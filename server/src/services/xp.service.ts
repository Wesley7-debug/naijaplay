import { XP_ACTIONS, XP_FARM_WINDOW_MINUTES, type XpAction } from '@naijaplay/shared';
import { User, XpTransaction, levelFromXp, xpForLevel, XP_ACTION_REASONS, type UserDoc } from '../models/index.js';
import logger from '../config/logger.js';

/**
 * Central XP service. ALL XP mutations flow through awardXP.
 * The backend determines the amount — clients can never post XP.
 */
export async function awardXP(
  userId: string,
  action: XpAction,
  metadata: Record<string, unknown> = {},
  opts: { reason?: string; amountOverride?: number } = {},
): Promise<{ amount: number; xp: number; level: number; leveledUp: boolean; skipped?: string }> {
  const baseAmount = opts.amountOverride ?? XP_ACTIONS[action];
  if (!baseAmount || baseAmount <= 0) {
    return { amount: 0, xp: 0, level: 1, leveledUp: false, skipped: 'unknown_action' };
  }

  // Anti-farming: limit repeatable actions within a rolling window.
  const windowMinutes = XP_FARM_WINDOW_MINUTES[action];
  if (windowMinutes) {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const recent = await XpTransaction.countDocuments({ userId, action, createdAt: { $gte: since } });
    const maxPerWindow = action === 'MOMENT_REACTION_RECEIVED' ? 50 : action === 'FOLLOW_RECEIVED' ? 30 : action === 'ROOM_JOIN' ? 10 : 5;
    if (recent >= maxPerWindow) {
      return { amount: 0, xp: 0, level: 1, leveledUp: false, skipped: 'rate_limited' };
    }
  }

  const user = await User.findById(userId);
  if (!user) return { amount: 0, xp: 0, level: 1, leveledUp: false, skipped: 'no_user' };

  const beforeLevel = user.level;
  user.xp += baseAmount;
  user.level = levelFromXp(user.xp);
  await user.save();

  await XpTransaction.create({
    userId,
    action,
    amount: baseAmount,
    reason: opts.reason || XP_ACTION_REASONS[action],
    metadata,
    balanceAfter: user.xp,
  });

  return {
    amount: baseAmount,
    xp: user.xp,
    level: user.level,
    leveledUp: user.level > beforeLevel,
  };
}

export async function getXpProgress(user: Pick<UserDoc, 'xp' | 'level'>) {
  const currentLevelXp = xpForLevel(user.level);
  const progress = Math.min(100, Math.round((user.xp / currentLevelXp) * 100));
  return {
    xp: user.xp,
    level: user.level,
    currentLevelXp: user.xp,
    nextLevelXp: currentLevelXp,
    progress,
  };
}

export async function getXpHistory(userId: string, limit = 30) {
  const rows = await XpTransaction.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((r) => ({
    id: String(r._id),
    action: r.action,
    amount: r.amount,
    reason: r.reason,
    createdAt: (r.createdAt as Date).toISOString(),
  }));
}

/** Test/debug helper — never exposed as an API. */
export function assertNeverAwarded(amount: number): boolean {
  if (amount < 0) {
    logger.warn({ amount }, 'negative XP rejected');
    return false;
  }
  return true;
}
