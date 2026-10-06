import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { CREW_KINDS, MEMBER_ROLES, type CrewKind, type MemberRole } from '@naijaplay/shared';

export interface ICrew {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  avatar?: string | null;
  cover?: string | null;
  kind: CrewKind;
  creatorId: mongoose.Types.ObjectId;
  memberCount: number;
  points: number;
  wins: number;
  losses: number;
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CrewDoc = HydratedDocument<ICrew>;

const crewSchema = new Schema<ICrew>(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '', maxlength: 500 },
    avatar: { type: String, default: null },
    cover: { type: String, default: null },
    kind: { type: String, enum: CREW_KINDS, default: 'other' },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    memberCount: { type: Number, default: 1, min: 0 },
    points: { type: Number, default: 0, min: 0 },
    wins: { type: Number, default: 0, min: 0 },
    losses: { type: Number, default: 0, min: 0 },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);
crewSchema.index({ points: -1 });
crewSchema.index({ name: 'text', description: 'text' });

export const Crew: Model<ICrew> = mongoose.model<ICrew>('Crew', crewSchema);

export interface ICrewMember {
  _id: mongoose.Types.ObjectId;
  crewId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: MemberRole;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CrewMemberDoc = HydratedDocument<ICrewMember>;

const crewMemberSchema = new Schema<ICrewMember>(
  {
    crewId: { type: Schema.Types.ObjectId, ref: 'Crew', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: MEMBER_ROLES, default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
crewMemberSchema.index({ crewId: 1, userId: 1 }, { unique: true });
crewMemberSchema.index({ userId: 1 });

export const CrewMember: Model<ICrewMember> = mongoose.model<ICrewMember>('CrewMember', crewMemberSchema);

export interface ICrewScoreLog {
  _id: mongoose.Types.ObjectId;
  crewId: mongoose.Types.ObjectId;
  delta: number;
  reason: string;
  sourceType: 'event' | 'competition' | 'quiz' | 'challenge' | 'season' | 'correction';
  sourceId?: mongoose.Types.ObjectId | null;
  actorId?: mongoose.Types.ObjectId | null;
  balanceAfter: number;
  createdAt: Date;
}

export type CrewScoreLogDoc = HydratedDocument<ICrewScoreLog>;

const crewScoreLogSchema = new Schema<ICrewScoreLog>(
  {
    crewId: { type: Schema.Types.ObjectId, ref: 'Crew', required: true, index: true },
    delta: { type: Number, required: true },
    reason: { type: String, required: true, maxlength: 200 },
    sourceType: { type: String, enum: ['event', 'competition', 'quiz', 'challenge', 'season', 'correction'], required: true },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
crewScoreLogSchema.index({ crewId: 1, createdAt: -1 });
crewScoreLogSchema.index({ sourceType: 1, sourceId: 1 });

export const CrewScoreLog: Model<ICrewScoreLog> = mongoose.model<ICrewScoreLog>('CrewScoreLog', crewScoreLogSchema);
