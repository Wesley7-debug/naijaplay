import type { GiveawayEntryCondition, GiveawayType } from '@naijaplay/shared';
import { Giveaway, GiveawayEntry, RoomMember, Rsvp, Follow, User, Event, type GiveawayDoc } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { secureSample } from '../utils/crypto.js';
import { notify } from './notification.service.js';
import { getIO } from '../sockets/io.js';
import { awardXP } from './xp.service.js';
import logger from '../config/logger.js';

export async function startGiveaway(opts: {
  roomId: string;
  hostId: string;
  title: string;
  prize: string;
  type: GiveawayType;
  winnerCount: number;
  entryCondition: GiveawayEntryCondition;
  entryDetail?: string;
  minAccountAgeDays?: number;
  durationSeconds: number;
}): Promise<GiveawayDoc> {
  const endsAt = new Date(Date.now() + opts.durationSeconds * 1000);
  const giveaway = await Giveaway.create({
    roomId: opts.roomId,
    hostId: opts.hostId,
    title: opts.title,
    prize: opts.prize,
    type: opts.type,
    winnerCount: opts.winnerCount,
    entryCondition: opts.entryCondition,
    entryDetail: opts.entryDetail || null,
    minAccountAgeDays: opts.minAccountAgeDays ?? null,
    status: 'active',
    startsAt: new Date(),
    endsAt,
  });
  return giveaway;
}

/** Validate entry eligibility — server-side anti-cheat. */
export async function checkEligibility(giveaway: GiveawayDoc, userId: string): Promise<{ ok: boolean; reason?: string }> {
  const user = await User.findById(userId);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.isSuspended) return { ok: false, reason: 'suspended' };

  if (giveaway.minAccountAgeDays && giveaway.minAccountAgeDays > 0) {
    const minAge = giveaway.minAccountAgeDays * 24 * 60 * 60 * 1000;
    if (Date.now() - user.createdAt.getTime() < minAge) {
      return { ok: false, reason: 'account_too_new' };
    }
  }

  switch (giveaway.entryCondition) {
    case 'in_room': {
      const member = await RoomMember.findOne({ roomId: giveaway.roomId, userId, status: 'active' });
      if (!member) return { ok: false, reason: 'not_in_room' };
      break;
    }
    case 'follow_host': {
      if (String(giveaway.hostId) === userId) break; // host auto-eligible (but cannot win own giveaway)
      const follow = await Follow.findOne({ followerId: userId, followingId: giveaway.hostId });
      if (!follow) return { ok: false, reason: 'must_follow' };
      break;
    }
    case 'rsvp': {
      const room = await (await import('../models/index.js')).Room.findById(giveaway.roomId).lean();
      const eventId = (room as { eventId?: string } | null)?.eventId;
      if (eventId) {
        const rsvp = await Rsvp.findOne({ eventId, userId, status: 'going' });
        if (!rsvp) return { ok: false, reason: 'must_rsvp' };
      }
      break;
    }
    case 'react':
    case 'answer_question':
    case 'custom':
    default:
      break;
  }
  return { ok: true };
}

export async function enterGiveaway(giveawayId: string, userId: string, answer?: string) {
  const giveaway = await Giveaway.findById(giveawayId);
  if (!giveaway) throw AppError.notFound('GIVEAWAY_NOT_FOUND', 'Giveaway not found.');
  if (giveaway.status !== 'active') throw AppError.conflict('GIVEAWAY_CLOSED', 'This giveaway is closed.');
  if (giveaway.endsAt.getTime() <= Date.now()) throw AppError.conflict('GIVEAWAY_ENDED', 'Time up! This giveaway has ended.');
  if (String(giveaway.hostId) === userId) throw AppError.badRequest('HOST_CANNOT_ENTER', 'You cannot enter your own giveaway.');

  const eligibility = await checkEligibility(giveaway, userId);
  if (!eligibility.ok) {
    const messages: Record<string, string> = {
      not_in_room: 'Join the room first to enter.',
      must_follow: `Follow @${(await User.findById(giveaway.hostId))?.username || 'host'} to enter.`,
      must_rsvp: 'RSVP to the event first.',
      account_too_new: 'Your account is too new for this giveaway.',
      suspended: 'Your account cannot enter giveaways.',
      not_found: 'Account not found.',
    };
    throw AppError.forbidden('NOT_ELIGIBLE', messages[eligibility.reason || ''] || 'You are not eligible for this giveaway.');
  }

  try {
    await GiveawayEntry.create({ giveawayId: giveaway._id, userId, answer: answer || null });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      throw AppError.conflict('ALREADY_ENTERED', 'You already entered this giveaway.');
    }
    throw err;
  }

  const entryCount = await GiveawayEntry.countDocuments({ giveawayId: giveaway._id });
  getIO()?.to(`room:${giveaway.roomId}`).emit('giveaway:entry', {
    giveawayId: String(giveaway._id),
    entryCount,
    userId,
  });
  return { entryCount };
}

/**
 * Server-side winner selection: crypto-random, persisted, broadcast.
 * Hosts can never influence the draw from the client.
 */
export async function finalizeGiveaway(giveawayId: string): Promise<GiveawayDoc | null> {
  const giveaway = await Giveaway.findById(giveawayId);
  if (!giveaway || giveaway.status !== 'active') return giveaway;

  giveaway.status = 'ended';
  giveaway.finalizedAt = new Date();

  const entries = await GiveawayEntry.find({ giveawayId: giveaway._id }).lean();
  const eligible = entries.filter((e) => String(e.userId) !== String(giveaway.hostId));
  const winners = secureSample(eligible, giveaway.winnerCount);
  giveaway.winnerIds = winners.map((w) => w.userId as never);
  await giveaway.save();

  const winnerUsers = await User.find({ _id: { $in: winners.map((w) => w.userId) } }).lean();

  getIO()?.to(`room:${giveaway.roomId}`).emit('giveaway:winners', {
    giveawayId: String(giveaway._id),
    title: giveaway.title,
    prize: giveaway.prize,
    winners: winnerUsers.map((u) => ({
      userId: String(u._id),
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar ?? null,
    })),
  });
  getIO()?.to(`room:${giveaway.roomId}`).emit('giveaway:finished', { giveawayId: String(giveaway._id) });

  for (const winner of winnerUsers) {
    // eslint-disable-next-line no-await-in-loop
    await User.updateOne({ _id: winner._id }, { $inc: { giveawaysWonCount: 1, winsCount: 1 } });
    // eslint-disable-next-line no-await-in-loop
    await notify({
      userId: String(winner._id),
      type: 'giveaway_won',
      title: 'Winner! 🎉',
      body: `You won “${giveaway.prize}” in ${giveaway.title}.`,
      link: `/rooms`,
      email: true,
    });
    // eslint-disable-next-line no-await-in-loop
    await awardXP(String(winner._id), 'GIVEAWAY_WIN', { giveawayId: String(giveaway._id) });
  }

  logger.info({ giveawayId: String(giveaway._id), winnerCount: winners.length }, 'giveaway finalized');
  return giveaway;
}

/** Invalidation guard: host cannot be winner of own giveaway (checked again at selection). */
export function assertHostNotWinner(giveaway: GiveawayDoc, userId: string): boolean {
  return String(giveaway.hostId) === userId;
}

export async function getActiveGiveawayForRoom(roomId: string) {
  return Giveaway.findOne({ roomId, status: 'active', endsAt: { $gt: new Date() } }).sort({ createdAt: -1 });
}

export async function getRecentGiveawaysForRoom(roomId: string, limit = 5) {
  return Giveaway.find({ roomId, status: { $in: ['active', 'ended'] } }).sort({ createdAt: -1 }).limit(limit);
}
