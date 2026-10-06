import { Crew, CrewMember, CrewScoreLog, User, type CrewDoc, type ICrew } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { slugify } from '../utils/crypto.js';

export async function createCrew(creatorId: string, input: { name: string; description?: string; kind?: ICrew['kind']; avatar?: string; cover?: string }): Promise<CrewDoc> {
  const creator = await User.findById(creatorId);
  if (!creator) throw AppError.notFound('USER_NOT_FOUND', 'User not found.');

  const nameTaken = await Crew.exists({ name: new RegExp(`^${input.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (nameTaken) throw AppError.conflict('CREW_NAME_TAKEN', 'A crew with that name already exists.');

  const crew = await Crew.create({
    name: input.name.trim(),
    slug: slugify(input.name),
    description: (input.description || '').trim(),
    kind: input.kind || 'other',
    avatar: input.avatar || null,
    cover: input.cover || null,
    creatorId,
    memberCount: 1,
    points: 0,
  });
  await CrewMember.create({ crewId: crew._id, userId: creatorId, role: 'host' });
  return crew;
}

export async function joinCrew(crewId: string, userId: string): Promise<{ alreadyMember: boolean }> {
  const crew = await Crew.findById(crewId);
  if (!crew) throw AppError.notFound('CREW_NOT_FOUND', 'Crew not found.');

  const existing = await CrewMember.findOne({ crewId: crew._id, userId });
  if (existing) return { alreadyMember: true };

  try {
    await CrewMember.create({ crewId: crew._id, userId, role: 'member' });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) return { alreadyMember: true };
    throw err;
  }
  await Crew.updateOne({ _id: crew._id }, { $inc: { memberCount: 1 } });
  return { alreadyMember: false };
}

export async function leaveCrew(crewId: string, userId: string): Promise<void> {
  const crew = await Crew.findById(crewId);
  if (!crew) throw AppError.notFound('CREW_NOT_FOUND', 'Crew not found.');
  if (String(crew.creatorId) === userId && crew.memberCount <= 1) {
    throw AppError.badRequest('CREW_LAST_MEMBER', 'You are the last member. Delete the crew instead.');
  }
  const removed = await CrewMember.findOneAndDelete({ crewId: crew._id, userId });
  if (removed) await Crew.updateOne({ _id: crew._id, $inc: { memberCount: -1 } });
}

/**
 * Central crew scoring service — all points originate from trusted platform events.
 * Keeps an immutable audit log; clients can never post points.
 */
export async function awardCrewPoints(opts: {
  crewId: string;
  delta: number;
  reason: string;
  sourceType: 'event' | 'competition' | 'quiz' | 'challenge' | 'season' | 'correction';
  sourceId?: string;
  actorId?: string;
}): Promise<number> {
  const crew = await Crew.findById(opts.crewId);
  if (!crew) throw AppError.notFound('CREW_NOT_FOUND', 'Crew not found.');
  if (!Number.isFinite(opts.delta) || opts.delta === 0) return crew.points;

  // Deduplicate identical source entries (idempotent scoring).
  if (opts.sourceId) {
    const dup = await CrewScoreLog.findOne({
      crewId: crew._id,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      delta: opts.delta,
    });
    if (dup) return crew.points;
  }

  const clamped = opts.delta > 0 ? Math.min(opts.delta, 10_000) : Math.max(opts.delta, -10_000);
  const updated = await Crew.findOneAndUpdate(
    { _id: crew._id },
    [{ $set: { points: { $max: [{ $add: ['$points', clamped] }, 0] } } }],
    { new: true },
  );
  const balanceAfter = updated?.points ?? crew.points;

  await CrewScoreLog.create({
    crewId: crew._id,
    delta: clamped,
    reason: opts.reason,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId || null,
    actorId: opts.actorId || null,
    balanceAfter,
  });
  return balanceAfter;
}

export async function recordCrewResult(crewId: string, result: 'win' | 'loss', opts: { reason: string; sourceType: 'event' | 'competition' | 'quiz' | 'season'; sourceId?: string }) {
  const field = result === 'win' ? 'wins' : 'losses';
  await Crew.updateOne({ _id: crewId }, { $inc: { [field]: 1 } });
  if (result === 'win') {
    await awardCrewPoints({ crewId, delta: 100, reason: opts.reason, sourceType: opts.sourceType, sourceId: opts.sourceId });
  }
}

export async function getCrewScoreHistory(crewId: string, limit = 50) {
  const logs = await CrewScoreLog.find({ crewId }).sort({ createdAt: -1 }).limit(limit).lean();
  return logs.map((l) => ({
    id: String(l._id),
    delta: l.delta,
    reason: l.reason,
    sourceType: l.sourceType,
    balanceAfter: l.balanceAfter,
    createdAt: (l.createdAt as Date).toISOString(),
  }));
}

export function serializeCrew(crew: ICrew, extras: { creator?: unknown; isMember?: boolean; viewerRole?: string | null } = {}) {
  return {
    id: String(crew._id),
    name: crew.name,
    slug: crew.slug,
    description: crew.description,
    avatar: crew.avatar ?? null,
    cover: crew.cover ?? null,
    kind: crew.kind,
    creator: extras.creator ?? null,
    memberCount: crew.memberCount,
    points: crew.points,
    wins: crew.wins,
    losses: crew.losses,
    isMember: extras.isMember ?? false,
    viewerRole: extras.viewerRole ?? null,
    createdAt: crew.createdAt.toISOString(),
  };
}
