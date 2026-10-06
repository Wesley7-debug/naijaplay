export const ROOM_CATEGORIES = [
  'gaming',
  'football',
  'music',
  'culture',
  'tech',
  'campus',
  'creator',
  'hangout',
  'other',
] as const;
export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

export const ROOM_TYPES = ['public', 'private', 'scheduled'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_STATUSES = ['scheduled', 'live', 'ended', 'cancelled'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const MEMBER_ROLES = ['member', 'moderator', 'cohost', 'host'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const USER_ROLES = ['user', 'creator', 'moderator', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EVENT_MODES = ['online', 'irl', 'both'] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export const RSVP_STATUSES = ['going', 'maybe', 'waitlist'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const GIVEAWAY_TYPES = ['airtime', 'data', 'cash', 'shoutout', 'sponsored_prize', 'custom'] as const;
export type GiveawayType = (typeof GIVEAWAY_TYPES)[number];

export const GIVEAWAY_CONDITIONS = ['in_room', 'react', 'answer_question', 'follow_host', 'rsvp', 'custom'] as const;
export type GiveawayEntryCondition = (typeof GIVEAWAY_CONDITIONS)[number];

export const GIVEAWAY_STATUSES = ['pending', 'active', 'ended', 'cancelled'] as const;
export type GiveawayStatus = (typeof GIVEAWAY_STATUSES)[number];

export const COMPETITION_FORMATS = ['elimination', 'leaderboard', 'quiz', 'crew_vs_crew'] as const;
export type CompetitionFormat = (typeof COMPETITION_FORMATS)[number];

export const COMPETITION_STATUSES = ['draft', 'registration', 'active', 'completed', 'cancelled'] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

export const SEASON_STATUSES = ['upcoming', 'active', 'finalizing', 'archived'] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

/** Ascending rank tiers used across seasons (Naija-flavoured). */
export const SEASON_RANK_TIERS = ['okada', 'danfo', 'molue', 'bullion_van'] as const;
export type SeasonRankTier = (typeof SEASON_RANK_TIERS)[number];

export const SEASON_RANK_LABELS: Record<SeasonRankTier, string> = {
  okada: 'Okada',
  danfo: 'Danfo',
  molue: 'Molue',
  bullion_van: 'Bullion Van',
};

export const REPORT_TARGETS = [
  'user',
  'message',
  'room',
  'event',
  'giveaway',
  'moment',
  'crew',
] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate_speech',
  'scam',
  'nudity',
  'violence',
  'impersonation',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const NOTIFICATION_TYPES = [
  'room_invite',
  'event_reminder',
  'event_starting',
  'giveaway_started',
  'giveaway_won',
  'mention',
  'new_follower',
  'crew_invitation',
  'crew_result',
  'season_result',
  'achievement_unlocked',
  'waitlist_promotion',
  'moderation_action',
  'sponsorship_update',
  'quiz_result',
  'rsvp_confirmed',
  'event_cancelled',
  'host_announcement',
  'room_starting',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Server-controlled XP amounts. Clients can never send amounts. */
export const XP_ACTIONS = {
  ROOM_JOIN: 10,
  ROOM_HOST: 30,
  EVENT_ATTEND: 25,
  EVENT_HOST: 40,
  QUIZ_WIN: 60,
  QUIZ_PARTICIPATE: 15,
  COMPETITION_WIN: 100,
  COMPETITION_PARTICIPATE: 25,
  GIVEAWAY_WIN: 50,
  MOMENT_POST: 8,
  MOMENT_REACTION_RECEIVED: 2,
  FOLLOW_RECEIVED: 5,
  ACHIEVEMENT_UNLOCK: 40,
  CREW_JOIN: 15,
  SEASON_REWARD: 100,
  DAILY_STREAK: 12,
} as const;
export type XpAction = keyof typeof XP_ACTIONS;

/** Actions that are rate-limited per time window to prevent XP farming. */
export const XP_FARM_WINDOW_MINUTES: Partial<Record<XpAction, number>> = {
  MOMENT_POST: 60,
  MOMENT_REACTION_RECEIVED: 1440,
  FOLLOW_RECEIVED: 1440,
  ROOM_JOIN: 30,
};

export const ACHIEVEMENT_CODES = [
  'join_10_lagos_run_events',
  'host_25_rooms',
  'win_5_giveaways',
  'win_10_competitions',
  'attend_7_days_streak',
  'first_competition_win',
  'reach_100_followers',
  'create_successful_crew',
  'send_first_message',
  'post_10_moments',
] as const;
export type AchievementCode = (typeof ACHIEVEMENT_CODES)[number];

export const BADGE_CODES = [
  'season_1_champion',
  'top_10',
  'top_crew',
  'giveaway_king',
  'quiz_master',
  'host_with_the_most',
  'early_player',
  'og_member',
] as const;
export type BadgeCode = (typeof BADGE_CODES)[number];

export const MOMENT_TYPES = ['screenshot', 'image', 'clip', 'achievement', 'room_moment', 'event_photo', 'text'] as const;
export type MomentType = (typeof MOMENT_TYPES)[number];

export const CREW_KINDS = ['area', 'school', 'friends', 'gaming', 'creator', 'other'] as const;
export type CrewKind = (typeof CREW_KINDS)[number];

export const NIGERIAN_AREAS = [
  'Yaba',
  'Surulere',
  'Lekki',
  'Ikeja',
  'Victoria Island',
  'Ikoyi',
  'Festac',
  'Ojo',
  'Agege',
  'Ikorodu',
  'Epe',
  'Badagry',
  'Apapa',
  'Magodo',
  'Gbagada',
  'Akoka',
  'Ojota',
  'Ogun',
  'Ibadan',
  'Ijebu-Ode',
  'Abeokuta',
  'Port Harcourt',
  'GRA PH',
  'Rumuokoro',
  'Owerri',
  'Warri',
  'Benin City',
  'Enugu',
  'Onitsha',
  'Awka',
  'Abuja',
  'Wuse',
  'Gwarinpa',
  'Asokoro',
  'Kano',
  'Kaduna',
  'Jos',
  'Calabar',
  'Uyo',
  'Akure',
  'Ado-Ekiti',
  'Kontagora',
  'Other',
] as const;
export type NigerianArea = (typeof NIGERIAN_AREAS)[number];

export const CITIES = [
  'Lagos',
  'Port Harcourt',
  'Abuja',
  'Ibadan',
  'Benin City',
  'Enugu',
  'Kano',
  'Kaduna',
  'Jos',
  'Calabar',
  'Uyo',
  'Warri',
  'Owerri',
  'Abeokuta',
  'Akure',
  'Onitsha',
  'Other',
] as const;
export type City = (typeof CITIES)[number];

export const INTERESTS = [
  'Gaming',
  'Football',
  'Music',
  'Tech',
  'Campus Life',
  'Content Creation',
  'Hangouts',
  'Anime',
  'Nollywood',
  'Food',
  'Fitness',
  'Skits',
  'Fashion',
  'Startup Life',
] as const;

/** Category -> prefixes for human-friendly room codes. */
export const ROOM_CODE_PREFIXES: Record<string, string> = {
  Lagos: 'LAG',
  'Port Harcourt': 'PH',
  Abuja: 'ABJ',
  Ibadan: 'IBA',
  'Benin City': 'BEN',
  Enugu: 'ENU',
  default: 'NGA',
};

export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const PROFANITY_LIST = [
  'fuck',
  'fucker',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'nigger',
  'nigga',
  'retard',
  'idiot',
];

export const API_SUCCESS = 'SUCCESS';
export const API_ERROR = 'ERROR';
