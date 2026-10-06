import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

/** Server-side session — the cookie holds only a random token. */
export interface ISession {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionDoc = HydratedDocument<ISession>;

const sessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session: Model<ISession> = mongoose.model<ISession>('Session', sessionSchema);

/** Single-use magic link token. */
export interface IMagicLink {
  _id: mongoose.Types.ObjectId;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export type MagicLinkDoc = HydratedDocument<IMagicLink>;

const magicLinkSchema = new Schema<IMagicLink>({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
magicLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MagicLink: Model<IMagicLink> = mongoose.model<IMagicLink>('MagicLink', magicLinkSchema);
