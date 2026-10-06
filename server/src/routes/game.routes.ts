import { Router } from 'express';
import { z } from 'zod';
import { handler, ok, created } from '../utils/http.js';
import { clientLink } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth, currentUser } from '../middleware/auth.js';
import { Game, GameFollow, GameScore, Room, Event, Moment, Season, User, type IGame } from '../models/index.js';
import { serializeGame, serializeUser } from '../utils/serialize.js';
import { AppError } from '../utils/errors.js';

const router = Router();

/** GET /api/games — informational/social directory (no game APIs). */
router.get(
  '/',
  handler(async (_req, res) => {
    const games = await Game.find({}).sort({ isFeatured: -1, followersCount: -1 }).lean();
    const liveCounts = await Room.aggregate([
      { $match: { status: 'live', isPrivate: false } },
      { $group: { _id: '$gameId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(liveCounts.map((c) => [String(c._id), c.count]));
    return ok(res, { items: games.map((g) => serializeGame(g as IGame, { roomsLive: countMap.get(String(g._id)) || 0 })) });
  }),
);

/** GET /api/games/:idOrSlug */
router.get(
  '/:idOrSlug',
  optionalAuth,
  handler(async (req, res) => {
    const key = String(req.params.idOrSlug);
    const game = /^[0-9a-fA-F]{24}$/.test(key) ? await Game.findById(key) : await Game.findOne({ slug: key });
    if (!game) throw AppError.notFound('GAME_NOT_FOUND', 'Game not found.');

    const [liveRooms, upcomingEvents, seasons, moments, topScores, viewerFollows] = await Promise.all([
      Room.find({ gameId: game._id, status: 'live', isPrivate: false }).sort({ memberCount: -1 }).limit(8).lean(),
      Event.find({ gameId: game._id, status: { $in: ['upcoming', 'live'] } }).sort({ startsAt: 1 }).limit(6).lean(),
      Season.find({ gameId: game._id }).sort({ startDate: -1 }).limit(3).lean(),
      Moment.find({ gameId: game._id, deletedAt: null }).sort({ createdAt: -1 }).limit(8).lean(),
      GameScore.find({ gameId: game._id }).sort({ score: -1 }).limit(10).lean(),
      req.user ? GameFollow.exists({ userId: req.user._id, gameId: game._id }) : null,
    ]);

    const scoreUsers = topScores.length ? await User.find({ _id: { $in: topScores.map((s) => s.userId) } }).lean() : [];
    const scoreMap = new Map(scoreUsers.map((u) => [String(u._id), u]));

    const hosts = liveRooms.length ? await User.find({ _id: { $in: liveRooms.map((r) => r.hostId) } }).lean() : [];
    const hostMap = new Map(hosts.map((h) => [String(h._id), h]));

    return ok(res, {
      game: serializeGame(game as IGame),
      isFollowing: Boolean(viewerFollows),
      liveRooms: liveRooms.map((r) => ({
        id: String(r._id),
        name: r.name,
        slug: r.slug,
        code: r.code,
        status: r.status,
        memberCount: r.memberCount,
        capacity: r.capacity,
        category: r.category,
        host: hostMap.get(String(r.hostId)) ? serializeUser(hostMap.get(String(r.hostId))!) : null,
        shareUrl: clientLink(`/r/${r.code}`),
        createdAt: r.createdAt.toISOString(),
      })),
      upcomingEvents: upcomingEvents.map((e) => ({
        id: String(e._id),
        title: e.title,
        slug: e.slug,
        startsAt: e.startsAt.toISOString(),
        mode: e.mode,
        city: e.city,
        goingCount: e.goingCount,
        capacity: e.capacity,
        status: e.status,
      })),
      seasons: seasons.map((s) => ({
        id: String(s._id),
        name: s.name,
        number: s.number,
        status: s.status,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        tiers: s.tiers,
      })),
      moments,
      topScores: topScores.map((s, i) => ({
        rank: i + 1,
        score: s.score,
        verification: s.verification,
        user: scoreMap.get(String(s.userId)) ? serializeUser(scoreMap.get(String(s.userId))!) : null,
      })),
    });
  }),
);

/** POST /api/games/:id/follow */
router.post(
  '/:id/follow',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const game = await Game.findById(req.params.id);
    if (!game) throw AppError.notFound('GAME_NOT_FOUND', 'Game not found.');
    try {
      await GameFollow.create({ userId: user._id, gameId: game._id });
      await Game.updateOne({ _id: game._id }, { $inc: { followersCount: 1 } });
    } catch (err: unknown) {
      if ((err as { code?: number })?.code !== 11000) throw err;
    }
    return ok(res, { following: true });
  }),
);

router.post(
  '/:id/unfollow',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const removed = await GameFollow.findOneAndDelete({ userId: user._id, gameId: req.params.id });
    if (removed) await Game.updateOne({ _id: req.params.id, followersCount: { $gt: 0 } }, { $inc: { followersCount: -1 } });
    return ok(res, { following: false });
  }),
);

/** POST /api/games/:id/scores — self-reported score with optional screenshot.
 *  Verification is host/moderator moderated; never implies official game verification. */
router.post(
  '/:id/scores',
  requireAuth,
  validate(
    z.object({
      score: z.coerce.number().int().min(0).max(1_000_000_000),
      gameUsername: z.string().max(40).optional().or(z.literal('')),
      screenshotUrl: z.string().url().max(600).optional().or(z.literal('')),
      externalUrl: z.string().url().max(600).optional().or(z.literal('')),
    }),
  ),
  handler(async (req, res) => {
    const user = currentUser(req);
    const game = await Game.findById(req.params.id);
    if (!game) throw AppError.notFound('GAME_NOT_FOUND', 'Game not found.');
    const body = req.body as { score: number; gameUsername?: string; screenshotUrl?: string; externalUrl?: string };
    const entry = await GameScore.create({
      userId: user._id,
      gameId: game._id,
      score: body.score,
      gameUsername: body.gameUsername || null,
      screenshotUrl: body.screenshotUrl || null,
      externalUrl: body.externalUrl || null,
      verification: 'unverified',
    });
    return created(res, { score: { id: String(entry._id), score: entry.score, verification: entry.verification, createdAt: entry.createdAt.toISOString() } });
  }),
);

/** POST /api/games/scores/:scoreId/verify — host/moderator marks verified/unverified. */
router.post(
  '/scores/:scoreId/verify',
  requireAuth,
  validate(z.object({ status: z.enum(['verified', 'rejected', 'unverified']), note: z.string().max(300).optional() })),
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!['admin', 'moderator', 'creator'].includes(user.role)) throw AppError.forbidden('NOT_MODERATOR', 'Only moderators can verify scores.');
    const { status } = req.body as { status: string };
    const entry = await GameScore.findById(req.params.scoreId);
    if (!entry) throw AppError.notFound('SCORE_NOT_FOUND', 'Score not found.');
    entry.verification = status as never;
    entry.verifiedBy = user._id;
    await entry.save();
    return ok(res, { verification: entry.verification, note: 'Community-verified. Not an official game verification.' });
  }),
);

export default router;

