import { Poll, PollVote, RoomMember } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { getIO } from '../sockets/io.js';

function serializePoll(poll: {
  _id: unknown;
  question: string;
  options: { _id: unknown; text: string; votes: number }[];
  totalVotes: number;
  endsAt: Date;
  closed: boolean;
  createdBy: unknown;
}) {
  return {
    id: String(poll._id),
    question: poll.question,
    options: poll.options.map((o) => ({ id: String(o._id), text: o.text, votes: o.votes })),
    totalVotes: poll.totalVotes,
    endsAt: poll.endsAt.toISOString(),
    closed: poll.closed || poll.endsAt.getTime() <= Date.now(),
    createdBy: String(poll.createdBy),
  };
}

export async function createPoll(roomId: string, userId: string, input: { question: string; options: string[]; durationSeconds: number }) {
  const membership = await RoomMember.findOne({ roomId, userId, status: 'active' });
  if (!membership || !['host', 'cohost', 'moderator'].includes(membership.role)) {
    throw AppError.forbidden('NOT_MODERATOR', 'Only hosts can create polls.');
  }
  const existing = await Poll.findOne({ roomId, closed: false, endsAt: { $gt: new Date() } });
  if (existing) throw AppError.conflict('POLL_RUNNING', 'A poll is already running. Wait for it to finish.');

  const poll = await Poll.create({
    roomId,
    createdBy: userId,
    question: input.question,
    options: input.options.slice(0, 6).map((text) => ({ text, votes: 0 })),
    totalVotes: 0,
    endsAt: new Date(Date.now() + input.durationSeconds * 1000),
    closed: false,
  });

  const payload = serializePoll(poll as never);
  getIO()?.to(`room:${roomId}`).emit('poll:created', { poll: payload });

  // Auto-close via timer (results still verified server-side).
  setTimeout(() => {
    void closePoll(String(poll._id));
  }, input.durationSeconds * 1000 + 500);

  return payload;
}

export async function votePoll(pollId: string, userId: string, optionId: string) {
  const poll = await Poll.findById(pollId);
  if (!poll) throw AppError.notFound('POLL_NOT_FOUND', 'Poll not found.');
  if (poll.closed || poll.endsAt.getTime() <= Date.now()) throw AppError.conflict('POLL_CLOSED', 'This poll has closed.');

  const membership = await RoomMember.findOne({ roomId: poll.roomId, userId, status: 'active' });
  if (!membership) throw AppError.forbidden('NOT_A_MEMBER', 'Join the room to vote.');

  const option = poll.options.find((o) => String(o._id) === optionId);
  if (!option) throw AppError.badRequest('BAD_OPTION', 'That option does not exist.');

  try {
    await PollVote.create({ pollId: poll._id, userId, optionId });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) throw AppError.conflict('ALREADY_VOTED', 'You already voted in this poll.');
    throw err;
  }

  option.votes += 1;
  poll.totalVotes += 1;
  await poll.save();

  const payload = serializePoll(poll as never);
  getIO()?.to(`room:${poll.roomId}`).emit('poll:updated', { poll: payload });
  return { poll: payload };
}

export async function closePoll(pollId: string): Promise<void> {
  const poll = await Poll.findById(pollId);
  if (!poll || poll.closed) return;
  poll.closed = true;
  await poll.save();
  getIO()?.to(`room:${poll.roomId}`).emit('poll:closed', { poll: serializePoll(poll as never) });
}

export async function listPolls(roomId: string) {
  const polls = await Poll.find({ roomId }).sort({ createdAt: -1 }).limit(10).lean();
  return polls.map((p) => serializePoll(p as never));
}
