import { SEASON_RANK_TIERS, type SeasonRankTier } from '@naijaplay/shared';
import { Season, SeasonPointLog, SeasonScore, Crew, User, type ISeason } from '../models/index.js';
import logger from '../config/logger.js';
import { notify } from './notification.service.js';

const DEFAULT_TIERS: { tier: SeasonRankTier; threshold: number }[] = [
  { tier: 'okada', threshold: 0 },
  { tier: 'danfo', threshold: 250 },
  { tier: 'molue', threshold: 700 },
  { tier: 'bullion_van', threshold: 1500 },
];

export function tierForScore(score: number, tiers = DEFAULT_TIERS): SeasonRankTier {
  let current: SeasonRankTier = 'okada';
  for (const t of [...tiers].sort((a, b) => a.threshold - b.threshold)) {
    if (score >= t.threshold) current = t.tier;
  }
  return current;
}

export async function getActiveSeason(): Promise<ISeason | null> {
  return Season.findOne({ status: 'active' }).sort({ startDate: -1 });
}

/**
 * Award season points from a trusted platform result (event win, quiz, competition...).
 * There is no API that accepts raw seasonPoints from clients.
 */
export async function awardSeasonPoints(opts: {
  userId: string;
  delta: number;
  reason: string;
  sourceType: string;
  sourceId?: string;
}): Promise<number> {
  const season = await getActiveSeason();
  if (!season) return 0;
  if (!Number.isFinite(opts.delta) || opts.delta <= 0) return 0;

  // Idempotency: same source cannot pay out twice.
  if (opts.sourceId) {
    const dup = await SeasonPointLog.findOne({
      seasonId: season._id,
      userId: opts.userId,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
    });
    if (dup) return 0;
  }

  const delta = Math.min(opts.delta, 10_000);
  const row = await SeasonScore.findOneAndUpdate(
    { seasonId: season._id, userId: opts.userId },
    { $inc: { score: delta }, $setOnInsert: { userId: opts.userId } },
    { upsert: true, new: true },
  );

  await SeasonPointLog.create({
    seasonId: season._id,
    userId: opts.userId,
    delta,
    reason: opts.reason,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId || null,
    balanceAfter: row.score,
  });

  const distinct = await SeasonScore.distinct('userId', { seasonId: season._id });
  await Season.updateOne({ _id: season._id }, { $set: { participantCount: distinct.length } });
  return row.score;
}

export async function getSeasonLeaderboard(seasonId: string, limit = 50) {
  const rows = await SeasonScore.find({ seasonId }).sort({ score: -1 }).limit(limit).lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }).lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  return rows.map((row, idx) => {
    const user = userMap.get(String(row.userId));
    return {
      rank: idx + 1,
      user: user
        ? {
            id: String(user._id),
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar ?? null,
            isVerified: user.isVerified,
            level: user.level,
            xp: user.xp,
            followersCount: user.followersCount,
            followingCount: user.followingCount,
            roomsHostedCount: user.roomsHostedCount,
            eventsJoinedCount: user.eventsJoinedCount,
            winsCount: user.winsCount,
            giveawaysWonCount: user.giveawaysWonCount,
            role: user.role,
            createdAt: user.createdAt.toISOString(),
          }
        : null,
      score: row.score,
      tier: tierForScore(row.score),
    };
  });
}

/** Finalize: archive leaderboard, award badges, start next season. */
export async function finalizeSeason(seasonId: string): Promise<void> {
  const season = await Season.findById(seasonId);
  if (!season || season.status === 'archived') return;

  const leaderboard = await getSeasonLeaderboard(String(season._id), 10);
  const topCrews = await Crew.find().sort({ points: -1 }).limit(3).lean();

  season.status = 'archived';
  season.finalizedAt = new Date();
  season.archivedResults = {
    topUsers: leaderboard.map((e) => ({
      userId: e.user ? (e.user as unknown as { id: string })?.id as never : (e as never),
      username: e.user?.username || '',
      displayName: e.user?.displayName || '',
      score: e.score,
      tier: e.tier as SeasonRankTier,
    })),
    topCrews: topCrews.map((c) => ({ crewId: c._id, name: c.name, score: c.points })),
  };
  await season.save();

  // Award badges to top performers (server-side, non-client-controlled).
  const badges: { code: string; title: string; description: string; icon: string }[] = [
    { code: 'season_champion', title: `${season.name} Champion`, description: `Finished first in ${season.name}.`, icon: 'trophy' },
    { code: 'top_10', title: 'Top 10', description: `Top 10 in ${season.name}.`, icon: 'medal' },
  ];
  for (const [idx, entry] of leaderboard.entries()) {
    if (!entry.user) continue;
    const userId = String((entry.user as { id: string }).id);
    const badge = idx === 0 ? badges[0] : idx < 10 ? badges[1] : null;
    if (!badge) break;
    // eslint-disable-next-line no-await-in-loop
    await User.updateOne(
      { _id: userId, 'badges.code': { $ne: badge.code } },
      { $push: { badges: { ...badge, awardedAt: new Date() } } },
    );
    // eslint-disable-next-line no-await-in-loop
    await notify({
      userId,
      type: 'season_result',
      title: `${season.name} results are in`,
      body: idx === 0 ? 'You took the crown. Legend. 🏆' : `You finished #${idx + 1} in ${season.name}.`,
      link: `/seasons/${season._id}`,
      email: true,
    });
  }

  // Reset seasonal ranking by starting the next season.
  const next = await Season.create({
    name: `Season ${season.number + 1}`,
    number: season.number + 1,
    gameId: season.gameId,
    status: 'active',
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    tiers: DEFAULT_TIERS,
    rewards: ['Exclusive badge', 'Bragging rights', 'Crew War points'],
    badgeCodes: ['season_champion', 'top_10'],
  });
  season.nextSeasonId = next._id;
  await season.save();

  // Reset per-user seasonal points for the new season.
  await SeasonScore.deleteMany({ seasonId: next._id });
  await User.updateMany({}, { $set: { seasonPoints: 0 } });
  logger.info({ seasonId: String(season._id), nextSeasonId: String(next._id) }, 'season finalized and rolled over');
}

export { DEFAULT_TIERS };
