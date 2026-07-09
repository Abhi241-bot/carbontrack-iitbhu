import mongoose, { Document, Schema } from 'mongoose';

const SECTION_STATUSES = [
  'not_started',
  'draft',
  'submitted',
  'under_review',
  'verified',
  'revision_requested',
];

// ── Sub-schemas (copied exactly from CampusRecord.model.ts) ──────────────────

const roadSegmentSchema = new Schema(
  {
    id: { type: String, required: true },
    roadName: { type: String, required: true, trim: true },
    lengthM: { type: Number, required: true, min: 0 },
    widthM: { type: Number, required: true, min: 0 },
    lengthKm: { type: Number, min: 0 },
    lanes: { type: Number, min: 1, default: 2 },
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
    roadType: String,
    isPaved: Boolean,
    lightsPerKm: Number,
    wattsPerLight: Number,
    hoursPerDay: Number,
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
    areaSqm: { type: Number, min: 0 },
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

// ── Document interface ────────────────────────────────────────────────────────

export interface ICampusDocument extends Document {
  // Identity
  slug: string;
  name: string;
  institution: string;
  shortName?: string;
  city: string;
  state: string;
  country: string;
  totalAreaAcres?: number;
  establishedYear?: number;
  website?: string;
  contactEmail?: string;
  description?: string;

  // Overview section tracking
  overviewStatus: string;
  overviewVersion: number;
  overviewSubmittedBy?: mongoose.Types.ObjectId;
  overviewVerifiedAt?: Date;
  overviewReviewedBy?: mongoose.Types.ObjectId;
  overviewReviewNotes?: string;

  // Infrastructure section (roads, vegetation, water bodies)
  infrastructureStatus: string;
  infrastructureVersion: number;
  infrastructureData: {
    roads: {
      segments: any[];
      hasStreetLighting?: boolean;
      streetLightCount?: number;
      streetLightType?: string;
      streetLightWattsEach?: number;
      streetLightHoursPerDay?: number;
      streetLightingRemarks?: string;
    };
    vegetation: {
      categories: any[];
      hasHeritageTrees?: boolean;
      heritageTreeCount?: number;
      heritageTreeRemarks?: string;
    };
    waterBodies: {
      waterBodies: any[];
      hasPerennialWaterBody?: boolean;
      waterManagementRemarks?: string;
    };
    commutation?: {
      noOccupants: number;
      avgDailyDistanceKm: number;
      workingDaysPerYear: number;
    };
    airTravel?: {
      noTravellers: number;
      totalPassengerKm?: number;
      avgDistancePerPersonKm?: number;
    };
    purchasedGoods?: {
      totalPopulation?: number;
      costPerPersonINR?: number;
      totalSpendINR?: number;
      totalSpend2022USD?: number;
    };
  };
  infrastructureSubmittedBy?: mongoose.Types.ObjectId;
  infrastructureVerifiedAt?: Date;
  infrastructureReviewedBy?: mongoose.Types.ObjectId;
  infrastructureReviewNotes?: string;
  infrastructureCarbonResults?: Record<string, unknown>;

  // Infrastructure member assignment
  infrastructureAssignedMembers: mongoose.Types.ObjectId[];

  // Shared
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const campusSchema = new Schema<ICampusDocument>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    institution: { type: String, required: true, trim: true },
    shortName: String,
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    totalAreaAcres: Number,
    establishedYear: Number,
    website: String,
    contactEmail: String,
    description: String,

    // Overview
    overviewStatus: { type: String, enum: SECTION_STATUSES, default: 'not_started' },
    overviewVersion: { type: Number, default: 0 },
    overviewSubmittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    overviewVerifiedAt: Date,
    overviewReviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    overviewReviewNotes: String,

    // Infrastructure
    infrastructureStatus: { type: String, enum: SECTION_STATUSES, default: 'not_started' },
    infrastructureVersion: { type: Number, default: 0 },
    infrastructureData: {
      roads: {
        segments: { type: [roadSegmentSchema], default: [] },
        hasStreetLighting: Boolean,
        streetLightCount: Number,
        streetLightType: String,
        streetLightWattsEach: Number,
        streetLightHoursPerDay: Number,
        streetLightingRemarks: String,
      },
      vegetation: {
        categories: { type: [vegetationCategorySchema], default: [] },
        hasHeritageTrees: Boolean,
        heritageTreeCount: Number,
        heritageTreeRemarks: String,
      },
      waterBodies: {
        waterBodies: { type: [waterBodySchema], default: [] },
        hasPerennialWaterBody: Boolean,
        waterManagementRemarks: String,
      },
      commutation: {
        noOccupants: { type: Number, min: 0 },
        avgDailyDistanceKm: { type: Number, min: 0 },
        workingDaysPerYear: { type: Number, min: 0 },
      },
      airTravel: {
        noTravellers: { type: Number, min: 0 },
        totalPassengerKm: { type: Number, min: 0 },
        avgDistancePerPersonKm: { type: Number, min: 0 },
      },
      purchasedGoods: {
        totalPopulation: { type: Number, min: 0 },
        costPerPersonINR: { type: Number, min: 0 },
        totalSpendINR: { type: Number, min: 0 },
        totalSpend2022USD: { type: Number, min: 0 },
      },
    },
    infrastructureSubmittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    infrastructureVerifiedAt: Date,
    infrastructureReviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    infrastructureReviewNotes: String,
    infrastructureCarbonResults: Schema.Types.Mixed,

    infrastructureAssignedMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

campusSchema.index({ slug: 1 }, { unique: true });
campusSchema.index({ isActive: 1 });
campusSchema.index({ country: 1, city: 1 });

export const Campus = (mongoose.models.Campus as mongoose.Model<ICampusDocument>) || mongoose.model<ICampusDocument>('Campus', campusSchema);
export default Campus;
