import { Router } from 'express';
import { createSponsorSchema, createSponsoredEventSchema } from '@naijaplay/shared';
import { handler, ok, created } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth, currentUser } from '../middleware/auth.js';
import { Sponsor, SponsoredEvent, Event, AnalyticsEvent, type ISponsor, type ISponsoredEvent } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { slugify } from '../utils/crypto.js';

const router = Router();

function serializeSponsor(s: ISponsor) {
  return {
    id: String(s._id),
    name: s.name,
    slug: s.slug,
    logo: s.logo ?? null,
    banner: s.banner ?? null,
    website: s.website ?? null,
    description: s.description,
    verified: s.verified,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
  };
}

/** GET /api/sponsors — public sponsor directory. */
router.get(
  '/',
  optionalAuth,
  handler(async (_req, res) => {
    const sponsors = await Sponsor.find({ status: { $ne: 'archived' } }).sort({ verified: -1, name: 1 }).limit(50).lean();
    return ok(res, { items: sponsors.map(serializeSponsor) });
  }),
);

/** POST /api/sponsors — admin/sponsor accounts only. */
router.post(
  '/',
  requireAuth,
  validate(createSponsorSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!['admin', 'moderator', 'creator'].includes(user.role)) {
      throw AppError.forbidden('NOT_AUTHORIZED', 'Only authorised accounts can create sponsors.');
    }
    const body = req.body as { name: string; website?: string; description?: string; logo?: string; banner?: string };
    const exists = await Sponsor.findOne({ name: new RegExp(`^${body.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (exists) throw AppError.conflict('SPONSOR_EXISTS', 'That sponsor already exists.');
    const sponsor = await Sponsor.create({
      name: body.name,
      slug: slugify(body.name),
      website: body.website || null,
      description: body.description || '',
      logo: body.logo || null,
      banner: body.banner || null,
      verified: user.role === 'admin',
      ownerUserId: user._id,
    });
    return created(res, { sponsor: serializeSponsor(sponsor as ISponsor) });
  }),
);

/** GET /api/sponsors/:idOrSlug */
router.get(
  '/:idOrSlug',
  handler(async (req, res) => {
    const key = String(req.params.idOrSlug);
    const sponsor = /^[0-9a-fA-F]{24}$/.test(key) ? await Sponsor.findById(key) : await Sponsor.findOne({ slug: key });
    if (!sponsor) throw AppError.notFound('SPONSOR_NOT_FOUND', 'Sponsor not found.');
    const campaigns = await SponsoredEvent.find({ sponsorId: sponsor._id }).sort({ startDate: -1 }).limit(20).lean();
    return ok(res, {
      sponsor: serializeSponsor(sponsor as ISponsor),
      campaigns: campaigns.map(serializeCampaign),
    });
  }),
);

function serializeCampaign(c: ISponsoredEvent) {
  return {
    id: String(c._id),
    sponsorId: String(c.sponsorId),
    eventId: c.eventId ? String(c.eventId) : null,
    campaignName: c.campaignName,
    sponsorContribution: c.sponsorContribution,
    banner: c.banner ?? null,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    status: c.status,
    analytics: c.analytics,
  };
}

/** POST /api/sponsors/campaigns — attach a sponsorship to an event. */
router.post(
  '/campaigns',
  requireAuth,
  validate(createSponsoredEventSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!['admin', 'moderator', 'creator'].includes(user.role)) {
      throw AppError.forbidden('NOT_AUTHORIZED', 'Only authorised accounts can create sponsorships.');
    }
    const body = req.body as { sponsorId: string; eventId: string; campaignName: string; sponsorContribution: number; banner?: string; startDate: string; endDate: string };

    const sponsor = await Sponsor.findById(body.sponsorId);
    if (!sponsor) throw AppError.notFound('SPONSOR_NOT_FOUND', 'Sponsor not found.');
    const event = await Event.findById(body.eventId);
    if (!event) throw AppError.notFound('EVENT_NOT_FOUND', 'Event not found.');
    if (new Date(body.endDate) <= new Date(body.startDate)) throw AppError.badRequest('BAD_DATES', 'Campaign end must be after start.');

    const campaign = await SponsoredEvent.create({
      sponsorId: sponsor._id,
      eventId: event._id,
      campaignName: body.campaignName,
      sponsorContribution: body.sponsorContribution,
      banner: body.banner || null,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      status: 'published',
      createdBy: user._id,
    });
    return created(res, { campaign: serializeCampaign(campaign as ISponsoredEvent) });
  }),
);

/** GET /api/sponsors/campaigns/mine — sponsor analytics view (authorized only). */
router.get(
  '/campaigns/mine',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!['admin', 'moderator', 'creator'].includes(user.role)) throw AppError.forbidden('NOT_AUTHORIZED', 'Admin access required.');
    const campaigns = await SponsoredEvent.find({ createdBy: user._id }).sort({ startDate: -1 }).limit(50).lean();
    return ok(res, { items: campaigns.map(serializeCampaign) });
  }),
);

/** POST /api/sponsors/campaigns/:id/track — record a click/view (analytics). */
router.post(
  '/campaigns/:id/track',
  handler(async (req, res) => {
    const type = (req.body as { type?: string })?.type === 'click' ? 'click' : 'view';
    const campaign = await SponsoredEvent.findById(req.params.id);
    if (!campaign) throw AppError.notFound('CAMPAIGN_NOT_FOUND', 'Campaign not found.');
    campaign.analytics[type === 'click' ? 'clicks' : 'views'] += 1;
    await campaign.save();
    await AnalyticsEvent.create({ type, entityType: 'sponsor', entityId: String(campaign._id), userId: req.user?._id ?? null });
    return ok(res, { ok: true });
  }),
);

export default router;
