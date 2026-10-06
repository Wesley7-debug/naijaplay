import { create } from 'zustand';

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

interface UiState {
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  connected: boolean;
  setConnected: (v: boolean) => void;
  createSheetOpen: boolean;
  setCreateSheetOpen: (v: boolean) => void;
}

let toastCounter = 0;

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  toast: (t) => {
    const id = `toast_${++toastCounter}`;
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismissToast(id), t.kind === 'error' ? 6000 : 4000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  connected: true,
  setConnected: (connected) => set({ connected }),
  createSheetOpen: false,
  setCreateSheetOpen: (createSheetOpen) => set({ createSheetOpen }),
}));

/** Convenience helpers */
export const toast = {
  success: (title: string, description?: string) => useUiStore.getState().toast({ kind: 'success', title, description }),
  error: (title: string, description?: string) => useUiStore.getState().toast({ kind: 'error', title, description }),
  info: (title: string, description?: string) => useUiStore.getState().toast({ kind: 'info', title, description }),
};
