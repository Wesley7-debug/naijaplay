import type { NotificationType } from '@naijaplay/shared';
import { Notification, User, type NotificationDoc } from '../models/index.js';
import { sendEmail, notificationEmail } from './email.service.js';
import { getIO } from '../sockets/io.js';
import logger from '../config/logger.js';

export interface NotifyOptions {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  data?: Record<string, unknown>;
  /** Send an email too (event reminders, payments, etc.). */
  email?: boolean;
  /** Suppress realtime emission (used during seeding). */
  silent?: boolean;
}

/**
 * Central notification pipeline: persist -> realtime emit (socket) -> optional email.
 * Structured so web push can be added as another channel later.
 */
export async function notify(opts: NotifyOptions): Promise<NotificationDoc | null> {
  try {
    if (opts.email) {
      const user = await User.findById(opts.userId).select('email');
      if (user && user.email) {
        const link = opts.link ? `${process.env.CLIENT_URL || ''}${opts.link}` : undefined;
        void sendEmail({
          to: user.email,
          subject: opts.title,
          html: notificationEmail(opts.title, opts.body, link),
          text: `${opts.title}\n${opts.body}${link ? `\n${link}` : ''}`,
        });
      }
    }

    const notification = await Notification.create({
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      link: opts.link ?? null,
      data: opts.data ?? {},
      readAt: null,
    });

    if (!opts.silent) {
      try {
        const io = getIO();
        if (io) {
          io.to(`user:${opts.userId}`).emit('notification:new', {
            id: String(notification._id),
            type: notification.type,
            title: notification.title,
            body: notification.body,
            link: notification.link,
            data: notification.data,
            createdAt: notification.createdAt.toISOString(),
            readAt: null,
          });
        }
      } catch {
        // socket layer may not be initialised (tests) — persistence already done
      }
    }
    return notification;
  } catch (err) {
    logger.error({ err, userId: opts.userId, type: opts.type }, 'notification failed');
    return null;
  }
}

export async function notifyMany(userIds: string[], opts: Omit<NotifyOptions, 'userId'>): Promise<void> {
  await Promise.all(userIds.map((id) => notify({ ...opts, userId: id })));
}

export async function listNotifications(userId: string, cursor?: string, limit = 20) {
  const filter: Record<string, unknown> = { userId };
  if (cursor) filter.createdAt = { $lt: new Date(cursor) };
  const rows = await Notification.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((n) => ({
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    data: n.data,
    readAt: n.readAt ? (n.readAt as Date).toISOString() : null,
    createdAt: (n.createdAt as Date).toISOString(),
  }));
  return {
    items,
    nextCursor: hasMore && items.length ? items[items.length - 1].createdAt : null,
  };
}

export async function unreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, readAt: null });
}

export async function markRead(userId: string, ids?: string[]): Promise<void> {
  if (ids && ids.length > 0) {
    await Notification.updateMany({ userId, _id: { $in: ids } }, { $set: { readAt: new Date() } });
    return;
  }
  await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
}

export async function markAllRead(userId: string): Promise<void> {
  await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
}
