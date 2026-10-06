import { create } from 'zustand';
import { api } from '@/lib/api';

export interface SocialLinks {
  twitter?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  discord?: string;
  website?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  location: string;
  favoriteGames: string[];
  customGames: string[];
  interests: string[];
  socialLinks: SocialLinks;
  role: 'user' | 'creator' | 'moderator' | 'admin';
  isVerified: boolean;
  isSuspended: boolean;
  followersCount: number;
  followingCount: number;
  roomsHostedCount: number;
  eventsJoinedCount: number;
  winsCount: number;
  giveawaysWonCount: number;
  xp: number;
  level: number;
  badges: { code: string; title: string; description: string; icon: string; awardedAt: string }[];
  achievements: { code: string; unlockedAt: string }[];
  onboardingComplete: boolean;
  lastSeenAt: string;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  fetched: boolean;
  fetchUser: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  fetched: false,
  fetchUser: async () => {
    if (get().fetched && !get().loading) {
      // still allow background refresh
    }
    set({ loading: true });
    try {
      const data = await api.get<{ user: AuthUser | null }>('/api/auth/me');
      set({ user: data.user, loading: false, fetched: true });
    } catch {
      set({ user: null, loading: false, fetched: true });
    }
  },
  setUser: (user) => set({ user, fetched: true, loading: false }),
  refresh: async () => {
    try {
      const data = await api.get<{ user: AuthUser | null }>('/api/auth/me');
      set({ user: data.user, loading: false, fetched: true });
    } catch {
      /* keep current state */
    }
  },
  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      set({ user: null });
      window.location.href = '/';
    }
  },
}));
