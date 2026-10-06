import { Giveaway, Event, Room, Season, Rsvp, User } from '../models/index.js';
import { finalizeGiveaway } from '../services/giveaway.service.js';
import { notify } from '../services/notification.service.js';
import { finalizeSeason } from '../services/season.service.js';
import { generateRecap } from '../services/recap.service.js';
import logger from '../config/logger.js';

let started = false;

/**
 * Background scheduler. Every job is idempotent and DB-driven:
 * giveaways finalize when endsAt passes, reminders fire once, seasons roll monthly.
 */
export function startJobs(): void {
  if (started) return;
  started = true;

  // 1. Giveaways whose countdown ended -> server-side winner selection.
  const giveawayJob = setInterval(async () => {
    try {
      const due = await Giveaway.find({ status: 'active', endsAt: { $lte: new Date() } }).limit(10);
      for (const g of due) {
        // eslint-disable-next-line no-await-in-loop
        await finalizeGiveaway(String(g._id));
      }
    } catch (err) {
      logger.error({ err }, 'giveaway job failed');
    }
  }, 3000);
  giveawayJob.unref?.();

  // 2. Event reminders (15 min before) + starting notifications + cancellations.
  const reminderJob = setInterval(async () => {
    try {
      const now = new Date();
      const soon = new Date(now.getTime() + 15 * 60_000);

      const dueReminders = await Event.find({
        status: 'upcoming',
        reminderSentAt: null,
        startsAt: { $gt: now, $lte: soon },
      }).limit(20);

      for (const event of dueReminders) {
        // eslint-disable-next-line no-await-in-loop
        const rsvps = await Rsvp.find({ eventId: event._id, status: 'going' }).lean();
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(
          rsvps.map((r) =>
            notify({
              userId: String(r.userId),
              type: 'event_reminder',
              title: `Starting soon: ${event.title}`,
              body: event.mode !== 'online' && event.venue ? `📍 ${event.venue} — ${event.city || ''}` : 'Your event kicks off in 15 minutes.',
              link: `/events/${event.slug}`,
              email: true,
            }),
          ),
        );
        event.reminderSentAt = now;
        // eslint-disable-next-line no-await-in-loop
        await event.save();
      }

      // Flip events to live when they start.
      const starting = await Event.find({ status: 'upcoming', startsAt: { $lte: now } }).limit(20);
      for (const event of starting) {
        event.status = 'live';
        // eslint-disable-next-line no-await-in-loop
        await event.save();
        if (!event.startingSentAt) {
          // eslint-disable-next-line no-await-in-loop
          const rsvps = await Rsvp.find({ eventId: event._id, status: 'going' }).lean();
          // eslint-disable-next-line no-await-in-loop
          await Promise.all(
            rsvps.map((r) =>
              notify({
                userId: String(r.userId),
                type: 'event_starting',
                title: `It's happening: ${event.title}`,
                body: 'The event is live. Head in.',
                link: `/events/${event.slug}`,
              }),
            ),
          );
          event.startingSentAt = now;
          // eslint-disable-next-line no-await-in-loop
          await event.save();
        }
      }

      // Mark past events ended.
      await Event.updateMany(
        { status: 'live', startsAt: { $lte: new Date(now.getTime() - 6 * 60 * 60_000) } },
        { $set: { status: 'ended' } },
      );
    } catch (err) {
      logger.error({ err }, 'reminder job failed');
    }
  }, 60_000);
  reminderJob.unref?.();

  // 3. Scheduled rooms go live at their time.
  const roomJob = setInterval(async () => {
    try {
      const due = await Room.find({ status: 'scheduled', scheduledAt: { $lte: new Date() } }).limit(20);
      for (const room of due) {
        room.status = 'live';
        room.startedAt = new Date();
        // eslint-disable-next-line no-await-in-loop
        await room.save();
        logger.info({ roomId: String(room._id) }, 'scheduled room went live');
      }
    } catch (err) {
      logger.error({ err }, 'scheduled room job failed');
    }
  }, 30_000);
  roomJob.unref?.();

  // 4. Ended rooms (older than 5 min) get a recap if missing.
  const recapJob = setInterval(async () => {
    try {
      const ended = await Room.find({ status: 'ended', recapId: null, endedAt: { $lte: new Date(Date.now() - 5 * 60_000) } }).limit(5);
      for (const room of ended) {
        // eslint-disable-next-line no-await-in-loop
        await generateRecap(room);
      }
    } catch (err) {
      logger.error({ err }, 'recap job failed');
    }
  }, 120_000);
  recapJob.unref?.();

  // 5. Season finalization when the end date passes.
  const seasonJob = setInterval(async () => {
    try {
      const expired = await Season.find({ status: 'active', endDate: { $lte: new Date() } }).limit(1);
      for (const season of expired) {
        // eslint-disable-next-line no-await-in-loop
        await finalizeSeason(String(season._id));
      }
    } catch (err) {
      logger.error({ err }, 'season job failed');
    }
  }, 300_000);
  seasonJob.unref?.();

  // 6. Daily streak helper: touch active users (supports the streak achievement).
  const streakJob = setInterval(
    () => {
      void User.updateMany({ lastSeenAt: { $gte: new Date(Date.now() - 24 * 60 * 60_000) } }, { $set: { lastSeenAt: new Date() } }).catch(() => undefined);
    },
    6 * 60 * 60_000,
  );
  streakJob.unref?.();

  logger.info('background jobs started');
}

export function stopJobs(): void {
  started = false;
}
