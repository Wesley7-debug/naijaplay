import { Router } from 'express';
import { z } from 'zod';
import { handler, ok, created } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { Conversation, DirectMessage, User, type IConversation, type IDirectMessage } from '../models/index.js';
import { serializeUser } from '../utils/serialize.js';
import { AppError } from '../utils/errors.js';
import { assertCleanText } from '../services/moderation.service.js';

const router = Router();
router.use(requireAuth);

/** GET /api/conversations — my DM threads with unread counts. */
router.get(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    const convos = await Conversation.find({ participantIds: user._id }).sort({ updatedAt: -1 }).limit(50).lean();
    const otherIds = convos.map((c) => c.participantIds.map(String).find((id) => id !== String(user._id))!).filter(Boolean);
    const others = otherIds.length ? await User.find({ _id: { $in: otherIds } }).lean() : [];
    const map = new Map(others.map((o) => [String(o._id), o]));

    const items = await Promise.all(
      convos.map(async (c: IConversation) => {
        const otherId = c.participantIds.map(String).find((id) => id !== String(user._id));
        const unread = await DirectMessage.countDocuments({
          conversationId: c._id,
          senderId: { $ne: user._id },
          readAt: null,
          deletedAt: null,
        });
        return {
          id: String(c._id),
          participant: otherId && map.get(otherId) ? serializeUser(map.get(otherId)!) : null,
          lastMessage: c.lastMessage
            ? { content: c.lastMessage.content, createdAt: c.lastMessage.createdAt.toISOString(), senderId: String(c.lastMessage.senderId) }
            : null,
          unreadCount: unread,
          updatedAt: c.updatedAt.toISOString(),
        };
      }),
    );
    return ok(res, { items });
  }),
);

/** POST /api/conversations — open (or reuse) a 1:1 thread. */
router.post(
  '/',
  validate(z.object({ userId: z.string().regex(/^[0-9a-fA-F]{24}$/) })),
  handler(async (req, res) => {
    const user = currentUser(req);
    const { userId } = req.body as { userId: string };
    if (userId === String(user._id)) throw AppError.badRequest('SELF_CONVO', 'You cannot message yourself.');
    const target = await User.findById(userId);
    if (!target || target.isSuspended) throw AppError.notFound('USER_NOT_FOUND', 'User not found.');
    if (target.blockedUserIds?.some((b) => String(b) === String(user._id))) {
      throw AppError.forbidden('BLOCKED', 'You cannot start a conversation with this user.');
    }
    if (user.blockedUserIds?.some((b) => String(b) === userId)) {
      throw AppError.forbidden('BLOCKED', 'Unblock this user first.');
    }

    const pair = [String(user._id), userId].sort();
    let convo = await Conversation.findOne({ participantIds: { $all: pair, $size: 2 } });
    if (!convo) convo = await Conversation.create({ participantIds: pair });
    return created(res, {
      conversation: {
        id: String(convo._id),
        participant: serializeUser(target),
        lastMessage: null,
        unreadCount: 0,
        updatedAt: convo.updatedAt.toISOString(),
      },
    });
  }),
);

/** GET /api/conversations/:id/messages?cursor= */
router.get(
  '/:id/messages',
  handler(async (req, res) => {
    const user = currentUser(req);
    const convo = await Conversation.findById(req.params.id);
    if (!convo || !convo.participantIds.some((p) => String(p) === String(user._id))) {
      throw AppError.notFound('CONVO_NOT_FOUND', 'Conversation not found.');
    }
    const cursor = req.query.cursor ? new Date(Number(req.query.cursor)) : null;
    const filter: Record<string, unknown> = { conversationId: convo._id, deletedAt: null };
    if (cursor) filter.createdAt = { $lt: cursor };
    const messages = await DirectMessage.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    const items = [...messages].reverse().map((m: IDirectMessage) => ({
      id: String(m._id),
      conversationId: String(m.conversationId),
      senderId: String(m.senderId),
      content: m.content,
      isMine: String(m.senderId) === String(user._id),
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    }));
    return ok(res, {
      items,
      nextCursor: messages.length === 50 ? String(messages[messages.length - 1].createdAt.getTime()) : null,
    });
  }),
);

/** POST /api/conversations/:id/messages — send a DM (persisted, real). */
router.post(
  '/:id/messages',
  validate(z.object({ content: z.string().min(1).max(2000) })),
  handler(async (req, res) => {
    const user = currentUser(req);
    const convo = await Conversation.findById(req.params.id);
    if (!convo || !convo.participantIds.some((p) => String(p) === String(user._id))) {
      throw AppError.notFound('CONVO_NOT_FOUND', 'Conversation not found.');
    }
    const otherId = convo.participantIds.map(String).find((id) => id !== String(user._id))!;
    const other = await User.findById(otherId);
    if (other?.blockedUserIds?.some((b) => String(b) === String(user._id))) {
      throw AppError.forbidden('BLOCKED', 'You cannot message this user.');
    }

    const content = (req.body as { content: string }).content.trim();
    assertCleanText(content, 'message');

    const message = await DirectMessage.create({ conversationId: convo._id, senderId: user._id, content });
    convo.lastMessage = { content: content.slice(0, 200), createdAt: message.createdAt, senderId: user._id };
    convo.updatedAt = new Date();
    await convo.save();

    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`user:${otherId}`).emit('dm:new', {
      id: String(message._id),
      conversationId: String(convo._id),
      senderId: String(user._id),
      senderName: user.displayName,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    });

    return created(res, {
      message: {
        id: String(message._id),
        conversationId: String(convo._id),
        senderId: String(user._id),
        content: message.content,
        isMine: true,
        createdAt: message.createdAt.toISOString(),
        readAt: null,
      },
    });
  }),
);

/** POST /api/conversations/:id/read — mark thread read. */
router.post(
  '/:id/read',
  handler(async (req, res) => {
    const user = currentUser(req);
    await DirectMessage.updateMany(
      { conversationId: req.params.id, senderId: { $ne: user._id }, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return ok(res, { ok: true });
  }),
);

export default router;
