import { Router } from 'express';
import { z } from 'zod';
import {
  createRoomSchema,
  createPollSchema,
  createGiveawaySchema,
  moderationActionSchema,
  quizQuestionsSchema,
  sendMessageSchema,
} from '@naijaplay/shared';
import { handler, ok, created } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth, currentUser } from '../middleware/auth.js';
import { rateLimits } from '../middleware/security.js';
import { createRoom, joinRoom, leaveRoom, serializeRoom, generateUniqueRoomCode } from '../services/room.service.js';
import { hydrateRooms } from '../services/matchmaking.service.js';
import { startGiveaway, getActiveGiveawayForRoom, getRecentGiveawaysForRoom, enterGiveaway } from '../services/giveaway.service.js';
import { createQuiz, startQuiz, getRuntime, DEFAULT_QUESTIONS } from '../services/quiz.service.js';
import { generateRecap, serializeRecap } from '../services/recap.service.js';
import { awardXP } from '../services/xp.service.js';
import { notify } from '../services/notification.service.js';
import { createPoll, votePoll, closePoll } from '../services/poll.service.js';
import { AppError } from '../utils/errors.js';
import {
  Room,
  RoomMember,
  Message,
  User,
  Game,
  Giveaway,
  Recap,
  type IRoom,
} from '../models/index.js';
import { serializeUser, serializeGame } from '../utils/serialize.js';
import logger from '../config/logger.js';

const router = Router();

async function getMembership(roomId: string, userId: string) {
  return RoomMember.findOne({ roomId, userId });
}

function canModerate(role: string | undefined): boolean {
  return role === 'host' || role === 'cohost' || role === 'moderator';
}

/** POST /api/rooms — create room (Start Now or Schedule). */
router.post(
  '/',
  requireAuth,
  rateLimits.roomCreate,
  validate(createRoomSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as {
      name: string;
      description?: string;
      category: 'gaming' | 'football' | 'music' | 'culture' | 'tech' | 'campus' | 'creator' | 'hangout' | 'other';
      gameId?: string | null;
      isPrivate: boolean;
      capacity: number;
      mode: 'now' | 'schedule';
      scheduledAt?: string | null;
      externalGameUrl?: string;
      externalGameCode?: string;
      rules?: string[];
      coverImage?: string;
      location?: string;
    };

    if (body.mode === 'schedule') {
      if (!body.scheduledAt) throw AppError.badRequest('MISSING_DATE', 'Pick a date and time to schedule the room.');
      if (new Date(body.scheduledAt).getTime() < Date.now() - 60_000) {
        throw AppError.badRequest('PAST_SCHEDULE', 'Scheduled time is in the past.');
      }
    }

    const room = await createRoom({
      hostId: String(user._id),
      name: body.name,
      description: body.description,
      category: body.category,
      gameId: body.gameId || null,
      isPrivate: body.isPrivate,
      capacity: body.capacity,
      mode: body.mode,
      scheduledAt: body.scheduledAt || null,
      externalGameUrl: body.externalGameUrl || null,
      externalGameCode: body.externalGameCode || null,
      rules: body.rules,
      coverImage: body.coverImage,
      location: body.location || user.location || null,
    });

    await awardXP(String(user._id), 'ROOM_HOST', { roomId: String(room._id) });
    const [view] = await hydrateRooms([room as IRoom]);
    return created(res, { room: view, inviteUrl: `https://naijaplay.com/r/${room.code}` });
  }),
);

/** POST /api/rooms/join-by-code — join using a share code. */
router.post(
  '/join-by-code',
  requireAuth,
  validate(z.object({ code: z.string().min(4).max(12) })),
  handler(async (req, res) => {
    const user = currentUser(req);
    const code = (req.body as { code: string }).code.toUpperCase();
    const room = await Room.findOne({ code });
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'No room with that code.');
    const result = await joinRoom({ roomId: String(room._id), userId: String(user._id), code });
    if (!result.alreadyMember) await awardXP(String(user._id), 'ROOM_JOIN', { roomId: String(room._id) });
    return ok(res, { roomId: String(room._id), slug: room.slug, alreadyMember: result.alreadyMember });
  }),
);

/** GET /api/rooms?status=&category=&gameId= */
router.get(
  '/',
  optionalAuth,
  handler(async (req, res) => {
    const status = String(req.query.status || 'live');
    const category = req.query.category ? String(req.query.category) : null;
    const gameId = req.query.gameId ? String(req.query.gameId) : null;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const filter: Record<string, unknown> = { isPrivate: false };
    if (status === 'all') filter.status = { $in: ['live', 'scheduled'] };
    else if (status !== 'any') filter.status = status;
    if (category) filter.category = category;
    if (gameId) filter.gameId = gameId;

    const rooms = await Room.find(filter).sort({ memberCount: -1, createdAt: -1 }).limit(limit).lean();
    const items = await hydrateRooms(rooms as IRoom[]);
    return ok(res, { items });
  }),
);

/** GET /api/rooms/mine — rooms I host or am a member of. */
router.get(
  '/mine',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const memberships = await RoomMember.find({ userId: user._id, status: 'active' }).sort({ joinedAt: -1 }).limit(30).lean();
    const rooms = await Room.find({ _id: { $in: memberships.map((m) => m.roomId) } }).lean();
    const items = await hydrateRooms(rooms as IRoom[]);
    return ok(res, { items });
  }),
);

/** GET /api/rooms/:idOrCode — room detail (private rooms enforce membership/code server-side). */
router.get(
  '/:idOrCode',
  optionalAuth,
  handler(async (req, res) => {
    const key = String(req.params.idOrCode);
    const queryCode = req.query.code ? String(req.query.code) : undefined;
    const room = /^[0-9a-fA-F]{24}$/.test(key) ? await Room.findById(key) : await Room.findOne({ $or: [{ code: key.toUpperCase() }, { slug: key }] });
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', "That room doesn't exist.");

    const user = req.user || null;
    let membership = user ? await getMembership(String(room._id), String(user._id)) : null;

    if (room.isPrivate) {
      const codeOk = queryCode && queryCode.toUpperCase() === room.code;
      const allowed = (membership && membership.status === 'active') || codeOk || (user && String(room.hostId) === String(user._id));
      if (!allowed) throw AppError.forbidden('PRIVATE_ROOM', 'This is a private room. You need an invite code.');
    }

    const [host, game, activeGiveaway, pastGiveaways, pinnedCount] = await Promise.all([
      User.findById(room.hostId),
      room.gameId ? Game.findById(room.gameId) : null,
      getActiveGiveawayForRoom(String(room._id)),
      getRecentGiveawaysForRoom(String(room._id)),
      Message.countDocuments({ roomId: room._id, isPinned: true, deletedAt: null }),
    ]);

    const view = serializeRoom(room as IRoom, {
      host: host ? serializeUser(host) : null,
      game: game ? serializeGame(game) : null,
    });

    return ok(res, {
      room: view,
      membership: membership
        ? { role: membership.role, status: membership.status, isMuted: membership.isMuted, joinedAt: membership.joinedAt.toISOString() }
        : null,
      viewer: user ? { id: String(user._id) } : null,
      activeGiveaway: activeGiveaway
        ? { id: String(activeGiveaway._id), title: activeGiveaway.title, prize: activeGiveaway.prize, endsAt: activeGiveaway.endsAt.toISOString() }
        : null,
      pastGiveaways: pastGiveaways.map((g) => ({ id: String(g._id), title: g.title, prize: g.prize, status: g.status, winnerCount: g.winnerIds.length })),
      pinnedCount,
      shareUrl: `https://naijaplay.com/r/${room.code}`,
    });
  }),
);

/** POST /api/rooms/:id/join */
router.post(
  '/:id/join',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const code = (req.body as { code?: string })?.code;
    const { room, alreadyMember } = await joinRoom({ roomId: String(req.params.id), userId: String(user._id), code });
    if (!alreadyMember) {
      await awardXP(String(user._id), 'ROOM_JOIN', { roomId: String(room._id) });
      const hostId = String(room.hostId);
      if (hostId !== String(user._id)) {
        await notify({
          userId: hostId,
          type: 'room_invite',
          title: 'Somebody just joined',
          body: `${user.displayName} entered “${room.name}”.`,
          link: `/rooms/${room.slug}`,
        });
      }
    }
    const members = await RoomMember.countDocuments({ roomId: room._id, status: 'active' });
    return ok(res, { roomId: String(room._id), slug: room.slug, memberCount: members, alreadyMember });
  }),
);

/** POST /api/rooms/:id/leave */
router.post(
  '/:id/leave',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const { room } = await leaveRoom(String(req.params.id), String(user._id));
    return ok(res, { memberCount: room.memberCount });
  }),
);

/** GET /api/rooms/:id/members */
router.get(
  '/:id/members',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const room = await Room.findById(req.params.id);
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');
    if (room.isPrivate) {
      const membership = await getMembership(String(room._id), String(user._id));
      if (!membership || membership.status !== 'active') throw AppError.forbidden('PRIVATE_ROOM', 'Join the room first.');
    }
    const members = await RoomMember.find({ roomId: room._id, status: 'active' }).sort({ role: 1, joinedAt: 1 }).limit(500).lean();
    const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }).lean();
    const map = new Map(users.map((u) => [String(u._id), u]));
    return ok(res, {
      items: members.map((m) => ({
        user: map.get(String(m.userId)) ? serializeUser(map.get(String(m.userId))!) : null,
        role: m.role,
        isMuted: m.isMuted,
        joinedAt: m.joinedAt.toISOString(),
      })),
      peakMemberCount: room.peakMemberCount,
      memberCount: room.memberCount,
    });
  }),
);

/** POST /api/rooms/:id/moderation — host actions (server-enforced permissions). */
router.post(
  '/:id/moderation',
  requireAuth,
  validate(moderationActionSchema),
  handler(async (req, res) => {
    const actor = currentUser(req);
    const { action, targetUserId } = req.body as { action: string; targetUserId: string };
    const room = await Room.findById(req.params.id);
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');

    const actorMembership = await getMembership(String(room._id), String(actor._id));
    if (!actorMembership || !canModerate(actorMembership.role)) throw AppError.forbidden('NOT_MODERATOR', 'You cannot moderate this room.');
    if (targetUserId === String(room.hostId) && action !== 'unmute') throw AppError.badRequest('CANNOT_TARGET_HOST', 'You cannot do that to the host.');
    if (targetUserId === String(actor._id)) throw AppError.badRequest('CANNOT_TARGET_SELF', 'You cannot do that to yourself.');

    const targetMembership = await getMembership(String(room._id), targetUserId);
    if (!targetMembership && ['mute', 'kick', 'ban', 'unban', 'assign_cohost', 'assign_moderator', 'remove_moderator'].includes(action)) {
      throw AppError.notFound('NOT_A_MEMBER', 'That user is not in this room.');
    }

    // Hierarchy: moderators cannot act on cohosts/host; cohosts can act on moderators.
    if (targetMembership) {
      const rank: Record<string, number> = { member: 0, moderator: 1, cohost: 2, host: 3 };
      if (rank[targetMembership.role] >= rank[actorMembership.role] && targetUserId !== String(actor._id) && actorMembership.role !== 'host') {
        throw AppError.forbidden('RANK_TOO_LOW', 'You cannot moderate someone of equal or higher rank.');
      }
      if (targetMembership.role === 'host') throw AppError.forbidden('CANNOT_TARGET_HOST', 'The host is untouchable.');
    }

    switch (action) {
      case 'mute':
        targetMembership!.isMuted = true;
        await targetMembership!.save();
        break;
      case 'unmute':
        targetMembership!.isMuted = false;
        await targetMembership!.save();
        break;
      case 'kick':
        targetMembership!.status = 'kicked';
        targetMembership!.leftAt = new Date();
        await targetMembership!.save();
        await Room.updateOne({ _id: room._id, memberCount: { $gt: 0 } }, [{ $set: { memberCount: { $max: [{ $subtract: ['$memberCount', 1] }, 0] } } }]);
        break;
      case 'ban':
        targetMembership!.status = 'banned';
        targetMembership!.leftAt = new Date();
        await targetMembership!.save();
        await Room.updateOne({ _id: room._id, memberCount: { $gt: 0 } }, [{ $set: { memberCount: { $max: [{ $subtract: ['$memberCount', 1] }, 0] } } }]);
        break;
      case 'unban':
        if (targetMembership) {
          targetMembership.status = 'left';
          await targetMembership.save();
        }
        break;
      case 'approve':
        if (targetMembership && targetMembership.status !== 'active') {
          targetMembership.status = 'active';
          targetMembership.joinedAt = new Date();
          await targetMembership.save();
        }
        break;
      case 'assign_cohost':
        targetMembership!.role = 'cohost';
        await targetMembership!.save();
        break;
      case 'assign_moderator':
        targetMembership!.role = 'moderator';
        await targetMembership!.save();
        break;
      case 'remove_moderator':
        targetMembership!.role = 'member';
        await targetMembership!.save();
        break;
      default:
        throw AppError.badRequest('BAD_ACTION', 'Unknown moderation action.');
    }

    await notify({
      userId: targetUserId,
      type: 'moderation_action',
      title: 'Room update',
      body: `The hosts updated your status in “${room.name}” (${action}).`,
      link: `/rooms/${room.slug}`,
    });

    // Realtime sync for everyone in the room.
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`room:${room._id}`).emit('room:moderation', { roomId: String(room._id), action, targetUserId, actorId: String(actor._id) });
    const memberCount = await RoomMember.countDocuments({ roomId: room._id, status: 'active' });
    io?.to(`room:${room._id}`).emit('room:member-count', { roomId: String(room._id), memberCount });
    return ok(res, { ok: true, memberCount });
  }),
);

/** POST /api/rooms/:id/lock | /unlock */
router.post(
  '/:id/lock',
  requireAuth,
  handler(async (req, res) => setLock(req, res, true)),
);
router.post(
  '/:id/unlock',
  requireAuth,
  handler(async (req, res) => setLock(req, res, false)),
);

async function setLock(req: import('express').Request, res: import('express').Response, locked: boolean) {
  const actor = currentUser(req);
  const room = await Room.findById(req.params.id);
  if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');
  const membership = await getMembership(String(room._id), String(actor._id));
  if (!membership || !canModerate(membership.role)) throw AppError.forbidden('NOT_MODERATOR', 'You cannot lock this room.');
  room.isLocked = locked;
  await room.save();
  const io = (await import('../sockets/io.js')).getIO();
  io?.to(`room:${room._id}`).emit('room:lock', { roomId: String(room._id), isLocked: locked });
  return ok(res, { isLocked: locked });
}

/** POST /api/rooms/:id/end — end room, generate recap (host only). */
router.post(
  '/:id/end',
  requireAuth,
  handler(async (req, res) => {
    const actor = currentUser(req);
    const room = await Room.findById(req.params.id);
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');
    if (String(room.hostId) !== String(actor._id) && actor.role !== 'admin' && actor.role !== 'moderator') {
      throw AppError.forbidden('NOT_HOST', 'Only the host can end the room.');
    }
    if (room.status === 'ended') {
      return ok(res, { alreadyEnded: true, recapId: room.recapId ? String(room.recapId) : null });
    }

    room.status = 'ended';
    room.endedAt = new Date();
    await room.save();

    const recap = await generateRecap(room);
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`room:${room._id}`).emit('room:ended', { roomId: String(room._id), recapId: String(recap._id) });

    return ok(res, { recapId: String(recap._id) });
  }),
);

/** GET /api/rooms/:id/recap */
router.get(
  '/:id/recap',
  handler(async (req, res) => {
    const room = await Room.findById(req.params.id);
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');
    let recapId = room.recapId ? String(room.recapId) : null;
    if (!recapId && room.status === 'ended') {
      const recap = await generateRecap(room);
      recapId = String(recap._id);
    }
    if (!recapId) throw AppError.notFound('NO_RECAP', 'This room has no recap yet.');
    const recap = await serializeRecap(recapId);
    return ok(res, { recap });
  }),
);

/** GET /api/rooms/:id/chat?cursor= */
router.get(
  '/:id/chat',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const room = await Room.findById(req.params.id);
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');
    if (room.isPrivate) {
      const membership = await getMembership(String(room._id), String(user._id));
      if (!membership || membership.status !== 'active') throw AppError.forbidden('PRIVATE_ROOM', 'Join the room first.');
    }
    const cursor = req.query.cursor ? new Date(Number(req.query.cursor)) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const filter: Record<string, unknown> = { roomId: room._id };
    if (cursor) filter.createdAt = { $lt: cursor };
    const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    const senders = await User.find({ _id: { $in: messages.map((m) => m.senderId) } }).lean();
    const senderMap = new Map(senders.map((s) => [String(s._id), s]));
    const replyIds = messages.map((m) => m.replyTo).filter(Boolean);
    const replies = replyIds.length ? await Message.find({ _id: { $in: replyIds } }).lean() : [];
    const replyMap = new Map(replies.map((r) => [String(r._id), r]));
    const replySenders = await User.find({ _id: { $in: replies.map((r) => r.senderId) } }).lean();
    const replySenderMap = new Map(replySenders.map((s) => [String(s._id), s]));

    const items = [...messages].reverse().map((m) => ({
      id: String(m._id),
      roomId: String(m.roomId),
      sender: senderMap.get(String(m.senderId)) ? serializeUser(senderMap.get(String(m.senderId))!) : null,
      content: m.deletedAt ? '' : m.content,
      attachments: m.deletedAt ? [] : m.attachments || [],
      replyTo: m.replyTo
        ? (() => {
            const r = replyMap.get(String(m.replyTo));
            const s = r ? replySenderMap.get(String(r.senderId)) : null;
            return r ? { id: String(r._id), senderName: s?.displayName || 'Someone', excerpt: (r.content || '').slice(0, 80) } : null;
          })()
        : null,
      reactions: (m.reactions || []).map((r) => ({
        emoji: r.emoji,
        users: r.users.map(String),
        count: r.users.length,
      })),
      isPinned: m.isPinned,
      isAnnouncement: m.isAnnouncement,
      isDeleted: Boolean(m.deletedAt),
      createdAt: m.createdAt.toISOString(),
    }));

    return ok(res, {
      items,
      nextCursor: messages.length === limit ? String(messages[messages.length - 1].createdAt.getTime()) : null,
    });
  }),
);

/** POST /api/rooms/:id/chat — persist a chat message (rate-limited). */
router.post(
  '/:id/chat',
  requireAuth,
  rateLimits.messages,
  validate(sendMessageSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const room = await Room.findById(req.params.id);
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');
    if (room.status === 'ended') throw AppError.conflict('ROOM_ENDED', 'This room has ended.');

    const membership = await getMembership(String(room._id), String(user._id));
    if (!membership || membership.status !== 'active') throw AppError.forbidden('NOT_A_MEMBER', 'Join the room to chat.');
    if (membership.isMuted) throw AppError.forbidden('MUTED', 'You are muted in this room.');

    const body = req.body as { content: string; replyTo?: string | null; attachments?: { type: 'image' | 'gif'; url: string; width?: number; height?: number }[] };
    const { assertCleanText, looksSpammy } = await import('../services/moderation.service.js');
    if (body.content) assertCleanText(body.content, 'message');

    // Spam guard: escalating soft block (never auto-ban).
    if (looksSpammy(body.content)) {
      const recentSpam = await Message.countDocuments({
        roomId: room._id,
        senderId: user._id,
        createdAt: { $gte: new Date(Date.now() - 60_000) },
      });
      if (recentSpam > 5) throw AppError.tooMany('SPAM_GUARD', 'Slow down — your messages look spammy.');
    }

    const isAnnouncement = (body.content || '').startsWith('!announce ') && canModerate(membership.role);

    const message = await Message.create({
      roomId: room._id,
      senderId: user._id,
      content: (body.content || '').slice(0, 2000),
      attachments: (body.attachments || []).slice(0, 4),
      replyTo: body.replyTo || null,
      isAnnouncement,
    });

    const payload = {
      id: String(message._id),
      roomId: String(room._id),
      sender: serializeUser(user),
      content: message.content,
      attachments: message.attachments,
      replyTo: null,
      reactions: [],
      isPinned: false,
      isAnnouncement,
      isDeleted: false,
      createdAt: message.createdAt.toISOString(),
    };
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`room:${room._id}`).emit('room:message', payload);

    // Mentions -> notifications
    const mentions = [...new Set((body.content.match(/@([a-z0-9_]{3,24})/gi) || []).map((m) => m.slice(1).toLowerCase()))];
    if (mentions.length) {
      const mentioned = await User.find({ username: { $in: mentions.slice(0, 10) } }).select('_id').lean();
      await Promise.all(
        mentioned
          .filter((m) => String(m._id) !== String(user._id))
          .map((m) =>
            notify({
              userId: String(m._id),
              type: 'mention',
              title: `${user.displayName} mentioned you`,
              body: message.content.slice(0, 120),
              link: `/rooms/${room.slug}`,
            }),
          ),
      );
    }

    return created(res, { message: payload });
  }),
);

/** POST /api/rooms/:id/chat/:messageId/react */
router.post(
  '/:id/chat/:messageId/react',
  requireAuth,
  rateLimits.reactions,
  validate(z.object({ emoji: z.string().min(1).max(8) })),
  handler(async (req, res) => {
    const user = currentUser(req);
    const { emoji } = req.body as { emoji: string };
    const message = await Message.findById(req.params.messageId);
    if (!message || String(message.roomId) !== String(req.params.id)) throw AppError.notFound('MESSAGE_NOT_FOUND', 'Message not found.');

    const membership = await getMembership(String(message.roomId), String(user._id));
    if (!membership || membership.status !== 'active') throw AppError.forbidden('NOT_A_MEMBER', 'Join the room first.');

    const existing = message.reactions.find((r) => r.emoji === emoji);
    let added = true;
    if (existing) {
      const idx = existing.users.findIndex((u) => String(u) === String(user._id));
      if (idx >= 0) {
        existing.users.splice(idx, 1);
        added = false;
        if (existing.users.length === 0) message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
      } else {
        existing.users.push(user._id);
      }
    } else {
      message.reactions.push({ emoji, users: [user._id] });
    }
    await message.save();

    const payload = {
      messageId: String(message._id),
      reactions: message.reactions.map((r) => ({ emoji: r.emoji, users: r.users.map(String), count: r.users.length })),
    };
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`room:${message.roomId}`).emit('room:reaction', payload);
    return ok(res, { ...payload, added });
  }),
);

/** DELETE /api/rooms/:id/chat/:messageId — author or moderator can delete. */
router.delete(
  '/:id/chat/:messageId',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const message = await Message.findById(req.params.messageId);
    if (!message || String(message.roomId) !== String(req.params.id)) throw AppError.notFound('MESSAGE_NOT_FOUND', 'Message not found.');
    const membership = await getMembership(String(message.roomId), String(user._id));
    const isAuthor = String(message.senderId) === String(user._id);
    const isModerator = membership && canModerate(membership.role);
    if (!isAuthor && !isModerator && user.role !== 'admin' && user.role !== 'moderator') {
      throw AppError.forbidden('NOT_ALLOWED', 'You can only delete your own messages.');
    }
    message.deletedAt = new Date();
    message.deletedBy = user._id;
    await message.save();
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`room:${message.roomId}`).emit('room:message-deleted', { messageId: String(message._id), roomId: String(message.roomId) });
    return ok(res, { ok: true });
  }),
);

/** POST /api/rooms/:id/polls — host creates a poll. */
router.post(
  '/:id/polls',
  requireAuth,
  validate(createPollSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const poll = await createPoll(String(req.params.id), String(user._id), req.body as never);
    return created(res, { poll });
  }),
);

/** POST /api/rooms/:id/polls/:pollId/vote */
router.post(
  '/:id/polls/:pollId/vote',
  requireAuth,
  validate(z.object({ optionId: z.string().min(1) })),
  handler(async (req, res) => {
    const user = currentUser(req);
    const result = await votePoll(String(req.params.pollId), String(user._id), (req.body as { optionId: string }).optionId);
    return ok(res, result);
  }),
);

/** GET /api/rooms/:id/polls */
router.get(
  '/:id/polls',
  requireAuth,
  handler(async (req, res) => {
    const { listPolls } = await import('../services/poll.service.js');
    const polls = await listPolls(String(req.params.id));
    return ok(res, { polls });
  }),
);

/** POST /api/rooms/:id/giveaways — host starts a giveaway. */
router.post(
  '/:id/giveaways',
  requireAuth,
  validate(createGiveawaySchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const room = await Room.findById(req.params.id);
    if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');
    const membership = await getMembership(String(room._id), String(user._id));
    if (!membership || !canModerate(membership.role)) throw AppError.forbidden('NOT_MODERATOR', 'Only hosts can run giveaways.');
    if (room.status !== 'live') throw AppError.conflict('ROOM_NOT_LIVE', 'The room must be live.');

    const body = req.body as { title: string; prize: string; type: 'airtime' | 'data' | 'cash' | 'shoutout' | 'sponsored_prize' | 'custom'; winnerCount: number; entryCondition: 'in_room' | 'react' | 'answer_question' | 'follow_host' | 'rsvp' | 'custom'; entryDetail?: string; minAccountAgeDays?: number; durationSeconds: number };

    const giveaway = await startGiveaway({
      roomId: String(room._id),
      hostId: String(user._id),
      title: body.title,
      prize: body.prize,
      type: body.type,
      winnerCount: body.winnerCount,
      entryCondition: body.entryCondition,
      entryDetail: body.entryDetail,
      minAccountAgeDays: body.minAccountAgeDays,
      durationSeconds: body.durationSeconds,
    });

    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`room:${room._id}`).emit('giveaway:started', {
      giveawayId: String(giveaway._id),
      roomId: String(room._id),
      title: giveaway.title,
      prize: giveaway.prize,
      type: giveaway.type,
      winnerCount: giveaway.winnerCount,
      entryCondition: giveaway.entryCondition,
      endsAt: giveaway.endsAt.toISOString(),
      seconds: body.durationSeconds,
    });

    return created(res, { giveaway: { id: String(giveaway._id), endsAt: giveaway.endsAt.toISOString(), title: giveaway.title, prize: giveaway.prize } });
  }),
);

/** POST /api/rooms/:id/giveaways/:giveawayId/enter */
router.post(
  '/:id/giveaways/:giveawayId/enter',
  requireAuth,
  rateLimits.giveawayEntries,
  handler(async (req, res) => {
    const user = currentUser(req);
    const answer = (req.body as { answer?: string })?.answer;
    const result = await enterGiveaway(String(req.params.giveawayId), String(user._id), answer);
    return ok(res, result);
  }),
);

/** GET /api/rooms/:id/giveaways */
router.get(
  '/:id/giveaways',
  requireAuth,
  handler(async (req, res) => {
    const active = await getActiveGiveawayForRoom(String(req.params.id));
    const past = await getRecentGiveawaysForRoom(String(req.params.id));
    const userId = String(currentUser(req)._id);
    let enteredIds: string[] = [];
    if (active) {
      const { GiveawayEntry } = await import('../models/index.js');
      const entry = await GiveawayEntry.findOne({ giveawayId: active._id, userId });
      enteredIds = entry ? [String(active._id)] : [];
    }
    return ok(res, {
      active: active ? { id: String(active._id), title: active.title, prize: active.prize, type: active.type, winnerCount: active.winnerCount, entryCondition: active.entryCondition, entryDetail: active.entryDetail, minAccountAgeDays: active.minAccountAgeDays, endsAt: active.endsAt.toISOString(), status: active.status } : null,
      past: past.filter((g) => g.status === 'ended').map((g) => ({ id: String(g._id), title: g.title, prize: g.prize, winnerIds: g.winnerIds.map(String), endsAt: g.endsAt.toISOString() })),
      enteredIds,
    });
  }),
);

/** POST /api/rooms/:id/quiz — host sets up quiz. */
router.post(
  '/:id/quiz',
  requireAuth,
  validate(quizQuestionsSchema.partial({ questions: true })),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as { title?: string; questions?: { question: string; options: string[]; correctIndex: number; roundTimeSeconds?: number }[] };
    const quiz = await createQuiz({
      roomId: String(req.params.id),
      hostId: String(user._id),
      title: body.title,
      questions: body.questions,
    });
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`room:${req.params.id}`).emit('quiz:created', { quizId: String(quiz._id), roomId: String(req.params.id), title: quiz.title, questionCount: quiz.questions.length });
    return created(res, { quiz: { id: String(quiz._id), title: quiz.title, questionCount: quiz.questions.length, status: quiz.status }, defaultQuestions: DEFAULT_QUESTIONS.length });
  }),
);

/** POST /api/rooms/:id/quiz/:quizId/start */
router.post(
  '/:id/quiz/:quizId/start',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const rt = await startQuiz(String(req.params.quizId), String(user._id));
    return ok(res, { started: true, players: rt.players.size });
  }),
);

/** GET /api/rooms/:id/quiz — current quiz state. */
router.get(
  '/:id/quiz',
  requireAuth,
  handler(async (req, res) => {
    const rt = getRuntime(String(req.params.id));
    const { Quiz } = await import('../models/index.js');
    const quiz = await Quiz.findOne({ roomId: String(req.params.id) }).sort({ createdAt: -1 });
    if (!quiz) return ok(res, { quiz: null });
    return ok(res, {
      quiz: {
        id: String(quiz._id),
        status: rt?.status || quiz.status,
        title: quiz.title,
        currentRound: rt?.currentRound ?? quiz.currentRound,
        totalRounds: quiz.questions.length,
        players: rt ? [...rt.players.values()] : [],
        winner: rt?.winnerId || (quiz.winnerId ? String(quiz.winnerId) : null),
      },
    });
  }),
);

export default router;
