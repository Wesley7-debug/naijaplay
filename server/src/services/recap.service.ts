import { Recap, Room, RoomMember, Message, Giveaway, Quiz, User, Moment, Sponsor, type RoomDoc } from '../models/index.js';
import { clientLink } from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Generates a permanent, shareable recap when a room/event ends.
 * All numbers are counted from the database — never fabricated.
 */
export async function generateRecap(room: RoomDoc) {
  const existing = await Recap.findOne({ roomId: room._id });
  if (existing) return existing;

  const startedAt = room.startedAt || room.createdAt;
  const endedAt = room.endedAt || new Date();
  const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));

  const [attendees, messageCount, reactionAgg, giveaways, quiz, host, moments] = await Promise.all([
    RoomMember.find({ roomId: room._id, status: { $in: ['active', 'left'] } })
      .select('userId')
      .lean(),
    Message.countDocuments({ roomId: room._id, deletedAt: null }),
    Message.aggregate([
      { $match: { roomId: room._id, deletedAt: null } },
      { $project: { count: { $size: { $ifNull: ['$reactions', []] } } } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]),
    Giveaway.find({ roomId: room._id, status: 'ended' }).lean(),
    Quiz.findOne({ roomId: room._id, status: 'finished' }),
    User.findById(room.hostId),
    Moment.find({ roomId: room._id, deletedAt: null }).limit(12).lean(),
  ]);

  const reactionCount = (reactionAgg[0]?.total as number) || 0;

  const winners: { userId: never; username: string; displayName: string; prize: string }[] = [];
  for (const g of giveaways) {
    if (!g.winnerIds?.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const users = await User.find({ _id: { $in: g.winnerIds } }).lean();
    for (const u of users) {
      winners.push({ userId: u._id as never, username: u.username, displayName: u.displayName, prize: g.prize });
    }
  }

  const participantIds = attendees.slice(0, 100).map((a) => a.userId);

  const recap = await Recap.create({
    roomId: room._id,
    title: room.name,
    hostId: room.hostId,
    startedAt,
    endedAt,
    durationMinutes,
    attendeeCount: attendees.length,
    peakMembers: room.peakMemberCount,
    messageCount,
    reactionCount,
    giveawayCount: giveaways.length,
    winners,
    quizChampion: quiz?.championData || null,
    participantIds,
    momentIds: moments.map((m) => m._id),
    shareUrl: '',
  });
  const shareUrl = clientLink(`/recaps/${String(recap._id)}`);
  await Recap.updateOne({ _id: recap._id }, { $set: { shareUrl } });
  recap.shareUrl = shareUrl;

  await Room.updateOne({ _id: room._id }, { $set: { recapId: recap._id } });
  void host;
  logger.info({ roomId: String(room._id), recapId: String(recap._id) }, 'recap generated');
  return recap;
}

export async function serializeRecap(recapId: string) {
  const recap = await Recap.findById(recapId);
  if (!recap) return null;
  const [host, participants, moments] = await Promise.all([
    User.findById(recap.hostId),
    User.find({ _id: { $in: recap.participantIds } }).limit(30).lean(),
    Moment.find({ _id: { $in: recap.momentIds } }).limit(12).lean(),
  ]);
  const sponsor = recap.sponsorId ? await Sponsor.findById(recap.sponsorId) : null;

  return {
    id: String(recap._id),
    roomId: recap.roomId ? String(recap.roomId) : null,
    title: recap.title,
    host: host
      ? { id: String(host._id), username: host.username, displayName: host.displayName, avatar: host.avatar ?? null }
      : null,
    startedAt: recap.startedAt.toISOString(),
    endedAt: recap.endedAt.toISOString(),
    durationMinutes: recap.durationMinutes,
    attendeeCount: recap.attendeeCount,
    peakMembers: recap.peakMembers,
    messageCount: recap.messageCount,
    reactionCount: recap.reactionCount,
    giveawayCount: recap.giveawayCount,
    winners: recap.winners.map((w) => ({ username: w.username, displayName: w.displayName, prize: w.prize })),
    quizChampion: recap.quizChampion
      ? { displayName: recap.quizChampion.displayName, username: recap.quizChampion.username }
      : null,
    participants: participants.map((p) => ({
      id: String(p._id),
      username: p.username,
      displayName: p.displayName,
      avatar: p.avatar ?? null,
      isVerified: p.isVerified,
      level: p.level,
      xp: p.xp,
      followersCount: p.followersCount,
      followingCount: p.followingCount,
      roomsHostedCount: p.roomsHostedCount,
      eventsJoinedCount: p.eventsJoinedCount,
      winsCount: p.winsCount,
      giveawaysWonCount: p.giveawaysWonCount,
      role: p.role,
      createdAt: p.createdAt.toISOString(),
    })),
    moments: moments.map((m) => ({
      id: String(m._id),
      author: null,
      type: m.type,
      caption: m.caption,
      media: m.media ?? null,
      reactions: m.reactions || {},
      commentsCount: m.commentsCount,
      sharesCount: m.sharesCount,
      viewerReaction: null,
      createdAt: m.createdAt.toISOString(),
    })),
    sponsor: sponsor
      ? { id: String(sponsor._id), name: sponsor.name, slug: sponsor.slug, logo: sponsor.logo ?? null, verified: sponsor.verified }
      : null,
    // Canonical share URL is always id-based (older docs stored room slugs).
    shareUrl: clientLink(`/recaps/${String(recap._id)}`),
  };
}
