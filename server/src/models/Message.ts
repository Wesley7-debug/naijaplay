import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IMessageAttachment {
  type: 'image' | 'gif';
  url: string;
  width?: number;
  height?: number;
}

export interface IMessage {
  _id: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content: string;
  attachments: IMessageAttachment[];
  replyTo?: mongoose.Types.ObjectId | null;
  reactions: { emoji: string; users: mongoose.Types.ObjectId[] }[];
  isPinned: boolean;
  isAnnouncement: boolean;
  deletedAt?: Date | null;
  deletedBy?: mongoose.Types.ObjectId | null;
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageDoc = HydratedDocument<IMessage>;

const messageSchema = new Schema<IMessage>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, default: '', maxlength: 2000 },
    attachments: [
      {
        _id: false,
        type: { type: String, enum: ['image', 'gif'] },
        url: String,
        width: Number,
        height: Number,
      },
    ],
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    reactions: [
      {
        _id: false,
        emoji: { type: String, required: true },
        users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      },
    ],
    isPinned: { type: Boolean, default: false },
    isAnnouncement: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Required index: roomId + createdAt
messageSchema.index({ roomId: 1, createdAt: -1 });
messageSchema.index({ roomId: 1, isPinned: 1, createdAt: -1 });
// Spam-guard lookup (per-message hot path).
messageSchema.index({ roomId: 1, senderId: 1, createdAt: -1 });

export const Message: Model<IMessage> = mongoose.model<IMessage>('Message', messageSchema);
