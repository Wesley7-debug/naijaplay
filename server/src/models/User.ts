import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { USER_ROLES, XP_ACTIONS, type UserRole } from '@naijaplay/shared';

export interface ISocialLinks {
  twitter?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  discord?: string;
  website?: string;
}

export interface IUser {
  _id: mongoose.Types.ObjectId;
  email: string;
  emailVerified: boolean;
  googleId?: string | null;
  username: string;
  displayName: string;
  avatar?: string | null;
  bio?: string;
  location?: string;
  favoriteGames: mongoose.Types.ObjectId[];
  /** Free-typed titles missing from the games directory. */
  customGames: string[];
  interests: string[];
  socialLinks: ISocialLinks;
  role: UserRole;
  isVerified: boolean;
  isSuspended: boolean;
  suspendedReason?: string | null;
  followersCount: number;
  followingCount: number;
  roomsHostedCount: number;
  eventsJoinedCount: number;
  winsCount: number;
  giveawaysWonCount: number;
  xp: number;
  level: number;
  badges: { code: string; title: string; description: string; icon: string; awardedAt: Date }[];
  achievements: { code: string; unlockedAt: Date }[];
  seasonPoints: number;
  seasonId?: mongoose.Types.ObjectId | null;
  onboardingComplete: boolean;
  blockedUserIds: mongoose.Types.ObjectId[];
  lastSeenAt: Date;
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDoc = HydratedDocument<IUser>;

const socialLinksSchema = new Schema<ISocialLinks>(
  {
    twitter: { type: String, default: undefined },
    instagram: { type: String, default: undefined },
    tiktok: { type: String, default: undefined },
    youtube: { type: String, default: undefined },
    discord: { type: String, default: undefined },
    website: { type: String, default: undefined },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    emailVerified: { type: Boolean, default: false },
    googleId: { type: String, default: null, sparse: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    displayName: { type: String, required: true, trim: true },
    avatar: { type: String, default: null },
    bio: { type: String, default: '', maxlength: 280 },
    location: { type: String, default: '', maxlength: 60 },
    favoriteGames: [{ type: Schema.Types.ObjectId, ref: 'Game' }],
    customGames: [{ type: String, maxlength: 40 }],
    interests: [{ type: String }],
    socialLinks: { type: socialLinksSchema, default: () => ({}) },
    role: { type: String, enum: USER_ROLES, default: 'user' },
    isVerified: { type: Boolean, default: false },
    isSuspended: { type: Boolean, default: false },
    suspendedReason: { type: String, default: null },
    followersCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    roomsHostedCount: { type: Number, default: 0, min: 0 },
    eventsJoinedCount: { type: Number, default: 0, min: 0 },
    winsCount: { type: Number, default: 0, min: 0 },
    giveawaysWonCount: { type: Number, default: 0, min: 0 },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    badges: [
      {
        _id: false,
        code: String,
        title: String,
        description: String,
        icon: String,
        awardedAt: { type: Date, default: Date.now },
      },
    ],
    achievements: [{ _id: false, code: String, unlockedAt: { type: Date, default: Date.now } }],
    seasonPoints: { type: Number, default: 0, min: 0 },
    seasonId: { type: Schema.Types.ObjectId, ref: 'Season', default: null },
    onboardingComplete: { type: Boolean, default: false },
    blockedUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastSeenAt: { type: Date, default: Date.now },
    isSeed: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const r = ret as unknown as Record<string, unknown>;
        delete r.googleId;
        delete r.blockedUserIds;
        return r;
      },
    },
  },
);

userSchema.index({ username: 'text', displayName: 'text' });
userSchema.index({ lastSeenAt: -1 });
userSchema.index({ followersCount: -1 });
userSchema.index({ createdAt: -1 });

/** XP needed to advance FROM the given level to the next. */
export function xpForLevel(level: number): number {
  return 500 + (level - 1) * 250;
}

/** Total XP required to first reach a level. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l += 1) total += xpForLevel(l);
  return total;
}

/** Recompute level from total XP (server-authoritative). */
export function levelFromXp(xp: number): number {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(level) && level < 999) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return level;
}

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);

/** Convenience: XP action labels for history entries. */
export const XP_ACTION_REASONS: Record<keyof typeof XP_ACTIONS, string> = {
  ROOM_JOIN: 'Joined a room',
  ROOM_HOST: 'Hosted a room',
  EVENT_ATTEND: 'Attended an event',
  EVENT_HOST: 'Hosted an event',
  QUIZ_WIN: 'Won a quiz',
  QUIZ_PARTICIPATE: 'Played a quiz',
  COMPETITION_WIN: 'Won a competition',
  COMPETITION_PARTICIPATE: 'Entered a competition',
  GIVEAWAY_WIN: 'Won a giveaway',
  MOMENT_POST: 'Posted a moment',
  MOMENT_REACTION_RECEIVED: 'Got reactions on a moment',
  FOLLOW_RECEIVED: 'Gained a follower',
  ACHIEVEMENT_UNLOCK: 'Unlocked an achievement',
  CREW_JOIN: 'Joined a crew',
  SEASON_REWARD: 'Season reward',
  DAILY_STREAK: 'Daily activity streak',
};
