import mongoose, { Document, Schema } from 'mongoose';

const roadSegmentSchema = new Schema(
  {
    id: { type: String, required: true },
    roadName: { type: String, required: true, trim: true },
    lengthM: { type: Number, required: true, min: 0 },
    widthM: { type: Number, required: true, min: 0 },
    surfaceType: {
      type: String,
      enum: [
        'paved_concrete',
        'paved_asphalt',
        'paved_brick',
        'unpaved_gravel',
        'unpaved_dirt',
        'mixed',
        'other',
      ],
      required: true,
    },
    surfaceTypeOther: String,
    isPaved: Boolean,
    areaM2: Number,
    remarks: String,
  },
  { _id: false }
);

const vegetationCategorySchema = new Schema(
  {
    id: { type: String, required: true },
    categoryType: {
      type: String,
      enum: [
        'native_trees',
        'ornamental_trees',
        'shrubs_grassland',
        'agroforestry',
        'arboriculture',
        'custom',
      ],
      required: true,
    },
    customCategoryLabel: String,
    definitionScope: String,
    numberOfTrees: { type: Number, min: 0 },
    areaAcres: { type: Number, min: 0 },
    remarks: String,
  },
  { _id: false }
);

const waterBodySchema = new Schema(
  {
    id: { type: String, required: true },
    category: {
      type: String,
      enum: ['canal', 'lake_pond', 'river', 'reservoir', 'other'],
      required: true,
    },
    customCategoryLabel: String,
    name: { type: String, required: true, trim: true },
    lengthM: { type: Number, min: 0 },
    widthM: { type: Number, min: 0 },
    surfaceAreaAcres: { type: Number, min: 0 },
    surfaceAreaM2: { type: Number, min: 0 },
    remarks: String,
  },
  { _id: false }
);

export interface ICampusRecordDocument extends Document {
  campusId: string;
  campusName: string;
  institution: string;
  totalCampusAreaAcres?: number;
  status:
    | 'not_started'
    | 'draft'
    | 'submitted'
    | 'under_review'
    | 'verified'
    | 'revision_requested';
  version: number;
  previousVersionId?: mongoose.Types.ObjectId;

  data: {
    roads: {
      segments: unknown[];
      hasStreetLighting?: boolean;
      streetLightCount?: number;
      streetLightType?: string;
      streetLightWattsEach?: number;
      streetLightHoursPerDay?: number;
      streetLightingRemarks?: string;
    };
    vegetation: {
      categories: unknown[];
      hasHeritageTrees?: boolean;
      heritageTreeCount?: number;
      heritageTreeRemarks?: string;
    };
    waterBodies: {
      waterBodies: unknown[];
      hasPerennialWaterBody?: boolean;
      waterManagementRemarks?: string;
    };
  };

  carbonResults?: {
    roadsEmbodiedCarbon: number;
    roadLightingCarbonPerYear: number;
    vegetationSequestrationPerYear: number;
    netCampusCarbonPerYear: number;
    totalCampusEmbodied: number;
    breakdown: Record<string, number>;
    estimatedFields: string[];
    confidenceScore: number;
    computedAt: Date;
  };

  estimatedFields: string[];
  confidenceScore: number;
  submittedBy?: mongoose.Types.ObjectId;
  submittedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const campusRecordSchema = new Schema<ICampusRecordDocument>(
  {
    campusId: { type: String, required: true, unique: true, default: 'iitbhu-main' },
    campusName: { type: String, default: 'IIT BHU Campus' },
    institution: { type: String, default: 'IIT (BHU) Varanasi' },
    totalCampusAreaAcres: Number,
    status: {
      type: String,
      enum: ['not_started', 'draft', 'submitted', 'under_review', 'verified', 'revision_requested'],
      default: 'not_started',
      index: true,
    },
    version: { type: Number, default: 1 },
    previousVersionId: { type: Schema.Types.ObjectId, ref: 'CampusRecord' },
    data: {
      roads: {
        segments: [roadSegmentSchema],
        hasStreetLighting: Boolean,
        streetLightCount: Number,
        streetLightType: String,
        streetLightWattsEach: Number,
        streetLightHoursPerDay: Number,
        streetLightingRemarks: String,
      },
      vegetation: {
        categories: [vegetationCategorySchema],
        hasHeritageTrees: Boolean,
        heritageTreeCount: Number,
        heritageTreeRemarks: String,
      },
      waterBodies: {
        waterBodies: [waterBodySchema],
        hasPerennialWaterBody: Boolean,
        waterManagementRemarks: String,
      },
    },
    carbonResults: {
      roadsEmbodiedCarbon: Number,
      roadLightingCarbonPerYear: Number,
      vegetationSequestrationPerYear: Number,
      netCampusCarbonPerYear: Number,
      totalCampusEmbodied: Number,
      breakdown: Schema.Types.Mixed,
      estimatedFields: [String],
      confidenceScore: Number,
      computedAt: Date,
    },
    estimatedFields: [String],
    confidenceScore: { type: Number, default: 0, min: 0, max: 100 },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNotes: String,
  },
  { timestamps: true }
);

campusRecordSchema.index({ campusId: 1 }, { unique: true });
campusRecordSchema.index({ status: 1 });

export const CampusRecord = mongoose.model<ICampusRecordDocument>(
  'CampusRecord',
  campusRecordSchema
);
export default CampusRecord;
