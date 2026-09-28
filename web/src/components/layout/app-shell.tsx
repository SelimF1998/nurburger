import { MenuIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useParams } from "react-router";
import { cn } from "@/lib/utils";
import { defaultProjectId, findProject, useSession } from "@/stores/session";
import { CommandMenu } from "./command-menu";
import { NewProjectDialog } from "./new-project-dialog";
import { Sidebar } from "./sidebar";

function DemoBanner() {
  const me = useSession((s) => s.me);
  const lastProjectId = useSession((s) => s.lastProjectId);
  const ownId = defaultProjectId(me, lastProjectId);
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-primary/[0.06] px-4 text-xs">
      <SparklesIcon className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 truncate text-muted-foreground">
        <span className="font-medium text-foreground">Demo project</span> · Acme Tasks, a sample SaaS
        with 90 days of data and live events. Run any query you like; changes aren’t saved.
      </span>
      <Link
        to={ownId ? `/project/${ownId}` : "/onboarding"}
        className="ml-auto shrink-0 font-medium text-primary hover:underline"
      >
        {ownId ? "Back to your project" : "Create your own →"}
      </Link>
    </div>
  );
}

export function AppShell() {
  const { projectId } = useParams();
  const me = useSession((s) => s.me);
  const rememberProject = useSession((s) => s.rememberProject);
  const found = findProject(me, projectId);
  const [mobileNav, setMobileNav] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (found && projectId && !found.project.is_demo) rememberProject(projectId);
  }, [found, projectId, rememberProject]);

  useEffect(() => setMobileNav(false), [location.pathname]);

  if (!found) return <Navigate to="/" replace />;

  return (
    <div className="flex h-dvh overflow-hidden">
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex bg-canvas transition-transform md:static md:translate-x-0",
          mobileNav ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        <Sidebar />
      </div>
      {mobileNav && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileNav(false)}
        />
      )}

      <main className="m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background md:ml-0">
        <div className="flex h-10 shrink-0 items-center border-b border-border px-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileNav(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Open menu"
          >
            <MenuIcon className="size-4" />
          </button>
          <span className="ml-2 truncate text-[13px] font-medium">{found.project.name}</span>
        </div>
        {found.project.is_demo && <DemoBanner />}
        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>

      <CommandMenu />
      <NewProjectDialog />
    </div>
  );
}
