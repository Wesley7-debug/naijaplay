import { Router } from 'express';
import { z } from 'zod';
import { createEventSchema, rsvpSchema } from '@naijaplay/shared';
import { handler, ok, created } from '../utils/http.js';
import { clientLink } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth, currentUser } from '../middleware/auth.js';
import { createEvent, rsvpEvent, serializeEvent, recomputeCounts } from '../services/event.service.js';
import { Event, Rsvp, User, Game, Sponsor, SponsoredEvent, type IEvent } from '../models/index.js';
import { serializeUser, serializeGame } from '../utils/serialize.js';
import { AppError } from '../utils/errors.js';
import { awardXP } from '../services/xp.service.js';
import { notify } from '../services/notification.service.js';
import { awardCrewPoints } from '../services/crew.service.js';

const router = Router();

async function hydrateEvents(events: IEvent[], viewerId?: string) {
  const hosts = await User.find({ _id: { $in: events.map((e) => e.hostId) } }).lean();
  const hostMap = new Map(hosts.map((h) => [String(h._id), h]));
  const gameIds = events.map((e) => e.gameId).filter(Boolean);
  const games = gameIds.length ? await Game.find({ _id: { $in: gameIds } }).lean() : [];
  const gameMap = new Map(games.map((g) => [String(g._id), g]));

  const campaigns = await SponsoredEvent.find({ eventId: { $in: events.map((e) => e._id) }, status: { $in: ['published', 'active'] } }).lean();
  const sponsors = campaigns.length ? await Sponsor.find({ _id: { $in: campaigns.map((c) => c.sponsorId) } }).lean() : [];
  const sponsorMap = new Map(sponsors.map((s) => [String(s._id), s]));

  let viewerRsvps: Map<string, string> = new Map();
  if (viewerId) {
    const rsvps = await Rsvp.find({ eventId: { $in: events.map((e) => e._id) }, userId: viewerId }).lean();
    viewerRsvps = new Map(rsvps.map((r) => [String(r.eventId), r.status]));
  }

  return events.map((event) => {
    const campaign = campaigns.find((c) => String(c.eventId) === String(event._id));
    const sponsor = campaign ? sponsorMap.get(String(campaign.sponsorId)) : null;
    const host = hostMap.get(String(event.hostId));
    const game = event.gameId ? gameMap.get(String(event.gameId)) : null;
    return serializeEvent(event, {
      host: host ? serializeUser(host) : null,
      game: game ? serializeGame(game) : null,
      sponsor:
        sponsor && campaign
          ? {
              id: String(sponsor._id),
              name: sponsor.name,
              slug: sponsor.slug,
              logo: sponsor.logo ?? null,
              banner: sponsor.banner ?? null,
              website: sponsor.website ?? null,
              verified: sponsor.verified,
              campaignName: campaign.campaignName,
              prizeContribution: campaign.sponsorContribution,
            }
          : null,
      viewerRsvp: (viewerRsvps.get(String(event._id)) as never) || null,
    });
  });
}

/** POST /api/events — schedule an event (IRL / online / both). */
router.post(
  '/',
  requireAuth,
  validate(createEventSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const event = await createEvent({ hostId: String(user._id), ...(req.body as object) } as never);
    await awardXP(String(user._id), 'EVENT_HOST', { eventId: String(event._id) });
    const [view] = await hydrateEvents([event as IEvent], String(user._id));
    return created(res, { event: view, shareUrl: clientLink(`/events/${event.slug}`) });
  }),
);

/** GET /api/events?upcoming=1&mode=&category=&city= */
router.get(
  '/',
  optionalAuth,
  handler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const filter: Record<string, unknown> = {};
    if (req.query.status === 'ended') filter.status = 'ended';
    else {
      filter.status = { $in: ['upcoming', 'live'] };
      if (req.query.mode === 'irl') filter.mode = { $in: ['irl', 'both'] };
      if (req.query.mode === 'online') filter.mode = { $in: ['online', 'both'] };
    }
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.city) filter.city = String(req.query.city);
    if (req.query.gameId) filter.gameId = String(req.query.gameId);

    const events = await Event.find(filter).sort({ startsAt: 1 }).limit(limit).lean();
    const items = await hydrateEvents(events as IEvent[], req.user ? String(req.user._id) : undefined);
    return ok(res, { items });
  }),
);

/** GET /api/events/mine — events I host or RSVP'd. */
router.get(
  '/mine',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const rsvps = await Rsvp.find({ userId: user._id }).sort({ createdAt: -1 }).limit(40).lean();
    const hosted = await Event.find({ hostId: user._id }).sort({ startsAt: 1 }).limit(20).lean();
    const joined = await Event.find({ _id: { $in: rsvps.map((r) => r.eventId) } }).sort({ startsAt: 1 }).limit(40).lean();
    const all = [...new Map([...hosted, ...joined].map((e) => [String(e._id), e])).values()];
    const items = await hydrateEvents(all as IEvent[], String(user._id));
    return ok(res, { items });
  }),
);

/** GET /api/events/:idOrSlug */
router.get(
  '/:idOrSlug',
  optionalAuth,
  handler(async (req, res) => {
    const key = String(req.params.idOrSlug);
    const event = /^[0-9a-fA-F]{24}$/.test(key) ? await Event.findById(key) : await Event.findOne({ slug: key });
    if (!event) throw AppError.notFound('EVENT_NOT_FOUND', 'Event not found.');
    const [view] = await hydrateEvents([event as IEvent], req.user ? String(req.user._id) : undefined);
    const waitlist = await Rsvp.find({ eventId: event._id, status: 'waitlist' }).sort({ createdAt: 1 }).limit(1).lean();
    return ok(res, { event: view, viewerIsNext: waitlist.length ? String(waitlist[0].userId) === String(req.user?._id) : false });
  }),
);

/** POST /api/events/:id/rsvp — going / maybe / cancelled (+ waitlist handling). */
router.post(
  '/:id/rsvp',
  requireAuth,
  validate(rsvpSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const { status } = req.body as { status: 'going' | 'maybe' | 'cancelled' };
    const result = await rsvpEvent(String(req.params.id), String(user._id), status);
    if (status === 'going' && result.status === 'going') {
      await awardXP(String(user._id), 'EVENT_ATTEND', { eventId: String(req.params.id) });
    }
    // Realtime update for event page watchers
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`event:${req.params.id}`).emit('event:rsvp', {
      eventId: String(req.params.id),
      goingCount: result.goingCount,
      maybeCount: result.maybeCount,
      waitlistCount: result.waitlistCount,
      status: result.status,
    });
    return ok(res, result);
  }),
);

/** POST /api/events/:id/cancel — host cancels, attendees notified. */
router.post(
  '/:id/cancel',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const event = await Event.findById(req.params.id);
    if (!event) throw AppError.notFound('EVENT_NOT_FOUND', 'Event not found.');
    if (String(event.hostId) !== String(user._id) && user.role !== 'admin') throw AppError.forbidden('NOT_HOST', 'Only the host can cancel.');
    if (event.status === 'cancelled') return ok(res, { ok: true });
    event.status = 'cancelled';
    await event.save();

    const rsvps = await Rsvp.find({ eventId: event._id }).lean();
    await Promise.all(
      rsvps.map((r) =>
        notify({
          userId: String(r.userId),
          type: 'event_cancelled',
          title: 'Event cancelled',
          body: `“${event.title}” was cancelled by the host.`,
          link: `/events/${event.slug}`,
          email: true,
        }),
      ),
    );
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`event:${event._id}`).emit('event:cancelled', { eventId: String(event._id) });
    return ok(res, { ok: true, notified: rsvps.length });
  }),
);

/** POST /api/events/:id/start — host starts the event (optionally creates a linked room). */
router.post(
  '/:id/start',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const event = await Event.findById(req.params.id);
    if (!event) throw AppError.notFound('EVENT_NOT_FOUND', 'Event not found.');
    if (String(event.hostId) !== String(user._id) && user.role !== 'admin') throw AppError.forbidden('NOT_HOST', 'Only the host can start.');
    event.status = 'live';
    await event.save();

    const rsvps = await Rsvp.find({ eventId: event._id, status: 'going' }).lean();
    await Promise.all(
      rsvps.map((r) =>
        notify({
          userId: String(r.userId),
          type: 'event_starting',
          title: 'It’s starting! 🎉',
          body: `“${event.title}” is live now.`,
          link: `/events/${event.slug}`,
        }),
      ),
    );
    const io = (await import('../sockets/io.js')).getIO();
    io?.to(`event:${event._id}`).emit('event:starting', { eventId: String(event._id) });
    return ok(res, { ok: true, notified: rsvps.length });
  }),
);

/** POST /api/events/:id/attend — record actual attendance (trusted server action). */
router.post(
  '/:id/attend',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const event = await Event.findById(req.params.id);
    if (!event) throw AppError.notFound('EVENT_NOT_FOUND', 'Event not found.');
    const rsvp = await Rsvp.findOne({ eventId: event._id, userId: user._id, status: 'going' });
    if (!rsvp) throw AppError.forbidden('NOT_GOING', 'You did not RSVP to this event.');
    const { AnalyticsEvent } = await import('../models/index.js');
    await AnalyticsEvent.create({ type: 'attendance', entityType: 'event', entityId: String(event._id), userId: user._id });
    await awardXP(String(user._id), 'EVENT_ATTEND', { eventId: String(event._id) });

    // Crew points for hosting large events come from server-observed attendance.
    if (event.goingCount >= 20) {
      const { CrewMember } = await import('../models/index.js');
      const hostCrew = await CrewMember.findOne({ userId: event.hostId });
      if (hostCrew) {
        await awardCrewPoints({
          crewId: String(hostCrew.crewId),
          delta: 50,
          reason: `Hosted ${event.title} with ${event.goingCount} going`,
          sourceType: 'event',
          sourceId: String(event._id),
        });
      }
    }
    return ok(res, { ok: true });
  }),
);

export default router;

