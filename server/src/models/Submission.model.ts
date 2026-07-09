import mongoose, { Document, Schema } from 'mongoose';

// Re-exported for backward compat — services that imported SubmissionStatus
// from this module continue to work during the Phase 1→2 migration.
export { SubmissionStatus } from '@shared/types/building.types';

export interface IReviewHistoryEntry {
  action: 'approved' | 'revision_requested' | 'flagged' | 'recalculated';
  adminId: mongoose.Types.ObjectId;
  notes?: string;
  flaggedFields?: string[];
  timestamp: Date;
}

export interface ISubmissionDocument extends Document {
  buildingId: mongoose.Types.ObjectId;
  submittedBy: mongoose.Types.ObjectId;
  section: 'civil' | 'electrical' | 'waste' | 'overview';
  lifecycle: 'static' | 'dynamic';
  entryMode: 'cumulative' | 'room_level';
  status:
    | 'not_started'
    | 'draft'
    | 'submitted'
    | 'under_review'
    | 'verified'
    | 'revision_requested';
  data: unknown;
  estimatedFields: string[];
  confidenceScore: number;
  carbonResults?: {
    embodiedCarbon?: number;
    embodiedCarbonPerYear?: number;
    operationalCarbonPerYear?: number;
    wasteCarbonPerYear?: number;
    breakdown: unknown;
    meta?: unknown;
    dataSourceInfo?: unknown;
    efSnapshot?: unknown;
    calculatedAt?: Date;
  };
  version: number;
  reviewNotes?: string;
  previousVersionId?: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  submittedAt?: Date;
  reviewHistory: IReviewHistoryEntry[];
  verifiedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SECTION_STATUSES = [
  'not_started',
  'draft',
  'submitted',
  'under_review',
  'verified',
  'revision_requested',
] as const;

const submissionSchema = new Schema<ISubmissionDocument>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // which domain section this submission belongs to
    section: {
      type: String,
      enum: ['civil', 'electrical', 'waste', 'overview'],
      required: true,
      index: true,
    },

    // static (locked after approval) or dynamic (re-enterable)
    lifecycle: {
      type: String,
      enum: ['static', 'dynamic'],
      required: true,
      default: 'dynamic',
    },

    // cumulative or room_level
    entryMode: {
      type: String,
      enum: ['cumulative', 'room_level'],
      default: 'cumulative',
    },

    status: {
      type: String,
      enum: SECTION_STATUSES,
      required: true,
      default: 'draft',
      index: true,
    },

    data: Schema.Types.Mixed, // ICivilSectionData | IElectricalSectionData | IWasteSectionData

    estimatedFields: [String],
    confidenceScore: { type: Number, default: 0, min: 0, max: 100 },

    carbonResults: {
      embodiedCarbon: Number,
      embodiedCarbonPerYear: Number,
      operationalCarbonPerYear: Number,
      wasteCarbonPerYear: Number,
      breakdown: Schema.Types.Mixed,
      meta: Schema.Types.Mixed,
      dataSourceInfo: Schema.Types.Mixed,
      efSnapshot: Schema.Types.Mixed,
      calculatedAt: Date,
    },

    version: { type: Number, default: 1 },
    reviewNotes: String,
    previousVersionId: { type: Schema.Types.ObjectId, ref: 'Submission' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    submittedAt: Date,
    reviewHistory: [
      {
        action: {
          type: String,
          enum: ['approved', 'revision_requested', 'flagged', 'recalculated'],
        },
        adminId: { type: Schema.Types.ObjectId, ref: 'User' },
        notes: String,
        flaggedFields: [String],
        timestamp: { type: Date, default: Date.now },
      },
    ],
    verifiedAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Compound indexes
submissionSchema.index({ buildingId: 1, section: 1, status: 1 });
submissionSchema.index({ buildingId: 1, section: 1, version: -1 });
submissionSchema.index({ submittedBy: 1, createdAt: -1 });

export const Submission = (mongoose.models.Submission as mongoose.Model<ISubmissionDocument>) || mongoose.model<ISubmissionDocument>('Submission', submissionSchema);
