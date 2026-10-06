import type { RoomCategory } from '@naijaplay/shared';
import { Game, LfgEntry, Room, User, type IRoom, type UserDoc } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { createRoom, joinRoom, serializeRoom } from './room.service.js';
import { notify } from './notification.service.js';
import logger from '../config/logger.js';

/** Happening now: active public rooms, most recent first. */
export async function getHappeningNow(limit = 12) {
  const rooms = await Room.find({ status: 'live', isPrivate: false })
    .sort({ memberCount: -1, startedAt: -1 })
    .limit(limit)
    .lean();
  return hydrateRooms(rooms as unknown as IRoom[]);
}

export async function hydrateRooms(rooms: IRoom[]) {
  const hostIds = rooms.map((r) => r.hostId);
  const gameIds = rooms.map((r) => r.gameId).filter(Boolean);
  const [hosts, games] = await Promise.all([
    User.find({ _id: { $in: hostIds } }).lean(),
    gameIds.length ? Game.find({ _id: { $in: gameIds } }).lean() : Promise.resolve([]),
  ]);
  const hostMap = new Map(hosts.map((h) => [String(h._id), h]));
  const gameMap = new Map(games.map((g) => [String(g._id), g]));

  return rooms.map((room) => {
    const host = hostMap.get(String(room.hostId)) as UserDoc | undefined;
    const game = room.gameId ? gameMap.get(String(room.gameId)) : null;
    return serializeRoom(room, {
      host: host
        ? {
            id: String(host._id),
            username: host.username,
            displayName: host.displayName,
            avatar: host.avatar ?? null,
            isVerified: host.isVerified,
            level: host.level,
          }
        : null,
      game: game
        ? { id: String(game._id), name: game.name, slug: game.slug, logo: game.logo ?? null }
        : null,
    });
  });
}

export interface SurpriseMeResult {
  room: ReturnType<typeof serializeRoom> | null;
  reason: string;
}

/**
 * Surprise Me — solves cold start by picking a suitable live public room.
 * Scoring considers favorite games, location, category interests, activity and free capacity.
 */
export async function surpriseMe(user: UserDoc | null): Promise<SurpriseMeResult> {
  const candidates = await Room.find({ status: 'live', isPrivate: false, isLocked: false })
    .sort({ memberCount: -1 })
    .limit(60)
    .lean();

  const usable = candidates.filter((r) => r.memberCount < r.capacity);
  if (usable.length === 0) return { room: null, reason: 'NO_LIVE_ROOMS' };

  if (!user) {
    const [room] = await hydrateRooms(usable.slice(0, 1));
    return { room, reason: 'ANY_LIVE' };
  }

  const favoriteGames = (user.favoriteGames || []).map(String);
  const location = (user.location || '').toLowerCase();

  let best: { room: IRoom; score: number } | null = null;
  for (const room of usable) {
    let score = 0;
    if (room.gameId && favoriteGames.includes(String(room.gameId))) score += 50;
    if (room.location && location && room.location.toLowerCase() === location) score += 30;
    if (room.hostId && user.followingCount > 0) score += 0; // host-follow bonus computed below
    const ratio = room.memberCount / Math.max(room.capacity, 1);
    score += Math.round(ratio * 20); // activity, but not full
    if (room.memberCount >= room.capacity * 0.9) score -= 25;
    if (room.category && (user.interests || []).some((i) => i.toLowerCase() === room.category)) score += 15;
    score += Math.random() * 5;
    if (!best || score > best.score) best = { room, score };
  }

  const chosen = best?.room ?? usable[0];
  const [view] = await hydrateRooms([chosen]);
  return { room: view, reason: best && best.score >= 30 ? 'MATCHED' : 'ANY_LIVE' };
}

/** Looking-for-group lobby: grouped counts per game. */
export async function getLfgGroups() {
  const entries = await LfgEntry.find({ active: true, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
  const userIds = entries.map((e) => e.userId);
  const users = await User.find({ _id: { $in: userIds }, isSuspended: false }).lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const groups = new Map<string, { gameName: string; gameId: string | null; count: number; entries: unknown[] }>();
  for (const entry of entries) {
    const user = userMap.get(String(entry.userId));
    if (!user) continue;
    const key = entry.gameId ? String(entry.gameId) : entry.gameName || entry.category || 'anything';
    const group = groups.get(key) || { gameName: entry.gameName || entry.category || 'Anything', gameId: entry.gameId ? String(entry.gameId) : null, count: 0, entries: [] };
    group.count += 1;
    group.entries.push({
      userId: String(user._id),
      displayName: user.displayName,
      username: user.username,
      avatar: user.avatar ?? null,
      gameId: entry.gameId ? String(entry.gameId) : null,
      gameName: entry.gameName,
      category: (entry.category as RoomCategory) || null,
      createdAt: (entry as unknown as { createdAt: Date }).createdAt?.toISOString?.() || new Date().toISOString(),
    });
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export async function toggleLfg(userId: string, opts: { gameId?: string | null; category?: string | null; gameName?: string }) {
  const existing = await LfgEntry.findOne({ userId });
  if (existing && existing.active) {
    existing.active = false;
    await existing.save();
    return { active: false };
  }
  const gameName = opts.gameId ? (await Game.findById(opts.gameId))?.name || '' : opts.gameName || '';
  if (existing) {
    existing.active = true;
    existing.gameId = (opts.gameId as never) || null;
    existing.gameName = gameName;
    existing.category = opts.category || null;
    existing.expiresAt = new Date(Date.now() + 60 * 60_000);
    await existing.save();
  } else {
    await LfgEntry.create({
      userId,
      gameId: opts.gameId || null,
      gameName,
      category: opts.category || null,
      active: true,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
  }
  return { active: true };
}

/**
 * Play Now — social matchmaking without any external game API:
 * find suitable active LFG users -> reuse a suitable quick room -> else create one.
 */
export async function playNow(user: UserDoc, opts: { gameId?: string | null; category?: RoomCategory }) {
  const game = opts.gameId ? await Game.findById(opts.gameId) : null;
  const category = opts.category || (game ? ('gaming' as RoomCategory) : ('hangout' as RoomCategory));

  // 1. suitable active LFG users (excluding self)
  const lfgFilter: Record<string, unknown> = {
    active: true,
    expiresAt: { $gt: new Date() },
    userId: { $ne: user._id },
  };
  if (opts.gameId) lfgFilter.gameId = opts.gameId;
  const seeking = await LfgEntry.find(lfgFilter).limit(20).lean();

  // 2. existing suitable quick room with space
  const roomFilter: Record<string, unknown> = {
    status: 'live',
    isPrivate: false,
    isLocked: false,
    isQuickRoom: true,
    memberCount: { $lt: 50 },
  };
  if (opts.gameId) roomFilter.gameId = opts.gameId;
  else roomFilter.category = category;
  const existing = await Room.findOne(roomFilter).sort({ memberCount: -1 });

  let room: IRoom;
  let created = false;
  if (existing) {
    room = existing;
  } else {
    const name = game ? `${game.name} — quick squad` : `Quick ${category} squad`;
    const createdRoom = await createRoom({
      hostId: String(user._id),
      name,
      description: 'Quick room made by Play Now. Hop in, find your people.',
      category,
      gameId: opts.gameId || null,
      isPrivate: false,
      capacity: 50,
      mode: 'now',
      location: user.location || null,
      isQuickRoom: true,
    });
    room = createdRoom;
    created = true;
  }

  // 3. put the user inside (server-authoritative join)
  await joinRoom({ roomId: String(room._id), userId: String(user._id) });

  // 4. notify suitable users looking for the same thing
  if (seeking.length > 0) {
    await Promise.all(
      seeking.map((entry) =>
        notify({
          userId: String(entry.userId),
          type: 'room_invite',
          title: 'Someone is ready to play',
          body: `${user.displayName} opened “${room.name}”. Join before it fills up.`,
          link: `/rooms/${room.slug}`,
        }),
      ),
    );
  }

  logger.info({ roomId: String(room._id), created, seekers: seeking.length }, 'playNow matchmaking');
  return { room, seekerCount: seeking.length, created };
}
