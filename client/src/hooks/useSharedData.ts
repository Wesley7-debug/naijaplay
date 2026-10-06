import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { toast } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import type {
  RoomSummary,
  EventSummary,
  GameSummary,
  CrewSummary,
  MomentView,
  NotificationView,
  Paginated,
  HomeFeed,
  LeaderboardEntry,
  SeasonSummary,
} from '@naijaplay/shared';

export function useHomeFeed() {
  return useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeFeed & { scheduledRooms: RoomSummary[]; season: SeasonSummary | null }>('/api/home'),
    staleTime: 20_000,
  });
}

export function useHappeningNow() {
  return useQuery({
    queryKey: ['happening-now'],
    queryFn: () => api.get<{ rooms: RoomSummary[] }>('/api/home/happening-now'),
    refetchInterval: 30_000,
  });
}

export function useLfgGroups() {
  return useQuery({
    queryKey: ['lfg'],
    queryFn: () => api.get<{ groups: { gameName: string; gameId: string | null; count: number; entries: unknown[] }[] }>('/api/home/lfg'),
    refetchInterval: 20_000,
  });
}

export function useDiscover(
  tab: string,
  filters: { category?: string; gameId?: string; location?: string; mode?: string } = {},
) {
  return useQuery({
    queryKey: ['discover', tab, filters],
    queryFn: () => api.get<Paginated<Record<string, unknown>>>(`/api/home/discover${qs({ tab, ...filters })}`),
    placeholderData: (prev) => prev,
  });
}

export function useRooms(status = 'all', category?: string, gameId?: string) {
  return useQuery({
    queryKey: ['rooms', status, category, gameId],
    queryFn: () => api.get<{ items: RoomSummary[] }>(`/api/rooms${qs({ status, category, gameId })}`),
    refetchInterval: 25_000,
  });
}

export function useRoom(idOrCode: string | undefined, code?: string) {
  return useQuery({
    queryKey: ['room', idOrCode, code],
    queryFn: () =>
      api.get<{
        room: RoomSummary;
        membership: { role: string; status: string; isMuted: boolean } | null;
        viewer: { id: string } | null;
        activeGiveaway: { id: string; title: string; prize: string; endsAt: string } | null;
        pastGiveaways: { id: string; title: string; prize: string; status: string; winnerCount: number }[];
        pinnedCount: number;
        shareUrl: string;
      }>(`/api/rooms/${idOrCode}${qs({ code })}`),
    enabled: Boolean(idOrCode),
    retry: false,
  });
}

export function useMyRooms() {
  return useQuery({
    queryKey: ['rooms', 'mine'],
    queryFn: () => api.get<{ items: RoomSummary[] }>('/api/rooms/mine'),
  });
}

export function useEvents(filters: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: ['events', filters],
    queryFn: () => api.get<{ items: EventSummary[] }>(`/api/events${qs(filters)}`),
    refetchInterval: 60_000,
  });
}

export function useMyEvents() {
  return useQuery({
    queryKey: ['events', 'mine'],
    queryFn: () => api.get<{ items: EventSummary[] }>('/api/events/mine'),
  });
}

export function useEvent(slug: string | undefined) {
  return useQuery({
    queryKey: ['event', slug],
    queryFn: () => api.get<{ event: EventSummary; viewerIsNext: boolean }>(`/api/events/${slug}`),
    enabled: Boolean(slug),
    retry: false,
  });
}

export function useGames() {
  return useQuery({
    queryKey: ['games'],
    queryFn: () => api.get<{ items: GameSummary[] }>('/api/games'),
    staleTime: 5 * 60_000,
  });
}

export function useGame(slug: string | undefined) {
  return useQuery({
    queryKey: ['game', slug],
    queryFn: () =>
      api.get<{
        game: GameSummary;
        isFollowing: boolean;
        liveRooms: Record<string, unknown>[];
        upcomingEvents: Record<string, unknown>[];
        seasons: Record<string, unknown>[];
        moments: MomentView[];
        topScores: { rank: number; score: number; verification: string; user: unknown }[];
      }>(`/api/games/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useCrews() {
  return useQuery({
    queryKey: ['crews'],
    queryFn: () => api.get<{ items: CrewSummary[] }>('/api/crews'),
  });
}

export function useCrew(slug: string | undefined) {
  return useQuery({
    queryKey: ['crew', slug],
    queryFn: () =>
      api.get<{
        crew: CrewSummary;
        members: { user: unknown; role: string; joinedAt: string }[];
        scoreHistory: { id: string; delta: number; reason: string; sourceType?: string; balanceAfter: number; createdAt: string }[];
      }>(`/api/crews/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useCrewLeaderboard() {
  return useQuery({
    queryKey: ['crews', 'leaderboard'],
    queryFn: () =>
      api.get<{
        items: { rank: number; crew: CrewSummary; score: number }[];
        rivalries: { home: string; away: string; homeScore: number; awayScore: number }[];
      }>('/api/crews/leaderboard'),
  });
}

export function useMoments(tab: 'new' | 'top' = 'new') {
  return useQuery({
    queryKey: ['moments', tab],
    queryFn: () => api.get<Paginated<MomentView>>(`/api/moments${tab === 'top' ? '/top' : ''}`),
    refetchInterval: 45_000,
  });
}

export function useMoment(id: string | undefined) {
  return useQuery({
    queryKey: ['moment', id],
    queryFn: () => api.get<{ moment: MomentView }>(`/api/moments/${id}`),
    enabled: Boolean(id),
  });
}

export function useProfile(username: string | undefined) {
  return useQuery({
    queryKey: ['profile', username],
    queryFn: () =>
      api.get<{
        profile: {
          id: string;
          username: string;
          displayName: string;
          avatar: string | null;
          bio: string;
          location: string;
          isSelf: boolean;
          isFollowing: boolean;
          isVerified: boolean;
          level: number;
          followersCount: number;
          followingCount: number;
          roomsHostedCount: number;
          eventsJoinedCount: number;
          winsCount: number;
          giveawaysWonCount: number;
          createdAt: string;
          crew: { slug: string; name: string; memberCount: number; points: number } | null;
          socialLinks: Record<string, string>;
          interests?: string[];
          customGames?: string[];
          favoriteGameData?: { name: string }[];
        };
        moments: MomentView[];
        hostedRooms: Record<string, unknown>[];
        recaps: Record<string, unknown>[];
      }>(`/api/users/${username}`),
    enabled: Boolean(username),
    retry: false,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ items: NotificationView[]; nextCursor: string | null; unread: number }>('/api/notifications'),
    refetchInterval: 30_000,
  });
}

export function useLeaderboard(scope: string) {
  return useQuery({
    queryKey: ['leaderboards', scope],
    queryFn: () => api.get<{ items: LeaderboardEntry[]; crews?: LeaderboardEntry[]; users?: LeaderboardEntry[]; rivalries?: unknown[]; season?: SeasonSummary | null }>(`/api/leaderboards${qs({ scope })}`),
    staleTime: 30_000,
  });
}

export function useSeasons() {
  return useQuery({
    queryKey: ['seasons'],
    queryFn: () => api.get<{ items: SeasonSummary[] }>('/api/seasons'),
  });
}

export function useCompetitions() {
  return useQuery({
    queryKey: ['competitions'],
    queryFn: () => api.get<{ items: Record<string, unknown>[] }>('/api/competitions'),
    refetchInterval: 60_000,
  });
}

export function useSearch(q: string, type = 'all') {
  return useQuery({
    queryKey: ['search', q, type],
    queryFn: () => api.get<Record<string, unknown[]>>(`/api/search${qs({ q, type })}`),
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  });
}

/** Follow/unfollow with optimistic update on the profile page. */
export function useFollow(username: string | undefined) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: async ({ follow }: { follow: boolean }) => {
      return api.post(`/api/users/${username}/${follow ? 'follow' : 'unfollow'}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', username] });
      if (user) void qc.invalidateQueries({ queryKey: ['profile', user.username] });
    },
    onError: (err) => toast.error('Could not update', (err as Error).message),
  });
}

export function useRsvp(eventId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: 'going' | 'maybe' | 'cancelled') =>
      api.post<{ status: string; goingCount: number; maybeCount: number; waitlistCount: number }>(
        `/api/events/${eventId}/rsvp`,
        { status },
      ),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['event'] });
      void qc.invalidateQueries({ queryKey: ['events'] });
      if (data.status === 'waitlist') toast.info('You joined the waitlist', 'We will ping you if a spot opens.');
      else if (data.status === 'going') toast.success("You're going!", 'See you there.');
    },
    onError: (err) => toast.error('RSVP failed', (err as Error).message),
  });
}
