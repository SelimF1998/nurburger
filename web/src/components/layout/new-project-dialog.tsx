import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useSession } from "@/stores/session";
import { useUi } from "@/stores/ui";

export function NewProjectDialog() {
  const orgId = useUi((s) => s.newProjectOrgId);
  const setOrgId = useUi((s) => s.setNewProjectOrgId);
  const refresh = useSession((s) => s.refresh);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const project = await api.post<Project>(`/orgs/${orgId}/projects`, { name });
      await refresh();
      setOrgId(null);
      setName("");
      navigate(`/project/${project.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={orgId !== null} onOpenChange={(open) => !open && setOrgId(null)}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Each project has its own events, flags, insights and API keys, so use one per app or environment.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Marketing site"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOrgId(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
