import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { MOMENT_TYPES, type MomentType } from '@naijaplay/shared';

export interface IMoment {
  _id: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  type: MomentType;
  caption: string;
  media?: {
    url: string;
    type: 'image' | 'video';
    width?: number;
    height?: number;
    durationSec?: number;
  } | null;
  gameId?: mongoose.Types.ObjectId | null;
  roomId?: mongoose.Types.ObjectId | null;
  eventId?: mongoose.Types.ObjectId | null;
  reactions: Record<string, number>;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  score: number;
  deletedAt?: Date | null;
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type MomentDoc = HydratedDocument<IMoment>;

const mediaSchema = new Schema(
  {
    url: String,
    type: { type: String, enum: ['image', 'video'] },
    width: Number,
    height: Number,
    durationSec: Number,
  },
  { _id: false },
);

const momentSchema = new Schema<IMoment>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: MOMENT_TYPES, default: 'text' },
    caption: { type: String, required: true, maxlength: 500 },
    media: { type: mediaSchema, default: null },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', default: null },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', default: null },
    reactions: { type: Object, default: {} },
    commentsCount: { type: Number, default: 0, min: 0 },
    sharesCount: { type: Number, default: 0, min: 0 },
    viewsCount: { type: Number, default: 0, min: 0 },
    score: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

momentSchema.index({ createdAt: -1 });
momentSchema.index({ gameId: 1, createdAt: -1 });
momentSchema.index({ authorId: 1, createdAt: -1 });
momentSchema.index({ score: -1, createdAt: -1 });
momentSchema.index({ caption: 'text' });

export const Moment: Model<IMoment> = mongoose.model<IMoment>('Moment', momentSchema);

export interface IMomentComment {
  _id: mongoose.Types.ObjectId;
  momentId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  content: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const momentCommentSchema = new Schema<IMomentComment>(
  {
    momentId: { type: Schema.Types.ObjectId, ref: 'Moment', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 500 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
momentCommentSchema.index({ momentId: 1, createdAt: 1 });

export const MomentComment: Model<IMomentComment> = mongoose.model<IMomentComment>('MomentComment', momentCommentSchema);

/** One reaction per user per moment; totals live on the Moment doc. */
export interface IMomentReaction {
  _id: mongoose.Types.ObjectId;
  momentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

const momentReactionSchema = new Schema<IMomentReaction>(
  {
    momentId: { type: Schema.Types.ObjectId, ref: 'Moment', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
momentReactionSchema.index({ momentId: 1, userId: 1 }, { unique: true });

export const MomentReaction: Model<IMomentReaction> = mongoose.model<IMomentReaction>('MomentReaction', momentReactionSchema);
