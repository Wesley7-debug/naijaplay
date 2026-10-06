import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IGlobalMessage {
  _id: mongoose.Types.ObjectId;
  /** Registered sender — null when sent by a guest. */
  senderId: mongoose.Types.ObjectId | null;
  /** Stable anonymous id for guests (g_ + hex). Null for registered users. */
  guestId: string | null;
  /** Display name chosen by the guest. Null for registered users. */
  guestName: string | null;
  content: string;
  /** Registered users mentioned via @username (for notifications/highlight). */
  mentions: mongoose.Types.ObjectId[];
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GlobalMessageDoc = HydratedDocument<IGlobalMessage>;

const globalMessageSchema = new Schema<IGlobalMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    guestId: { type: String, default: null, index: true, maxlength: 64 },
    guestName: { type: String, default: null, maxlength: 20 },
    content: { type: String, required: true, maxlength: 500 },
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

globalMessageSchema.index({ createdAt: -1 });
// Spam-guard + sender history lookups (per-message hot path).
globalMessageSchema.index({ senderId: 1, createdAt: -1 });
globalMessageSchema.index({ guestId: 1, createdAt: -1 });

export const GlobalMessage: Model<IGlobalMessage> =
  mongoose.models.GlobalMessage || mongoose.model<IGlobalMessage>('GlobalMessage', globalMessageSchema);
