import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { COMPETITION_FORMATS, COMPETITION_STATUSES, type CompetitionFormat, type CompetitionStatus } from '@naijaplay/shared';

export interface ICompetition {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  gameId?: mongoose.Types.ObjectId | null;
  hostId: mongoose.Types.ObjectId;
  format: CompetitionFormat;
  rules: string[];
  prizes: string[];
  startsAt: Date;
  endsAt: Date;
  status: CompetitionStatus;
  participantIds: mongoose.Types.ObjectId[];
  crewIds: mongoose.Types.ObjectId[];
  sponsorId?: mongoose.Types.ObjectId | null;
  winnerId?: mongoose.Types.ObjectId | null;
  winningCrewId?: mongoose.Types.ObjectId | null;
  roomId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CompetitionDoc = HydratedDocument<ICompetition>;

const competitionSchema = new Schema<ICompetition>(
  {
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', default: null },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    format: { type: String, enum: COMPETITION_FORMATS, required: true },
    rules: [{ type: String, maxlength: 300 }],
    prizes: [{ type: String, maxlength: 200 }],
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: { type: String, enum: COMPETITION_STATUSES, default: 'registration', index: true },
    participantIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    crewIds: [{ type: Schema.Types.ObjectId, ref: 'Crew' }],
    sponsorId: { type: Schema.Types.ObjectId, ref: 'Sponsor', default: null },
    winnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    winningCrewId: { type: Schema.Types.ObjectId, ref: 'Crew', default: null },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
  },
  { timestamps: true },
);
competitionSchema.index({ status: 1, startsAt: 1 });
competitionSchema.index({ title: 'text', description: 'text' });

export const Competition: Model<ICompetition> = mongoose.model<ICompetition>('Competition', competitionSchema);

export interface ICompetitionEntry {
  _id: mongoose.Types.ObjectId;
  competitionId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  crewId?: mongoose.Types.ObjectId | null;
  score: number;
  joinedAt: Date;
  createdAt: Date;
}

const competitionEntrySchema = new Schema<ICompetitionEntry>(
  {
    competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    crewId: { type: Schema.Types.ObjectId, ref: 'Crew', default: null },
    score: { type: Number, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
competitionEntrySchema.index({ competitionId: 1, userId: 1 }, { unique: true });
competitionEntrySchema.index({ competitionId: 1, score: -1 });

export const CompetitionEntry: Model<ICompetitionEntry> = mongoose.model<ICompetitionEntry>('CompetitionEntry', competitionEntrySchema);

/** One-to-one DM conversation (architecture supports group later). */
export interface IConversation {
  _id: mongoose.Types.ObjectId;
  participantIds: mongoose.Types.ObjectId[];
  lastMessage?: { content: string; createdAt: Date; senderId: mongoose.Types.ObjectId } | null;
  updatedAt: Date;
  createdAt: Date;
}

export type ConversationDoc = HydratedDocument<IConversation>;

const conversationSchema = new Schema<IConversation>(
  {
    participantIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: {
      type: {
        content: String,
        createdAt: Date,
        senderId: Schema.Types.ObjectId,
      },
      default: null,
      _id: false,
    },
  },
  { timestamps: true },
);
conversationSchema.index({ participantIds: 1 }, { unique: true });

export const Conversation: Model<IConversation> = mongoose.model<IConversation>('Conversation', conversationSchema);

export interface IDirectMessage {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content: string;
  readAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const directMessageSchema = new Schema<IDirectMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
directMessageSchema.index({ conversationId: 1, createdAt: -1 });

export const DirectMessage: Model<IDirectMessage> = mongoose.model<IDirectMessage>('DirectMessage', directMessageSchema);

/** Looking-for-group lobby entries (social matchmaking). */
export interface ILfgEntry {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  gameId?: mongoose.Types.ObjectId | null;
  gameName: string;
  category?: string | null;
  note?: string | null;
  active: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const lfgSchema = new Schema<ILfgEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', default: null },
    gameName: { type: String, default: '', maxlength: 80 },
    category: { type: String, default: null },
    note: { type: String, default: null, maxlength: 140 },
    active: { type: Boolean, default: true, index: true },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 60 * 60_000) },
  },
  { timestamps: true },
);
lfgSchema.index({ active: 1, gameId: 1 });
lfgSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LfgEntry: Model<ILfgEntry> = mongoose.model<ILfgEntry>('LfgEntry', lfgSchema);

/** Lightweight analytics: views, clicks, attendance, giveaway entries. */
export interface IAnalyticsEvent {
  _id: mongoose.Types.ObjectId;
  type: 'view' | 'click' | 'attendance' | 'giveaway_entry' | 'share';
  entityType: 'room' | 'event' | 'profile' | 'crew' | 'moment' | 'season' | 'recap' | 'sponsor' | 'game';
  entityId: string;
  userId?: mongoose.Types.ObjectId | null;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const analyticsSchema = new Schema<IAnalyticsEvent>(
  {
    type: { type: String, enum: ['view', 'click', 'attendance', 'giveaway_entry', 'share'], required: true },
    entityType: {
      type: String,
      enum: ['room', 'event', 'profile', 'crew', 'moment', 'season', 'recap', 'sponsor', 'game'],
      required: true,
    },
    entityId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
analyticsSchema.index({ entityType: 1, entityId: 1, type: 1, createdAt: -1 });

export const AnalyticsEvent: Model<IAnalyticsEvent> = mongoose.model<IAnalyticsEvent>('AnalyticsEvent', analyticsSchema);
