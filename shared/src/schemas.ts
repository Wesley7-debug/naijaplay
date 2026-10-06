import { z } from 'zod';
import {
  ROOM_CATEGORIES,
  ROOM_TYPES,
  EVENT_MODES,
  GIVEAWAY_TYPES,
  GIVEAWAY_CONDITIONS,
  COMPETITION_FORMATS,
  REPORT_TARGETS,
  REPORT_REASONS,
  MOMENT_TYPES,
  CREW_KINDS,
  NIGERIAN_AREAS,
  CITIES,
  INTERESTS,
} from './constants';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/** Free-typed game titles (directory misses, local mods, tabletop, etc.). */
export const customGamesSchema = z
  .array(z.string().trim().max(40, 'Keep it under 40 characters'))
  .max(8, 'Max 8 custom games')
  .default([])
  .transform((list) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const name = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push(name);
    }
    return out.slice(0, 8);
  });

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(24, 'Username must be at most 24 characters')
  .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers and underscores');

export const displayNameSchema = z.string().min(2).max(50);
export const bioSchema = z.string().max(280).optional();
export const locationSchema = z.string().max(60).optional();
export const emailSchema = z.string().email('Enter a valid email').max(254);

export const socialLinksSchema = z.object({
  twitter: z.string().url().or(z.string().max(0)).optional().or(z.literal('')),
  instagram: z.string().url().or(z.string().max(0)).optional().or(z.literal('')),
  tiktok: z.string().url().or(z.string().max(0)).optional().or(z.literal('')),
  youtube: z.string().url().or(z.string().max(0)).optional().or(z.literal('')),
  discord: z.string().url().or(z.string().max(0)).optional().or(z.literal('')),
  website: z.string().url().or(z.string().max(0)).optional().or(z.literal('')),
});

export const onboardingSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  avatar: z.string().max(500).optional().or(z.literal('')),
  location: locationSchema,
  favoriteGames: z.array(objectId).max(8).default([]),
  /** Free-typed game names for titles missing from the directory. */
  customGames: customGamesSchema,
  interests: z.array(z.string().max(40)).max(10).default([]),
  socialLinks: socialLinksSchema.partial().optional(),
  bio: bioSchema,
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatar: z.string().max(500).optional().or(z.literal('')),
  bio: bioSchema,
  location: locationSchema,
  favoriteGames: z.array(objectId).max(8).optional(),
  customGames: customGamesSchema.optional(),
  interests: z.array(z.string().max(40)).max(10).optional(),
  socialLinks: socialLinksSchema.partial().optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const magicLinkSchema = z.object({ email: emailSchema });

export const createRoomSchema = z.object({
  name: z.string().min(3, 'Room name is too short').max(80),
  description: z.string().max(500).optional().or(z.literal('')),
  category: z.enum(ROOM_CATEGORIES),
  gameId: objectId.optional().nullable(),
  isPrivate: z.boolean().default(false),
  capacity: z.coerce.number().int().min(2).max(5000).default(100),
  mode: z.enum(['now', 'schedule']).default('now'),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
  externalGameUrl: z.string().url().optional().or(z.literal('')),
  externalGameCode: z.string().max(40).optional().or(z.literal('')),
  rules: z.array(z.string().max(200)).max(20).optional(),
  coverImage: z.string().max(500).optional().or(z.literal('')),
  location: z.string().max(60).optional().or(z.literal('')),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const createEventSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(2000).optional().or(z.literal('')),
  mode: z.enum(EVENT_MODES),
  category: z.enum(ROOM_CATEGORIES),
  gameId: objectId.optional().nullable(),
  city: z.string().max(60).optional().or(z.literal('')),
  area: z.enum(NIGERIAN_AREAS).optional().or(z.literal('')),
  venue: z.string().max(200).optional().or(z.literal('')),
  safetyNotes: z.string().max(600).optional().or(z.literal('')),
  onlineUrl: z.string().url().optional().or(z.literal('')),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).optional().nullable(),
  capacity: z.coerce.number().int().min(1).max(10000).default(100),
  rules: z.array(z.string().max(200)).max(20).optional(),
  coverImage: z.string().max(500).optional().or(z.literal('')),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const rsvpSchema = z.object({
  status: z.enum(['going', 'maybe', 'cancelled']),
});

export const sendMessageSchema = z.object({
  content: z.string().max(2000).default(''),
  replyTo: objectId.optional().nullable(),
  attachments: z
    .array(
      z.object({
        type: z.enum(['image', 'gif']),
        url: z.string().url().max(1000),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .max(4)
    .optional()
    .default([]),
});

export const createPollSchema = z.object({
  question: z.string().min(3).max(300),
  options: z.array(z.string().min(1).max(120)).min(2).max(6),
  durationSeconds: z.coerce.number().int().min(15).max(3600).default(300),
});

/** Global lobby chat: short messages, guests allowed with a guest identity. */
export const guestIdSchema = z
  .string()
  .regex(/^g_[0-9a-f]{8,64}$/, 'Invalid guest id')
  .max(66);

export const guestNameSchema = z
  .string()
  .min(3, 'Pick a name with at least 3 characters')
  .max(20, 'Keep it under 20 characters')
  .regex(/^[A-Za-z0-9_ ]+$/, 'Only letters, numbers, spaces and underscores');

export const globalMessageSchema = z.object({
  content: z.string().min(1, 'Say something').max(500, 'Keep it under 500 characters'),
  guestId: guestIdSchema.optional(),
  guestName: guestNameSchema.optional(),
});

export const createGiveawaySchema = z.object({
  title: z.string().min(3).max(120),
  prize: z.string().min(1).max(200),
  type: z.enum(GIVEAWAY_TYPES),
  winnerCount: z.coerce.number().int().min(1).max(50).default(1),
  entryCondition: z.enum(GIVEAWAY_CONDITIONS).default('in_room'),
  entryDetail: z.string().max(300).optional().or(z.literal('')),
  minAccountAgeDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
  durationSeconds: z.coerce.number().int().min(30).max(7200).default(300),
});
export type CreateGiveawayInput = z.infer<typeof createGiveawaySchema>;

export const createCrewSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(500).optional().or(z.literal('')),
  kind: z.enum(CREW_KINDS).default('other'),
  avatar: z.string().max(500).optional().or(z.literal('')),
  cover: z.string().max(500).optional().or(z.literal('')),
});
export type CreateCrewInput = z.infer<typeof createCrewSchema>;

export const createMomentSchema = z.object({
  caption: z.string().min(1, 'Say something').max(500),
  type: z.enum(MOMENT_TYPES).default('text'),
  media: z
    .object({
      url: z.string().url().max(1000),
      type: z.enum(['image', 'video']),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      durationSec: z.number().positive().optional(),
    })
    .optional()
    .nullable(),
  gameId: objectId.optional().nullable(),
  roomId: objectId.optional().nullable(),
  eventId: objectId.optional().nullable(),
});
export type CreateMomentInput = z.infer<typeof createMomentSchema>;

export const commentSchema = z.object({
  content: z.string().min(1).max(500),
});

export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: objectId,
  reason: z.enum(REPORT_REASONS),
  description: z.string().max(1000).optional().or(z.literal('')),
});
export type ReportInput = z.infer<typeof reportSchema>;

export const createCompetitionSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional().or(z.literal('')),
  gameId: objectId.optional().nullable(),
  format: z.enum(COMPETITION_FORMATS),
  rules: z.array(z.string().max(300)).max(20).default([]),
  prizes: z.array(z.string().max(200)).max(10).default([]),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});
export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>;

export const quizQuestionsSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  questions: z
    .array(
      z.object({
        question: z.string().min(2).max(300),
        options: z.array(z.string().min(1).max(120)).min(2).max(6),
        correctIndex: z.number().int().min(0).max(5),
        roundTimeSeconds: z.coerce.number().int().min(5).max(120).optional(),
      }),
    )
    .min(3)
    .max(50),
});
export type QuizQuestionsInput = z.infer<typeof quizQuestionsSchema>;

export const magicRequestSchema = z.object({ email: emailSchema });

export const searchSchema = z.object({
  q: z.string().min(1).max(80),
  type: z.enum(['all', 'rooms', 'users', 'crews', 'games', 'events']).default('all'),
});

export const leaderboardQuerySchema = z.object({
  scope: z.enum(['global', 'crews', 'games', 'weekly', 'monthly', 'season']).default('global'),
  gameId: objectId.optional(),
  seasonId: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const lfgToggleSchema = z.object({
  gameId: objectId.nullable().optional(),
  category: z.enum(ROOM_CATEGORIES).nullable().optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createSponsorSchema = z.object({
  name: z.string().min(2).max(80),
  website: z.string().url().optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  logo: z.string().max(500).optional().or(z.literal('')),
  banner: z.string().max(500).optional().or(z.literal('')),
});

export const createSponsoredEventSchema = z.object({
  sponsorId: objectId,
  eventId: objectId,
  campaignName: z.string().min(2).max(120),
  sponsorContribution: z.coerce.number().int().min(0),
  banner: z.string().max(500).optional().or(z.literal('')),
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
});

export const moderationActionSchema = z.object({
  action: z.enum([
    'mute',
    'unmute',
    'kick',
    'ban',
    'unban',
    'approve',
    'assign_cohost',
    'assign_moderator',
    'remove_moderator',
  ]),
  targetUserId: objectId,
});

export const adminUserActionSchema = z.object({
  action: z.enum(['suspend', 'unsuspend', 'verify', 'unverify', 'set_role']),
  role: z.enum(['user', 'creator', 'moderator', 'admin']).optional(),
  reason: z.string().max(300).optional(),
});

export const reportResolveSchema = z.object({
  status: z.enum(['reviewing', 'resolved', 'dismissed']),
  resolution: z.string().max(500).optional().or(z.literal('')),
});

export const interestsSchema = z.object({
  interests: z.array(z.string().max(40)).max(10),
});

export { objectId };
