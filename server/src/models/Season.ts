import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { SEASON_RANK_TIERS, SEASON_STATUSES, type SeasonRankTier, type SeasonStatus } from '@naijaplay/shared';

export interface ISeason {
  _id: mongoose.Types.ObjectId;
  name: string;
  number: number;
  gameId?: mongoose.Types.ObjectId | null;
  status: SeasonStatus;
  startDate: Date;
  endDate: Date;
  tiers: { tier: SeasonRankTier; threshold: number }[];
  rewards: string[];
  badgeCodes: string[];
  participantCount: number;
  finalizedAt?: Date | null;
  nextSeasonId?: mongoose.Types.ObjectId | null;
  archivedResults?: {
    topUsers: { userId: mongoose.Types.ObjectId; username: string; displayName: string; score: number; tier: SeasonRankTier }[];
    topCrews: { crewId: mongoose.Types.ObjectId; name: string; score: number }[];
  };
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SeasonDoc = HydratedDocument<ISeason>;

const seasonSchema = new Schema<ISeason>(
  {
    name: { type: String, required: true },
    number: { type: Number, required: true },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', default: null },
    status: { type: String, enum: SEASON_STATUSES, default: 'active', index: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    tiers: [
      {
        _id: false,
        tier: { type: String, enum: SEASON_RANK_TIERS },
        threshold: { type: Number, default: 0 },
      },
    ],
    rewards: [{ type: String }],
    badgeCodes: [{ type: String }],
    participantCount: { type: Number, default: 0 },
    finalizedAt: { type: Date, default: null },
    nextSeasonId: { type: Schema.Types.ObjectId, ref: 'Season', default: null },
    archivedResults: { type: Schema.Types.Mixed, default: undefined },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);
seasonSchema.index({ status: 1, startDate: 1 });

export const Season: Model<ISeason> = mongoose.model<ISeason>('Season', seasonSchema);

/** Per-user score rows within a season — updated only by trusted platform events. */
export interface ISeasonScore {
  _id: mongoose.Types.ObjectId;
  seasonId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  score: number;
  updatedAt: Date;
  createdAt: Date;
}

const seasonScoreSchema = new Schema<ISeasonScore>(
  {
    seasonId: { type: Schema.Types.ObjectId, ref: 'Season', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
seasonScoreSchema.index({ seasonId: 1, score: -1 });
seasonScoreSchema.index({ seasonId: 1, userId: 1 }, { unique: true });

export const SeasonScore: Model<ISeasonScore> = mongoose.model<ISeasonScore>('SeasonScore', seasonScoreSchema);

/** Immutable audit trail of season point changes. */
export interface ISeasonPointLog {
  _id: mongoose.Types.ObjectId;
  seasonId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  delta: number;
  reason: string;
  sourceType: string;
  sourceId?: mongoose.Types.ObjectId | null;
  balanceAfter: number;
  createdAt: Date;
}

const seasonPointLogSchema = new Schema<ISeasonPointLog>(
  {
    seasonId: { type: Schema.Types.ObjectId, ref: 'Season', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    delta: { type: Number, required: true },
    reason: { type: String, required: true, maxlength: 200 },
    sourceType: { type: String, required: true },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
seasonPointLogSchema.index({ seasonId: 1, userId: 1, createdAt: -1 });

export const SeasonPointLog: Model<ISeasonPointLog> = mongoose.model<ISeasonPointLog>('SeasonPointLog', seasonPointLogSchema);
