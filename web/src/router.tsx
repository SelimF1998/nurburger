import { useEffect } from "react";
import { Navigate, Outlet, createBrowserRouter, useLocation } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { useProject } from "@/lib/use-project";
import { DashboardsPage } from "@/pages/dashboards";
import { EventsPage } from "@/pages/events";
import { FlagDetailPage } from "@/pages/flag-detail";
import { FlagsPage } from "@/pages/flags";
import { GetStartedPage } from "@/pages/get-started";
import { InsightsPage } from "@/pages/insights";
import { LoginPage } from "@/pages/login";
import { OnboardingPage } from "@/pages/onboarding";
import { AccountSettingsPage } from "@/pages/settings-account";
import { OrgSettingsPage } from "@/pages/settings-org";
import { ProjectSettingsPage } from "@/pages/settings-project";
import { defaultProjectId, useSession } from "@/stores/session";

function FullScreenSpinner() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="size-4 animate-spin rounded-full border-2 border-border border-t-muted-foreground" />
    </div>
  );
}

/** Loads the session once and gates everything below on being signed in. */
function RequireAuth() {
  const status = useSession((s) => s.status);
  const load = useSession((s) => s.load);
  const location = useLocation();

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  if (status === "idle" || status === "loading") return <FullScreenSpinner />;
  if (status === "anonymous") {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <Outlet />;
}

/** Project and org settings don't exist for the shared demo. */
function NotInDemo() {
  const { href, isDemo } = useProject();
  return isDemo ? <Navigate to={href} replace /> : <Outlet />;
}

function RootRedirect() {
  const me = useSession((s) => s.me);
  const lastProjectId = useSession((s) => s.lastProjectId);
  const projectId = defaultProjectId(me, lastProjectId);
  return <Navigate to={projectId ? `/project/${projectId}` : "/onboarding"} replace />;
}

// Chart + editor code (Recharts, CodeMirror) loads only when these routes are visited.
const editor = (kind?: "sql") => async () => {
  const { InsightEditorRoute } = await import("@/pages/insight-editor");
  return { Component: () => <InsightEditorRoute kind={kind} /> };
};

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/", element: <RootRedirect /> },
      { path: "/onboarding", element: <OnboardingPage /> },
      {
        path: "/project/:projectId",
        element: <AppShell />,
        children: [
          { index: true, element: <GetStartedPage /> },
          { path: "events", element: <EventsPage /> },
          { path: "flags", element: <FlagsPage /> },
          { path: "flags/:flagId", element: <FlagDetailPage /> },
          { path: "insights", element: <InsightsPage /> },
          { path: "insights/new", lazy: editor() },
          { path: "insights/:insightId", lazy: editor() },
          { path: "sql", lazy: editor("sql") },
          { path: "dashboards", element: <DashboardsPage /> },
          { path: "dashboards/:dashboardId", lazy: async () => ({ Component: (await import("@/pages/dashboard")).DashboardPage }) },
          {
            element: <NotInDemo />,
            children: [
              { path: "settings/project", element: <ProjectSettingsPage /> },
              { path: "settings/org", element: <OrgSettingsPage /> },
            ],
          },
          { path: "settings/account", element: <AccountSettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
