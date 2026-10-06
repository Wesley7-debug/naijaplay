import { Router } from 'express';
import { z } from 'zod';
import { profileUpdateSchema, reportSchema, paginationSchema } from '@naijaplay/shared';
import { handler, ok, created } from '../utils/http.js';
import { clientLink } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth, currentUser } from '../middleware/auth.js';
import { rateLimits } from '../middleware/security.js';
import { User, Follow, Room, Event, Moment, Crew, CrewMember, Game, GameFollow, Recap, type IUser } from '../models/index.js';
import { serializeUser, serializeGame } from '../utils/serialize.js';
import { AppError } from '../utils/errors.js';
import { getXpProgress, getXpHistory, awardXP } from '../services/xp.service.js';
import { notify } from '../services/notification.service.js';
import { createReport } from '../services/moderation.service.js';
import { evaluateAchievements } from '../services/achievement.service.js';

const router = Router();

/** GET /api/users/:username — public profile. */
router.get(
  '/:username',
  optionalAuth,
  handler(async (req, res) => {
    const user = await User.findOne({ username: String(req.params.username).toLowerCase() });
    if (!user || user.isSuspended) throw AppError.notFound('USER_NOT_FOUND', 'That profile does not exist.');

    const viewer = req.user || null;
    const isSelf = viewer ? String(viewer._id) === String(user._id) : false;

    const [following, followers, crewMembership, recentMoments, hostedRooms, recaps] = await Promise.all([
      Follow.countDocuments({ followerId: user._id }),
      Follow.countDocuments({ followingId: user._id }),
      CrewMember.findOne({ userId: user._id }),
      Moment.find({ authorId: user._id, deletedAt: null }).sort({ createdAt: -1 }).limit(12).lean(),
      Room.find({ hostId: user._id, status: { $in: ['live', 'ended'] } }).sort({ createdAt: -1 }).limit(6).lean(),
      Recap.find({ hostId: user._id }).sort({ endedAt: -1 }).limit(3).lean(),
    ]);

    const crew = crewMembership ? await Crew.findById(crewMembership.crewId) : null;
    const viewerFollows = viewer
      ? await Follow.exists({ followerId: viewer._id, followingId: user._id })
      : null;

    const authoredGames = user.favoriteGames.length ? await Game.find({ _id: { $in: user.favoriteGames } }).lean() : [];
    return ok(res, {
      profile: {
        ...serializeUser(user as IUser),
        followersCount: followers,
        followingCount: following,
        crew: crew ? { id: String(crew._id), name: crew.name, slug: crew.slug, points: crew.points, memberCount: crew.memberCount, avatar: crew.avatar ?? null } : null,
        isFollowing: Boolean(viewerFollows),
        isSelf,
        favoriteGameData: authoredGames.map((g) => serializeGame(g as never)),
      },
      moments: recentMoments,
      hostedRooms: hostedRooms.map((r) => ({
        id: String(r._id),
        name: r.name,
        slug: r.slug,
        code: r.code,
        status: r.status,
        category: r.category,
        memberCount: r.memberCount,
        peakMemberCount: r.peakMemberCount,
        shareUrl: clientLink(`/r/${r.code}`),
        createdAt: r.createdAt.toISOString(),
      })),
      recaps: recaps.map((r) => ({ id: String(r._id), title: r.title, shareUrl: r.shareUrl, attendeeCount: r.attendeeCount, endedAt: r.endedAt.toISOString() })),
    });
  }),
);

/** PATCH /api/users/me/profile */
router.patch(
  '/me/profile',
  requireAuth,
  validate(profileUpdateSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (body.displayName !== undefined) updates.displayName = (body.displayName as string).trim();
    if (body.avatar !== undefined) updates.avatar = body.avatar || null;
    if (body.bio !== undefined) updates.bio = body.bio || '';
    if (body.location !== undefined) updates.location = body.location || '';
    if (body.interests !== undefined) updates.interests = body.interests || [];
    if (body.customGames !== undefined) updates.customGames = (body.customGames as string[]).slice(0, 8);
    if (body.socialLinks !== undefined) updates.socialLinks = body.socialLinks || {};
    if (body.favoriteGames !== undefined) {
      const valid = await Game.find({ _id: { $in: body.favoriteGames } }).select('_id');
      updates.favoriteGames = valid.map((g) => g._id);
    }
    const updated = await User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
    return ok(res, { user: updated ? serializeUser(updated as IUser) : null });
  }),
);

/** GET /api/users/me/xp — progress + history. */
router.get(
  '/me/xp',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const [progress, history] = await Promise.all([getXpProgress(user), getXpHistory(String(user._id))]);
    return ok(res, { progress, history });
  }),
);

/** POST /api/users/:username/follow */
router.post(
  '/:username/follow',
  requireAuth,
  rateLimits.follows,
  handler(async (req, res) => {
    const viewer = currentUser(req);
    const target = await User.findOne({ username: String(req.params.username).toLowerCase() });
    if (!target) throw AppError.notFound('USER_NOT_FOUND', 'That profile does not exist.');
    if (String(target._id) === String(viewer._id)) throw AppError.badRequest('SELF_FOLLOW', 'You cannot follow yourself.');
    if (target.isSuspended) throw AppError.forbidden('UNAVAILABLE', 'You cannot follow this account.');

    let createdNew = false;
    try {
      await Follow.create({ followerId: viewer._id, followingId: target._id });
      createdNew = true;
    } catch (err: unknown) {
      if ((err as { code?: number })?.code !== 11000) throw err;
    }

    if (createdNew) {
      await User.updateOne({ _id: viewer._id }, { $inc: { followingCount: 1 } });
      await User.updateOne({ _id: target._id }, { $inc: { followersCount: 1 } });
      await notify({
        userId: String(target._id),
        type: 'new_follower',
        title: 'New follower',
        body: `${viewer.displayName} started following you.`,
        link: `/u/${viewer.username}`,
      });
      const xp = await awardXP(String(target._id), 'FOLLOW_RECEIVED', { followerId: String(viewer._id) });
      const unlocked = await evaluateAchievements(String(target._id));
      return created(res, { following: true, xpGained: xp.amount, unlocked });
    }
    return ok(res, { following: true, xpGained: 0, unlocked: [] });
  }),
);

/** POST /api/users/:username/unfollow */
router.post(
  '/:username/unfollow',
  requireAuth,
  handler(async (req, res) => {
    const viewer = currentUser(req);
    const target = await User.findOne({ username: String(req.params.username).toLowerCase() });
    if (!target) throw AppError.notFound('USER_NOT_FOUND', 'That profile does not exist.');
    const removed = await Follow.findOneAndDelete({ followerId: viewer._id, followingId: target._id });
    if (removed) {
      await User.updateOne({ _id: viewer._id, followingCount: { $gt: 0 } }, { $inc: { followingCount: -1 } });
      await User.updateOne({ _id: target._id, followersCount: { $gt: 0 } }, { $inc: { followersCount: -1 } });
    }
    return ok(res, { following: false });
  }),
);

/** GET /api/users/:username/followers | /following */
router.get(
  '/:username/followers',
  optionalAuth,
  validate(paginationSchema, 'query'),
  handler(async (req, res) => {
    const target = await User.findOne({ username: String(req.params.username).toLowerCase() });
    if (!target) throw AppError.notFound('USER_NOT_FOUND', 'User not found.');
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const follows = await Follow.find({ followingId: target._id }).sort({ createdAt: -1 }).limit(limit).lean();
    const users = await User.find({ _id: { $in: follows.map((f) => f.followerId) } }).lean();
    return ok(res, { items: users.map(serializeUser) });
  }),
);

router.get(
  '/:username/following',
  optionalAuth,
  handler(async (req, res) => {
    const target = await User.findOne({ username: String(req.params.username).toLowerCase() });
    if (!target) throw AppError.notFound('USER_NOT_FOUND', 'User not found.');
    const follows = await Follow.find({ followerId: target._id }).sort({ createdAt: -1 }).limit(30).lean();
    const users = await User.find({ _id: { $in: follows.map((f) => f.followingId) } }).lean();
    return ok(res, { items: users.map(serializeUser) });
  }),
);

/** POST /api/users/report — report a user (or other targets via /api/reports). */
router.post(
  '/report',
  requireAuth,
  rateLimits.reports,
  validate(reportSchema),
  handler(async (req, res) => {
    const viewer = currentUser(req);
    const body = req.body as { targetType: string; targetId: string; reason: string; description?: string };
    const report = await createReport({
      reporterId: String(viewer._id),
      targetType: body.targetType as never,
      targetId: body.targetId,
      reason: body.reason as never,
      description: body.description,
    });
    return created(res, { reportId: String(report._id), status: report.status });
  }),
);

/** POST /api/users/block/:userId */
router.post(
  '/block/:userId',
  requireAuth,
  handler(async (req, res) => {
    const viewer = currentUser(req);
    if (String(req.params.userId) === String(viewer._id)) throw AppError.badRequest('SELF_BLOCK', 'You cannot block yourself.');
    await User.updateOne({ _id: viewer._id }, { $addToSet: { blockedUserIds: req.params.userId } });
    return ok(res, { blocked: true });
  }),
);

router.post(
  '/unblock/:userId',
  requireAuth,
  handler(async (req, res) => {
    const viewer = currentUser(req);
    await User.updateOne({ _id: viewer._id }, { $pull: { blockedUserIds: req.params.userId } });
    return ok(res, { blocked: false });
  }),
);

/** GET /api/users/me/achievements — evaluated server-side on read. */
router.get(
  '/me/achievements',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    await evaluateAchievements(String(user._id));
    const fresh = await User.findById(user._id);
    const { ACHIEVEMENTS, BADGES } = await import('../services/achievement.service.js');
    return ok(res, {
      achievements: ACHIEVEMENTS.map((a) => ({
        code: a.code,
        title: a.title,
        description: a.description,
        icon: a.icon,
        unlockedAt: fresh?.achievements.find((x) => x.code === a.code)?.unlockedAt?.toISOString() || null,
      })),
      badges: (fresh?.badges || []).map((b) => ({ ...b, awardedAt: b.awardedAt?.toISOString?.() || null })),
    });
  }),
);

export default router;

