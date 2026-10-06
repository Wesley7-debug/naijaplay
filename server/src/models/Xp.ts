import mongoose, { Schema, type Model } from 'mongoose';
import type { XpAction } from '@naijaplay/shared';

/** Server-side XP ledger — history of every XP mutation. */
export interface IXpTransaction {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  action: XpAction;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
  balanceAfter: number;
  createdAt: Date;
}

const xpTransactionSchema = new Schema<IXpTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    amount: { type: Number, required: true },
    reason: { type: String, required: true, maxlength: 200 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
xpTransactionSchema.index({ userId: 1, createdAt: -1 });
xpTransactionSchema.index({ userId: 1, action: 1, createdAt: -1 });

export const XpTransaction: Model<IXpTransaction> = mongoose.model<IXpTransaction>('XpTransaction', xpTransactionSchema);
