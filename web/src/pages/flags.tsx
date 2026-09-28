import { FlagIcon, PlusIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton, PageBody, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label, Slider, Switch } from "@/components/ui/primitives";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { Flag } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { timeAgo } from "@/lib/utils";

export function RolloutBar({ value, active }: { value: number; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={active ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-subtle-foreground/50"}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-9 text-xs text-muted-foreground tabular">{value}%</span>
    </div>
  );
}

function NewFlagDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (flag: Flag) => void;
}) {
  const { apiBase } = useProject();
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [rollout, setRollout] = useState(100);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setKey("");
      setDescription("");
      setRollout(100);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const flag = await api.post<Flag>(`${apiBase}/flags`, {
        key,
        description,
        rollout_percentage: rollout,
        active: true,
      });
      onCreated(flag);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create flag");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New feature flag</DialogTitle>
            <DialogDescription>Flags are evaluated per user with a stable hash, so users get a consistent result.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="flag-key">Key</Label>
            <Input
              id="flag-key"
              autoFocus
              placeholder="new-checkout"
              className="font-mono text-xs"
              value={key}
              onChange={(e) => setKey(e.target.value.replace(/\s+/g, "-"))}
              pattern="[a-zA-Z0-9_\-]+"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="flag-desc">Description</Label>
            <Textarea
              id="flag-desc"
              placeholder="What does this flag control?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2.5">
            <div className="flex items-center justify-between">
              <Label>Rollout</Label>
              <span className="text-xs tabular">{rollout}% of users</span>
            </div>
            <Slider value={[rollout]} min={0} max={100} step={1} onValueChange={([v]) => setRollout(v)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!key || saving}>
              Create flag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FlagsPage() {
  const { apiBase, href, canEdit } = useProject();
  const { data, error, loading, reload, setData } = useFetch<Flag[]>(`${apiBase}/flags`);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const creating = params.get("new") === "1";

  const setCreating = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  };

  const toggle = async (flag: Flag, active: boolean) => {
    setData((prev) => (prev ?? []).map((f) => (f.id === flag.id ? { ...f, active } : f)));
    try {
      await api.patch(`${apiBase}/flags/${flag.id}`, { active });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
      void reload();
    }
  };

  return (
    <>
      <PageHeader
        title="Feature flags"
        actions={
          canEdit && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <PlusIcon /> New flag
            </Button>
          )
        }
      />
      <PageBody>
        {error && <ErrorState message={error} onRetry={reload} />}
        {loading && !data && <ListSkeleton />}
        {data && data.length === 0 && (
          <EmptyState
            icon={<FlagIcon />}
            title="No feature flags"
            description="Ship features safely by rolling them out gradually."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <PlusIcon /> New flag
              </Button>
            }
          />
        )}
        {data && data.length > 0 && (
          <div className="rounded-lg border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>Key</TH>
                  <TH className="hidden md:table-cell">Description</TH>
                  <TH>Rollout</TH>
                  <TH className="hidden text-right sm:table-cell">Updated</TH>
                  <TH className="w-16 text-right">Enabled</TH>
                </TR>
              </THead>
              <TBody>
                {data.map((f) => (
                  <TR key={f.id} data-clickable onClick={() => navigate(`${href}/flags/${f.id}`)}>
                    <TD className="font-mono text-xs font-medium">{f.key}</TD>
                    <TD className="hidden max-w-80 truncate text-muted-foreground md:table-cell">
                      {f.description || f.name || "—"}
                    </TD>
                    <TD>
                      <RolloutBar value={f.rollout_percentage} active={f.active} />
                    </TD>
                    <TD className="hidden text-right text-xs text-muted-foreground sm:table-cell">
                      {timeAgo(f.updated_at)}
                    </TD>
                    <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Switch checked={f.active} disabled={!canEdit} onCheckedChange={(v) => void toggle(f, v)} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </PageBody>
      <NewFlagDialog
        open={creating && canEdit}
        onOpenChange={setCreating}
        onCreated={(flag) => {
          toast.success(`Created ${flag.key}`);
          navigate(`${href}/flags/${flag.id}`);
        }}
      />
    </>
  );
}
