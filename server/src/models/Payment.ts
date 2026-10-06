import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

// NOTE: No online payments. Money moves off-platform via manual bank
// transfer (aza) arranged in chat between host and winner/recipient.

export interface ISponsor {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  logo?: string | null;
  banner?: string | null;
  website?: string | null;
  description: string;
  verified: boolean;
  status: 'active' | 'paused' | 'archived';
  contactEmail?: string | null;
  ownerUserId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SponsorDoc = HydratedDocument<ISponsor>;

const sponsorSchema = new Schema<ISponsor>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, index: true },
    logo: { type: String, default: null },
    banner: { type: String, default: null },
    website: { type: String, default: null },
    description: { type: String, default: '', maxlength: 1000 },
    verified: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active', index: true },
    contactEmail: { type: String, default: null },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const Sponsor: Model<ISponsor> = mongoose.model<ISponsor>('Sponsor', sponsorSchema);

export interface ISponsoredEvent {
  _id: mongoose.Types.ObjectId;
  sponsorId: mongoose.Types.ObjectId;
  eventId?: mongoose.Types.ObjectId | null;
  giveawayId?: mongoose.Types.ObjectId | null;
  competitionId?: mongoose.Types.ObjectId | null;
  seasonId?: mongoose.Types.ObjectId | null;
  campaignName: string;
  sponsorContribution: number;
  banner?: string | null;
  startDate: Date;
  endDate: Date;
  status: 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  analytics: { views: number; clicks: number; entries: number; attendance: number };
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type SponsoredEventDoc = HydratedDocument<ISponsoredEvent>;

const sponsoredEventSchema = new Schema<ISponsoredEvent>(
  {
    sponsorId: { type: Schema.Types.ObjectId, ref: 'Sponsor', required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
    giveawayId: { type: Schema.Types.ObjectId, ref: 'Giveaway', default: null },
    competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', default: null },
    seasonId: { type: Schema.Types.ObjectId, ref: 'Season', default: null },
    campaignName: { type: String, required: true, maxlength: 120 },
    sponsorContribution: { type: Number, default: 0, min: 0 },
    banner: { type: String, default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['draft', 'published', 'active', 'completed', 'cancelled'], default: 'draft', index: true },
    analytics: {
      type: {
        views: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        entries: { type: Number, default: 0 },
        attendance: { type: Number, default: 0 },
      },
      default: () => ({ views: 0, clicks: 0, entries: 0, attendance: 0 }),
      _id: false,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
sponsoredEventSchema.index({ status: 1, startDate: 1, endDate: 1 });

export const SponsoredEvent: Model<ISponsoredEvent> = mongoose.model<ISponsoredEvent>('SponsoredEvent', sponsoredEventSchema);
