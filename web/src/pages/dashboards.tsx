import { LayoutGridIcon, PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton, PageBody, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { timeAgo } from "@/lib/utils";

export function DashboardsPage() {
  const { apiBase, href, canEdit } = useProject();
  const { data, error, loading, reload } = useFetch<Dashboard[]>(`${apiBase}/dashboards`);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const d = await api.post<Dashboard>(`${apiBase}/dashboards`, { name, description });
      navigate(`${href}/dashboards/${d.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create dashboard");
    }
  };

  const newButton = canEdit && (
    <Button size="sm" onClick={() => setOpen(true)}>
      <PlusIcon /> New dashboard
    </Button>
  );

  return (
    <>
      <PageHeader title="Dashboards" actions={newButton} />
      <PageBody>
        {error && <ErrorState message={error} onRetry={reload} />}
        {loading && !data && <ListSkeleton />}
        {data && data.length === 0 && (
          <EmptyState
            icon={<LayoutGridIcon />}
            title="No dashboards"
            description="Group related insights on one page for your team."
            action={newButton || undefined}
          />
        )}
        {data && data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => navigate(`${href}/dashboards/${d.id}`)}
                className="flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-input hover:bg-accent/40"
              >
                <div className="flex w-full items-center gap-2">
                  <LayoutGridIcon className="size-3.5 text-muted-foreground" />
                  <span className="truncate font-medium">{d.name}</span>
                </div>
                <p className="line-clamp-2 min-h-[2lh] text-xs text-muted-foreground">
                  {d.description || "No description"}
                </p>
                <div className="mt-2 text-xs text-subtle-foreground">
                  {d.tile_count} {d.tile_count === 1 ? "insight" : "insights"} · created {timeAgo(d.created_at)}
                </div>
              </button>
            ))}
          </div>
        )}
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={create} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>New dashboard</DialogTitle>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="d-name">Name</Label>
              <Input id="d-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Product health" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="d-desc">Description</Label>
              <Textarea id="d-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
