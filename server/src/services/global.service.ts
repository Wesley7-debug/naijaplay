import crypto from 'node:crypto';
import { GlobalMessage, User, type UserDoc } from '../models/index.js';
import { serializeUser } from '../utils/serialize.js';
import { AppError } from '../utils/errors.js';
import { notify } from './notification.service.js';
import { getIO } from '../sockets/io.js';
import type { GlobalMessageView } from '@naijaplay/shared';

export interface GlobalIdentity {
  user?: UserDoc | null;
  guestId?: string | null;
  guestName?: string | null;
}

function sanitizeGuestName(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9_ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

/** Mint a fresh anonymous identity for signed-out visitors. */
export function mintGuest(): { guestId: string; guestName: string } {
  const guestId = `g_${crypto.randomBytes(8).toString('hex')}`;
  const guestName = `Anon${Math.floor(1000 + Math.random() * 9000)}`;
  return { guestId, guestName };
}

export function serializeGlobalMessage(
  m: {
    _id: unknown;
    senderId?: unknown;
    guestId?: string | null;
    guestName?: string | null;
    content: string;
    createdAt: Date;
  },
  senderUser?: { username: string; displayName: string; avatar?: string | null; isVerified?: boolean; level?: number } | null,
  mentionTags: { id: string; username: string }[] = [],
): GlobalMessageView {
  if (m.senderId && senderUser) {
    return {
      id: String(m._id),
      sender: {
        id: String(m.senderId),
        username: senderUser.username,
        displayName: senderUser.displayName,
        avatar: senderUser.avatar ?? null,
        guest: false,
        isVerified: senderUser.isVerified,
        level: senderUser.level,
      },
      content: m.content,
      mentions: mentionTags,
      createdAt: m.createdAt.toISOString(),
    };
  }
  return {
    id: String(m._id),
    sender: {
      id: m.guestId || `g_${String(m._id)}`,
      username: (m.guestName || 'Anon').replace(/\s+/g, ''),
      displayName: m.guestName || 'Anon',
      avatar: null,
      guest: true,
    },
    content: m.content,
    mentions: mentionTags,
    createdAt: m.createdAt.toISOString(),
  };
}

function extractMentions(content: string): string[] {
  return [...new Set((content.match(/@([a-z0-9_]{3,24})/gi) || []).map((m) => m.slice(1).toLowerCase()))].slice(0, 10);
}

/**
 * Persist + broadcast a global lobby message.
 * Signed-in users send as themselves; everyone else sends as a guest.
 */
export async function postGlobalMessage(identity: GlobalIdentity, rawContent: string): Promise<GlobalMessageView> {
  const content = rawContent.trim().slice(0, 500);
  if (!content) throw AppError.badRequest('EMPTY', 'Message cannot be empty.');

  const { assertCleanText, looksSpammy } = await import('./moderation.service.js');
  assertCleanText(content, 'message');

  if (identity.user) {
    if (identity.user.isSuspended) throw AppError.forbidden('SUSPENDED', 'Your account is suspended.');
    if (looksSpammy(content)) {
      const recent = await GlobalMessage.countDocuments({
        senderId: identity.user._id,
        createdAt: { $gte: new Date(Date.now() - 60_000) },
      });
      if (recent > 8) throw AppError.tooMany('SPAM_GUARD', 'Slow down — your messages look spammy.');
    }
  } else {
    const guestId = identity.guestId || '';
    if (!/^g_[0-9a-f]{8,64}$/.test(guestId)) throw AppError.badRequest('GUEST_REQUIRED', 'Your guest session expired. Refresh to get a new one.');
    const guestName = sanitizeGuestName(identity.guestName || '');
    if (guestName.length < 3) throw AppError.badRequest('GUEST_NAME_REQUIRED', 'Pick a display name (3–20 characters).');
    if (looksSpammy(content)) {
      const recent = await GlobalMessage.countDocuments({
        guestId,
        createdAt: { $gte: new Date(Date.now() - 60_000) },
      });
      if (recent > 6) throw AppError.tooMany('SPAM_GUARD', 'Slow down — your messages look spammy.');
    }
  }

  const mentionNames = extractMentions(content);
  const mentioned = mentionNames.length
    ? await User.find({ username: { $in: mentionNames } }).select('_id username displayName').lean()
    : [];
  const mentionIds = mentioned.map((u) => u._id);

  const doc = await GlobalMessage.create({
    senderId: identity.user ? identity.user._id : null,
    guestId: identity.user ? null : identity.guestId,
    guestName: identity.user ? null : sanitizeGuestName(identity.guestName || ''),
    content,
    mentions: mentionIds,
  });

  const view = identity.user
    ? serializeGlobalMessage(doc, {
        username: identity.user.username,
        displayName: identity.user.displayName,
        avatar: identity.user.avatar ?? null,
        isVerified: identity.user.isVerified,
        level: identity.user.level,
      }, mentioned.map((u) => ({ id: String(u._id), username: u.username })))
    : serializeGlobalMessage(doc, null, mentioned.map((u) => ({ id: String(u._id), username: u.username })));

  getIO()?.to('global').emit('global:message', view);

  // Notify mentioned registered users (skip self-mentions).
  if (mentioned.length) {
    const fromName = identity.user ? identity.user.displayName : sanitizeGuestName(identity.guestName || 'Someone');
    const fromId = identity.user ? String(identity.user._id) : null;
    await Promise.all(
      mentioned
        .filter((m) => String(m._id) !== fromId)
        .map((m) =>
          notify({
            userId: String(m._id),
            type: 'mention',
            title: `${fromName} mentioned you in global chat`,
            body: content.slice(0, 120),
            link: '/global',
          }),
        ),
    );
  }

  return view;
}

/** Latest global messages, oldest-first for chat display. */
export async function getGlobalHistory(limit = 50, before?: Date): Promise<GlobalMessageView[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (before) filter.createdAt = { $lt: before };
  const docs = await GlobalMessage.find(filter).sort({ createdAt: -1 }).limit(safeLimit).lean();
  const userIds = docs.map((d) => d.senderId).filter(Boolean);
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).lean() : [];
  const map = new Map(users.map((u) => [String(u._id), u]));
  const allMentionIds = [...new Set(docs.flatMap((d) => (d.mentions || []).map(String)))];
  const mentionUsers = allMentionIds.length
    ? await User.find({ _id: { $in: allMentionIds } }).select('_id username').lean()
    : [];
  const mentionMap = new Map(mentionUsers.map((u) => [String(u._id), u.username]));
  return [...docs].reverse().map((d) => {
    const u = d.senderId ? map.get(String(d.senderId)) : null;
    const tags = (d.mentions || [])
      .map((id) => ({ id: String(id), username: mentionMap.get(String(id)) || '' }))
      .filter((t) => t.username);
    return serializeGlobalMessage(d, u ? serializeUser(u as never) : null, tags);
  });
}
