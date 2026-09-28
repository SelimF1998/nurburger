import { ArrowLeftIcon, ArrowRightIcon, SparklesIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { Org } from "@/lib/types";
import { demoProject, useSession } from "@/stores/session";

export function OnboardingPage() {
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [saving, setSaving] = useState(false);
  const hasOrgs = !!me?.orgs.some((o) => !o.is_demo);
  const demo = demoProject(me);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const org = await api.post<Org>("/orgs", {
        name: orgName,
        project_name: projectName || "Default project",
      });
      await refresh();
      navigate(`/project/${org.projects[0].id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create organization");
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[380px]">
        {hasOrgs && (
          <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2">
            <Link to="/">
              <ArrowLeftIcon /> Back
            </Link>
          </Button>
        )}
        <Logo className="mb-6 size-8" />
        <h1 className="text-lg font-semibold tracking-tight">
          {hasOrgs ? "Create an organization" : `Welcome${me?.user.name ? `, ${me.user.name.split(" ")[0]}` : ""}`}
        </h1>
        <p className="mt-1 mb-6 text-[13px] text-muted-foreground">
          Organizations hold your team and projects. You can invite teammates next.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="org">Organization name</Label>
            <Input
              id="org"
              autoFocus
              required
              placeholder="Acme Inc."
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="project">First project</Label>
            <Input
              id="project"
              placeholder="Default project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="h-9"
            />
          </div>
          <Button type="submit" size="lg" disabled={!orgName.trim() || saving} className="mt-2">
            Create organization
          </Button>
        </form>
        {demo && (
          <Link
            to={`/project/${demo.id}`}
            className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 transition-colors hover:bg-accent/60"
          >
            <SparklesIcon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">Explore the demo first</span>
              <span className="block truncate text-xs text-muted-foreground">
                A sample SaaS with 250k events, flags, insights and dashboards
              </span>
            </span>
            <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          </Link>
        )}
      </div>
    </div>
  );
}
