import { ROOM_CODE_PREFIXES, type RoomCategory, type RoomStatus, type RoomType } from '@naijaplay/shared';
import { Game, Recap, Room, RoomMember, User, type IRoom, type RoomDoc, type UserDoc } from '../models/index.js';
import { clientLink } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { generateRoomCode, slugify } from '../utils/crypto.js';
import { CITIES } from '@naijaplay/shared';

const CITY_PREFIX: Record<string, string> = {
  Lagos: 'LAG',
  'Port Harcourt': 'PH',
  Abuja: 'ABJ',
  Ibadan: 'IBA',
  'Benin City': 'BEN',
  Enugu: 'ENU',
  Kano: 'KAN',
  Kaduna: 'KAD',
};

function prefixForLocation(location?: string | null): string {
  if (!location) return ROOM_CODE_PREFIXES.default;
  const city = CITIES.find((c) => c.toLowerCase() === location.toLowerCase());
  if (city && CITY_PREFIX[city]) return CITY_PREFIX[city];
  return ROOM_CODE_PREFIXES.default;
}

/** Generate a unique room code (LAG-8X2K style). */
export async function generateUniqueRoomCode(location?: string | null): Promise<string> {
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const code = generateRoomCode(prefixForLocation(location));
    // eslint-disable-next-line no-await-in-loop
    const clash = await Room.exists({ code });
    if (!clash) return code;
  }
  return generateRoomCode('NGA');
}

export interface CreateRoomInput {
  hostId: string;
  name: string;
  description?: string;
  category: RoomCategory;
  gameId?: string | null;
  isPrivate: boolean;
  capacity: number;
  mode: 'now' | 'schedule';
  scheduledAt?: string | null;
  externalGameUrl?: string | null;
  externalGameCode?: string | null;
  rules?: string[];
  coverImage?: string | null;
  location?: string | null;
  isQuickRoom?: boolean;
}

export async function createRoom(input: CreateRoomInput): Promise<RoomDoc> {
  const host = await User.findById(input.hostId);
  if (!host) throw AppError.notFound('USER_NOT_FOUND', 'User not found.');
  if (host.isSuspended) throw AppError.forbidden('SUSPENDED', 'Your account is suspended.');

  if (input.gameId) {
    const game = await Game.findById(input.gameId);
    if (!game) throw AppError.badRequest('GAME_NOT_FOUND', 'That game does not exist.');
  }

  const code = await generateUniqueRoomCode(input.location);
  const scheduled = input.mode === 'schedule' && input.scheduledAt;

  const room = await Room.create({
    name: input.name.trim(),
    code,
    slug: slugify(input.name),
    description: (input.description || '').trim(),
    hostId: host._id,
    type: (input.isPrivate ? 'private' : scheduled ? 'scheduled' : 'public') as RoomType,
    category: input.category,
    gameId: input.gameId || null,
    scheduledAt: scheduled ? new Date(input.scheduledAt as string) : null,
    startedAt: scheduled ? null : new Date(),
    status: (scheduled ? 'scheduled' : 'live') as RoomStatus,
    capacity: input.capacity,
    memberCount: 1,
    peakMemberCount: 1,
    isPrivate: Boolean(input.isPrivate),
    coverImage: input.coverImage || null,
    rules: input.rules || [],
    externalGameUrl: input.externalGameUrl || null,
    externalGameCode: input.externalGameCode || null,
    location: input.location || null,
    isQuickRoom: Boolean(input.isQuickRoom),
  });

  await RoomMember.create({
    roomId: room._id,
    userId: host._id,
    role: 'host',
    status: 'active',
    joinedAt: new Date(),
  });

  await User.updateOne({ _id: host._id }, { $inc: { roomsHostedCount: 1 } });
  return room;
}

export interface RoomView {
  id: string;
  name: string;
  slug: string;
  code: string;
  description: string;
  host: unknown;
  type: RoomType;
  category: RoomCategory;
  game: unknown;
  status: RoomStatus;
  memberCount: number;
  peakMemberCount: number;
  capacity: number;
  isLocked: boolean;
  isPrivate: boolean;
  coverImage: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  location: string | null;
  externalGameUrl: string | null;
  externalGameCode: string | null;
  rules: string[];
  recapId: string | null;
  shareUrl: string;
  createdAt: string;
}

/**
 * Server-authoritative room join.
 * 1 authenticate (caller middleware) 2 verify room 3 locked? 4 banned? 5 capacity
 * 6 existing membership 7 create membership 8 atomic count 9 peak count 10 realtime emit
 */
export async function joinRoom(opts: {
  roomId: string;
  userId: string;
  code?: string;
  skipCapacity?: boolean;
}): Promise<{ room: RoomDoc; alreadyMember: boolean }> {
  const room = await Room.findById(opts.roomId);
  if (!room) throw AppError.notFound('ROOM_NOT_FOUND', "That room doesn't exist anymore.");
  if (room.status === 'ended' || room.status === 'cancelled') {
    throw AppError.conflict('ROOM_ENDED', 'This room has ended.');
  }
  if (room.isPrivate) {
    const existing = await RoomMember.findOne({ roomId: room._id, userId: opts.userId });
    if (!existing || existing.status === 'left') {
      // Private rooms: membership or valid code required. Knowing the URL is not enough.
      const codeOk = opts.code && opts.code.toUpperCase() === room.code;
      if (!codeOk) throw AppError.forbidden('PRIVATE_ROOM', 'This is a private room. You need an invite code to enter.');
    }
  }
  if (room.isLocked && room.status === 'live') {
    const existing = await RoomMember.findOne({ roomId: room._id, userId: opts.userId, status: 'active' });
    if (!existing) throw AppError.forbidden('ROOM_LOCKED', 'The host locked this room.');
  }

  const membership = await RoomMember.findOne({ roomId: room._id, userId: opts.userId });
  if (membership && membership.status === 'banned') {
    throw AppError.forbidden('BANNED_FROM_ROOM', 'You were banned from this room.');
  }
  if (membership && membership.status === 'kicked') {
    throw AppError.forbidden('KICKED_FROM_ROOM', 'You were removed from this room.');
  }
  if (membership && membership.status === 'active') {
    return { room, alreadyMember: true };
  }

  const activeCount = await RoomMember.countDocuments({ roomId: room._id, status: 'active' });
  if (!opts.skipCapacity && activeCount >= room.capacity) {
    throw AppError.conflict('ROOM_FULL', 'This room is full.');
  }

  if (membership) {
    membership.status = 'active';
    membership.role = membership.role === 'host' ? 'host' : 'member';
    membership.joinedAt = new Date();
    membership.leftAt = null;
    await membership.save();
  } else {
    try {
      await RoomMember.create({ roomId: room._id, userId: opts.userId, role: 'member', status: 'active' });
    } catch (err: unknown) {
      // Duplicate key = concurrent join already succeeded (compound unique index).
      if ((err as { code?: number })?.code === 11000) {
        return { room, alreadyMember: true };
      }
      throw err;
    }
  }

  const updated = await Room.findOneAndUpdate(
    { _id: room._id },
    [
      {
        $set: {
          memberCount: { $max: [{ $add: ['$memberCount', 1] }, 1] },
          peakMemberCount: { $max: ['$peakMemberCount', { $add: ['$memberCount', 1] }] },
        },
      },
    ],
    { new: true },
  );
  return { room: (updated || room) as RoomDoc, alreadyMember: false };
}

export async function leaveRoom(roomId: string, userId: string): Promise<{ room: RoomDoc }> {
  const room = await Room.findById(roomId);
  if (!room) throw AppError.notFound('ROOM_NOT_FOUND', "That room doesn't exist anymore.");

  const membership = await RoomMember.findOne({ roomId: room._id, userId });
  if (!membership || membership.status !== 'active') return { room };

  if (membership.role === 'host') {
    // Host leaving a live room ends it (with recap) rather than orphaning it.
    throw AppError.badRequest('HOST_CANNOT_LEAVE', 'End the room instead of leaving it.');
  }

  membership.status = 'left';
  membership.leftAt = new Date();
  await membership.save();

  const updated = await Room.findOneAndUpdate(
    { _id: room._id, memberCount: { $gt: 0 } },
    [{ $set: { memberCount: { $max: [{ $subtract: ['$memberCount', 1] }, 0] } } }],
    { new: true },
  );
  return { room: (updated || room) as RoomDoc };
}

export function serializeRoom(room: IRoom, extras: { host?: unknown; game?: unknown } = {}): RoomView {
  return {
    id: String(room._id),
    name: room.name,
    slug: room.slug,
    code: room.code,
    description: room.description,
    host: extras.host ?? null,
    type: room.type,
    category: room.category,
    game: extras.game ?? null,
    status: room.status,
    memberCount: room.memberCount,
    peakMemberCount: room.peakMemberCount,
    capacity: room.capacity,
    isLocked: room.isLocked,
    isPrivate: room.isPrivate,
    coverImage: room.coverImage ?? null,
    scheduledAt: room.scheduledAt ? room.scheduledAt.toISOString() : null,
    startedAt: room.startedAt ? room.startedAt.toISOString() : null,
    endedAt: room.endedAt ? room.endedAt.toISOString() : null,
    location: room.location ?? null,
    externalGameUrl: room.externalGameUrl ?? null,
    externalGameCode: room.externalGameCode ?? null,
    rules: room.rules,
    recapId: room.recapId ? String(room.recapId) : null,
    shareUrl: clientLink(`/r/${room.code}`),
    createdAt: room.createdAt.toISOString(),
  };
}
