import { Router } from 'express';
import { z } from 'zod';
import { createCompetitionSchema, paginationSchema } from '@naijaplay/shared';
import { handler, ok, created } from '../utils/http.js';
import { clientLink } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth, currentUser } from '../middleware/auth.js';
import { Season, SeasonScore, Competition, CompetitionEntry, User, Game, Crew, Recap, type ISeason, type ICompetition } from '../models/index.js';
import { getActiveSeason, getSeasonLeaderboard, tierForScore, DEFAULT_TIERS } from '../services/season.service.js';
import { serializeUser, serializeGame } from '../utils/serialize.js';
import { AppError } from '../utils/errors.js';
import { notify } from '../services/notification.service.js';
import { awardXP } from '../services/xp.service.js';
import { awardCrewPoints, recordCrewResult } from '../services/crew.service.js';
import { awardSeasonPoints } from '../services/season.service.js';
import { evaluateAchievements } from '../services/achievement.service.js';

const router = Router();

/** GET /api/seasons — active + archived seasons (historical results remain viewable). */
router.get(
  '/',
  handler(async (_req, res) => {
    const seasons = await Season.find({}).sort({ number: -1 }).limit(12).lean();
    return ok(res, {
      items: seasons.map((s) => ({
        id: String(s._id),
        name: s.name,
        number: s.number,
        status: s.status,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        tiers: s.tiers?.length ? s.tiers : DEFAULT_TIERS,
        rewards: s.rewards,
        participantCount: s.participantCount,
        archivedResults: s.archivedResults || null,
        finalizedAt: s.finalizedAt ? s.finalizedAt.toISOString() : null,
      })),
    });
  }),
);

/** GET /api/seasons/active */
router.get(
  '/active',
  handler(async (_req, res) => {
    const season = await getActiveSeason();
    if (!season) return ok(res, { season: null });
    return ok(res, {
      season: {
        id: String(season._id),
        name: season.name,
        number: season.number,
        status: season.status,
        startDate: season.startDate.toISOString(),
        endDate: season.endDate.toISOString(),
        tiers: season.tiers?.length ? season.tiers : DEFAULT_TIERS,
        rewards: season.rewards,
        participantCount: season.participantCount,
      },
    });
  }),
);

/** GET /api/seasons/:id/leaderboard */
router.get(
  '/:id/leaderboard',
  handler(async (req, res) => {
    const season = await Season.findById(req.params.id);
    if (!season) throw AppError.notFound('SEASON_NOT_FOUND', 'Season not found.');
    const items = await getSeasonLeaderboard(String(season._id), Math.min(Number(req.query.limit) || 50, 100));
    return ok(res, { items, seasonId: String(season._id), name: season.name });
  }),
);

/** GET /api/seasons/:id — detail incl. archived results. */
router.get(
  '/:id',
  handler(async (req, res) => {
    const season = await Season.findById(req.params.id);
    if (!season) throw AppError.notFound('SEASON_NOT_FOUND', 'Season not found.');
    const board = await getSeasonLeaderboard(String(season._id), 20);
    return ok(res, {
      season: {
        id: String(season._id),
        name: season.name,
        number: season.number,
        status: season.status,
        startDate: season.startDate.toISOString(),
        endDate: season.endDate.toISOString(),
        tiers: season.tiers?.length ? season.tiers : DEFAULT_TIERS,
        rewards: season.rewards,
        participantCount: season.participantCount,
        archivedResults: season.archivedResults || null,
      },
      leaderboard: board,
    });
  }),
);

/** GET /api/seasons/me/rank — viewer's rank + tier (server-computed). */
router.get(
  '/me/rank',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const season = await getActiveSeason();
    if (!season) return ok(res, { rank: null, score: 0, tier: 'okada' });
    const row = await SeasonScore.findOne({ seasonId: season._id, userId: user._id });
    if (!row) return ok(res, { rank: null, score: 0, tier: 'okada', seasonName: season.name });
    const better = await SeasonScore.countDocuments({ seasonId: season._id, score: { $gt: row.score } });
    return ok(res, { rank: better + 1, score: row.score, tier: tierForScore(row.score), seasonName: season.name });
  }),
);

// ---- Competitions ----

/** POST /api/competitions */
router.post(
  '/',
  requireAuth,
  validate(createCompetitionSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as { title: string; description?: string; gameId?: string; format: string; rules?: string[]; prizes?: string[]; startsAt: string; endsAt: string };
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) throw AppError.badRequest('BAD_DATES', 'End time must be after start time.');

    const competition = await Competition.create({
      title: body.title,
      description: body.description || '',
      gameId: body.gameId || null,
      hostId: user._id,
      format: body.format,
      rules: body.rules || [],
      prizes: body.prizes || [],
      startsAt,
      endsAt,
      status: 'registration',
      participantIds: [user._id],
    });
    await CompetitionEntry.create({ competitionId: competition._id, userId: user._id, crewId: null, score: 0 });
    return created(res, { competition: { id: String(competition._id), title: competition.title, status: competition.status } });
  }),
);

/** GET /api/competitions */
router.get(
  '/',
  optionalAuth,
  handler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : { $in: ['registration', 'active'] };
    const competitions = await Competition.find({ status: status as never }).sort({ startsAt: 1 }).limit(30).lean();
    const gameIds = competitions.map((c) => c.gameId).filter(Boolean);
    const games = gameIds.length ? await Game.find({ _id: { $in: gameIds } }).lean() : [];
    const gameMap = new Map(games.map((g) => [String(g._id), g]));
    const hosts = await User.find({ _id: { $in: competitions.map((c) => c.hostId) } }).lean();
    const hostMap = new Map(hosts.map((h) => [String(h._id), h]));
    const viewerId = req.user ? String(req.user._id) : null;

    return ok(res, {
      items: competitions.map((c) => ({
        id: String(c._id),
        title: c.title,
        description: c.description,
        game: c.gameId && gameMap.get(String(c.gameId)) ? serializeGame(gameMap.get(String(c.gameId))!) : null,
        host: hostMap.get(String(c.hostId)) ? serializeUser(hostMap.get(String(c.hostId))!) : null,
        format: c.format,
        rules: c.rules,
        prizes: c.prizes,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        status: c.status,
        participantCount: c.participantIds.length,
        crewCount: c.crewIds.length,
        winner: c.winnerId ? 'decided' : null,
        viewerJoined: viewerId ? c.participantIds.some((p) => String(p) === viewerId) : false,
        shareUrl: clientLink(`/competitions/${c._id}`),
      })),
    });
  }),
);

/** GET /api/competitions/:id */
router.get(
  '/:id',
  optionalAuth,
  handler(async (req, res) => {
    const competition = await Competition.findById(req.params.id);
    if (!competition) throw AppError.notFound('COMPETITION_NOT_FOUND', 'Competition not found.');
    const entries = await CompetitionEntry.find({ competitionId: competition._id }).sort({ score: -1 }).limit(50).lean();
    const users = await User.find({ _id: { $in: entries.map((e) => e.userId) } }).lean();
    const map = new Map(users.map((u) => [String(u._id), u]));
    const host = await User.findById(competition.hostId);
    const game = competition.gameId ? await Game.findById(competition.gameId) : null;
    const viewerId = req.user ? String(req.user._id) : null;
    return ok(res, {
      competition: {
        id: String(competition._id),
        title: competition.title,
        description: competition.description,
        game: game ? serializeGame(game) : null,
        host: host ? serializeUser(host) : null,
        format: competition.format,
        rules: competition.rules,
        prizes: competition.prizes,
        startsAt: competition.startsAt.toISOString(),
        endsAt: competition.endsAt.toISOString(),
        status: competition.status,
        participantCount: competition.participantIds.length,
        crewCount: competition.crewIds.length,
        viewerJoined: viewerId ? competition.participantIds.some((p) => String(p) === viewerId) : false,
        shareUrl: clientLink(`/competitions/${competition._id}`),
      },
      leaderboard: entries.map((e, i) => ({
        rank: i + 1,
        score: e.score,
        user: map.get(String(e.userId)) ? serializeUser(map.get(String(e.userId))!) : null,
      })),
    });
  }),
);

/** POST /api/competitions/:id/join */
router.post(
  '/:id/join',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const competition = await Competition.findById(req.params.id);
    if (!competition) throw AppError.notFound('COMPETITION_NOT_FOUND', 'Competition not found.');
    if (!['registration', 'active'].includes(competition.status)) throw AppError.conflict('CLOSED', 'Registration is closed.');
    if (competition.participantIds.some((p) => String(p) === String(user._id))) {
      return ok(res, { joined: true, alreadyJoined: true });
    }
    try {
      await CompetitionEntry.create({ competitionId: competition._id, userId: user._id, score: 0 });
    } catch (err: unknown) {
      if ((err as { code?: number })?.code !== 11000) throw err;
    }
    competition.participantIds.push(user._id);
    await competition.save();
    await awardXP(String(user._id), 'COMPETITION_PARTICIPATE', { competitionId: String(competition._id) });
    const { CrewMember } = await import('../models/index.js');
    const crewMembership = await CrewMember.findOne({ userId: user._id });
    if (crewMembership && !competition.crewIds.some((c) => String(c) === String(crewMembership.crewId))) {
      competition.crewIds.push(crewMembership.crewId);
      await competition.save();
      await CompetitionEntry.updateOne(
        { competitionId: competition._id, userId: user._id },
        { $set: { crewId: crewMembership.crewId } },
      );
    }
    return ok(res, { joined: true, participantCount: competition.participantIds.length });
  }),
);

/**
 * POST /api/competitions/:id/result — server-recorded result (host/admin).
 * Awards XP, season points and crew points from this single trusted source.
 */
router.post(
  '/:id/result',
  requireAuth,
  validate(z.object({ winnerUserId: z.string().regex(/^[0-9a-fA-F]{24}$/), crewId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable() })),
  handler(async (req, res) => {
    const actor = currentUser(req);
    const competition = await Competition.findById(req.params.id);
    if (!competition) throw AppError.notFound('COMPETITION_NOT_FOUND', 'Competition not found.');
    const isHost = String(competition.hostId) === String(actor._id);
    if (!isHost && !['admin', 'moderator'].includes(actor.role)) throw AppError.forbidden('NOT_HOST', 'Only the host can record results.');
    if (competition.winnerId) throw AppError.conflict('ALREADY_DECIDED', 'Result already recorded.');

    const { winnerUserId, crewId } = req.body as { winnerUserId: string; crewId?: string };
    const winner = await User.findById(winnerUserId);
    if (!winner) throw AppError.notFound('USER_NOT_FOUND', 'Winner not found.');
    const isParticipant = competition.participantIds.some((p) => String(p) === winnerUserId);
    if (!isParticipant) throw AppError.badRequest('NOT_PARTICIPANT', 'Winner must be a participant.');

    competition.winnerId = winner._id;
    competition.status = 'completed';
    if (crewId) competition.winningCrewId = crewId as never;
    await competition.save();

    await User.updateOne({ _id: winner._id }, { $inc: { winsCount: 1 } });
    const xp = await awardXP(winnerUserId, 'COMPETITION_WIN', { competitionId: String(competition._id) });
    await awardSeasonPoints({
      userId: winnerUserId,
      delta: 150,
      reason: `Won ${competition.title}`,
      sourceType: 'competition',
      sourceId: String(competition._id),
    });
    const winningCrewId = crewId || null;
    if (winningCrewId) {
      await recordCrewResult(winningCrewId, 'win', { reason: `${competition.title} win`, sourceType: 'competition', sourceId: String(competition._id) });
    }
    // Losers' crews record a loss for rivalry tracking.
    for (const pid of competition.participantIds) {
      if (String(pid) === winnerUserId) continue;
      // eslint-disable-next-line no-await-in-loop
      const { CrewMember } = await import('../models/index.js');
      // eslint-disable-next-line no-await-in-loop
      const membership = await CrewMember.findOne({ userId: pid });
      if (membership && String(membership.crewId) !== String(winningCrewId)) {
        // eslint-disable-next-line no-await-in-loop
        await recordCrewResult(String(membership.crewId), 'loss', { reason: `${competition.title} result`, sourceType: 'competition', sourceId: String(competition._id) });
      }
    }

    await Promise.all([
      notify({
        userId: winnerUserId,
        type: 'season_result',
        title: 'Winner! 🏆',
        body: `You won ${competition.title}.`,
        link: `/competitions/${competition._id}`,
        email: true,
      }),
      evaluateAchievements(winnerUserId),
    ]);

    return ok(res, { ok: true, winner: serializeUser(winner), xpGained: xp.amount });
  }),
);

export default router;

