import { Router } from 'express';
import { z } from 'zod';
import { createMomentSchema, commentSchema, paginationSchema } from '@naijaplay/shared';
import { handler, ok, created } from '../utils/http.js';
import { clientLink } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth, currentUser } from '../middleware/auth.js';
import { rateLimits } from '../middleware/security.js';
import { Moment, MomentComment, MomentReaction, User, type IMoment } from '../models/index.js';
import { serializeUser } from '../utils/serialize.js';
import { AppError } from '../utils/errors.js';
import { awardXP } from '../services/xp.service.js';
import { notify } from '../services/notification.service.js';
import { assertCleanText, looksSpammy, createReport } from '../services/moderation.service.js';
import { evaluateAchievements } from '../services/achievement.service.js';

const router = Router();

async function hydrateMoments(moments: IMoment[], viewerId?: string) {
  const authors = await User.find({ _id: { $in: moments.map((m) => m.authorId) } }).lean();
  const map = new Map(authors.map((a) => [String(a._id), a]));
  let viewerReactions = new Map<string, string>();
  if (viewerId && moments.length) {
    const reacts = await MomentReaction.find({
      momentId: { $in: moments.map((m) => m._id) },
      userId: viewerId,
    }).lean();
    viewerReactions = new Map(reacts.map((r) => [String(r.momentId), r.emoji]));
  }
  return moments.map((m) => ({
    id: String(m._id),
    author: map.get(String(m.authorId)) ? serializeUser(map.get(String(m.authorId))!) : null,
    type: m.type,
    caption: m.caption,
    media: m.media ?? null,
    gameId: m.gameId ? String(m.gameId) : null,
    roomId: m.roomId ? String(m.roomId) : null,
    eventId: m.eventId ? String(m.eventId) : null,
    reactions: m.reactions || {},
    commentsCount: m.commentsCount,
    sharesCount: m.sharesCount,
    viewerReaction: viewerReactions.get(String(m._id)) || null,
    createdAt: m.createdAt.toISOString(),
    score: m.score,
  }));
}

/** Recompute Moment Wall ranking score from real signals only. */
function computeScore(m: { createdAt: Date; reactions: Record<string, number>; commentsCount: number; sharesCount: number }): number {
  const reactionTotal = Object.values(m.reactions || {}).reduce((a, b) => a + b, 0);
  const ageHours = Math.max(0, (Date.now() - m.createdAt.getTime()) / 3_600_000);
  const freshness = Math.exp(-ageHours / 18); // half-life ~12h
  return Math.round((reactionTotal * 3 + m.commentsCount * 4 + m.sharesCount * 5 + 1) * (0.4 + freshness) * 100) / 100;
}

/** GET /api/moments — Moment Wall feed (cursor pagination, ranked). */
router.get(
  '/',
  optionalAuth,
  validate(paginationSchema, 'query'),
  handler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    const filter: Record<string, unknown> = { deletedAt: null };
    if (cursor) filter.createdAt = { $lt: new Date(cursor) };
    const moments = await Moment.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
    const hasMore = moments.length > limit;
    const page = moments.slice(0, limit);
    const items = await hydrateMoments(page as IMoment[], req.user ? String(req.user._id) : undefined);
    // Ranked view for the "top" tab; feed stays recency-based for freshness.
    return ok(res, {
      items,
      nextCursor: hasMore ? String(page[page.length - 1].createdAt.getTime()) : null,
    });
  }),
);

/** GET /api/moments/top — ranked by real engagement signals. */
router.get(
  '/top',
  optionalAuth,
  handler(async (req, res) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const moments = await Moment.find({ deletedAt: null, createdAt: { $gte: since } })
      .sort({ score: -1 })
      .limit(Math.min(Number(req.query.limit) || 20, 50))
      .lean();
    const items = await hydrateMoments(moments as IMoment[], req.user ? String(req.user._id) : undefined);
    return ok(res, { items });
  }),
);

/** GET /api/moments/user/:userId */
router.get(
  '/user/:userId',
  optionalAuth,
  handler(async (req, res) => {
    const moments = await Moment.find({ authorId: req.params.userId, deletedAt: null }).sort({ createdAt: -1 }).limit(30).lean();
    const items = await hydrateMoments(moments as IMoment[], req.user ? String(req.user._id) : undefined);
    return ok(res, { items });
  }),
);

/** GET /api/moments/:id — with comments. */
router.get(
  '/:id',
  optionalAuth,
  handler(async (req, res) => {
    const moment = await Moment.findById(req.params.id);
    if (!moment || moment.deletedAt) throw AppError.notFound('MOMENT_NOT_FOUND', 'That moment is gone.');
    const [view] = await hydrateMoments([moment as IMoment], req.user ? String(req.user._id) : undefined);
    const comments = await MomentComment.find({ momentId: moment._id, deletedAt: null }).sort({ createdAt: 1 }).limit(100).lean();
    const commenters = await User.find({ _id: { $in: comments.map((c) => c.authorId) } }).lean();
    const map = new Map(commenters.map((c) => [String(c._id), c]));
    return ok(res, {
      moment: {
        ...view,
        comments: comments.map((c) => ({
          id: String(c._id),
          author: map.get(String(c.authorId)) ? serializeUser(map.get(String(c.authorId))!) : null,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
        })),
      },
    });
  }),
);

/** POST /api/moments — post a moment (rate-limited, spam-guarded). */
router.post(
  '/',
  requireAuth,
  rateLimits.reactions,
  validate(createMomentSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as {
      caption: string;
      type?: string;
      media?: { url: string; type: 'image' | 'video'; width?: number; height?: number; durationSec?: number };
      gameId?: string;
      roomId?: string;
      eventId?: string;
    };

    assertCleanText(body.caption, 'moment');
    if (looksSpammy(body.caption)) throw AppError.badRequest('SPAM_DETECTED', 'That looks like spam. Make it a real moment.');

    // Per-user posting cadence guard (anti-farm, no auto-ban).
    const recent = await Moment.countDocuments({ authorId: user._id, createdAt: { $gte: new Date(Date.now() - 10 * 60_000) } });
    if (recent >= 5) throw AppError.tooMany('POSTING_TOO_FAST', 'You are posting too fast. Take a breather.');

    const moment = await Moment.create({
      authorId: user._id,
      type: (body.type as never) || (body.media ? (body.media.type === 'video' ? 'clip' : 'image') : 'text'),
      caption: body.caption.slice(0, 500),
      media: body.media || null,
      gameId: body.gameId || null,
      roomId: body.roomId || null,
      eventId: body.eventId || null,
      reactions: {},
      commentsCount: 0,
      sharesCount: 0,
      score: 1,
    });

    const xp = await awardXP(String(user._id), 'MOMENT_POST', { momentId: String(moment._id) });
    const unlocked = await evaluateAchievements(String(user._id));
    const [view] = await hydrateMoments([moment as IMoment], String(user._id));
    return created(res, { moment: view, xpGained: xp.amount, unlocked });
  }),
);

/** POST /api/moments/:id/react — one reaction per user, totals stored server-side. */
router.post(
  '/:id/react',
  requireAuth,
  rateLimits.reactions,
  validate(z.object({ emoji: z.string().min(1).max(8) })),
  handler(async (req, res) => {
    const user = currentUser(req);
    const { emoji } = req.body as { emoji: string };
    const moment = await Moment.findById(req.params.id);
    if (!moment || moment.deletedAt) throw AppError.notFound('MOMENT_NOT_FOUND', 'That moment is gone.');

    const existing = await MomentReaction.findOne({ momentId: moment._id, userId: user._id });
    let awardedToAuthor = false;

    if (existing) {
      if (existing.emoji === emoji) {
        await existing.deleteOne();
        moment.reactions[emoji] = Math.max(0, (moment.reactions[emoji] || 0) - 1);
      } else {
        moment.reactions[existing.emoji] = Math.max(0, (moment.reactions[existing.emoji] || 0) - 1);
        existing.emoji = emoji;
        await existing.save();
        moment.reactions[emoji] = (moment.reactions[emoji] || 0) + 1;
        awardedToAuthor = true;
      }
    } else {
      await MomentReaction.create({ momentId: moment._id, userId: user._id, emoji });
      moment.reactions[emoji] = (moment.reactions[emoji] || 0) + 1;
      awardedToAuthor = true;
    }

    moment.score = computeScore(moment as never);
    await moment.save();

    if (awardedToAuthor && String(moment.authorId) !== String(user._id)) {
      await awardXP(String(moment.authorId), 'MOMENT_REACTION_RECEIVED', { momentId: String(moment._id), by: String(user._id) });
    }

    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`moment:${moment._id}`).emit('moment:reaction', { momentId: String(moment._id), reactions: moment.reactions });
    return ok(res, { reactions: moment.reactions, viewerReaction: emoji });
  }),
);

/** POST /api/moments/:id/comments */
router.post(
  '/:id/comments',
  requireAuth,
  rateLimits.messages,
  validate(commentSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const moment = await Moment.findById(req.params.id);
    if (!moment || moment.deletedAt) throw AppError.notFound('MOMENT_NOT_FOUND', 'That moment is gone.');
    const content = (req.body as { content: string }).content;
    assertCleanText(content, 'comment');

    const comment = await MomentComment.create({ momentId: moment._id, authorId: user._id, content });
    moment.commentsCount += 1;
    moment.score = computeScore(moment as never);
    await moment.save();

    if (String(moment.authorId) !== String(user._id)) {
      await notify({
        userId: String(moment.authorId),
        type: 'mention',
        title: 'New comment',
        body: `${user.displayName}: ${content.slice(0, 100)}`,
        link: `/moments/${moment._id}`,
      });
    }
    return created(res, {
      comment: { id: String(comment._id), author: serializeUser(user), content: comment.content, createdAt: comment.createdAt.toISOString() },
      commentsCount: moment.commentsCount,
    });
  }),
);

/** POST /api/moments/:id/share */
router.post(
  '/:id/share',
  requireAuth,
  handler(async (req, res) => {
    const moment = await Moment.findById(req.params.id);
    if (!moment || moment.deletedAt) throw AppError.notFound('MOMENT_NOT_FOUND', 'That moment is gone.');
    moment.sharesCount += 1;
    moment.score = computeScore(moment as never);
    await moment.save();
    const { AnalyticsEvent } = await import('../models/index.js');
    await AnalyticsEvent.create({ type: 'share', entityType: 'moment', entityId: String(moment._id), userId: req.user?._id });
    return ok(res, { sharesCount: moment.sharesCount, shareUrl: clientLink(`/moments/${moment._id}`) });
  }),
);

/** DELETE /api/moments/:id — author or admin only. */
router.delete(
  '/:id',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const moment = await Moment.findById(req.params.id);
    if (!moment) throw AppError.notFound('MOMENT_NOT_FOUND', 'That moment is gone.');
    if (String(moment.authorId) !== String(user._id) && user.role !== 'admin' && user.role !== 'moderator') {
      throw AppError.forbidden('NOT_ALLOWED', 'You can only delete your own moments.');
    }
    moment.deletedAt = new Date();
    await moment.save();
    return ok(res, { ok: true });
  }),
);

/** POST /api/moments/:id/report */
router.post(
  '/:id/report',
  requireAuth,
  rateLimits.reports,
  handler(async (req, res) => {
    const user = currentUser(req);
    const report = await createReport({
      reporterId: String(user._id),
      targetType: 'moment',
      targetId: String(req.params.id),
      reason: 'spam',
      description: 'Reported from moment wall',
    });
    return created(res, { reportId: String(report._id) });
  }),
);

export default router;

