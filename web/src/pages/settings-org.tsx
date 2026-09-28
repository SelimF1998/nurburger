import { MailIcon, XIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PageBody, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, Badge } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Invite, Member, Role } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { timeAgo } from "@/lib/utils";
import { useSession } from "@/stores/session";

const ROLES: { value: Role; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

export function OrgSettingsPage() {
  const { org, isAdmin } = useProject();
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const navigate = useNavigate();
  const base = `/orgs/${org.id}`;
  const members = useFetch<Member[]>(`${base}/members`);
  const invites = useFetch<Invite[]>(`${base}/invites`);
  const [name, setName] = useState(org.name);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [removing, setRemoving] = useState<Member | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isOwner = org.role === "owner";

  useEffect(() => setName(org.name), [org.name]);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    await api.patch(base, { name });
    await refresh();
    toast.success("Organization renamed");
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post<{ status: "added" | "invited" }>(`${base}/invites`, { email, role });
      toast.success(res.status === "added" ? `${email} added to ${org.name}` : `Invited ${email}`, {
        description: res.status === "invited" ? "They’ll join automatically when they sign in." : undefined,
      });
      setEmail("");
      void members.reload();
      void invites.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    }
  };

  const changeRole = async (member: Member, next: Role) => {
    try {
      await api.patch(`${base}/members/${member.user.id}`, { role: next });
      members.setData((prev) => (prev ?? []).map((m) => (m.user.id === member.user.id ? { ...m, role: next } : m)));
      if (member.user.id === me?.user.id) await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change role");
    }
  };

  const removeMember = async (member: Member) => {
    try {
      await api.delete(`${base}/members/${member.user.id}`);
      if (member.user.id === me?.user.id) {
        await refresh();
        navigate("/");
        return;
      }
      members.setData((prev) => (prev ?? []).filter((m) => m.user.id !== member.user.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove member");
    }
  };

  const cancelInvite = async (inv: Invite) => {
    await api.delete(`${base}/invites/${inv.id}`);
    invites.setData((prev) => (prev ?? []).filter((i) => i.id !== inv.id));
  };

  const deleteOrg = async () => {
    await api.delete(base);
    await refresh();
    navigate("/");
  };

  return (
    <>
      <PageHeader title="Organization" />
      <PageBody className="max-w-4xl">
        <Section title="General">
          <form onSubmit={rename} className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />
            {isAdmin && (
              <Button type="submit" variant="secondary" disabled={!name.trim() || name === org.name}>
                Save
              </Button>
            )}
          </form>
        </Section>

        <Section
          title="Members"
          description="Members can use every project in this organization. Admins can also manage keys, projects and members."
        >
          {isAdmin && (
            <form onSubmit={invite} className="mb-4 flex gap-2">
              <Input
                type="email"
                required
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="w-28 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => isOwner || r.value !== "owner").map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" className="shrink-0">
                Invite
              </Button>
            </form>
          )}

          <div className="divide-y divide-border rounded-lg border border-border">
            {members.data?.map((m) => {
              const isSelf = m.user.id === me?.user.id;
              const canEdit = isAdmin && !isSelf && (isOwner || m.role !== "owner");
              return (
                <div key={m.user.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar src={m.user.avatar_url} name={m.user.name || m.user.email} className="size-7 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {m.user.name || m.user.email}
                      {isSelf && <span className="ml-1.5 font-normal text-muted-foreground">(you)</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{m.user.email}</div>
                  </div>
                  {canEdit ? (
                    <Select value={m.role} onValueChange={(v) => void changeRole(m, v as Role)}>
                      <SelectTrigger size="sm" className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.filter((r) => isOwner || r.value !== "owner").map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={m.role === "owner" ? "primary" : "outline"} className="capitalize">
                      {m.role}
                    </Badge>
                  )}
                  {(canEdit || isSelf) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRemoving(m)}
                      aria-label={isSelf ? "Leave organization" : "Remove member"}
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              );
            })}
            {invites.data?.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                  <MailIcon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{inv.email}</div>
                  <div className="text-xs text-muted-foreground">Invited {timeAgo(inv.created_at)}</div>
                </div>
                <Badge variant="warning">Pending · {inv.role}</Badge>
                {isAdmin && (
                  <Button variant="ghost" size="icon-sm" onClick={() => void cancelInvite(inv)} aria-label="Cancel invite">
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Section>

        {isOwner && (
          <Section title="Danger zone">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4">
              <div>
                <div className="text-[13px] font-medium">Delete organization</div>
                <p className="text-xs text-muted-foreground">Deletes every project and all of its data.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </div>
          </Section>
        )}
      </PageBody>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing?.user.id === me?.user.id ? `Leave ${org.name}?` : `Remove ${removing?.user.name || removing?.user.email}?`}
        description={
          removing?.user.id === me?.user.id
            ? "You’ll lose access to its projects unless someone invites you again."
            : "They’ll lose access to every project in this organization."
        }
        confirmLabel={removing?.user.id === me?.user.id ? "Leave" : "Remove"}
        onConfirm={async () => {
          if (removing) await removeMember(removing);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${org.name}?`}
        description="Every project, event, flag, insight and dashboard will be permanently deleted."
        confirmLabel="Delete organization"
        onConfirm={deleteOrg}
      />
    </>
  );
}
