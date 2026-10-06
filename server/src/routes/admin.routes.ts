import { Router } from 'express';
import { z } from 'zod';
import { adminUserActionSchema, reportResolveSchema } from '@naijaplay/shared';
import { handler, ok } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import {
  User,
  Room,
  Event,
  Report,
  Giveaway,
  Crew,
  Moment,
  SponsoredEvent,
  Message,
  type IUser,
} from '../models/index.js';
import { serializeUser } from '../utils/serialize.js';
import { resolveReport } from '../services/moderation.service.js';
import { notify } from '../services/notification.service.js';

const router = Router();

/** All admin routes are protected server-side (admin/moderator roles only). */
router.use(requireAuth);
router.use((req, _res, next) => {
  const user = currentUser(req);
  if (!['admin', 'moderator'].includes(user.role)) {
    return next(AppError.forbidden('NOT_ADMIN', 'Admin access required.'));
  }
  next();
});

/** GET /api/admin/metrics — real database counts. */
router.get(
  '/metrics',
  handler(async (_req, res) => {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      activeUsers,
      totalRooms,
      liveRooms,
      totalEvents,
      openReports,
      totalGiveaways,
      totalCrews,
      totalMoments,
      sponsored,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ lastSeenAt: { $gte: since7d } }),
      Room.countDocuments({}),
      Room.countDocuments({ status: 'live' }),
      Event.countDocuments({}),
      Report.countDocuments({ status: { $in: ['open', 'reviewing'] } }),
      Giveaway.countDocuments({}),
      Crew.countDocuments({}),
      Moment.countDocuments({ deletedAt: null }),
      SponsoredEvent.countDocuments({}),
    ]);

    return ok(res, {
      metrics: {
        totalUsers,
        activeUsers,
        totalRooms,
        liveRooms,
        totalEvents,
        openReports,
        totalGiveaways,
        totalCrews,
        totalMoments,
        sponsoredEvents: sponsored,
      },
    });
  }),
);

/** GET /api/admin/reports?status= */
router.get(
  '/reports',
  handler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : { $in: ['open', 'reviewing'] };
    const reports = await Report.find({ status: status as never })
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 50, 100))
      .lean();
    const userIds = reports.map((r) => r.reporterId);
    const moderatorIds = reports.map((r) => r.moderatorId).filter(Boolean);
    const users = await User.find({ _id: { $in: [...userIds, ...moderatorIds] } }).lean();
    const map = new Map(users.map((u) => [String(u._id), u]));
    return ok(res, {
      items: reports.map((r) => ({
        id: String(r._id),
        reporter: map.get(String(r.reporterId)) ? serializeUser(map.get(String(r.reporterId)) as IUser) : null,
        targetType: r.targetType,
        targetId: String(r.targetId),
        targetLabel: r.targetLabel,
        reason: r.reason,
        description: r.description,
        status: r.status,
        moderator: r.moderatorId && map.get(String(r.moderatorId)) ? serializeUser(map.get(String(r.moderatorId)) as IUser) : null,
        resolution: r.resolution,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }),
);

/** POST /api/admin/reports/:id/resolve */
router.post(
  '/reports/:id/resolve',
  validate(reportResolveSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const { status, resolution } = req.body as { status: 'reviewing' | 'resolved' | 'dismissed'; resolution?: string };
    const report = await resolveReport(String(req.params.id), String(user._id), status, resolution);
    await notify({
      userId: String(report.reporterId),
      type: 'moderation_action',
      title: 'Report updated',
      body: `Your report was marked ${status}.`,
      link: '/notifications',
    });
    return ok(res, { status: report.status });
  }),
);

/** POST /api/admin/users/:id/action — suspend/unsuspend/verify/set_role. */
router.post(
  '/users/:id/action',
  validate(adminUserActionSchema),
  handler(async (req, res) => {
    const actor = currentUser(req);
    if (actor.role !== 'admin') throw AppError.forbidden('ADMIN_ONLY', 'Only admins can manage users.');
    const { action, role, reason } = req.body as { action: string; role?: string; reason?: string };
    const target = await User.findById(req.params.id);
    if (!target) throw AppError.notFound('USER_NOT_FOUND', 'User not found.');
    if (String(target._id) === String(actor._id)) throw AppError.badRequest('SELF_ACTION', 'You cannot do that to yourself.');

    switch (action) {
      case 'suspend':
        target.isSuspended = true;
        target.suspendedReason = reason || null;
        break;
      case 'unsuspend':
        target.isSuspended = false;
        target.suspendedReason = null;
        break;
      case 'verify':
        target.isVerified = true;
        break;
      case 'unverify':
        target.isVerified = false;
        break;
      case 'set_role': {
        if (!role || !['user', 'creator', 'moderator', 'admin'].includes(role)) {
          throw AppError.badRequest('BAD_ROLE', 'Invalid role.');
        }
        target.role = role as never;
        break;
      }
      default:
        throw AppError.badRequest('BAD_ACTION', 'Unknown action.');
    }
    await target.save();
    await notify({
      userId: String(target._id),
      type: 'moderation_action',
      title: 'Account updated',
      body: `Your account was updated by a moderator (${action}).${reason ? ` Reason: ${reason}` : ''}`,
      link: '/notifications',
    });
    return ok(res, { user: serializeUser(target as IUser) });
  }),
);

/** GET /api/admin/users?query= */
router.get(
  '/users',
  handler(async (req, res) => {
    const q = req.query.query ? String(req.query.query) : '';
    const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const users = await User.find(rx ? { $or: [{ username: rx }, { email: rx }, { displayName: rx }] } : {})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return ok(res, { items: users.map(serializeUser) });
  }),
);

/** DELETE /api/admin/rooms/:id — hard delete a room with its messages. */
router.delete(
  '/rooms/:id',
  handler(async (req, res) => {
    const actor = currentUser(req);
    if (actor.role !== 'admin') throw AppError.forbidden('ADMIN_ONLY', 'Only admins can delete rooms.');
    const room = await Room.findById(req.params.id);
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');
    await Promise.all([
      Room.deleteOne({ _id: room._id }),
      Message.deleteMany({ roomId: room._id }),
      (await import('../models/index.js')).RoomMember.deleteMany({ roomId: room._id }),
    ]);
    return ok(res, { deleted: true });
  }),
);

/** POST /api/admin/messages/:id/delete — moderate a chat message. */
router.post(
  '/messages/:id/delete',
  handler(async (req, res) => {
    const actor = currentUser(req);
    const message = await Message.findById(req.params.id);
    if (!message) throw AppError.notFound('MESSAGE_NOT_FOUND', 'Message not found.');
    message.deletedAt = new Date();
    message.deletedBy = actor._id;
    await message.save();
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`room:${message.roomId}`).emit('room:message-deleted', { messageId: String(message._id), roomId: String(message.roomId) });
    return ok(res, { ok: true });
  }),
);

/** GET /api/admin/suspicious — rate/abuse signals. */
router.get(
  '/suspicious',
  handler(async (_req, res) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const [fastFollowers, spammyPosts, multiReports] = await Promise.all([
      User.aggregate([
        { $lookup: { from: 'follows', localField: '_id', foreignField: 'followerId', as: 'f' } },
        { $match: { 'f.createdAt': { $gte: oneHourAgo } } },
        { $project: { username: 1, count: { $size: '$f' } } },
        { $match: { count: { $gte: 40 } } },
        { $limit: 20 },
      ]),
      Message.aggregate([
        { $match: { createdAt: { $gte: oneHourAgo } } },
        { $group: { _id: '$senderId', count: { $sum: 1 } } },
        { $match: { count: { $gte: 60 } } },
        { $limit: 20 },
      ]),
      Report.aggregate([
        { $group: { _id: '$targetId', count: { $sum: 1 } } },
        { $match: { count: { $gte: 3 } } },
        { $limit: 20 },
      ]),
    ]);
    const userIds = [...fastFollowers.map((u) => u._id), ...spammyPosts.map((m) => m._id)];
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }).lean() : [];
    const map = new Map(users.map((u) => [String(u._id), u]));
    return ok(res, {
      fastFollowers: fastFollowers.map((u) => ({ user: map.get(String(u._id)) ? serializeUser(map.get(String(u._id)) as IUser) : null, followsLastHour: u.count })),
      spammyPosters: spammyPosts.map((m) => ({ user: map.get(String(m._id)) ? serializeUser(map.get(String(m._id)) as IUser) : null, messagesLastHour: m.count })),
      reportedTargets: multiReports,
    });
  }),
);

export default router;
