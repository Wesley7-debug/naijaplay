/**
 * Development seed data — makes NaijaPlay feel alive immediately.
 * All seeded docs are flagged isSeed:true so they are clearly distinguishable
 * from real production data. NEVER run this against production.
 *
 * Usage: npm run seed -w server
 */
import { connectDb, disconnectDb } from '../config/db.js';
import config from '../config/env.js';
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
  CrewScoreLog,
  Moment,
  Giveaway,
  GiveawayEntry,
  Season,
  SeasonScore,
  Follow,
  Sponsor,
  SponsoredEvent,
  Competition,
  CompetitionEntry,
  Recap,
  Notification,
} from '../models/index.js';
import { DEFAULT_TIERS } from '../services/season.service.js';
import { generateRecap } from '../services/recap.service.js';
import { levelFromXp } from '../models/User.js';
import logger from '../config/logger.js';

const SEED_PASSWORDLESS_NOTE = 'seed users — sign in with magic link to any email below';

function slug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function seed() {
  if (config.isProd) {
    // eslint-disable-next-line no-console
    console.error('Refusing to seed in production. Set NODE_ENV=development.');
    process.exit(1);
  }

  await connectDb();
  // eslint-disable-next-line no-console
  console.log('Seeding NaijaPlay development data...');

  // Wipe only seed-flagged docs (keep any real user activity).
  await Promise.all([
    User.deleteMany({ isSeed: true }),
    Game.deleteMany({}),
    Room.deleteMany({ isSeed: true }),
    RoomMember.deleteMany({ isSeed: true }),
    Message.deleteMany({ isSeed: true }),
    Event.deleteMany({ isSeed: true }),
    Crew.deleteMany({ isSeed: true }),
    Moment.deleteMany({ isSeed: true }),
    Giveaway.deleteMany({ isSeed: true }),
    Season.deleteMany({ isSeed: true }),
    Sponsor.deleteMany({}),
    SponsoredEvent.deleteMany({}),
    Competition.deleteMany({}),
    Recap.deleteMany({ isSeed: true }),
    Notification.deleteMany({}),
  ]);

  // ---- Games (informational directory, no API integration claimed) ----
  const games = await Game.insertMany([
    {
      name: 'Lagos Run',
      slug: 'lagos-run',
      description: 'Dodge danfos, collect naira and survive Lagos traffic. The street classic.',
      developer: 'Independent',
      category: 'gaming',
      isFeatured: true,
      followersCount: 0,
      isSeed: true,
    },
    {
      name: 'Lagos Life',
      slug: 'lagos-life',
      description: 'Build your hustle, run your streets, live the Lagos dream.',
      developer: 'Independent',
      category: 'gaming',
      isFeatured: true,
      followersCount: 0,
      isSeed: true,
    },
    {
      name: 'Danfo Run',
      slug: 'danfo-run',
      description: 'Yellow bus energy. Sprint through traffic before the conductor shouts “arrive!”.',
      developer: 'Independent',
      category: 'gaming',
      isFeatured: true,
      followersCount: 0,
      isSeed: true,
    },
    {
      name: 'PH Lifestyle',
      slug: 'ph-lifestyle',
      description: 'Port Harcourt vibes — waterfronts, wells and the good life.',
      developer: 'Independent',
      category: 'gaming',
      isFeatured: false,
      followersCount: 0,
      isSeed: true,
    },
  ]);
  const [lagosRun, lagosLife, danfoRun, phLifestyle] = games;

  // ---- Users ----
  const userDefs = [
    { username: 'kingtunde', displayName: 'Tunde Alabi', location: 'Yaba', role: 'admin' as const, xp: 4200, bio: 'Building the culture. Host of Yaba Game Night.' },
    { username: 'chidera', displayName: 'Chidera O.', location: 'Surulere', role: 'creator' as const, xp: 3100, bio: 'Content creator. If you beat me in Lagos Run, show me the clip.' },
    { username: 'bigmanph', displayName: 'Ibinabo Woke', location: 'Port Harcourt', role: 'creator' as const, xp: 2800, bio: 'PH finest. Crew Wars general.' },
    { username: 'unilag_amaka', displayName: 'Amaka Nwosu', location: 'Yaba', role: 'user' as const, xp: 2100, bio: 'UNILAG CSE. Quiz machine 🧠' },
    { username: 'odede_aba', displayName: 'Emeka Obi', location: 'Benin City', role: 'user' as const, xp: 1500, bio: 'Football + games. Simple.' },
    { username: 'zainab_dev', displayName: 'Zainab Yusuf', location: 'Abuja', role: 'creator' as const, xp: 2600, bio: 'Frontend dev by day, Danfo Run by night.' },
    { username: 'lagos_boy', displayName: 'Segun Ade', location: 'Lekki', role: 'user' as const, xp: 900, bio: 'Lekki to Yaba, any day.' },
    { username: 'ola_iba', displayName: 'Ola Sotayo', location: 'Ibadan', role: 'user' as const, xp: 700, bio: 'UI student. Always down for a session.' },
    { username: 'grace_enugu', displayName: 'Grace Eze', location: 'Enugu', role: 'user' as const, xp: 1200, bio: 'Enugu hun. Events person.' },
    { username: 'tobi_ws', displayName: 'Tobi Bakare', location: 'Ikeja', role: 'moderator' as const, xp: 3500, bio: 'Keeping the streets clean. Moderator.' },
  ];

  const users = await User.insertMany(
    userDefs.map((u) => ({
      ...u,
      email: `${u.username}@seed.naijaplay.test`,
      emailVerified: true,
      avatar: `https://api.dicebear.com/9.x/thumbs/svg?seed=${u.username}`,
      favoriteGames: [lagosRun._id, danfoRun._id],
      interests: ['Gaming', 'Hangouts'],
      followersCount: 0,
      followingCount: 0,
      roomsHostedCount: 0,
      eventsJoinedCount: 0,
      level: levelFromXp(u.xp),
      onboardingComplete: true,
      isSeed: true,
      lastSeenAt: new Date(),
    })),
  );
  const [kingTunde, chidera, bigmanPh, amaka, emeka, zainab, segun, ola, grace, tobi] = users;
  // eslint-disable-next-line no-console
  console.log(`  ${users.length} users (${SEED_PASSWORDLESS_NOTE})`);

  // ---- Follows ----
  const followPairs: [number, number][] = [
    [6, 0], [6, 1], [6, 2], [3, 1], [3, 0], [4, 2], [5, 0], [7, 1],
    [8, 1], [9, 0], [0, 1], [0, 2], [1, 0], [2, 0], [2, 3], [3, 2],
    [4, 0], [5, 3], [7, 3], [8, 3], [9, 3], [6, 3], [7, 0], [8, 4],
  ];
  for (const [a, b] of followPairs) {
    // eslint-disable-next-line no-await-in-loop
    await Follow.create({ followerId: users[a]._id, followingId: users[b]._id }).catch(() => undefined);
    // eslint-disable-next-line no-await-in-loop
    await User.updateOne({ _id: users[a]._id }, { $inc: { followingCount: 1 } });
    // eslint-disable-next-line no-await-in-loop
    await User.updateOne({ _id: users[b]._id }, { $inc: { followersCount: 1 } });
  }

  // ---- Crews ----
  const crewDefs = [
    { name: 'Yaba Crew', kind: 'area' as const, creator: kingTunde, description: 'Yaba on the map. We run the west side.', points: 1420, wins: 6, losses: 2, members: [0, 1, 3, 6] },
    { name: 'Surulere Boys', kind: 'area' as const, creator: chidera, description: 'Surulere to the world. Never sleeping early.', points: 1280, wins: 5, losses: 3, members: [1, 7, 9] },
    { name: 'PH Gamers', kind: 'gaming' as const, creator: bigmanPh, description: 'Garden City strongest squad.', points: 1090, wins: 4, losses: 3, members: [2, 4] },
    { name: 'UNILAG Gamers', kind: 'school' as const, creator: amaka, description: 'Akoka legends. Lecture break = lobby time.', points: 870, wins: 3, losses: 4, members: [3, 6, 8] },
    { name: 'Lekki Crew', kind: 'area' as const, creator: segun, description: 'Island boys and girls.', points: 640, wins: 2, losses: 4, members: [6, 5] },
  ];
  const crews = [];
  for (const def of crewDefs) {
    // eslint-disable-next-line no-await-in-loop
    const crew = await Crew.create({
      name: def.name,
      slug: slug(def.name),
      description: def.description,
      kind: def.kind,
      creatorId: def.creator._id,
      memberCount: def.members.length,
      points: def.points,
      wins: def.wins,
      losses: def.losses,
      avatar: `https://api.dicebear.com/9.x/shapes/svg?seed=${def.name}`,
      isSeed: true,
    });
    for (const m of def.members) {
      // eslint-disable-next-line no-await-in-loop
      await CrewMember.create({
        crewId: crew._id,
        userId: users[m]._id,
        role: m === def.members[0] ? 'host' : 'member',
      }).catch(() => undefined);
    }
    // eslint-disable-next-line no-await-in-loop
    await CrewScoreLog.create({
      crewId: crew._id,
      delta: def.points,
      reason: 'Season standings',
      sourceType: 'season',
      balanceAfter: def.points,
    });
    crews.push(crew);
  }
  // eslint-disable-next-line no-console
  console.log(`  ${crews.length} crews`);

  // ---- Rooms (live + scheduled) ----
  const now = Date.now();
  const roomDefs = [
    { name: 'Yaba Game Night — Lagos Run ladder', host: kingTunde, category: 'gaming' as const, game: lagosRun, members: 42, capacity: 120, location: 'Yaba', private: false },
    { name: 'PH Friday Night Lobby', host: bigmanPh, category: 'gaming' as const, game: phLifestyle, members: 28, capacity: 80, location: 'Port Harcourt', private: false },
    { name: 'Danfo Run speedrun attempts', host: chidera, category: 'gaming' as const, game: danfoRun, members: 19, capacity: 60, location: 'Surulere', private: false },
    { name: 'UNILAG reading break chill', host: amaka, category: 'campus' as const, game: null, members: 33, capacity: 100, location: 'Yaba', private: false },
    { name: 'Naija Trivia — who sabi am?', host: tobi, category: 'culture' as const, game: null, members: 24, capacity: 90, location: 'Ikeja', private: false },
    { name: 'Weekend football watchalong', host: emeka, category: 'football' as const, game: null, members: 51, capacity: 200, location: 'Benin City', private: false },
  ];
  const rooms = [];
  for (const def of roomDefs) {
    // eslint-disable-next-line no-await-in-loop
    const room = await Room.create({
      name: def.name,
      code: `NGA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      slug: slug(def.name),
      description: 'Seeded live room — real activity starts when you join.',
      hostId: def.host._id,
      type: def.private ? 'private' : 'public',
      category: def.category,
      gameId: def.game ? def.game._id : null,
      startedAt: new Date(now - 45 * 60_000),
      capacity: def.capacity,
      memberCount: def.members,
      peakMemberCount: def.members + 6,
      status: 'live',
      location: def.location,
      isSeed: true,
    });
    // eslint-disable-next-line no-await-in-loop
    await RoomMember.create({ roomId: room._id, userId: def.host._id, role: 'host', status: 'active', isSeed: true }).catch(() => undefined);
    // Seed some real members.
    const others = users.filter((u) => u._id !== def.host._id).slice(0, 5);
    for (const m of others) {
      // eslint-disable-next-line no-await-in-loop
      await RoomMember.create({ roomId: room._id, userId: m._id, role: 'member', status: 'active', isSeed: true }).catch(() => undefined);
    }
    await User.updateOne({ _id: def.host._id }, { $inc: { roomsHostedCount: 1 } });
    rooms.push(room);
  }

  // Scheduled rooms
  const scheduledDefs = [
    { name: 'Saturday Lagos Run Tournament', host: kingTunde, when: now + 2 * 86_400_000, category: 'gaming' as const, game: lagosRun, location: 'Lagos' },
    { name: 'Campus Clash: UNILAG vs LASU', host: amaka, when: now + 4 * 86_400_000, category: 'campus' as const, game: null, location: 'Yaba' },
    { name: 'PH Crew Wars Qualifier', host: bigmanPh, when: now + 6 * 86_400_000, category: 'gaming' as const, game: phLifestyle, location: 'Port Harcourt' },
  ];
  for (const def of scheduledDefs) {
    // eslint-disable-next-line no-await-in-loop
    const room = await Room.create({
      name: def.name,
      code: `NGA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      slug: slug(def.name),
      description: 'Scheduled session — set a reminder and pull up.',
      hostId: def.host._id,
      type: 'scheduled',
      category: def.category,
      gameId: def.game ? def.game._id : null,
      scheduledAt: new Date(def.when),
      capacity: 150,
      memberCount: 1,
      peakMemberCount: 1,
      status: 'scheduled',
      location: def.location,
      isSeed: true,
    });
    await RoomMember.create({ roomId: room._id, userId: def.host._id, role: 'host', status: 'active', isSeed: true }).catch(() => undefined);
    rooms.push(room);
  }

  // ---- Chat messages in the first live room ----
  const chatSeed = [
    { u: kingTunde, c: 'Welcome to Yaba Game Night! Drop your high scores 👀' },
    { u: chidera, c: '800k finally!! been chasing that for weeks' },
    { u: amaka, c: 'nawa, I dey struggle to pass 300k 😭' },
    { u: segun, c: 'who wan run one more round?' },
    { u: tobi, c: 'reminder: no spam links, keep it clean 🙏' },
    { u: emeka, c: 'this danfo passenger nearly finished me 😂😂' },
  ];
  for (const [i, m] of chatSeed.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await Message.create({
      roomId: rooms[0]._id,
      senderId: m.u._id,
      content: m.c,
      createdAt: new Date(now - (chatSeed.length - i) * 4 * 60_000),
      isSeed: true,
    });
  }

  // ---- Events (IRL + online) ----
  const eventDefs = [
    {
      title: 'Yaba Game Night',
      host: kingTunde,
      mode: 'both' as const,
      category: 'hangout' as const,
      city: 'Lagos',
      area: 'Yaba',
      venue: 'Coworking space, Herbert Macaulay Way (venue shared with RSVP)',
      startsAt: now + 3 * 86_400_000,
      capacity: 100,
      going: 87,
      maybe: 13,
      game: lagosRun,
      description: 'Lagos Run tournament, jollof and games. Bring your people.',
    },
    {
      title: 'PH Developers Hangout',
      host: bigmanPh,
      mode: 'irl' as const,
      category: 'tech' as const,
      city: 'Port Harcourt',
      area: 'GRA PH',
      venue: 'Community space, GRA (details on RSVP)',
      startsAt: now + 7 * 86_400_000,
      capacity: 60,
      going: 34,
      maybe: 9,
      game: null,
      description: 'Dev talk + Danfo Run chill. Come with your laptop or come with nothing.',
    },
    {
      title: 'UNILAG Game Night',
      host: amaka,
      mode: 'irl' as const,
      category: 'campus' as const,
      city: 'Lagos',
      area: 'Akoka',
      venue: 'Student lounge, UNILAG (RSVP for access)',
      startsAt: now + 5 * 86_400_000,
      capacity: 80,
      going: 52,
      maybe: 21,
      game: danfoRun,
      description: 'Campus edition. Danfo Run bracket + trivia + snacks.',
      safetyNotes: 'Campus security at gate. Bring your student ID if you have one.',
    },
    {
      title: 'Lagos Creators Meetup',
      host: chidera,
      mode: 'both' as const,
      category: 'creator' as const,
      city: 'Lagos',
      area: 'Lekki',
      venue: 'Creator studio, Lekki Phase 1',
      startsAt: now + 10 * 86_400_000,
      capacity: 50,
      going: 41,
      maybe: 15,
      game: null,
      description: 'Content creators, editors and brands. Collabs over drinks.',
    },
    {
      title: 'Abuja Gaming Meetup',
      host: zainab,
      mode: 'both' as const,
      category: 'gaming' as const,
      city: 'Abuja',
      area: 'Wuse',
      venue: 'Game lounge, Wuse (venue shared with RSVP)',
      startsAt: now + 12 * 86_400_000,
      capacity: 70,
      going: 28,
      maybe: 17,
      game: lagosLife,
      description: 'Console corner + PC corner + Lagos Life speedrun showcase.',
    },
  ];
  const events = [];
  for (const def of eventDefs) {
    // eslint-disable-next-line no-await-in-loop
    const event = await Event.create({
      title: def.title,
      slug: slug(def.title),
      description: def.description,
      hostId: def.host._id,
      mode: def.mode,
      category: def.category,
      gameId: def.game ? def.game._id : null,
      city: def.city,
      area: def.area,
      venue: def.venue,
      startsAt: new Date(def.startsAt),
      capacity: def.capacity,
      goingCount: def.going,
      maybeCount: def.maybe,
      status: 'upcoming',
      safetyNotes: (def as { safetyNotes?: string }).safetyNotes || null,
      isSeed: true,
    });
    // Create matching RSVP rows so counts are real.
    const goingUsers = users.slice(0, Math.min(def.going, users.length));
    for (const u of goingUsers) {
      // eslint-disable-next-line no-await-in-loop
      await Rsvp.create({ eventId: event._id, userId: u._id, status: 'going' }).catch(() => undefined);
      // eslint-disable-next-line no-await-in-loop
      await User.updateOne({ _id: u._id }, { $inc: { eventsJoinedCount: 1 } });
    }
    await Event.updateOne({ _id: event._id }, { $set: { goingCount: goingUsers.length, maybeCount: def.maybe } });
    events.push(event);
  }
  // eslint-disable-next-line no-console
  console.log(`  ${events.length} events`);

  // ---- Giveaway on the first room ----
  const giveaway = await Giveaway.create({
    roomId: rooms[0]._id,
    hostId: kingTunde._id,
    title: 'Jollof Friday Giveaway',
    prize: '₦5,000 airtime',
    type: 'airtime',
    winnerCount: 2,
    entryCondition: 'in_room',
    status: 'active',
    startsAt: new Date(),
    endsAt: new Date(now + 86_400_000),
    isSeed: true,
  });
  await GiveawayEntry.insertMany([
    { giveawayId: giveaway._id, userId: chidera._id },
    { giveawayId: giveaway._id, userId: amaka._id },
    { giveawayId: giveaway._id, userId: segun._id },
  ]);

  // ---- Moments ----
  const momentDefs = [
    { u: chidera, c: '800k finally! 🥹 Lagos Run, don finish me today.', type: 'achievement' as const, game: lagosRun },
    { u: emeka, c: 'This danfo passenger nearly finished me 😭', type: 'screenshot' as const, game: danfoRun },
    { u: bigmanPh, c: 'Yaba took the whole lobby. Respect. 💚', type: 'room_moment' as const, game: null },
    { u: amaka, c: 'Who else dey grind Lagos Life at 2am? Nobody send me 😂', type: 'text' as const, game: lagosLife },
    { u: zainab, c: 'Cleared my to-do list just to play Danfo Run. Priorities.', type: 'text' as const, game: danfoRun },
    { u: grace, c: 'Enugu crew where una dey? Setting up a session this weekend.', type: 'text' as const, game: null },
    { u: segun, c: 'Lekki traffic today was basically a Lagos Run level irl 🏃‍♂️', type: 'text' as const, game: lagosRun },
  ];
  const moments = [];
  for (const [i, def] of momentDefs.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const moment = await Moment.create({
      authorId: def.u._id,
      type: def.type,
      caption: def.c,
      gameId: def.game ? def.game._id : null,
      reactions: { '💚': (momentDefs.length - i) * 3, '😂': (momentDefs.length - i) * 2 },
      commentsCount: i % 3,
      sharesCount: i % 2,
      score: 100 - i * 8,
      createdAt: new Date(now - (i + 1) * 3 * 3_600_000),
      isSeed: true,
    });
    moments.push(moment);
  }
  // eslint-disable-next-line no-console
  console.log(`  ${moments.length} moments`);

  // ---- Season ----
  const season = await Season.create({
    name: 'Lagos Run — Season 1',
    number: 1,
    gameId: lagosRun._id,
    status: 'active',
    startDate: new Date(now - 20 * 86_400_000),
    endDate: new Date(now + 10 * 86_400_000),
    tiers: DEFAULT_TIERS,
    rewards: ['Season 1 Champion badge', 'Top 10 badge', 'Crew War bonus points'],
    badgeCodes: ['season_champion', 'top_10'],
    participantCount: users.length,
    isSeed: true,
  });
  const seasonScores = [2100, 1750, 1490, 1180, 940, 820, 610, 540, 320, 180];
  for (const [i, score] of seasonScores.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await SeasonScore.create({ seasonId: season._id, userId: users[i]._id, score });
    // eslint-disable-next-line no-await-in-loop
    await User.updateOne({ _id: users[i]._id }, { $set: { seasonPoints: score, seasonId: season._id } });
  }

  // ---- Sponsor + sponsored event (generic, no real brand claimed) ----
  const sponsor = await Sponsor.create({
    name: 'Demo Sponsor Co.',
    slug: 'demo-sponsor-co',
    description: 'A placeholder sponsor used in development. Real brands get their own pages.',
    website: 'https://example.com',
    verified: true,
    status: 'active',
  });
  await SponsoredEvent.create({
    sponsorId: sponsor._id,
    eventId: events[0]._id,
    campaignName: 'Yaba Game Night Takeover',
    sponsorContribution: 100000,
    startDate: new Date(now - 86_400_000),
    endDate: new Date(now + 14 * 86_400_000),
    status: 'active',
    createdBy: kingTunde._id,
    analytics: { views: 1240, clicks: 187, entries: 96, attendance: 87 },
  });

  // ---- Competition ----
  const comp = await Competition.create({
    title: 'NaijaPlay Lagos Run Cup',
    description: 'Monthly elimination bracket. Server-recorded results only.',
    gameId: lagosRun._id,
    hostId: kingTunde._id,
    format: 'elimination',
    rules: ['Single elimination', 'Screenshots required for finals', "Host's decision is final (server records it)"],
    prizes: ['₦20,000 airtime', 'Bragging rights', '150 season points'],
    startsAt: new Date(now + 2 * 86_400_000),
    endsAt: new Date(now + 4 * 86_400_000),
    status: 'registration',
    participantIds: [kingTunde._id, chidera._id, amaka._id, bigmanPh._id],
  });
  for (const u of [kingTunde, chidera, amaka, bigmanPh]) {
    // eslint-disable-next-line no-await-in-loop
    await CompetitionEntry.create({ competitionId: comp._id, userId: u._id, score: 0 }).catch(() => undefined);
  }

  // ---- Recap from a finished room ----
  const pastRoom = await Room.create({
    name: 'Last Friday — Danfo Run chill',
    code: `NGA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    slug: 'last-friday-danfo-run-chill',
    description: 'Seeded past session.',
    hostId: chidera._id,
    type: 'public',
    category: 'gaming',
    gameId: danfoRun._id,
    startedAt: new Date(now - 6 * 86_400_000),
    endedAt: new Date(now - 6 * 86_400_000 + 3 * 3_600_000 + 12 * 60_000),
    status: 'ended',
    memberCount: 0,
    peakMemberCount: 64,
    isSeed: true,
  });
  await generateRecap(pastRoom);

  // ---- Game follow counts (real) ----
  for (const game of games) {
    const count = users.filter((u) => u.favoriteGames.some((g) => String(g) === String(game._id))).length;
    await Game.updateOne({ _id: game._id }, { $set: { followersCount: count } });
  }

  // eslint-disable-next-line no-console
  console.log(`
✅ Seed complete.

Seeded (isSeed=true): ${users.length} users, ${games.length} games, ${rooms.length} rooms, ${events.length} events, ${crews.length} crews, ${moments.length} moments, 1 season, 1 competition, 1 giveaway, 1 sponsor.

Sign in with magic link using any seeded email, e.g:
  kingtunde@seed.naijaplay.test   (admin)
  chidera@seed.naijaplay.test     (creator)
  bigmanph@seed.naijaplay.test    (creator)
  tobi_ws@seed.naijaplay.test     (moderator)
`);
  await disconnectDb();
}

seed().catch(async (err) => {
  logger.error({ err }, 'seed failed');
  // eslint-disable-next-line no-console
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
