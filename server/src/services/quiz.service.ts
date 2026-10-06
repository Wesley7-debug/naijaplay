import { Quiz, QuizAnswer, RoomMember, User, type IQuiz, type IQuizQuestion } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { getIO } from '../sockets/io.js';
import { notify } from './notification.service.js';
import { awardXP } from './xp.service.js';
import logger from '../config/logger.js';

/** Server-authoritative elimination quiz (Squid-Game style, Naija trivia). */

export const DEFAULT_QUESTIONS: IQuizQuestion[] = [
  {
    question: 'Which bus is famously called “Molue” in Lagos?',
    options: ['Yellow danfo', 'Big blue bus', 'Okada', 'Keke'],
    correctIndex: 1,
    roundTimeSeconds: 20,
  },
  {
    question: '“Danfo” is slang for what?',
    options: ['Yellow bus', 'Suya', 'Phone', 'Shoe'],
    correctIndex: 0,
    roundTimeSeconds: 15,
  },
  {
    question: 'Which city is known as the Garden City?',
    options: ['Lagos', 'Port Harcourt', 'Abuja', 'Enugu'],
    correctIndex: 1,
    roundTimeSeconds: 15,
  },
  {
    question: 'What is the Nigerian currency?',
    options: ['Cedi', 'Shilling', 'Naira', 'Rand'],
    correctIndex: 2,
    roundTimeSeconds: 12,
  },
  {
    question: '“Wahala” means?',
    options: ['Blessing', 'Trouble', 'Money', 'Sleep'],
    correctIndex: 1,
    roundTimeSeconds: 12,
  },
];

export interface QuizRuntimePlayer {
  userId: string;
  displayName: string;
  username: string;
  avatar: string | null;
  eliminated: boolean;
  correctCount: number;
  answeredThisRound: boolean;
}

export interface QuizRuntime {
  quizId: string;
  roomId: string;
  hostId: string;
  questions: IQuizQuestion[];
  players: Map<string, QuizRuntimePlayer>;
  status: 'lobby' | 'active' | 'finished';
  currentRound: number;
  roundEndsAt: number | null;
  roundClosed: boolean;
  timer: NodeJS.Timeout | null;
  winnerId: string | null;
}

const runtimes = new Map<string, QuizRuntime>();

export function getRuntime(roomId: string): QuizRuntime | undefined {
  return runtimes.get(roomId);
}

export async function createQuiz(opts: { roomId: string; hostId: string; title?: string; questions?: IQuizQuestion[] }): Promise<IQuiz> {
  const isMember = await RoomMember.findOne({ roomId: opts.roomId, userId: opts.hostId, status: 'active' });
  const member = isMember;
  if (!member || !['host', 'cohost', 'moderator'].includes(member.role)) {
    throw AppError.forbidden('NOT_HOST', 'Only the host can set up a quiz.');
  }
  const existing = runtimes.get(opts.roomId);
  if (existing && (existing.status === 'active' || existing.status === 'lobby')) {
    throw AppError.conflict('QUIZ_RUNNING', 'A quiz is already running in this room.');
  }
  const questions = (opts.questions && opts.questions.length >= 3 ? opts.questions : DEFAULT_QUESTIONS).map((q) => ({
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    roundTimeSeconds: q.roundTimeSeconds ?? 20,
  }));
  const quiz = await Quiz.create({
    roomId: opts.roomId,
    hostId: opts.hostId,
    title: opts.title || 'Naija Quiz',
    questions,
    status: 'lobby',
    currentRound: 0,
  });
  return quiz;
}

async function loadPlayers(roomId: string): Promise<Map<string, QuizRuntimePlayer>> {
  const members = await RoomMember.find({ roomId, status: 'active' }).lean();
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }).lean();
  const map = new Map<string, QuizRuntimePlayer>();
  for (const user of users) {
    map.set(String(user._id), {
      userId: String(user._id),
      displayName: user.displayName,
      username: user.username,
      avatar: user.avatar ?? null,
      eliminated: false,
      correctCount: 0,
      answeredThisRound: false,
    });
  }
  return map;
}

function publicQuestion(rt: QuizRuntime) {
  const q = rt.questions[rt.currentRound - 1];
  if (!q) return null;
  return {
    round: rt.currentRound,
    question: q.question,
    // Options are shuffled per emission? No — order must be stable for correctness indexing.
    options: q.options,
    endsAt: new Date(rt.roundEndsAt || Date.now()).toISOString(),
  };
}

function alivePlayers(rt: QuizRuntime): QuizRuntimePlayer[] {
  return [...rt.players.values()].filter((p) => !p.eliminated);
}

function emitQuizState(rt: QuizRuntime) {
  const io = getIO();
  if (!io) return;
  io.to(`room:${rt.roomId}`).emit('quiz:state', {
    id: rt.quizId,
    roomId: rt.roomId,
    status: rt.status,
    currentRound: rt.currentRound,
    totalRounds: rt.questions.length,
    question: rt.status === 'active' ? publicQuestion(rt) : null,
    players: [...rt.players.values()].map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      avatar: p.avatar,
      eliminated: p.eliminated,
      correctCount: p.correctCount,
    })),
    aliveCount: alivePlayers(rt).length,
    winner: rt.winnerId,
  });
}

/** Host starts the quiz: enters active state and opens round 1. */
export async function startQuiz(quizId: string, hostId: string): Promise<QuizRuntime> {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw AppError.notFound('QUIZ_NOT_FOUND', 'Quiz not found.');
  if (String(quiz.hostId) !== hostId) throw AppError.forbidden('NOT_HOST', 'Only the host can start the quiz.');
  if (quiz.status === 'active' || quiz.status === 'finished') {
    throw AppError.conflict('QUIZ_RUNNING', 'This quiz already started.');
  }

  const players = await loadPlayers(String(quiz.roomId));
  if (players.size < 1) throw AppError.badRequest('NO_PLAYERS', 'Nobody is in the room to play.');

  const rt: QuizRuntime = {
    quizId: String(quiz._id),
    roomId: String(quiz.roomId),
    hostId,
    questions: quiz.questions as IQuizQuestion[],
    players,
    status: 'active',
    currentRound: 0,
    roundEndsAt: null,
    roundClosed: false,
    timer: null,
    winnerId: null,
  };
  runtimes.set(rt.roomId, rt);

  quiz.status = 'active';
  quiz.startedAt = new Date();
  quiz.participantIds = [...players.keys()] as never;
  await quiz.save();

  await openRound(rt);
  return rt;
}

async function openRound(rt: QuizRuntime): Promise<void> {
  const io = getIO();
  const question = rt.questions[rt.currentRound];
  if (!question) {
    await finishQuizByTimeout(rt);
    return;
  }
  rt.currentRound += 1;
  rt.roundClosed = false;
  const seconds = question.roundTimeSeconds ?? 20;
  rt.roundEndsAt = Date.now() + seconds * 1000;
  for (const p of rt.players.values()) p.answeredThisRound = false;

  io?.to(`room:${rt.roomId}`).emit('quiz:question', {
    quizId: rt.quizId,
    round: rt.currentRound,
    totalRounds: rt.questions.length,
    question: question.question,
    options: question.options,
    endsAt: new Date(rt.roundEndsAt).toISOString(),
  });
  emitQuizState(rt);

  if (rt.timer) clearTimeout(rt.timer);
  rt.timer = setTimeout(() => {
    void closeRound(rt.roomId);
  }, seconds * 1000 + 250);
}

/** Server evaluates answers; incorrect players are eliminated. */
export async function submitAnswer(rt: QuizRuntime, userId: string, answerIndex: number, round: number): Promise<{ correct: boolean; eliminated: boolean }> {
  const io = getIO();
  const player = rt.players.get(userId);
  if (!player) throw AppError.forbidden('NOT_PLAYER', 'You are not in this quiz.');
  if (player.eliminated) throw AppError.forbidden('ELIMINATED', 'You have been eliminated.');
  if (rt.status !== 'active' || rt.roundClosed) throw AppError.conflict('ROUND_CLOSED', 'This round is closed.');
  if (round !== rt.currentRound) throw AppError.badRequest('STALE_ROUND', 'That round is over.');
  if (player.answeredThisRound) throw AppError.conflict('ALREADY_ANSWERED', 'You already answered this round.');
  if (rt.roundEndsAt && Date.now() > rt.roundEndsAt) throw AppError.conflict('ROUND_CLOSED', 'Time up for this round.');

  const question = rt.questions[rt.currentRound - 1];
  const correct = Number(answerIndex) === question.correctIndex;
  player.answeredThisRound = true;
  if (correct) player.correctCount += 1;
  if (!correct) {
    player.eliminated = true;
  }

  try {
    await QuizAnswer.create({
      quizId: rt.quizId,
      roomId: rt.roomId,
      userId,
      round: rt.currentRound,
      answerIndex,
      isCorrect: correct,
      elapsedMs: rt.roundEndsAt ? Math.max(0, rt.roundEndsAt - Date.now()) : 0,
    });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code !== 11000) throw err; // duplicate answer ignored
  }

  io?.to(`user:${userId}`).emit('quiz:answer-result', {
    quizId: rt.quizId,
    round: rt.currentRound,
    correct,
    eliminated: player.eliminated,
  });
  if (player.eliminated) {
    io?.to(`room:${rt.roomId}`).emit('quiz:player-eliminated', {
      quizId: rt.quizId,
      userId,
      displayName: player.displayName,
      round: rt.currentRound,
    });
  }

  const alive = alivePlayers(rt);
  if (alive.length <= 1 && !rt.roundClosed) {
    await closeRound(rt.roomId);
  }
  return { correct, eliminated: player.eliminated };
}

/** Close the current round: broadcast results, advance or finish. */
export async function closeRound(roomId: string): Promise<void> {
  const rt = runtimes.get(roomId);
  if (!rt || rt.status !== 'active' || rt.roundClosed) return;
  rt.roundClosed = true;
  if (rt.timer) clearTimeout(rt.timer);
  const io = getIO();

  const alive = alivePlayers(rt);
  io?.to(`room:${roomId}`).emit('quiz:round-ended', {
    quizId: rt.quizId,
    round: rt.currentRound,
    aliveCount: alive.length,
    eliminatedCount: [...rt.players.values()].filter((p) => p.eliminated).length,
    correctIndex: rt.questions[rt.currentRound - 1]?.correctIndex ?? -1,
  });

  if (alive.length <= 1) {
    await finishQuiz(rt, alive[0]?.userId || null);
    return;
  }
  if (rt.currentRound >= rt.questions.length) {
    // Out of questions: highest correct count among alive wins.
    const sorted = [...alive].sort((a, b) => b.correctCount - a.correctCount);
    await finishQuiz(rt, sorted[0]?.userId || null);
    return;
  }

  io?.to(`room:${roomId}`).emit('quiz:state', { phase: 'intermission', quizId: rt.quizId, ms: 3000 });
  rt.timer = setTimeout(() => {
    void openRound(rt);
  }, 3000);
}

async function finishQuiz(rt: QuizRuntime, winnerId: string | null): Promise<void> {
  const io = getIO();
  rt.status = 'finished';
  rt.winnerId = winnerId;
  if (rt.timer) clearTimeout(rt.timer);

  const quiz = await Quiz.findById(rt.quizId);
  if (quiz) {
    quiz.status = 'finished';
    quiz.finishedAt = new Date();
    quiz.winnerId = winnerId as never;
    if (winnerId) {
      const winner = rt.players.get(winnerId);
      if (winner) quiz.championData = { userId: winnerId as never, username: winner.username, displayName: winner.displayName };
    }
    await quiz.save();
  }

  if (winnerId) {
    const winner = rt.players.get(winnerId);
    io?.to(`room:${roomId(rt)}`).emit('quiz:finished', {
      quizId: rt.quizId,
      winnerId,
      winnerName: winner?.displayName || 'Someone',
    });
    await awardXP(winnerId, 'QUIZ_WIN', { quizId: rt.quizId });
    await notify({
      userId: winnerId,
      type: 'quiz_result',
      title: 'Winner! 🏆',
      body: `You won the quiz in the room. Sharp!`,
      link: `/rooms`,
    });
  } else {
    io?.to(`room:${roomId(rt)}`).emit('quiz:finished', { quizId: rt.quizId, winnerId: null, winnerName: null });
  }

  // Award participation XP once.
  await Promise.all(
    [...rt.players.keys()].filter((id) => id !== winnerId).map((id) => awardXP(id, 'QUIZ_PARTICIPATE', { quizId: rt.quizId })),
  );

  setTimeout(() => runtimes.delete(rt.roomId), 60_000);
  logger.info({ quizId: rt.quizId, winnerId }, 'quiz finished');
}

async function finishQuizByTimeout(rt: QuizRuntime): Promise<void> {
  await finishQuiz(rt, null);
}

function roomId(rt: QuizRuntime): string {
  return rt.roomId;
}

export function cleanupRuntime(roomId: string): void {
  const rt = runtimes.get(roomId);
  if (rt?.timer) clearTimeout(rt.timer);
  runtimes.delete(roomId);
}
