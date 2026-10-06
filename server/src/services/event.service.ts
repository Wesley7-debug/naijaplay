import type { RsvpStatus } from '@naijaplay/shared';
import { Event, Rsvp, User, type EventDoc, type IEvent } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { slugify } from '../utils/crypto.js';
import { notify } from './notification.service.js';

export interface CreateEventInput {
  hostId: string;
  title: string;
  description?: string;
  mode: 'online' | 'irl' | 'both';
  category: IEvent['category'];
  gameId?: string | null;
  city?: string;
  area?: string;
  venue?: string;
  safetyNotes?: string;
  onlineUrl?: string;
  startsAt: string;
  endsAt?: string | null;
  capacity: number;
  rules?: string[];
  coverImage?: string;
}

export async function createEvent(input: CreateEventInput): Promise<EventDoc> {
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw AppError.badRequest('BAD_DATE', 'Invalid event date.');
  if (startsAt.getTime() < Date.now() - 60_000) {
    throw AppError.badRequest('PAST_EVENT', 'Event start time is in the past.');
  }
  return Event.create({
    title: input.title.trim(),
    slug: slugify(input.title),
    description: (input.description || '').trim(),
    hostId: input.hostId,
    mode: input.mode,
    category: input.category,
    gameId: input.gameId || null,
    city: input.city || null,
    area: input.area || null,
    venue: input.venue || null,
    safetyNotes: input.safetyNotes || null,
    onlineUrl: input.onlineUrl || null,
    startsAt,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    capacity: input.capacity,
    rules: input.rules || [],
    coverImage: input.coverImage || null,
    status: 'upcoming',
  });
}

export interface RsvpResult {
  status: RsvpStatus;
  goingCount: number;
  maybeCount: number;
  waitlistCount: number;
}

/**
 * Server-side RSVP with waitlist logic:
 * capacity reached -> waitlist; when someone cancels -> promote next eligible.
 */
export async function rsvpEvent(eventId: string, userId: string, status: 'going' | 'maybe' | 'cancelled'): Promise<RsvpResult> {
  const event = await Event.findById(eventId);
  if (!event) throw AppError.notFound('EVENT_NOT_FOUND', 'Event not found.');
  if (event.status === 'cancelled') throw AppError.conflict('EVENT_CANCELLED', 'This event was cancelled.');
  if (event.status === 'ended') throw AppError.conflict('EVENT_ENDED', 'This event already ended.');

  const isHost = String(event.hostId) === userId;
  const existing = await Rsvp.findOne({ eventId: event._id, userId });

  if (status === 'cancelled') {
    if (existing) await existing.deleteOne();
    await recomputeCounts(event._id.toString());
    // Promote the next waitlisted user when a going-spot frees up.
    await promoteFromWaitlist(event);
    const counts = await recomputeCounts(event._id.toString());
    return { status: 'cancelled' as never, ...counts };
  }

  if (isHost) throw AppError.badRequest('HOST_RSVP', 'You are the host of this event.');

  const counts = await recomputeCounts(event._id.toString());
  let finalStatus: RsvpStatus = status as RsvpStatus;

  if (status === 'going' && counts.goingCount >= event.capacity) {
    finalStatus = 'waitlist';
  }

  if (existing) {
    existing.status = finalStatus;
    await existing.save();
  } else {
    await Rsvp.create({ eventId: event._id, userId, status: finalStatus });
    await User.updateOne({ _id: userId }, { $inc: { eventsJoinedCount: 1 } });
    if (finalStatus === 'going') {
      await notify({
        userId,
        type: 'rsvp_confirmed',
        title: "You're going!",
        body: `Your spot for “${event.title}” is confirmed.`,
        link: `/events/${event.slug}`,
        email: true,
      });
    } else if (finalStatus === 'waitlist') {
      await notify({
        userId,
        type: 'rsvp_confirmed',
        title: 'You joined the waitlist',
        body: `“${event.title}” is full. We will notify you if a spot opens up.`,
        link: `/events/${event.slug}`,
      });
    }
  }

  const after = await recomputeCounts(event._id.toString());
  return { status: finalStatus, ...after };
}

export async function recomputeCounts(eventId: string): Promise<Omit<RsvpResult, 'status'>> {
  const [going, maybe, waitlist] = await Promise.all([
    Rsvp.countDocuments({ eventId, status: 'going' }),
    Rsvp.countDocuments({ eventId, status: 'maybe' }),
    Rsvp.countDocuments({ eventId, status: 'waitlist' }),
  ]);
  await Event.updateOne({ _id: eventId }, { $set: { goingCount: going, maybeCount: maybe, waitlistCount: waitlist } });
  return { goingCount: going, maybeCount: maybe, waitlistCount: waitlist };
}

/** Select the earliest waitlisted user, promote to going, notify them. */
export async function promoteFromWaitlist(event: EventDoc): Promise<boolean> {
  const counts = await recomputeCounts(event._id.toString());
  if (counts.goingCount >= event.capacity) return false;

  const next = await Rsvp.findOne({ eventId: event._id, status: 'waitlist' }).sort({ createdAt: 1 });
  if (!next) return false;

  next.status = 'going';
  await next.save();
  await recomputeCounts(event._id.toString());
  await notify({
    userId: String(next.userId),
    type: 'waitlist_promotion',
    title: 'Spot opened — you’re in!',
    body: `A spot opened for “${event.title}”. You are now going.`,
    link: `/events/${event.slug}`,
    email: true,
  });
  return true;
}

export function serializeEvent(
  event: IEvent,
  extras: { host?: unknown; game?: unknown; sponsor?: unknown; viewerRsvp?: RsvpStatus | null } = {},
) {
  return {
    id: String(event._id),
    title: event.title,
    slug: event.slug,
    description: event.description,
    host: extras.host ?? null,
    mode: event.mode,
    category: event.category,
    game: extras.game ?? null,
    city: event.city,
    area: event.area,
    venue: event.venue,
    safetyNotes: event.safetyNotes,
    onlineUrl: event.mode !== 'irl' ? event.onlineUrl : null,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt ? event.endsAt.toISOString() : null,
    capacity: event.capacity,
    goingCount: event.goingCount,
    maybeCount: event.maybeCount,
    waitlistCount: event.waitlistCount,
    coverImage: event.coverImage ?? null,
    rules: event.rules,
    status: event.status,
    viewerRsvp: extras.viewerRsvp ?? null,
    sponsor: extras.sponsor ?? null,
    shareUrl: `https://naijaplay.com/events/${event.slug}`,
    createdAt: event.createdAt.toISOString(),
  };
}
