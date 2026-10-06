import { Router } from 'express';
import { z } from 'zod';
import { createCrewSchema } from '@naijaplay/shared';
import { handler, ok, created } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth, currentUser } from '../middleware/auth.js';
import { createCrew, joinCrew, leaveCrew, serializeCrew, getCrewScoreHistory } from '../services/crew.service.js';
import { Crew, CrewMember, User, type ICrew } from '../models/index.js';
import { serializeUser } from '../utils/serialize.js';
import { AppError } from '../utils/errors.js';
import { awardXP } from '../services/xp.service.js';
import { notify } from '../services/notification.service.js';
import { evaluateAchievements } from '../services/achievement.service.js';

const router = Router();

async function hydrateCrew(crew: ICrew, viewerId?: string) {
  const creator = await User.findById(crew.creatorId);
  let isMember = false;
  let viewerRole: string | null = null;
  if (viewerId) {
    const membership = await CrewMember.findOne({ crewId: crew._id, userId: viewerId });
    if (membership) {
      isMember = true;
      viewerRole = membership.role;
    }
  }
  return serializeCrew(crew, {
    creator: creator ? serializeUser(creator) : null,
    isMember,
    viewerRole,
  });
}

/** GET /api/crews */
router.get(
  '/',
  optionalAuth,
  handler(async (req, res) => {
    const kind = req.query.kind ? String(req.query.kind) : null;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const crews = await Crew.find(kind ? { kind } : {}).sort({ points: -1, memberCount: -1 }).limit(limit).lean();
    const items = await Promise.all(crews.map((c) => hydrateCrew(c as ICrew, req.user ? String(req.user._id) : undefined)));
    return ok(res, { items });
  }),
);

/** GET /api/crews/mine */
router.get(
  '/mine',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const memberships = await CrewMember.find({ userId: user._id }).lean();
    const crews = await Crew.find({ _id: { $in: memberships.map((m) => m.crewId) } }).lean();
    const items = await Promise.all(crews.map((c) => hydrateCrew(c as ICrew, String(user._id))));
    return ok(res, { items });
  }),
);

/** GET /api/crews/leaderboard — rivalry presentation data. */
router.get(
  '/leaderboard',
  handler(async (_req, res) => {
    const crews = await Crew.find({}).sort({ points: -1 }).limit(20).lean();
    const items = crews.map((c, i) => ({ rank: i + 1, crew: serializeCrew(c as ICrew), score: c.points }));
    // Build rivalry pairings: top crews by proximity.
    const rivalries: { home: string; away: string; homeScore: number; awayScore: number }[] = [];
    for (let i = 0; i < Math.min(crews.length - 1, 8); i += 2) {
      rivalries.push({
        home: crews[i].name.toUpperCase(),
        away: crews[i + 1].name.toUpperCase(),
        homeScore: crews[i].points,
        awayScore: crews[i + 1].points,
      });
    }
    return ok(res, { items, rivalries });
  }),
);

/** POST /api/crews */
router.post(
  '/',
  requireAuth,
  validate(createCrewSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as { name: string; description?: string; kind?: 'area' | 'school' | 'friends' | 'gaming' | 'creator' | 'other'; avatar?: string; cover?: string };
    const crew = await createCrew(String(user._id), body);
    await awardXP(String(user._id), 'CREW_JOIN', { crewId: String(crew._id) });
    await evaluateAchievements(String(user._id));
    return created(res, { crew: await hydrateCrew(crew as ICrew, String(user._id)), shareUrl: `https://naijaplay.com/crews/${crew.slug}` });
  }),
);

/** GET /api/crews/:idOrSlug */
router.get(
  '/:idOrSlug',
  optionalAuth,
  handler(async (req, res) => {
    const key = String(req.params.idOrSlug);
    const crew = /^[0-9a-fA-F]{24}$/.test(key) ? await Crew.findById(key) : await Crew.findOne({ slug: key });
    if (!crew) throw AppError.notFound('CREW_NOT_FOUND', 'Crew not found.');
    const memberships = await CrewMember.find({ crewId: crew._id }).sort({ role: 1, joinedAt: 1 }).limit(100).lean();
    const members = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }).lean();
    const map = new Map(members.map((m) => [String(m._id), m]));
    const history = await getCrewScoreHistory(String(crew._id), 20);
    return ok(res, {
      crew: await hydrateCrew(crew as ICrew, req.user ? String(req.user._id) : undefined),
      members: memberships
        .filter((m) => map.has(String(m.userId)))
        .map((m) => ({ user: serializeUser(map.get(String(m.userId))!), role: m.role, joinedAt: m.joinedAt.toISOString() })),
      scoreHistory: history,
    });
  }),
);

/** POST /api/crews/:id/join */
router.post(
  '/:id/join',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const crew = await Crew.findById(req.params.id);
    if (!crew) throw AppError.notFound('CREW_NOT_FOUND', 'Crew not found.');
    const result = await joinCrew(String(crew._id), String(user._id));
    if (!result.alreadyMember) {
      await awardXP(String(user._id), 'CREW_JOIN', { crewId: String(crew._id) });
      await notify({
        userId: String(crew.creatorId),
        type: 'crew_invitation',
        title: 'New crew member',
        body: `${user.displayName} joined ${crew.name}.`,
        link: `/crews/${crew.slug}`,
      });
      await evaluateAchievements(String(user._id));
    }
    const memberCount = await CrewMember.countDocuments({ crewId: crew._id });
    return ok(res, { memberCount, alreadyMember: result.alreadyMember });
  }),
);

/** POST /api/crews/:id/leave */
router.post(
  '/:id/leave',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    await leaveCrew(String(req.params.id), String(user._id));
    const crew = await Crew.findById(req.params.id);
    return ok(res, { memberCount: crew?.memberCount ?? 0 });
  }),
);

/** POST /api/crews/:id/invite — invite a user by username. */
router.post(
  '/:id/invite',
  requireAuth,
  validate(z.object({ username: z.string().min(3).max(24) })),
  handler(async (req, res) => {
    const user = currentUser(req);
    const crew = await Crew.findById(req.params.id);
    if (!crew) throw AppError.notFound('CREW_NOT_FOUND', 'Crew not found.');
    const membership = await CrewMember.findOne({ crewId: crew._id, userId: user._id });
    if (!membership) throw AppError.forbidden('NOT_A_MEMBER', 'Join the crew first.');
    const target = await User.findOne({ username: String((req.body as { username: string }).username).toLowerCase() });
    if (!target) throw AppError.notFound('USER_NOT_FOUND', 'No user with that username.');
    await notify({
      userId: String(target._id),
      type: 'crew_invitation',
      title: `Invited to ${crew.name}`,
      body: `${user.displayName} wants you in ${crew.name}.`,
      link: `/crews/${crew.slug}`,
    });
    return ok(res, { invited: true });
  }),
);

export default router;
