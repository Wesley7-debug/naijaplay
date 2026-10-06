import { Router } from 'express';
import { z } from 'zod';
import {
  leaderboardQuerySchema,
  lfgToggleSchema,
  searchSchema,
} from '@naijaplay/shared';
import { handler, ok } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { optionalAuth, requireAuth, currentUser } from '../middleware/auth.js';
import { getHappeningNow, hydrateRooms, surpriseMe, getLfgGroups, toggleLfg, playNow } from '../services/matchmaking.service.js';
import { serializeEvent } from '../services/event.service.js';
import { serializeCrew } from '../services/crew.service.js';
import { getSeasonLeaderboard, getActiveSeason, tierForScore } from '../services/season.service.js';
import { Room, Event, Crew, CrewMember, Game, User, Moment, Sponsor, SponsoredEvent, type IRoom, type IEvent, type ICrew } from '../models/index.js';
import { serializeUser, serializeGame } from '../utils/serialize.js';
import { AppError } from '../utils/errors.js';
import { runSearch } from '../services/search.service.js';
import { Follow } from '../models/index.js';

const router = Router();

/** GET /api/home — dynamic home feed backed entirely by real DB activity. */
router.get(
  '/home',
  optionalAuth,
  handler(async (req, res) => {
    const user = req.user || null;

    const [liveRooms, upcomingEvents, games, crews, moments, season, scheduledRooms] = await Promise.all([
      Room.find({ status: 'live', isPrivate: false }).sort({ memberCount: -1, startedAt: -1 }).limit(8).lean(),
      Event.find({ status: 'upcoming', startsAt: { $gte: new Date() } }).sort({ startsAt: 1 }).limit(6).lean(),
      Game.find({}).sort({ isFeatured: -1, followersCount: -1 }).limit(8).lean(),
      Crew.find({}).sort({ points: -1, memberCount: -1 }).limit(6).lean(),
      Moment.find({ deletedAt: null }).sort({ score: -1, createdAt: -1 }).limit(9).lean(),
      getActiveSeason(),
      Room.find({ status: 'scheduled' }).sort({ scheduledAt: 1 }).limit(4).lean(),
    ]);

    // Personalised "for you" ranking: shared games, shared crews, followers, interests.
    let recommended = liveRooms as IRoom[];
    if (user) {
      const [followedCrewIds, followees] = await Promise.all([
        CrewMember.find({ userId: user._id }).select('crewId').lean(),
        Follow.find({ followerId: user._id }).select('followingId').lean(),
      ]);
      const favGames = new Set((user.favoriteGames || []).map(String));
      const crewSet = new Set(followedCrewIds.map((c) => String(c.crewId)));
      const followSet = new Set(followesafe(followees));
      recommended = [...liveRooms].sort((a, b) => scoreRoom(b) - scoreRoom(a));

      function scoreRoom(room: IRoom): number {
        let s = room.memberCount;
        if (room.gameId && favGames.has(String(room.gameId))) s += 100;
        if (room.hostId && followSet.has(String(room.hostId))) s += 60;
        if (room.location && user?.location && room.location === user.location) s += 40;
        if (room.category && (user?.interests || []).some((i) => i.toLowerCase() === room.category)) s += 25;
        if (crewSet.has(String(room.hostId))) s += 30;
        return s;
      }
    }

    // One parallel wave for hydration (was 4 sequential round-trips).
    const hostIds = upcomingEvents.map((e) => e.hostId);
    const [leaderboard, liveViews, scheduledViews] = await Promise.all([
      season ? getSeasonLeaderboard(String(season._id), 5) : Promise.resolve([]),
      hydrateRooms(liveRooms as IRoom[]),
      hydrateRooms(scheduledRooms as IRoom[]),
    ]);
    const hosts = hostIds.length ? await User.find({ _id: { $in: hostIds } }).lean() : [];
    const hostMap = new Map(hosts.map((h) => [String(h._id), h]));

    return ok(res, {
      liveRooms: liveViews,
      scheduledRooms: scheduledViews,
      happeningNow: liveViews,
      upcomingEvents: upcomingEvents.map((e) => serializeEvent(e as IEvent, { host: hostMap.get(String(e.hostId)) ? serializeUser(hostMap.get(String(e.hostId))!) : null })),
      games: games.map((g) => serializeGame(g)),
      crews: crews.map((c) => serializeCrew(c as ICrew)),
      moments,
      leaderboard,
      season: season
        ? {
            id: String(season._id),
            name: season.name,
            number: season.number,
            status: season.status,
            startDate: season.startDate.toISOString(),
            endDate: season.endDate.toISOString(),
            tiers: season.tiers,
            participantCount: season.participantCount,
          }
        : null,
      viewer: user ? { id: String(user._id), recommendedRoomIds: recommended.slice(0, 5).map((r) => String(r._id)) } : null,
    });
  }),
);

function followesafe(rows: { followingId: unknown }[]): string[] {
  return rows.map((r) => String(r.followingId));
}

/** GET /api/home/happening-now */
router.get(
  '/home/happening-now',
  handler(async (_req, res) => {
    const rooms = await getHappeningNow(16);
    return ok(res, { rooms });
  }),
);

/** POST /api/home/surprise-me — personalised cold-start room picker. */
router.post(
  '/home/surprise-me',
  optionalAuth,
  handler(async (req, res) => {
    const result = await surpriseMe(req.user || null);
    if (!result.room) {
      return ok(res, { room: null, reason: result.reason, message: "Nobody's outside yet. Start the first room." });
    }
    return ok(res, result);
  }),
);

/** GET /api/home/lfg — who is looking for a group right now. */
router.get(
  '/home/lfg',
  handler(async (_req, res) => {
    const groups = await getLfgGroups();
    return ok(res, { groups });
  }),
);

/** POST /api/home/lfg — toggle looking-for-group status. */
router.post(
  '/home/lfg',
  requireAuth,
  validate(lfgToggleSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as { gameId?: string | null; category?: string | null };
    const game = body.gameId ? await Game.findById(body.gameId) : null;
    const result = await toggleLfg(String(user._id), {
      gameId: body.gameId || null,
      category: body.category || null,
      gameName: game?.name || '',
    });
    return ok(res, result);
  }),
);

/** POST /api/home/play-now — find/create a quick room and put the user in it. */
router.post(
  '/home/play-now',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = (req.body || {}) as { gameId?: string | null; category?: string | null };
    const result = await playNow(user, { gameId: body.gameId || null, category: (body.category as never) || 'gaming' });
    return ok(res, {
      roomCode: result.room.code,
      roomId: String(result.room._id),
      slug: result.room.slug,
      seekerCount: result.seekerCount,
      created: result.created,
    });
  }),
);

/** GET /api/home/discover?tab=&filters — discovery page tabs. */
const discoverQuery = z.object({
  tab: z.enum(['live', 'rooms', 'events', 'games', 'people', 'crews', 'moments']).default('live'),
  category: z.string().max(30).optional(),
  gameId: z.string().max(40).optional(),
  location: z.string().max(60).optional(),
  mode: z.enum(['online', 'irl', 'upcoming']).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get(
  '/home/discover',
  optionalAuth,
  validate(discoverQuery, 'query'),
  handler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof discoverQuery>;
    const cursorDate = q.cursor ? new Date(Number(q.cursor) || Date.now()) : new Date();

    if (q.tab === 'live' || q.tab === 'rooms') {
      const filter: Record<string, unknown> = { isPrivate: false };
      filter.status = q.tab === 'live' ? 'live' : { $in: ['live', 'scheduled'] };
      if (q.category) filter.category = q.category;
      if (q.gameId) filter.gameId = q.gameId;
      if (q.location) filter.location = q.location;
      filter.createdAt = { $lt: cursorDate };
      const rooms = await Room.find(filter).sort({ createdAt: -1 }).limit(q.limit + 1).lean();
      const hasMore = rooms.length > q.limit;
      const items = await hydrateRooms(rooms.slice(0, q.limit) as IRoom[]);
      return ok(res, { items, nextCursor: hasMore ? String(items[items.length - 1] ? new Date(items[items.length - 1].createdAt).getTime() : '') : null });
    }

    if (q.tab === 'events') {
      const filter: Record<string, unknown> = { startsAt: { $lte: cursorDate } };
      if (q.mode === 'irl') filter.mode = { $in: ['irl', 'both'] };
      if (q.mode === 'online') filter.mode = { $in: ['online', 'both'] };
      if (q.mode === 'upcoming') {
        filter.startsAt = { $gte: new Date() };
      }
      if (q.category) filter.category = q.category;
      if (q.gameId) filter.gameId = q.gameId;
      if (q.location) filter.city = q.location;
      const events = await Event.find(filter).sort({ startsAt: q.mode === 'upcoming' ? 1 : -1 }).limit(q.limit + 1).lean();
      const hosts = await User.find({ _id: { $in: events.map((e) => e.hostId) } }).lean();
      const hostMap = new Map(hosts.map((h) => [String(h._id), h]));
      const hasMore = events.length > q.limit;
      const items = events.slice(0, q.limit).map((e) =>
        serializeEvent(e as IEvent, {
          host: hostMap.get(String(e.hostId)) ? serializeUser(hostMap.get(String(e.hostId))!) : null,
        }),
      );
      return ok(res, { items, nextCursor: hasMore ? String(new Date(items[items.length - 1].createdAt).getTime()) : null });
    }

    if (q.tab === 'games') {
      const games = await Game.find(q.category ? { category: q.category } : {}).sort({ isFeatured: -1, followersCount: -1 }).limit(q.limit).lean();
      return ok(res, { items: games.map((g) => serializeGame(g)), nextCursor: null });
    }

    if (q.tab === 'people') {
      const filter: Record<string, unknown> = { isSuspended: false };
      if (q.location) filter.location = q.location;
      const people = await User.find(filter).sort({ followersCount: -1 }).limit(q.limit).lean();
      return ok(res, { items: people.map(serializeUser), nextCursor: null });
    }

    if (q.tab === 'crews') {
      const crews = await Crew.find({}).sort({ points: -1, memberCount: -1 }).limit(q.limit).lean();
      return ok(res, { items: crews.map((c) => serializeCrew(c as ICrew)), nextCursor: null });
    }

    // moments
    const filter: Record<string, unknown> = { deletedAt: null, createdAt: { $lt: cursorDate } };
    if (q.gameId) filter.gameId = q.gameId;
    const moments = await Moment.find(filter).sort({ createdAt: -1 }).limit(q.limit + 1).lean();
    const hasMore = moments.length > q.limit;
    const authors = await User.find({ _id: { $in: moments.map((m) => m.authorId) } }).lean();
    const authorMap = new Map(authors.map((a) => [String(a._id), a]));
    const items = moments.slice(0, q.limit).map((m) => ({
      ...m,
      author: authorMap.get(String(m.authorId)) ? serializeUser(authorMap.get(String(m.authorId))!) : null,
    }));
    return ok(res, {
      items,
      nextCursor: hasMore ? String(moments[q.limit - 1].createdAt.getTime()) : null,
    });
  }),
);

/** GET /api/search?q= — search rooms, users, crews, games, events. */
router.get(
  '/search',
  optionalAuth,
  validate(searchSchema, 'query'),
  handler(async (req, res) => {
    const q = req.query as unknown as { q: string; type: string };
    const results = await runSearch(q.q, q.type);
    return ok(res, results);
  }),
);

/** GET /api/leaderboards?scope= */
router.get(
  '/leaderboards',
  handler(async (req, res) => {
    const parsed = leaderboardQuerySchema.safeParse(req.query);
    if (!parsed.success) throw AppError.badRequest('BAD_QUERY', 'Invalid leaderboard query.');
    const { scope, gameId, seasonId, limit } = parsed.data;

    if (scope === 'crews' || scope === 'global' || scope === 'monthly' || scope === 'weekly') {
      const crews = await Crew.find({}).sort({ points: -1 }).limit(limit).lean();
      const items = crews.map((c, i) => ({ rank: i + 1, crew: serializeCrew(c as ICrew), score: c.points }));
      if (scope === 'crews') return ok(res, { scope, items });

      const users = await User.find({ isSuspended: false }).sort({ xp: -1 }).limit(limit).lean();
      return ok(res, {
        scope,
        crews: items,
        users: users.map((u, i) => ({ rank: i + 1, user: serializeUser(u), score: u.xp })),
      });
    }

    if (scope === 'games' && gameId) {
      const scores = await (await import('../models/index.js')).GameScore.find({ gameId }).sort({ score: -1 }).limit(limit).lean();
      const users = await User.find({ _id: { $in: scores.map((s) => s.userId) } }).lean();
      const map = new Map(users.map((u) => [String(u._id), u]));
      return ok(res, {
        scope,
        items: scores.map((s, i) => ({ rank: i + 1, score: s.score, user: map.get(String(s.userId)) ? serializeUser(map.get(String(s.userId))!) : null })),
      });
    }

    // season
    const season = seasonId ? await (await import('../models/index.js')).Season.findById(seasonId) : await getActiveSeason();
    if (!season) return ok(res, { scope: 'season', items: [], season: null });
    const items = await getSeasonLeaderboard(String(season._id), limit);
    return ok(res, {
      scope: 'season',
      items,
      season: {
        id: String(season._id),
        name: season.name,
        number: season.number,
        status: season.status,
        startDate: season.startDate.toISOString(),
        endDate: season.endDate.toISOString(),
        tiers: season.tiers,
      },
      tierForScore,
    });
  }),
);

/** GET /api/sponsors/active — sponsored events banner data. */
router.get(
  '/sponsors/active',
  handler(async (_req, res) => {
    const now = new Date();
    const campaigns = await SponsoredEvent.find({ status: { $in: ['published', 'active'] }, startDate: { $lte: now }, endDate: { $gte: now } })
      .limit(6)
      .lean();
    const sponsors = await Sponsor.find({ _id: { $in: campaigns.map((c) => c.sponsorId) } }).lean();
    const map = new Map(sponsors.map((s) => [String(s._id), s]));
    return ok(res, {
      campaigns: campaigns.map((c) => {
        const sponsor = map.get(String(c.sponsorId));
        return {
          id: String(c._id),
          campaignName: c.campaignName,
          sponsorContribution: c.sponsorContribution,
          banner: c.banner ?? null,
          startDate: c.startDate.toISOString(),
          endDate: c.endDate.toISOString(),
          eventId: c.eventId ? String(c.eventId) : null,
          sponsor: sponsor
            ? { id: String(sponsor._id), name: sponsor.name, slug: sponsor.slug, logo: sponsor.logo ?? null, website: sponsor.website ?? null, verified: sponsor.verified }
            : null,
        };
      }),
    });
  }),
);

export default router;
