import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { ROOM_CATEGORIES, ROOM_STATUSES, ROOM_TYPES, MEMBER_ROLES, type RoomCategory, type RoomStatus, type RoomType, type MemberRole } from '@naijaplay/shared';

export interface IRoom {
  _id: mongoose.Types.ObjectId;
  name: string;
  code: string;
  slug: string;
  description: string;
  hostId: mongoose.Types.ObjectId;
  type: RoomType;
  category: RoomCategory;
  gameId?: mongoose.Types.ObjectId | null;
  scheduledAt?: Date | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  capacity: number;
  memberCount: number;
  peakMemberCount: number;
  status: RoomStatus;
  isLocked: boolean;
  isPrivate: boolean;
  isQuickRoom: boolean;
  coverImage?: string | null;
  rules: string[];
  externalGameUrl?: string | null;
  externalGameCode?: string | null;
  location?: string | null;
  recapId?: mongoose.Types.ObjectId | null;
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RoomDoc = HydratedDocument<IRoom>;

const roomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '', maxlength: 500 },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ROOM_TYPES, default: 'public' },
    category: { type: String, enum: ROOM_CATEGORIES, default: 'gaming', index: true },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', default: null },
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    capacity: { type: Number, default: 100, min: 2, max: 5000 },
    memberCount: { type: Number, default: 0, min: 0 },
    peakMemberCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ROOM_STATUSES, default: 'live', index: true },
    isLocked: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    isQuickRoom: { type: Boolean, default: false },
    coverImage: { type: String, default: null },
    rules: [{ type: String, maxlength: 200 }],
    externalGameUrl: { type: String, default: null },
    externalGameCode: { type: String, default: null, maxlength: 40 },
    location: { type: String, default: null, maxlength: 60 },
    recapId: { type: Schema.Types.ObjectId, ref: 'Recap', default: null },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

roomSchema.index({ status: 1, isPrivate: 1, createdAt: -1 });
roomSchema.index({ status: 1, scheduledAt: 1 });
roomSchema.index({ hostId: 1, status: 1 });
roomSchema.index({ gameId: 1, status: 1 });
roomSchema.index({ category: 1, status: 1 });
roomSchema.index({ name: 'text', description: 'text' });

export const Room: Model<IRoom> = mongoose.model<IRoom>('Room', roomSchema);

export interface IRoomMember {
  _id: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: MemberRole;
  status: 'active' | 'left' | 'kicked' | 'banned';
  joinedAt: Date;
  leftAt?: Date | null;
  isMuted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RoomMemberDoc = HydratedDocument<IRoomMember>;

const roomMemberSchema = new Schema<IRoomMember>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: MEMBER_ROLES, default: 'member' },
    status: { type: String, enum: ['active', 'left', 'kicked', 'banned'], default: 'active' },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    isMuted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Prevents duplicate membership — required by the spec.
roomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });
roomMemberSchema.index({ userId: 1, status: 1 });
roomMemberSchema.index({ roomId: 1, status: 1 });

export const RoomMember: Model<IRoomMember> = mongoose.model<IRoomMember>('RoomMember', roomMemberSchema);
