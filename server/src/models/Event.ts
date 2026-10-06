import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { EVENT_MODES, ROOM_CATEGORIES, RSVP_STATUSES, type EventMode, type RoomCategory, type RsvpStatus } from '@naijaplay/shared';

export interface IEvent {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  hostId: mongoose.Types.ObjectId;
  mode: EventMode;
  category: RoomCategory;
  gameId?: mongoose.Types.ObjectId | null;
  city?: string | null;
  area?: string | null;
  venue?: string | null;
  safetyNotes?: string | null;
  onlineUrl?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  capacity: number;
  goingCount: number;
  maybeCount: number;
  waitlistCount: number;
  coverImage?: string | null;
  rules: string[];
  status: 'upcoming' | 'live' | 'ended' | 'cancelled';
  roomId?: mongoose.Types.ObjectId | null;
  recapId?: mongoose.Types.ObjectId | null;
  reminderSentAt?: Date | null;
  startingSentAt?: Date | null;
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type EventDoc = HydratedDocument<IEvent>;

const eventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '', maxlength: 2000 },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mode: { type: String, enum: EVENT_MODES, default: 'online' },
    category: { type: String, enum: ROOM_CATEGORIES, default: 'hangout' },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', default: null },
    city: { type: String, default: null, maxlength: 60 },
    area: { type: String, default: null, maxlength: 60 },
    venue: { type: String, default: null, maxlength: 200 },
    safetyNotes: { type: String, default: null, maxlength: 600 },
    onlineUrl: { type: String, default: null },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, default: null },
    capacity: { type: Number, default: 100, min: 1 },
    goingCount: { type: Number, default: 0, min: 0 },
    maybeCount: { type: Number, default: 0, min: 0 },
    waitlistCount: { type: Number, default: 0, min: 0 },
    coverImage: { type: String, default: null },
    rules: [{ type: String, maxlength: 200 }],
    status: { type: String, enum: ['upcoming', 'live', 'ended', 'cancelled'], default: 'upcoming', index: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
    recapId: { type: Schema.Types.ObjectId, ref: 'Recap', default: null },
    reminderSentAt: { type: Date, default: null },
    startingSentAt: { type: Date, default: null },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

eventSchema.index({ startsAt: 1, status: 1 });
eventSchema.index({ status: 1, mode: 1, startsAt: 1 });
eventSchema.index({ category: 1, startsAt: 1 });
eventSchema.index({ title: 'text', description: 'text' });

export const Event: Model<IEvent> = mongoose.model<IEvent>('Event', eventSchema);

export interface IRsvp {
  _id: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: RsvpStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type RsvpDoc = HydratedDocument<IRsvp>;

const rsvpSchema = new Schema<IRsvp>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: RSVP_STATUSES, default: 'going' },
  },
  { timestamps: true },
);
rsvpSchema.index({ eventId: 1, userId: 1 }, { unique: true });
rsvpSchema.index({ userId: 1, status: 1 });

export const Rsvp: Model<IRsvp> = mongoose.model<IRsvp>('Rsvp', rsvpSchema);

export interface IRecap {
  _id: mongoose.Types.ObjectId;
  roomId?: mongoose.Types.ObjectId | null;
  eventId?: mongoose.Types.ObjectId | null;
  title: string;
  hostId: mongoose.Types.ObjectId;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  attendeeCount: number;
  peakMembers: number;
  messageCount: number;
  reactionCount: number;
  giveawayCount: number;
  winners: { userId: mongoose.Types.ObjectId; username: string; displayName: string; prize: string }[];
  quizChampion?: { userId: mongoose.Types.ObjectId; username: string; displayName: string } | null;
  participantIds: mongoose.Types.ObjectId[];
  momentIds: mongoose.Types.ObjectId[];
  sponsorId?: mongoose.Types.ObjectId | null;
  shareUrl: string;
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RecapDoc = HydratedDocument<IRecap>;

const recapSchema = new Schema<IRecap>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', default: null },
    title: { type: String, required: true },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 0 },
    attendeeCount: { type: Number, default: 0 },
    peakMembers: { type: Number, default: 0 },
    messageCount: { type: Number, default: 0 },
    reactionCount: { type: Number, default: 0 },
    giveawayCount: { type: Number, default: 0 },
    winners: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        username: String,
        displayName: String,
        prize: String,
      },
    ],
    quizChampion: {
      _id: false,
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      username: String,
      displayName: String,
    },
    participantIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    momentIds: [{ type: Schema.Types.ObjectId, ref: 'Moment' }],
    sponsorId: { type: Schema.Types.ObjectId, ref: 'Sponsor', default: null },
    shareUrl: { type: String, default: '' },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);
recapSchema.index({ createdAt: -1 });

export const Recap: Model<IRecap> = mongoose.model<IRecap>('Recap', recapSchema);
