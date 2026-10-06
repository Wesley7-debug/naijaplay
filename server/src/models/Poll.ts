import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IPoll {
  _id: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  question: string;
  options: { _id: mongoose.Types.ObjectId; text: string; votes: number }[];
  totalVotes: number;
  endsAt: Date;
  closed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PollDoc = HydratedDocument<IPoll>;

const pollSchema = new Schema<IPoll>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    question: { type: String, required: true, maxlength: 300 },
    options: [
      {
        text: { type: String, required: true, maxlength: 120 },
        votes: { type: Number, default: 0, min: 0 },
      },
    ],
    totalVotes: { type: Number, default: 0, min: 0 },
    endsAt: { type: Date, required: true },
    closed: { type: Boolean, default: false },
  },
  { timestamps: true },
);
pollSchema.index({ roomId: 1, createdAt: -1 });

export const Poll: Model<IPoll> = mongoose.model<IPoll>('Poll', pollSchema);

/** Prevents duplicate votes. */
export interface IPollVote {
  _id: mongoose.Types.ObjectId;
  pollId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  optionId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const pollVoteSchema = new Schema<IPollVote>({
  pollId: { type: Schema.Types.ObjectId, ref: 'Poll', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  optionId: { type: Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, default: Date.now },
});
pollVoteSchema.index({ pollId: 1, userId: 1 }, { unique: true });

export const PollVote: Model<IPollVote> = mongoose.model<IPollVote>('PollVote', pollVoteSchema);
