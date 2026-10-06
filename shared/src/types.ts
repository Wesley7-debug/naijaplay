import type {
  RoomCategory,
  RoomType,
  RoomStatus,
  MemberRole,
  UserRole,
  EventMode,
  RsvpStatus,
  GiveawayType,
  GiveawayEntryCondition,
  GiveawayStatus,
  CompetitionFormat,
  CompetitionStatus,
  SeasonStatus,
  SeasonRankTier,
  ReportTarget,
  ReportStatus,
  ReportReason,
  NotificationType,
  XpAction,
  AchievementCode,
  BadgeCode,
  MomentType,
  CrewKind,
} from './constants';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface SocialLinks {
  twitter?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  discord?: string;
  website?: string;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio?: string;
  location?: string;
  role: UserRole;
  isVerified: boolean;
  level: number;
  xp: number;
  followersCount: number;
  followingCount: number;
  roomsHostedCount: number;
  eventsJoinedCount: number;
  winsCount: number;
  giveawaysWonCount: number;
  customGames?: string[];
  lastSeenAt?: string;
  createdAt: string;
}

export interface CurrentUser extends PublicUser {
  email: string;
  emailVerified: boolean;
  favoriteGames: string[];
  socialLinks: SocialLinks;
  interests: string[];
  isSuspended?: boolean;
}

export interface GameSummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
  developer?: string;
  logo?: string | null;
  coverImage?: string | null;
  category: string;
  isFeatured?: boolean;
  followersCount?: number;
  roomsLive?: number;
}

export interface RoomSummary {
  id: string;
  name: string;
  slug: string;
  code: string;
  description?: string;
  host: PublicUser | null;
  type: RoomType;
  category: RoomCategory;
  game?: GameSummary | null;
  status: RoomStatus;
  memberCount: number;
  peakMemberCount: number;
  capacity: number;
  isLocked: boolean;
  isPrivate: boolean;
  coverImage?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  location?: string | null;
  externalGameUrl?: string | null;
  externalGameCode?: string | null;
  rules?: string[];
  createdAt: string;
}

export interface RoomMemberView {
  user: PublicUser;
  role: MemberRole;
  status: 'active' | 'left' | 'kicked' | 'banned';
  isMuted: boolean;
  joinedAt: string;
}

export interface MessageView {
  id: string;
  roomId: string;
  sender: PublicUser | null;
  content: string;
  attachments: { type: 'image' | 'gif'; url: string; width?: number; height?: number }[];
  replyTo: { id: string; senderName: string; excerpt: string } | null;
  reactions: { emoji: string; users: string[]; count: number }[];
  isPinned: boolean;
  isAnnouncement: boolean;
  isDeleted: boolean;
  createdAt: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

/** A single global lobby message — sender is a user or a guest, never both. */
export interface GlobalSender {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  guest: boolean;
  isVerified?: boolean;
  level?: number;
}

export interface GlobalMessageView {
  id: string;
  sender: GlobalSender;
  content: string;
  mentions: { id: string; username: string }[];
  createdAt: string;
}

export interface PollView {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  endsAt: string;
  closed: boolean;
  createdBy: string | null;
}

export interface GiveawayView {
  id: string;
  roomId: string;
  hostId: string;
  title: string;
  prize: string;
  type: GiveawayType;
  winnerCount: number;
  entryCondition: GiveawayEntryCondition;
  entryDetail?: string | null;
  minAccountAgeDays?: number | null;
  status: GiveawayStatus;
  startsAt: string;
  endsAt: string;
  entryCount: number;
  hasEntered: boolean;
  winners: { userId: string; username: string; displayName: string; avatar: string | null }[];
  createdAt: string;
}

export interface QuizQuestionView {
  round: number;
  question: string;
  options: string[];
  endsAt: string;
}

export interface QuizStateView {
  id: string;
  roomId: string;
  status: 'lobby' | 'active' | 'finished';
  currentRound: number;
  totalRounds: number;
  question: QuizQuestionView | null;
  players: { userId: string; displayName: string; avatar: string | null; eliminated: boolean; correctCount: number }[];
  aliveCount: number;
  winner: string | null;
  answered?: boolean;
}

export interface EventSummary {
  id: string;
  title: string;
  slug: string;
  description?: string;
  host: PublicUser | null;
  mode: EventMode;
  category: RoomCategory;
  game?: GameSummary | null;
  city?: string | null;
  area?: string | null;
  venue?: string | null;
  safetyNotes?: string | null;
  onlineUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  capacity: number;
  goingCount: number;
  maybeCount: number;
  waitlistCount: number;
  coverImage?: string | null;
  rules?: string[];
  status: 'upcoming' | 'live' | 'ended' | 'cancelled';
  viewerRsvp?: RsvpStatus | null;
  sponsor?: SponsorBadge | null;
  createdAt: string;
}

export interface CrewSummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatar?: string | null;
  cover?: string | null;
  kind: CrewKind;
  creator: PublicUser | null;
  memberCount: number;
  points: number;
  wins: number;
  losses: number;
  isMember?: boolean;
  viewerRole?: MemberRole | null;
  createdAt: string;
}

export interface MomentCommentView {
  id: string;
  author: PublicUser | null;
  content: string;
  createdAt: string;
}

export interface MomentView {
  id: string;
  author: PublicUser | null;
  type: MomentType;
  caption: string;
  media?: { url: string; type: 'image' | 'video'; width?: number; height?: number; durationSec?: number } | null;
  game?: GameSummary | null;
  roomId?: string | null;
  eventId?: string | null;
  reactions: Record<string, number>;
  viewerReaction?: string | null;
  commentsCount: number;
  sharesCount: number;
  comments?: MomentCommentView[];
  isDeleted?: boolean;
  createdAt: string;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

export interface FollowView {
  user: PublicUser;
  createdAt: string;
}

export interface XpProgress {
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
}

export interface XpHistoryEntry {
  id: string;
  action: XpAction;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface AchievementView {
  id: string;
  code: AchievementCode;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
  progress?: number;
  target?: number;
}

export interface BadgeView {
  id: string;
  code: BadgeCode;
  title: string;
  description: string;
  icon: string;
  awardedAt: string;
}

export interface SeasonSummary {
  id: string;
  name: string;
  game?: GameSummary | null;
  status: SeasonStatus;
  startDate: string;
  endDate: string;
  number: number;
  tiers: { tier: SeasonRankTier; label: string; threshold: number }[];
  rewards?: string[];
  viewerRank?: number | null;
  viewerTier?: SeasonRankTier | null;
  participantCount: number;
}

export interface LeaderboardEntry {
  rank: number;
  user?: PublicUser;
  crew?: CrewSummary;
  score: number;
  tier?: SeasonRankTier;
}

export interface SponsorBadge {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  banner?: string | null;
  website?: string | null;
  verified: boolean;
  campaignName?: string;
  prizeContribution?: number;
}

export interface RecapView {
  id: string;
  roomId: string;
  title: string;
  host: PublicUser | null;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  attendeeCount: number;
  peakMembers: number;
  messageCount: number;
  reactionCount: number;
  giveawayCount: number;
  winners: { username: string; displayName: string; prize: string }[];
  quizChampion: { displayName: string; username: string } | null;
  moments: MomentView[];
  participants: PublicUser[];
  sponsor?: SponsorBadge | null;
  shareUrl: string;
}

export interface ReportView {
  id: string;
  reporter: PublicUser | null;
  targetType: ReportTarget;
  targetId: string;
  targetLabel?: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  moderator: PublicUser | null;
  resolution?: string | null;
  createdAt: string;
}

export interface CompetitionView {
  id: string;
  title: string;
  description?: string;
  game?: GameSummary | null;
  format: CompetitionFormat;
  host: PublicUser | null;
  status: CompetitionStatus;
  rules: string[];
  prizes: string[];
  startsAt: string;
  endsAt: string;
  participantCount: number;
  crewCount: number;
  sponsor?: SponsorBadge | null;
  winner?: PublicUser | null;
  viewerJoined?: boolean;
}

export interface ConversationView {
  id: string;
  participant: PublicUser | null;
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface DirectMessageView {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt?: string | null;
}

export interface AdminMetrics {
  totalUsers: number;
  activeUsers: number;
  totalRooms: number;
  liveRooms: number;
  totalEvents: number;
  openReports: number;
  totalGiveaways: number;
  totalCrews: number;
  totalMoments: number;
  sponsoredEvents: number;
}

export interface HomeFeed {
  liveRooms: RoomSummary[];
  upcomingEvents: EventSummary[];
  games: GameSummary[];
  happeningNow: RoomSummary[];
  crews: CrewSummary[];
  moments: MomentView[];
  leaderboard: LeaderboardEntry[];
}

export interface SearchResults {
  rooms: RoomSummary[];
  users: PublicUser[];
  crews: CrewSummary[];
  games: GameSummary[];
  events: EventSummary[];
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export interface LfgEntry {
  userId: string;
  displayName: string;
  username: string;
  avatar: string | null;
  gameId: string | null;
  gameName: string;
  category: RoomCategory | null;
  createdAt: string;
}

export interface LfgGroup {
  gameName: string;
  gameId: string | null;
  count: number;
  entries: LfgEntry[];
}
