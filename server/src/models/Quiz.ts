import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  roundTimeSeconds?: number;
}

export interface IQuiz {
  _id: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  hostId: mongoose.Types.ObjectId;
  title: string;
  questions: IQuizQuestion[];
  status: 'lobby' | 'active' | 'finished' | 'cancelled';
  currentRound: number;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  winnerId?: mongoose.Types.ObjectId | null;
  participantIds: mongoose.Types.ObjectId[];
  championData?: { userId: mongoose.Types.ObjectId; username: string; displayName: string } | null;
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type QuizDoc = HydratedDocument<IQuiz>;

const quizSchema = new Schema<IQuiz>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'Naija Quiz' },
    questions: [
      {
        _id: false,
        question: String,
        options: [String],
        correctIndex: Number,
        roundTimeSeconds: Number,
      },
    ],
    status: { type: String, enum: ['lobby', 'active', 'finished', 'cancelled'], default: 'lobby' },
    currentRound: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    winnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    participantIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    championData: {
      type: {
        userId: Schema.Types.ObjectId,
        username: String,
        displayName: String,
      },
      default: null,
      _id: false,
    },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Quiz: Model<IQuiz> = mongoose.model<IQuiz>('Quiz', quizSchema);

export interface IQuizAnswer {
  _id: mongoose.Types.ObjectId;
  quizId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  round: number;
  answerIndex: number;
  isCorrect: boolean;
  elapsedMs: number;
  createdAt: Date;
}

const quizAnswerSchema = new Schema<IQuizAnswer>({
  quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  round: { type: Number, required: true },
  answerIndex: { type: Number, required: true },
  isCorrect: { type: Boolean, required: true },
  elapsedMs: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});
// One answer per player per round.
quizAnswerSchema.index({ quizId: 1, round: 1, userId: 1 }, { unique: true });

export const QuizAnswer: Model<IQuizAnswer> = mongoose.model<IQuizAnswer>('QuizAnswer', quizAnswerSchema);
