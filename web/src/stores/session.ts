import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ApiError, api } from "@/lib/api";
import type { Me, Org, Project } from "@/lib/types";

type Status = "idle" | "loading" | "authenticated" | "anonymous";

interface SessionState {
  status: Status;
  me: Me | null;
  lastProjectId: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  rememberProject: (projectId: string) => void;
}

/** The signed-in user, their orgs and projects, and the last project they opened. */
export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      status: "idle",
      me: null,
      lastProjectId: null,

      load: async () => {
        if (get().status === "loading") return;
        set({ status: "loading" });
        try {
          const me = await api.get<Me>("/me");
          set({ me, status: "authenticated" });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) set({ me: null, status: "anonymous" });
          else throw e;
        }
      },

      refresh: async () => {
        const me = await api.get<Me>("/me");
        set({ me, status: "authenticated" });
      },

      logout: async () => {
        await api.post("/auth/logout");
        set({ me: null, status: "anonymous" });
      },

      rememberProject: (projectId) => set({ lastProjectId: projectId }),
    }),
    { name: "nb-session", partialize: (s) => ({ lastProjectId: s.lastProjectId }) },
  ),
);

export function findProject(
  me: Me | null,
  projectId: string | undefined,
): { org: Org; project: Project } | null {
  if (!me || !projectId) return null;
  for (const org of me.orgs) {
    const project = org.projects.find((p) => p.id === projectId);
    if (project) return { org, project };
  }
  return null;
}

/** Where to land after sign-in. Null means "no org of your own yet" → onboarding. */
export function defaultProjectId(me: Me | null, lastProjectId: string | null): string | null {
  if (!me) return null;
  const own = me.orgs.filter((o) => !o.is_demo);
  if (!own.length) return null;
  const last = findProject(me, lastProjectId ?? undefined);
  if (last && !last.project.is_demo) return last.project.id;
  return own.flatMap((o) => o.projects)[0]?.id ?? null;
}

export function demoProject(me: Me | null): Project | null {
  return me?.orgs.find((o) => o.is_demo)?.projects[0] ?? null;
}
