import { create } from "zustand";

interface UiState {
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  newProjectOrgId: string | null;
  setNewProjectOrgId: (orgId: string | null) => void;
}

export const useUi = create<UiState>()((set) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  newProjectOrgId: null,
  setNewProjectOrgId: (newProjectOrgId) => set({ newProjectOrgId }),
}));
