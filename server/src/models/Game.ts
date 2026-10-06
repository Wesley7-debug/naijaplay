import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IGame {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  developer: string;
  officialUrl?: string | null;
  logo?: string | null;
  coverImage?: string | null;
  category: string;
  isFeatured: boolean;
  followersCount: number;
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type GameDoc = HydratedDocument<IGame>;

const gameSchema = new Schema<IGame>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '', maxlength: 1000 },
    developer: { type: String, default: '' },
    officialUrl: { type: String, default: null },
    logo: { type: String, default: null },
    coverImage: { type: String, default: null },
    category: { type: String, default: 'gaming' },
    isFeatured: { type: Boolean, default: false },
    followersCount: { type: Number, default: 0, min: 0 },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);
gameSchema.index({ name: 'text', description: 'text' });

export const Game: Model<IGame> = mongoose.model<IGame>('Game', gameSchema);

export interface IGameFollow {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  gameId: mongoose.Types.ObjectId;
  isFavorite: boolean;
  createdAt: Date;
}

const gameFollowSchema = new Schema<IGameFollow>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
    isFavorite: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
gameFollowSchema.index({ userId: 1, gameId: 1 }, { unique: true });

export const GameFollow: Model<IGameFollow> = mongoose.model<IGameFollow>('GameFollow', gameFollowSchema);

/** Optional self-reported score (no external game APIs used). */
export interface IGameScore {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  gameId: mongoose.Types.ObjectId;
  score: number;
  gameUsername?: string | null;
  screenshotUrl?: string | null;
  externalUrl?: string | null;
  verification: 'unverified' | 'verified' | 'rejected';
  verifiedBy?: mongoose.Types.ObjectId | null;
  roomId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const gameScoreSchema = new Schema<IGameScore>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
    score: { type: Number, required: true, min: 0 },
    gameUsername: { type: String, default: null },
    screenshotUrl: { type: String, default: null },
    externalUrl: { type: String, default: null },
    verification: { type: String, enum: ['unverified', 'verified', 'rejected'], default: 'unverified' },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
  },
  { timestamps: true },
);
gameScoreSchema.index({ gameId: 1, score: -1 });
gameScoreSchema.index({ userId: 1, gameId: 1, createdAt: -1 });

export const GameScore: Model<IGameScore> = mongoose.model<IGameScore>('GameScore', gameScoreSchema);
