import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { GIVEAWAY_CONDITIONS, GIVEAWAY_STATUSES, GIVEAWAY_TYPES, type GiveawayEntryCondition, type GiveawayStatus, type GiveawayType } from '@naijaplay/shared';

export interface IGiveaway {
  _id: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  hostId: mongoose.Types.ObjectId;
  title: string;
  prize: string;
  type: GiveawayType;
  winnerCount: number;
  entryCondition: GiveawayEntryCondition;
  entryDetail?: string | null;
  minAccountAgeDays?: number | null;
  status: GiveawayStatus;
  startsAt: Date;
  endsAt: Date;
  winnerIds: mongoose.Types.ObjectId[];
  finalizedAt?: Date | null;
  payoutStatus?: 'none' | 'pending' | 'sent' | 'failed';
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type GiveawayDoc = HydratedDocument<IGiveaway>;

const giveawaySchema = new Schema<IGiveaway>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120 },
    prize: { type: String, required: true, maxlength: 200 },
    type: { type: String, enum: GIVEAWAY_TYPES, default: 'custom' },
    winnerCount: { type: Number, default: 1, min: 1, max: 50 },
    entryCondition: { type: String, enum: GIVEAWAY_CONDITIONS, default: 'in_room' },
    entryDetail: { type: String, default: null, maxlength: 300 },
    minAccountAgeDays: { type: Number, default: null },
    status: { type: String, enum: GIVEAWAY_STATUSES, default: 'active', index: true },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true, index: true },
    winnerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    finalizedAt: { type: Date, default: null },
    payoutStatus: { type: String, enum: ['none', 'pending', 'sent', 'failed'], default: 'none' },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);
giveawaySchema.index({ status: 1, endsAt: 1 });
giveawaySchema.index({ hostId: 1, createdAt: -1 });

export const Giveaway: Model<IGiveaway> = mongoose.model<IGiveaway>('Giveaway', giveawaySchema);

export interface IGiveawayEntry {
  _id: mongoose.Types.ObjectId;
  giveawayId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  answer?: string | null;
  createdAt: Date;
}

const giveawayEntrySchema = new Schema<IGiveawayEntry>({
  giveawayId: { type: Schema.Types.ObjectId, ref: 'Giveaway', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  answer: { type: String, default: null, maxlength: 300 },
  createdAt: { type: Date, default: Date.now },
});
// One entry per account — anti-cheat requirement.
giveawayEntrySchema.index({ giveawayId: 1, userId: 1 }, { unique: true });
giveawayEntrySchema.index({ giveawayId: 1, createdAt: -1 });

export const GiveawayEntry: Model<IGiveawayEntry> = mongoose.model<IGiveawayEntry>('GiveawayEntry', giveawayEntrySchema);
