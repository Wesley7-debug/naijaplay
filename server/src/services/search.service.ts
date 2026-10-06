import { Room, User, Crew, Game, Event, type IRoom, type IEvent, type ICrew } from '../models/index.js';
import { clientLink } from '../config/env.js';
import { hydrateRooms } from './matchmaking.service.js';
import { serializeEvent } from './event.service.js';
import { serializeCrew } from './crew.service.js';
import { serializeUser, serializeGame } from '../utils/serialize.js';

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Debounced server-side search across all entity types. */
export async function runSearch(qRaw: string, type: string) {
  const q = qRaw.trim().slice(0, 80);
  if (!q) return { rooms: [], users: [], crews: [], games: [], events: [] };
  const rx = new RegExp(escapeRegex(q), 'i');
  const limit = 12;

  const wants = (t: string) => type === 'all' || type === t;

  const [rooms, users, crews, games, events] = await Promise.all([
    wants('rooms')
      ? Room.find({ isPrivate: false, $or: [{ name: rx }, { description: rx }, { code: rx }] })
          .sort({ memberCount: -1 })
          .limit(limit)
          .lean()
      : Promise.resolve([]),
    wants('users')
      ? User.find({ isSuspended: false, $or: [{ username: rx }, { displayName: rx }, { location: rx }] })
          .sort({ followersCount: -1 })
          .limit(limit)
          .lean()
      : Promise.resolve([]),
    wants('crews') ? Crew.find({ $or: [{ name: rx }, { description: rx }] }).sort({ points: -1 }).limit(limit).lean() : Promise.resolve([]),
    wants('games') ? Game.find({ $or: [{ name: rx }, { description: rx }] }).sort({ followersCount: -1 }).limit(limit).lean() : Promise.resolve([]),
    wants('events')
      ? Event.find({ status: { $in: ['upcoming', 'live'] }, $or: [{ title: rx }, { description: rx }, { city: rx }, { area: rx }] })
          .sort({ startsAt: 1 })
          .limit(limit)
          .lean()
      : Promise.resolve([]),
  ]);

  const hostIds = rooms.map((r) => r.hostId);
  const hosts = hostIds.length ? await User.find({ _id: { $in: hostIds } }).lean() : [];
  const hostMap = new Map(hosts.map((h) => [String(h._id), h]));
  const eventHosts = events.length ? await User.find({ _id: { $in: events.map((e) => e.hostId) } }).lean() : [];
  const eventHostMap = new Map(eventHosts.map((h) => [String(h._id), h]));

  const roomViews = rooms.map((room) => {
    const host = hostMap.get(String(room.hostId));
    return {
      id: String(room._id),
      name: room.name,
      slug: room.slug,
      code: room.code,
      description: room.description,
      host: host ? serializeUser(host) : null,
      type: room.type,
      category: room.category,
      game: null,
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
  });

  return {
    rooms: roomViews,
    users: users.map(serializeUser),
    crews: crews.map((c) => serializeCrew(c as ICrew)),
    games: games.map(serializeGame),
    events: events.map((e) =>
      serializeEvent(e as IEvent, {
        host: eventHostMap.get(String(e.hostId)) ? serializeUser(eventHostMap.get(String(e.hostId))!) : null,
      }),
    ),
  };
}
