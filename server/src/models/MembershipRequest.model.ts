import mongoose, { Document, Schema } from 'mongoose';

export enum RequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum RequestTargetType {
  BUILDING = 'building',
  CAMPUS_INFRASTRUCTURE = 'campus_infrastructure',
}

export interface IMembershipRequestDocument extends Document {
  userId: mongoose.Types.ObjectId;
  targetType: RequestTargetType;
  /** Set when targetType === 'building' */
  buildingId?: mongoose.Types.ObjectId;
  /** Set when targetType === 'campus_infrastructure' */
  campusId?: mongoose.Types.ObjectId;
  status: RequestStatus;
  message?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const membershipRequestSchema = new Schema<IMembershipRequestDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: {
      type: String,
      enum: Object.values(RequestTargetType),
      default: RequestTargetType.BUILDING,
      index: true,
    },
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', index: true, sparse: true },
    campusId: { type: Schema.Types.ObjectId, ref: 'Campus', index: true, sparse: true },
    status: {
      type: String,
      enum: Object.values(RequestStatus),
      default: RequestStatus.PENDING,
      index: true,
    },
    message: { type: String, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

// One pending request per user per target at a time
membershipRequestSchema.index({ userId: 1, buildingId: 1, status: 1 });
membershipRequestSchema.index({ userId: 1, campusId: 1, status: 1 });

export const MembershipRequest = (mongoose.models.MembershipRequest as mongoose.Model<IMembershipRequestDocument>) || mongoose.model<IMembershipRequestDocument>(
  'MembershipRequest',
  membershipRequestSchema
);
