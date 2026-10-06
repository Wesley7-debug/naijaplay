/**
 * Unseed — removes development seed data + local test accounts.
 * Deletes isSeed-flagged docs, seed-originated collections (games, sponsors,
 * competitions), and explicit test emails from live auth testing.
 * Real user content is never touched (no isSeed flag, not a test email).
 *
 * Usage: npm run unseed -w server
 * DANGER: point MONGODB_URI at the right database before running.
 */
import { connectDb, disconnectDb } from '../config/db.js';
import {
  User,
  Game,
  Room,
  RoomMember,
  Message,
  Event,
  Rsvp,
  Crew,
  CrewMember,
  Moment,
  MomentComment,
  MomentReaction,
  Giveaway,
  GiveawayEntry,
  Season,
  SeasonScore,
  SeasonPointLog,
  Follow,
  Notification,
  Report,
  Session,
  MagicLink,
  GameFollow,
  GameScore,
  Quiz,
  QuizAnswer,
  Poll,
  PollVote,
  Sponsor,
  SponsoredEvent,
  Competition,
  CompetitionEntry,
  Conversation,
  DirectMessage,
  LfgEntry,
  AnalyticsEvent,
  Recap,
  XpTransaction,
  GlobalMessage,
} from '../models/index.js';

/** Local auth-testing accounts (never real users). */
const TEST_EMAILS = [
  'authtest@example.com',
  'skiptest@example.com',
  'onboard2@example.com',
  'pathtest@example.com',
  'patchtest2@example.com',
  'gmailtest@example.com',
  'gmailfail@example.com',
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to unseed in production. Set NODE_ENV explicitly to proceed.');
  }
  await connectDb();

  // 1. Collect seed + test ids first (children reference these).
  const [seedUsers, testUsers, seedRooms, seedEvents, seedMoments, seedGiveaways, seedCrews, seedSeasons] =
    await Promise.all([
      User.find({ isSeed: true }).select('_id').lean(),
      User.find({ email: { $in: TEST_EMAILS } }).select('_id').lean(),
      Room.find({ isSeed: true }).select('_id').lean(),
      Event.find({ isSeed: true }).select('_id').lean(),
      Moment.find({ isSeed: true }).select('_id').lean(),
      Giveaway.find({ isSeed: true }).select('_id').lean(),
      Crew.find({ isSeed: true }).select('_id').lean(),
      Season.find({ isSeed: true }).select('_id').lean(),
    ]);
  const goneUserIds = [...seedUsers, ...testUsers].map((u) => u._id);
  const seedRoomIds = seedRooms.map((r) => r._id);
  const seedEventIds = seedEvents.map((e) => e._id);
  const seedMomentIds = seedMoments.map((m) => m._id);
  const seedGiveawayIds = seedGiveaways.map((g) => g._id);
  const seedCrewIds = seedCrews.map((c) => c._id);
  const seedSeasonIds = seedSeasons.map((s) => s._id);

  const seedPolls = await Poll.find({ roomId: { $in: seedRoomIds } }).select('_id').lean();
  const seedPollIds = seedPolls.map((p) => p._id);
  const seedQuizzes = await Quiz.find({ $or: [{ isSeed: true }, { roomId: { $in: seedRoomIds } }] })
    .select('_id')
    .lean();
  const seedQuizIds = seedQuizzes.map((q) => q._id);
  const goneConvos = await Conversation.find({
    $or: [{ participantIds: { $in: goneUserIds } }],
  })
    .select('_id')
    .lean();
  const goneConvoIds = goneConvos.map((c) => c._id);

  const counts: Record<string, number> = {};
  async function wipe(name: string, promise: Promise<{ deletedCount?: number }>) {
    const res = await promise;
    counts[name] = res.deletedCount ?? 0;
  }

  // 2. Children first, then parents.
  await Promise.all([
    wipe('PollVote', PollVote.deleteMany({ pollId: { $in: seedPollIds } })),
    wipe('QuizAnswer', QuizAnswer.deleteMany({ quizId: { $in: seedQuizIds } })),
    wipe('DirectMessage', DirectMessage.deleteMany({ $or: [{ conversationId: { $in: goneConvoIds } }, { senderId: { $in: goneUserIds } }] })),
    wipe('GiveawayEntry', GiveawayEntry.deleteMany({ giveawayId: { $in: seedGiveawayIds } })),
    wipe('CompetitionEntry', CompetitionEntry.deleteMany({ userId: { $in: goneUserIds } })),
    wipe('Rsvp', Rsvp.deleteMany({ $or: [{ eventId: { $in: seedEventIds } }, { userId: { $in: goneUserIds } }] })),
    wipe('Follow', Follow.deleteMany({ $or: [{ followerId: { $in: goneUserIds } }, { followingId: { $in: goneUserIds } }] })),
    wipe('RoomMember', RoomMember.deleteMany({ $or: [{ roomId: { $in: seedRoomIds } }, { userId: { $in: goneUserIds } }] })),
    wipe('CrewMember', CrewMember.deleteMany({ $or: [{ crewId: { $in: seedCrewIds } }, { userId: { $in: goneUserIds } }] })),
    wipe('MomentComment', MomentComment.deleteMany({ momentId: { $in: seedMomentIds } })),
    wipe('MomentReaction', MomentReaction.deleteMany({ momentId: { $in: seedMomentIds } })),
    wipe('SeasonScore', SeasonScore.deleteMany({ $or: [{ seasonId: { $in: seedSeasonIds } }, { userId: { $in: goneUserIds } }] })),
    wipe('SeasonPointLog', SeasonPointLog.deleteMany({ $or: [{ seasonId: { $in: seedSeasonIds } }, { userId: { $in: goneUserIds } }] })),
    wipe('Notification', Notification.deleteMany({ userId: { $in: goneUserIds } })),
    wipe('Report', Report.deleteMany({ reporterId: { $in: goneUserIds } })),
    wipe('Session', Session.deleteMany({ userId: { $in: goneUserIds } })),
    wipe('MagicLink', MagicLink.deleteMany({ email: { $in: TEST_EMAILS } })),
    wipe('GameFollow', GameFollow.deleteMany({ userId: { $in: goneUserIds } })),
    wipe('GameScore', GameScore.deleteMany({ userId: { $in: goneUserIds } })),
    wipe('XpTransaction', XpTransaction.deleteMany({ userId: { $in: goneUserIds } })),
    wipe('GlobalMessage', GlobalMessage.deleteMany({ senderId: { $in: goneUserIds } })),
    wipe('LfgEntry', LfgEntry.deleteMany({ userId: { $in: goneUserIds } })),
    wipe('AnalyticsEvent', AnalyticsEvent.deleteMany({ userId: { $in: goneUserIds } })),
  ]);

  await Promise.all([
    wipe('Poll', Poll.deleteMany({ roomId: { $in: seedRoomIds } })),
    wipe('Quiz', Quiz.deleteMany({ $or: [{ isSeed: true }, { roomId: { $in: seedRoomIds } }] })),
    wipe('Conversation', Conversation.deleteMany({ _id: { $in: goneConvoIds } })),
    wipe('Message', Message.deleteMany({ $or: [{ isSeed: true }, { roomId: { $in: seedRoomIds } }, { senderId: { $in: goneUserIds } }] })),
    wipe('Moment', Moment.deleteMany({ isSeed: true })),
    wipe('Giveaway', Giveaway.deleteMany({ isSeed: true })),
    wipe('Event', Event.deleteMany({ isSeed: true })),
    wipe('Room', Room.deleteMany({ isSeed: true })),
    wipe('Crew', Crew.deleteMany({ isSeed: true })),
    wipe('Season', Season.deleteMany({ isSeed: true })),
    wipe('Recap', Recap.deleteMany({ $or: [{ isSeed: true }, { roomId: { $in: seedRoomIds } }] })),
    wipe('User', User.deleteMany({ $or: [{ isSeed: true }, { email: { $in: TEST_EMAILS } }] })),
    // Seed-originated collections (no create API exists for these — all docs came from seed).
    wipe('Game', Game.deleteMany({})),
    wipe('Sponsor', Sponsor.deleteMany({})),
    wipe('SponsoredEvent', SponsoredEvent.deleteMany({})),
    wipe('Competition', Competition.deleteMany({})),
  ]);

  // eslint-disable-next-line no-console
  console.log('\n✅ Unseed complete.');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ seedUsers: seedUsers.length, testUsers: testUsers.length, ...counts }, null, 2));

  await disconnectDb();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
