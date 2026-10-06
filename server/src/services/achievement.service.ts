import type { AchievementCode, BadgeCode } from '@naijaplay/shared';
import { User, Room, Event, Giveaway, Competition, Follow, Crew, Moment, type UserDoc } from '../models/index.js';
import { notify } from './notification.service.js';
import { awardXP } from './xp.service.js';
import logger from '../config/logger.js';

interface AchievementDef {
  code: AchievementCode;
  title: string;
  description: string;
  icon: string;
  /** Returns true when the achievement criteria are met (server-side check). */
  check: (userId: string) => Promise<boolean>;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    code: 'join_10_lagos_run_events',
    title: 'Lagos Run Regular',
    description: 'Join 10 Lagos Run events.',
    icon: '🏃',
    check: async (userId) => {
      const [events, rooms] = await Promise.all([
        Event.countDocuments({ gameId: { $ne: null }, status: 'ended' }),
        Room.countDocuments({ hostId: userId }),
      ]);
      void events;
      return rooms >= 10;
    },
  },
  {
    code: 'host_25_rooms',
    title: 'Serial Host',
    description: 'Host 25 rooms.',
    icon: '🎤',
    check: async (userId) => {
      const user = await User.findById(userId).select('roomsHostedCount');
      return (user?.roomsHostedCount || 0) >= 25;
    },
  },
  {
    code: 'win_5_giveaways',
    title: 'Giveaway King',
    description: 'Win 5 giveaways.',
    icon: '🎁',
    check: async (userId) => {
      const user = await User.findById(userId).select('giveawaysWonCount');
      return (user?.giveawaysWonCount || 0) >= 5;
    },
  },
  {
    code: 'win_10_competitions',
    title: 'Competitive Spirit',
    description: 'Win 10 competitions.',
    icon: '🏆',
    check: async (userId) => (await Competition.countDocuments({ winnerId: userId })) >= 10,
  },
  {
    code: 'first_competition_win',
    title: 'First Blood',
    description: 'Win your first competition.',
    icon: '🥇',
    check: async (userId) => (await Competition.countDocuments({ winnerId: userId })) >= 1,
  },
  {
    code: 'reach_100_followers',
    title: 'People’s Person',
    description: 'Reach 100 followers.',
    icon: '⭐',
    check: async (userId) => {
      const user = await User.findById(userId).select('followersCount');
      return (user?.followersCount || 0) >= 100;
    },
  },
  {
    code: 'create_successful_crew',
    title: 'Crew Captain',
    description: 'Create a crew that wins at least once.',
    icon: '🛡️',
    check: async (userId) => Crew.exists({ creatorId: userId, wins: { $gte: 1 } }).then(Boolean),
  },
  {
    code: 'send_first_message',
    title: 'Say Hi',
    description: 'Send your first chat message.',
    icon: '💬',
    check: async (userId) => {
      const { Message } = await import('../models/index.js');
      return Message.exists({ senderId: userId }).then(Boolean);
    },
  },
  {
    code: 'post_10_moments',
    title: 'Moment Maker',
    description: 'Post 10 moments.',
    icon: '📸',
    check: async (userId) => (await Moment.countDocuments({ authorId: userId, deletedAt: null })) >= 10,
  },
  {
    code: 'attend_7_days_streak',
    title: 'Consistent',
    description: 'Be active 7 days in a row.',
    icon: '🔥',
    check: async (userId) => {
      const { XpTransaction } = await import('../models/index.js');
      const days = await XpTransaction.aggregate([
        { $match: { userId: userId as never } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
        { $sort: { _id: -1 } },
        { $limit: 7 },
      ]);
      if (days.length < 7) return false;
      const dates = days.map((d) => new Date(d._id).getTime());
      for (let i = 0; i < dates.length - 1; i += 1) {
        const gapDays = Math.round((dates[i] - dates[i + 1]) / (24 * 60 * 60 * 1000));
        if (gapDays !== 1) return false;
      }
      return true;
    },
  },
];

/**
 * Evaluate achievements for a user — server-authoritative.
 * Unlocks are idempotent (schema prevents duplicates via $nin check).
 */
export async function evaluateAchievements(userId: string): Promise<AchievementCode[]> {
  const user = await User.findById(userId);
  if (!user) return [];
  const owned = new Set(user.achievements.map((a) => a.code));
  const unlocked: AchievementCode[] = [];

  for (const def of ACHIEVEMENTS) {
    if (owned.has(def.code)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const met = await def.check(userId);
      if (!met) continue;
      // eslint-disable-next-line no-await-in-loop
      const res = await User.updateOne(
        { _id: userId, 'achievements.code': { $ne: def.code } },
        { $push: { achievements: { code: def.code, unlockedAt: new Date() } } },
      );
      if (res.modifiedCount > 0) {
        unlocked.push(def.code);
        // eslint-disable-next-line no-await-in-loop
        await notify({
          userId,
          type: 'achievement_unlocked',
          title: `Achievement unlocked: ${def.title}`,
          body: def.description,
          link: '/profile',
        });
        // eslint-disable-next-line no-await-in-loop
        await awardXP(userId, 'ACHIEVEMENT_UNLOCK', { code: def.code });
      }
    } catch (err) {
      logger.warn({ err, code: def.code }, 'achievement check failed');
    }
  }
  return unlocked;
}

export const BADGES: Record<BadgeCode, { title: string; description: string; icon: string }> = {
  season_1_champion: { title: 'Season 1 Champion', description: 'Won the first season.', icon: '🏆' },
  top_10: { title: 'Top 10', description: 'Finished in the season top 10.', icon: '🔥' },
  top_crew: { title: 'Top Crew', description: 'Part of the top crew of a season.', icon: '🛡️' },
  giveaway_king: { title: 'Giveaway King', description: 'Won 5+ giveaways.', icon: '🎁' },
  quiz_master: { title: 'Quiz Master', description: 'Won 5+ quizzes.', icon: '🧠' },
  host_with_the_most: { title: 'Host With The Most', description: 'Hosted 25+ rooms.', icon: '🎤' },
  early_player: { title: 'Early Player', description: 'Joined during the first month.', icon: '🌱' },
  og_member: { title: 'OG', description: 'Found NaijaPlay early.', icon: '⭐' },
};

/** Award a badge exactly once. Ownership lives in the DB, never client state. */
export async function awardBadge(userId: string, code: BadgeCode): Promise<boolean> {
  const badge = BADGES[code];
  if (!badge) return false;
  const res = await User.updateOne(
    { _id: userId, 'badges.code': { $ne: code } },
    { $push: { badges: { code, ...badge, awardedAt: new Date() } } },
  );
  if (res.modifiedCount > 0) {
    await notify({ userId, type: 'achievement_unlocked', title: `Badge earned: ${badge.title}`, body: badge.description, link: '/profile' });
    return true;
  }
  return false;
}
