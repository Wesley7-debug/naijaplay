import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { NOTIFICATION_TYPES, REPORT_REASONS, REPORT_STATUSES, REPORT_TARGETS, type NotificationType, type ReportReason, type ReportStatus, type ReportTarget } from '@naijaplay/shared';

export interface IFollow {
  _id: mongoose.Types.ObjectId;
  followerId: mongoose.Types.ObjectId;
  followingId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export type FollowDoc = HydratedDocument<IFollow>;

const followSchema = new Schema<IFollow>(
  {
    followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    followingId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// Prevents duplicate follows — required by spec.
followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
followSchema.index({ followingId: 1, createdAt: -1 });

export const Follow: Model<IFollow> = mongoose.model<IFollow>('Follow', followSchema);

export interface INotification {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, unknown>;
  readAt?: Date | null;
  createdAt: Date;
}

export type NotificationDoc = HydratedDocument<INotification>;

const notificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 400 },
  link: { type: String, default: null },
  data: { type: Schema.Types.Mixed, default: {} },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

export const Notification: Model<INotification> = mongoose.model<INotification>('Notification', notificationSchema);

export interface IReport {
  _id: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  targetType: ReportTarget;
  targetId: mongoose.Types.ObjectId;
  targetLabel?: string;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  moderatorId?: mongoose.Types.ObjectId | null;
  resolution?: string | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReportDoc = HydratedDocument<IReport>;

const reportSchema = new Schema<IReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    targetLabel: { type: String, default: '' },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    description: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: REPORT_STATUSES, default: 'open', index: true },
    moderatorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolution: { type: String, default: null, maxlength: 500 },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
reportSchema.index({ status: 1, createdAt: -1 });
// One open report per reporter per target prevents report spam.
reportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['open', 'reviewing'] } } },
);

export const Report: Model<IReport> = mongoose.model<IReport>('Report', reportSchema);
