import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import crypto from 'node:crypto';
import config from '../config/env.js';
import logger from '../config/logger.js';
import { setIO } from './io.js';
import { Session, User, Room, RoomMember, Message, type UserDoc } from '../models/index.js';
import { sha256 } from '../utils/crypto.js';
import { joinRoom, leaveRoom } from '../services/room.service.js';
import { submitAnswer, closeRound, getRuntime } from '../services/quiz.service.js';
import { AppError } from '../utils/errors.js';

interface SocketData {
  user: UserDoc | null;
  guestId?: string;
  guestName?: string;
}

function sanitizeGuestName(raw: unknown): string {
  return String(raw || '')
    .replace(/[^A-Za-z0-9_ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

function isGuestId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^g_[0-9a-f]{8,64}$/.test(raw);
}

async function authenticateSocket(socket: Socket): Promise<UserDoc | null> {
  const rawCookie = socket.handshake.headers.cookie;
  if (!rawCookie) return null;
  const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${config.cookie.name}=([^;]+)`));
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const session = await Session.findOne({ tokenHash: sha256(token) });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const user = await User.findById(session.userId);
  if (!user || user.isSuspended) return null;
  return user;
}

/** Presence registry: roomId -> socketId -> userId (rebuilt on reconnects). */
const presence = new Map<string, Map<string, string>>();

function addPresence(roomId: string, socketId: string, userId: string) {
  if (!presence.has(roomId)) presence.set(roomId, new Map());
  presence.get(roomId)!.set(socketId, userId);
}

function removePresence(roomId: string, socketId: string) {
  presence.get(roomId)?.delete(socketId);
}

function uniqueUsersInRoom(roomId: string): string[] {
  const set = new Set<string>();
  presence.get(roomId)?.forEach((userId) => set.add(userId));
  return [...set];
}

/** Global lobby presence: socketId -> { id, displayName, guest }. */
interface GlobalPresenceEntry {
  id: string;
  displayName: string;
  guest: boolean;
}
const globalPresence = new Map<string, GlobalPresenceEntry>();

function touchGlobalPresence(socket: Socket) {
  const d = socket.data as SocketData;
  const entry: GlobalPresenceEntry = d.user
    ? { id: String(d.user._id), displayName: d.user.displayName, guest: false }
    : { id: d.guestId || socket.id, displayName: d.guestName || 'Anon', guest: true };
  globalPresence.set(socket.id, entry);
}

function removeGlobalPresence(socketId: string): boolean {
  return globalPresence.delete(socketId);
}

function broadcastGlobalPresence(io: Server) {
  io.to('global').emit('global:presence', presenceForGlobal());
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientUrl, credentials: true },
    pingTimeout: 25_000,
    pingInterval: 15_000,
    transports: ['websocket', 'polling'],
  });
  setIO(io);

  // Auth middleware: sessions for members, guest identity for visitors.
  // The global lobby allows guests; room handlers still require a member user.
  io.use(async (socket, next) => {
    try {
      const user = await authenticateSocket(socket);
      const data = socket.data as SocketData;
      if (user) {
        data.user = user;
        socket.join(`user:${user._id}`);
        return next();
      }
      const auth = (socket.handshake.auth || {}) as { guestId?: unknown; guestName?: unknown };
      data.user = null;
      if (isGuestId(auth.guestId)) {
        data.guestId = auth.guestId;
        data.guestName = sanitizeGuestName(auth.guestName) || 'Anon';
      }
      return next();
    } catch (err) {
      logger.warn({ err }, 'socket auth failed');
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const data = socket.data as SocketData;
    const user = data.user;
    logger.debug({ userId: user ? String(user._id) : data.guestId || 'anon', sid: socket.id }, 'socket connected');

    const requireUser = (): UserDoc => {
      if (!user) throw AppError.unauthorized('Sign in to do that.');
      return user;
    };

    /** room:join — revalidates membership server-side on every (re)connect. */
    socket.on('room:join', async (payload: { roomId: string }, ack?: (r: unknown) => void) => {
      try {
        const me = requireUser();
        const roomId = String(payload?.roomId || '');
        const room = await Room.findById(roomId);
        if (!room) throw AppError.notFound('ROOM_NOT_FOUND', 'Room not found.');

        const membership = await RoomMember.findOne({ roomId, userId: me._id, status: 'active' });
        if (!membership) {
          // Auto-join public live rooms the socket enters (private requires HTTP join first).
          if (room.isPrivate || room.status === 'ended') throw AppError.forbidden('NOT_A_MEMBER', 'Join this room first.');
          await joinRoom({ roomId, userId: String(me._id) });
        }
        if (room.isLocked && (!membership || membership.status !== 'active')) {
          throw AppError.forbidden('ROOM_LOCKED', 'The host locked this room.');
        }

        socket.join(`room:${roomId}`);
        addPresence(roomId, socket.id, String(me._id));

        const memberCount = await RoomMember.countDocuments({ roomId, status: 'active' });
        io.to(`room:${roomId}`).emit('room:member-count', { roomId, memberCount });
        io.to(`room:${roomId}`).emit('room:presence', {
          roomId,
          onlineUsers: uniqueUsersInRoom(roomId),
        });
        ack?.({ ok: true, memberCount });
      } catch (err) {
        const e = err as AppError;
        ack?.({ ok: false, code: e.code || 'ERROR', message: e.message || 'Could not join.' });
      }
    });

    socket.on('room:leave', async (payload: { roomId: string }) => {
      if (!user) return;
      const roomId = String(payload?.roomId || '');
      socket.leave(`room:${roomId}`);
      removePresence(roomId, socket.id);
      try {
        await leaveRoom(roomId, String(user._id));
      } catch {
        // host cannot leave — presence still removed
      }
      const memberCount = await RoomMember.countDocuments({ roomId, status: 'active' });
      io.to(`room:${roomId}`).emit('room:member-count', { roomId, memberCount });
      io.to(`room:${roomId}`).emit('room:presence', { roomId, onlineUsers: uniqueUsersInRoom(roomId) });
    });

    /** room:typing — ephemeral, no persistence. */
    socket.on('room:typing', (payload: { roomId: string; typing?: boolean }) => {
      if (!user) return;
      const roomId = String(payload?.roomId || '');
      socket.to(`room:${roomId}`).emit('room:typing', {
        roomId,
        userId: String(user._id),
        displayName: user.displayName,
        typing: payload?.typing !== false,
      });
    });

    /** room:message — server persists + broadcasts (never trusts client sender info). */
    socket.on('room:message', async (payload: { roomId: string; content: string; clientNonce?: string }, ack?: (r: unknown) => void) => {
      try {
        const me = requireUser();
        const roomId = String(payload?.roomId || '');
        const content = String(payload?.content || '').slice(0, 2000).trim();
        if (!content) throw AppError.badRequest('EMPTY', 'Message cannot be empty.');

        const membership = await RoomMember.findOne({ roomId, userId: me._id, status: 'active' });
        if (!membership) throw AppError.forbidden('NOT_A_MEMBER', 'Join the room to chat.');
        if (membership.isMuted) throw AppError.forbidden('MUTED', 'You are muted in this room.');

        const { assertCleanText, looksSpammy } = await import('../services/moderation.service.js');
        assertCleanText(content, 'message');
        if (looksSpammy(content)) {
          const recent = await Message.countDocuments({ roomId, senderId: me._id, createdAt: { $gte: new Date(Date.now() - 60_000) } });
          if (recent > 5) throw AppError.tooMany('SPAM_GUARD', 'Slow down — your messages look spammy.');
        }

        const isAnnouncement = content.startsWith('!announce ') && ['host', 'cohost', 'moderator'].includes(membership.role);
        const message = await Message.create({
          roomId,
          senderId: me._id,
          content,
          isAnnouncement,
        });

        const payloadOut = {
          id: String(message._id),
          roomId,
          sender: {
            id: String(me._id),
            username: me.username,
            displayName: me.displayName,
            avatar: me.avatar ?? null,
            isVerified: me.isVerified,
            level: me.level,
            role: me.role,
          },
          content: message.content,
          attachments: [],
          replyTo: null,
          reactions: [],
          isPinned: false,
          isAnnouncement,
          isDeleted: false,
          clientNonce: payload.clientNonce,
          createdAt: message.createdAt.toISOString(),
        };
        io.to(`room:${roomId}`).emit('room:message', payloadOut);
        ack?.({ ok: true, id: String(message._id) });
      } catch (err) {
        const e = err as AppError;
        ack?.({ ok: false, code: e.code || 'ERROR', message: e.message || 'Could not send.' });
      }
    });

    /** room:reaction — toggle reaction on a message. */
    socket.on('room:reaction', async (payload: { roomId: string; messageId: string; emoji: string }) => {
      try {
        const me = requireUser();
        const { messageId, emoji } = payload || {};
        if (!messageId || !emoji) return;
        const message = await Message.findById(messageId);
        if (!message) return;
        const membership = await RoomMember.findOne({ roomId: message.roomId, userId: me._id, status: 'active' });
        if (!membership) return;

        const existing = message.reactions.find((r) => r.emoji === emoji.slice(0, 8));
        if (existing) {
          const idx = existing.users.findIndex((u) => String(u) === String(me._id));
          if (idx >= 0) existing.users.splice(idx, 1);
          else existing.users.push(me._id);
          if (existing.users.length === 0) message.reactions = message.reactions.filter((r) => r.emoji !== emoji.slice(0, 8));
        } else {
          message.reactions.push({ emoji: emoji.slice(0, 8), users: [me._id] });
        }
        await message.save();
        io.to(`room:${String(message.roomId)}`).emit('room:reaction', {
          messageId: String(message._id),
          reactions: message.reactions.map((r) => ({ emoji: r.emoji, users: r.users.map(String), count: r.users.length })),
        });
      } catch (err) {
        logger.warn({ err }, 'reaction failed');
      }
    });

    // ---- Quiz events (server-authoritative) ----

    socket.on('quiz:answer', async (payload: { roomId: string; round: number; answerIndex: number }, ack?: (r: unknown) => void) => {
      try {
        const me = requireUser();
        const rt = getRuntime(String(payload?.roomId || ''));
        if (!rt) throw AppError.notFound('NO_QUIZ', 'No quiz is running.');
        const result = await submitAnswer(rt, String(me._id), Number(payload.answerIndex), Number(payload.round));
        ack?.({ ok: true, ...result });
      } catch (err) {
        const e = err as AppError;
        ack?.({ ok: false, code: e.code || 'ERROR', message: e.message || 'Answer not accepted.' });
      }
    });

    socket.on('quiz:round-ended', async (payload: { roomId: string }) => {
      if (!user) return;
      // Host-driven early round close is allowed; closeRound itself is guarded.
      const membership = await RoomMember.findOne({ roomId: String(payload?.roomId || ''), userId: user._id, status: 'active' }).catch(() => null);
      if (membership && ['host', 'cohost'].includes(membership.role)) {
        await closeRound(String(payload.roomId)).catch(() => undefined);
      }
    });

    // ---- Giveaway: re-emit countdown ticks from server clock ----
    socket.on('giveaway:enter', async (payload: { giveawayId: string }, ack?: (r: unknown) => void) => {
      try {
        const me = requireUser();
        const { enterGiveaway } = await import('../services/giveaway.service.js');
        const result = await enterGiveaway(String(payload?.giveawayId || ''), String(me._id));
        ack?.({ ok: true, ...result });
      } catch (err) {
        const e = err as AppError;
        ack?.({ ok: false, code: e.code || 'ERROR', message: e.message || 'Could not enter.' });
      }
    });

    // ---- Global lobby (members + guests) ----

    socket.on('global:join', async (payload: { guestId?: string; guestName?: string }, ack?: (r: unknown) => void) => {
      try {
        const d = socket.data as SocketData;
        if (!d.user) {
          if (isGuestId(payload?.guestId)) {
            d.guestId = payload.guestId;
            const name = sanitizeGuestName(payload?.guestName);
            if (name) d.guestName = name;
          }
          if (!d.guestId) {
            const { mintGuest } = await import('../services/global.service.js');
            const g = mintGuest();
            d.guestId = g.guestId;
            d.guestName = g.guestName;
          }
        }
        socket.join('global');
        touchGlobalPresence(socket);
        broadcastGlobalPresence(io);
        ack?.({ ok: true, guestId: d.guestId || null, guestName: d.guestName || null, ...presenceForGlobal() });
      } catch (err) {
        const e = err as AppError;
        ack?.({ ok: false, code: e.code || 'ERROR', message: e.message || 'Could not join.' });
      }
    });

    socket.on('global:typing', (payload: { typing?: boolean }) => {
      const d = socket.data as SocketData;
      const displayName = d.user ? d.user.displayName : d.guestName || 'Someone';
      const id = d.user ? String(d.user._id) : d.guestId || socket.id;
      socket.to('global').emit('global:typing', {
        id,
        displayName,
        guest: !d.user,
        typing: payload?.typing !== false,
      });
    });

    socket.on('global:message', async (payload: { content: string; guestId?: string; guestName?: string; clientNonce?: string }, ack?: (r: unknown) => void) => {
      try {
        const d = socket.data as SocketData;
        const { postGlobalMessage } = await import('../services/global.service.js');
        const view = await postGlobalMessage(
          {
            user: d.user,
            guestId: payload?.guestId || d.guestId || null,
            guestName: payload?.guestName || d.guestName || null,
          },
          String(payload?.content || ''),
        );
        ack?.({ ok: true, message: { ...view, clientNonce: payload?.clientNonce } });
      } catch (err) {
        const e = err as AppError;
        ack?.({ ok: false, code: e.code || 'ERROR', message: e.message || 'Could not send.' });
      }
    });

    // ---- Typing & general error safety ----
    socket.on('error', (err) => logger.warn({ err, sid: socket.id }, 'socket error'));

    socket.on('disconnect', (reason) => {
      const departedGlobal = removeGlobalPresence(socket.id);
      if (departedGlobal) broadcastGlobalPresence(io);
      // Grace period: presence might be restored by an immediate reconnect.
      // Remove after 10s if the same user+room does not come back.
      const userId = user ? String(user._id) : null;
      setTimeout(() => {
        for (const [roomId, sockets] of presence.entries()) {
          let stillHere = false;
          sockets.forEach((uid, sid) => {
            if (sid === socket.id) sockets.delete(sid);
            else if (uid === userId) stillHere = true;
          });
          if (!stillHere && sockets.size === 0) {
            io.to(`room:${roomId}`).emit('room:presence', { roomId, onlineUsers: uniqueUsersInRoom(roomId) });
          } else if (sockets.size >= 0) {
            io.to(`room:${roomId}`).emit('room:presence', { roomId, onlineUsers: uniqueUsersInRoom(roomId) });
          }
          if (sockets.size === 0) presence.delete(roomId);
        }
      }, 10_000);
      logger.debug({ sid: socket.id, reason }, 'socket disconnected');
    });
  });

  // Stale presence sweeper: drop ghost sockets every minute.
  setInterval(() => {
    for (const [roomId, sockets] of presence.entries()) {
      const ids = [...sockets.keys()];
      for (const sid of ids) {
        if (!io.sockets.sockets.get(sid)) sockets.delete(sid);
      }
      if (sockets.size === 0) presence.delete(roomId);
    }
    let globalChanged = false;
    for (const sid of [...globalPresence.keys()]) {
      if (!io.sockets.sockets.get(sid)) {
        globalPresence.delete(sid);
        globalChanged = true;
      }
    }
    if (globalChanged) broadcastGlobalPresence(io);
  }, 60_000).unref?.();

  return io;
}

export function presenceForGlobal(): { onlineCount: number; users: { id: string; displayName: string; guest: boolean }[] } {
  const seen = new Map<string, GlobalPresenceEntry>();
  for (const entry of globalPresence.values()) {
    if (!seen.has(entry.id)) seen.set(entry.id, entry);
  }
  const users = [...seen.values()].slice(0, 50);
  return { onlineCount: seen.size, users };
}

export function presenceForRoom(roomId: string): string[] {
  return uniqueUsersInRoom(roomId);
}

export function randomId(): string {
  return crypto.randomBytes(8).toString('hex');
}
