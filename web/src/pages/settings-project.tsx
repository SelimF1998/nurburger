import { KeyRoundIcon, PlusIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CodeBlock, KeyField, PageBody, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { api } from "@/lib/api";
import { snippets } from "@/lib/snippets";
import type { SecretKey } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { timeAgo } from "@/lib/utils";
import { useSession } from "@/stores/session";

function SecretKeys() {
  const { apiBase, isAdmin } = useProject();
  const { data, setData } = useFetch<SecretKey[]>(`${apiBase}/secret-keys`);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<SecretKey | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const key = await api.post<SecretKey & { key: string }>(`${apiBase}/secret-keys`, { name });
      setData((prev) => [key, ...(prev ?? [])]);
      setCreated(key.key);
      setName("");
      setCreating(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create key");
    }
  };

  const revoke = async (key: SecretKey) => {
    await api.delete(`${apiBase}/secret-keys/${key.id}`);
    setData((prev) => (prev ?? []).filter((k) => k.id !== key.id));
    toast.success("Key revoked");
  };

  return (
    <>
      {data && data.length > 0 ? (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Key</TH>
                <TH className="hidden sm:table-cell">Last used</TH>
                <TH className="w-10" />
              </TR>
            </THead>
            <TBody>
              {data.map((k) => (
                <TR key={k.id}>
                  <TD className="font-medium">{k.name}</TD>
                  <TD className="font-mono text-xs text-muted-foreground">{k.mask}</TD>
                  <TD className="hidden text-xs text-muted-foreground sm:table-cell">
                    {k.last_used_at ? timeAgo(k.last_used_at) : "Never"}
                  </TD>
                  <TD>
                    {isAdmin && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setRevoking(k)} aria-label="Revoke key">
                        <Trash2Icon />
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          No secret keys yet.
        </p>
      )}
      {isAdmin && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setCreating(true)}>
          <PlusIcon /> Create secret key
        </Button>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <form onSubmit={create} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Create secret key</DialogTitle>
              <DialogDescription>Give it a name that says where it’s used, like “Backend prod”.</DialogDescription>
            </DialogHeader>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name" />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRoundIcon className="size-4 text-primary" /> Copy your secret key
            </DialogTitle>
            <DialogDescription>
              You won’t be able to see it again. Keep it server-side, because it can read all of this
              project’s data.
            </DialogDescription>
          </DialogHeader>
          {created && <KeyField value={created} />}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke “${revoking?.name}”?`}
        description="Requests using this key will fail immediately. This can’t be undone."
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (revoking) await revoke(revoking);
        }}
      />
    </>
  );
}

export function ProjectSettingsPage() {
  const { project, apiBase, isAdmin } = useProject();
  const refresh = useSession((s) => s.refresh);
  const navigate = useNavigate();
  const [name, setName] = useState(project.name);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setName(project.name), [project.name]);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    await api.patch(apiBase, { name });
    await refresh();
    toast.success("Project renamed");
  };

  const rotate = async () => {
    await api.post(`${apiBase}/rotate-public-key`);
    await refresh();
    toast.success("Public key rotated");
  };

  const remove = async () => {
    await api.delete(apiBase);
    await refresh();
    toast.success("Project deleted");
    navigate("/");
  };

  return (
    <>
      <PageHeader title="Project & API keys" />
      <PageBody className="max-w-4xl">
        <Section title="General">
          <form onSubmit={rename} className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />
            {isAdmin && (
              <Button type="submit" variant="secondary" disabled={!name.trim() || name === project.name}>
                Save
              </Button>
            )}
          </form>
          <p className="mt-2 font-mono text-xs text-subtle-foreground">ID {project.id}</p>
        </Section>

        <Section
          title="Public key"
          description="Sends events and evaluates flags. It’s safe to expose in client-side code."
          actions={
            isAdmin && (
              <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => setConfirmRotate(true)}>
                <RotateCwIcon /> Rotate
              </Button>
            )
          }
        >
          <KeyField value={project.public_key} />
        </Section>

        <Section
          title="Secret keys"
          description="Grant server-side access to the query API (trends, SQL and saved insight results). Only the key’s hash is stored."
        >
          <SecretKeys />
          <div className="mt-6">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Query API</div>
            <CodeBlock code={snippets(project.public_key).queryCurl()} />
          </div>
        </Section>

        {isAdmin && (
          <Section title="Danger zone">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4">
              <div>
                <div className="text-[13px] font-medium">Delete this project</div>
                <p className="text-xs text-muted-foreground">
                  Permanently deletes all events, flags, insights and dashboards.
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                Delete project
              </Button>
            </div>
          </Section>
        )}
      </PageBody>
      <ConfirmDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title="Rotate public key?"
        description="Apps using the current key will stop sending events until you update them."
        confirmLabel="Rotate key"
        onConfirm={rotate}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${project.name}?`}
        description="All of its data will be permanently deleted. This can’t be undone."
        confirmLabel="Delete project"
        onConfirm={remove}
      />
    </>
  );
}
