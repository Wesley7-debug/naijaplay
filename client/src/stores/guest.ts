import { create } from 'zustand';
import { api } from '@/lib/api';

const STORAGE_KEY = 'np_guest';

interface GuestState {
  guestId: string | null;
  guestName: string | null;
  ready: boolean;
  /** Mint (server) or restore (localStorage) the anonymous identity. */
  ensureGuest: () => Promise<void>;
  setGuestName: (name: string) => void;
  resetGuest: () => void;
}

function readStored(): { guestId: string | null; guestName: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { guestId: null, guestName: null };
    const parsed = JSON.parse(raw) as { guestId?: string; guestName?: string };
    if (parsed.guestId && /^g_[0-9a-f]{8,64}$/.test(parsed.guestId)) {
      return { guestId: parsed.guestId, guestName: parsed.guestName || null };
    }
  } catch {
    /* corrupted storage — mint fresh below */
  }
  return { guestId: null, guestName: null };
}

function persist(guestId: string | null, guestName: string | null) {
  try {
    if (guestId) localStorage.setItem(STORAGE_KEY, JSON.stringify({ guestId, guestName }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode — identity just won't survive reloads */
  }
}

export const useGuestStore = create<GuestState>((set, get) => ({
  guestId: null,
  guestName: null,
  ready: false,
  ensureGuest: async () => {
    if (get().ready) return;
    const stored = readStored();
    if (stored.guestId) {
      set({ guestId: stored.guestId, guestName: stored.guestName, ready: true });
      return;
    }
    try {
      const data = await api.post<{ guestId: string; guestName: string }>('/api/global/guest');
      persist(data.guestId, data.guestName);
      set({ guestId: data.guestId, guestName: data.guestName, ready: true });
    } catch {
      // Offline on first paint — chat will retry when the composer mounts.
      set({ ready: true });
    }
  },
  setGuestName: (name) => {
    const { guestId } = get();
    persist(guestId, name);
    set({ guestName: name });
  },
  resetGuest: () => {
    persist(null, null);
    set({ guestId: null, guestName: null, ready: false });
  },
}));
