import { useParams } from "react-router";
import { findProject, useSession } from "@/stores/session";

/** Current org + project from the URL. Only use inside the /project/:projectId layout. */
export function useProject() {
  const { projectId } = useParams();
  const me = useSession((s) => s.me);
  const found = findProject(me, projectId);
  if (!found) throw new Error("useProject used outside a project route");
  const base = `/projects/${found.project.id}`;
  const isDemo = found.project.is_demo;
  return {
    ...found,
    /** API path prefix, e.g. `${apiBase}/flags` */
    apiBase: base,
    /** App route prefix, e.g. `${href}/flags` */
    href: `/project/${found.project.id}`,
    isAdmin: !isDemo && found.org.role !== "member",
    /** The shared demo: browse and run queries, but nothing can be saved. */
    isDemo,
    canEdit: !isDemo,
  };
}
