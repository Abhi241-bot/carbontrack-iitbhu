import mongoose, { Document, Schema } from 'mongoose';
import { BuildingType } from '@shared/types/building.types';

const SECTION_STATUSES = [
  'not_started',
  'draft',
  'submitted',
  'under_review',
  'verified',
  'revision_requested',
] as const;

type SectionStatusValue = (typeof SECTION_STATUSES)[number];
type OverallStatus = 'not_started' | 'in_progress' | 'fully_verified' | 'partial';

export interface IBuildingDocument extends Document {
  name: string;
  shortName?: string;
  type: BuildingType;
  description?: string;
  floors: number;
  totalArea?: number;
  yearBuilt?: number;
  latitude?: number;
  longitude?: number;
  footprintGeometry?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  shapefileHeight?: number;
  imageUrl?: string;
  campusId: mongoose.Types.ObjectId;
  assignedMembers: mongoose.Types.ObjectId[];
  isActive: boolean;
  tags: string[];

  // ── RESEARCH FORMAT: USAGE & IDENTITY ──
  usagesOfBuilding?: string;
  frequencyOfUsagePerDay?: number;
  numberOfBuildings?: number;
  numberOfOccupantsPerBuilding?: number;
  areaOfOneBuildingSqFt?: number;

  // ── RESEARCH FORMAT: ENVIRONMENTAL DESIGN ──
  ventilationType?: 'natural' | 'mechanical' | 'mixed';
  buildingNature?: 'temporary' | 'permanent';

  // ── RESEARCH FORMAT: ORIENTATION ──
  orientationNorthPct?: number;
  orientationEastPct?: number;
  orientationSouthPct?: number;
  orientationWestPct?: number;

  // ── LAND USE ──
  landUseOpenPlayAreaAcres?: number;
  landUseGreenPermeableAcres?: number;
  landUsePavedAcres?: number;
  landUseCoveredBuiltUpAcres?: number;
  landUseCustomCategories?: Array<{ categoryName: string; areaAcres: number; remarks?: string }>;

  // ── RESEARCH FORMAT: STRUCTURAL DIMENSIONS ──
  wallThicknessMm?: number;
  internalPartitionMm?: number;
  slabThicknessMm?: number;
  beamSize?: string;
  columnSize?: string;
  numberOfRooms?: number;
  numberOfWindows?: number;
  clearRoomHeightFt?: number;

  // ── RESEARCH FORMAT: ROOF ──
  roofMaterials?: string;
  roofThicknessMm?: number;

  // ── RESEARCH FORMAT: CONSTRUCTION ──
  constructionType?: 'load_bearing' | 'rcc' | 'steel_frame' | 'other';
  constructionTypeOther?: string;
  localConstructionPractices?: boolean;
  materialSourceDistance?: string;
  localMaterialsPercent?: number;
  insulationMaterial?: string;
  scrapMaterialsUsed?: string;
  reusePolicy?: string;

  // ── OPENINGS SUMMARY ──
  openingSummary?: {
    totalWindows?: number;
    totalDoors?: number;
    totalClerestoryWindows?: number;
    totalSunshades?: number;
  };

  // ── REMARKS ──
  remarks?: string;

  // Overview (static)
  overviewStatus: SectionStatusValue;
  overviewSubmissionId?: mongoose.Types.ObjectId;

  // Civil section (static lifecycle)
  civilStatus: SectionStatusValue;
  civilSubmissionId?: mongoose.Types.ObjectId;

  // Electrical section (dynamic lifecycle)
  electricalStatus: SectionStatusValue;
  electricalSubmissionId?: mongoose.Types.ObjectId;
  electricalVersion: number;

  // Waste section (dynamic lifecycle)
  wasteStatus: SectionStatusValue;
  wasteSubmissionId?: mongoose.Types.ObjectId;
  wasteVersion: number;

  // Combined carbon results (computed after all three sections verified)
  combinedCarbonResults?: unknown;
  lastCarbonCalculatedAt?: Date;

  // Virtuals
  overallStatus: OverallStatus;
  submissionStatus: OverallStatus; // backward-compat alias for overallStatus

  createdAt: Date;
  updatedAt: Date;
}

const buildingSchema = new Schema<IBuildingDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    shortName: { type: String, trim: true, maxlength: 50 },
    type: {
      type: String,
      enum: Object.values(BuildingType),
      required: true,
      index: true,
    },
    description: String,
    floors: { type: Number, required: true, min: 1 },
    totalArea: Number,
    yearBuilt: Number,
    latitude: Number,
    longitude: Number,
    footprintGeometry: {
      type: { type: String, enum: ['Polygon'], default: 'Polygon' },
      coordinates: [[[Number]]],
    },
    shapefileHeight: Number,
    imageUrl: String,
    campusId: {
      type: Schema.Types.ObjectId,
      ref: 'Campus',
      required: true,
      index: true,
    },
    assignedMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isActive: { type: Boolean, default: true, index: true },
    tags: [String],

    // Overview (static)
    overviewStatus: { type: String, enum: SECTION_STATUSES, default: 'not_started' },
    overviewSubmissionId: { type: Schema.Types.ObjectId, ref: 'Submission' },

    // Civil section (static lifecycle)
    civilStatus: { type: String, enum: SECTION_STATUSES, default: 'not_started', index: true },
    civilSubmissionId: { type: Schema.Types.ObjectId, ref: 'Submission' },

    // Electrical section (dynamic lifecycle)
    electricalStatus: { type: String, enum: SECTION_STATUSES, default: 'not_started', index: true },
    electricalSubmissionId: { type: Schema.Types.ObjectId, ref: 'Submission' },
    electricalVersion: { type: Number, default: 0 },

    // Waste section (dynamic lifecycle)
    wasteStatus: { type: String, enum: SECTION_STATUSES, default: 'not_started', index: true },
    wasteSubmissionId: { type: Schema.Types.ObjectId, ref: 'Submission' },
    wasteVersion: { type: Number, default: 0 },

    // Combined carbon results
    combinedCarbonResults: Schema.Types.Mixed,
    lastCarbonCalculatedAt: Date,

    // ── RESEARCH FORMAT: USAGE & IDENTITY ──
    usagesOfBuilding: String,
    frequencyOfUsagePerDay: Number,
    numberOfBuildings: { type: Number, min: 1, default: 1 },
    numberOfOccupantsPerBuilding: Number,
    areaOfOneBuildingSqFt: Number,

    // ── RESEARCH FORMAT: ENVIRONMENTAL DESIGN ──
    ventilationType: { type: String, enum: ['natural', 'mechanical', 'mixed'] },
    buildingNature: { type: String, enum: ['temporary', 'permanent'], default: 'permanent' },

    // ── RESEARCH FORMAT: ORIENTATION ──
    orientationNorthPct: { type: Number, min: 0, max: 100 },
    orientationEastPct: { type: Number, min: 0, max: 100 },
    orientationSouthPct: { type: Number, min: 0, max: 100 },
    orientationWestPct: { type: Number, min: 0, max: 100 },

    // ── LAND USE ──
    landUseOpenPlayAreaAcres: Number,
    landUseGreenPermeableAcres: Number,
    landUsePavedAcres: Number,
    landUseCoveredBuiltUpAcres: Number,
    landUseCustomCategories: [
      {
        categoryName: String,
        areaAcres: Number,
        remarks: String,
      },
    ],

    // ── RESEARCH FORMAT: STRUCTURAL DIMENSIONS ──
    wallThicknessMm: Number,
    internalPartitionMm: Number,
    slabThicknessMm: Number,
    beamSize: String,
    columnSize: String,
    numberOfRooms: Number,
    numberOfWindows: Number,
    clearRoomHeightFt: Number,

    // ── RESEARCH FORMAT: ROOF ──
    roofMaterials: String,
    roofThicknessMm: Number,

    // ── RESEARCH FORMAT: CONSTRUCTION ──
    constructionType: { type: String, enum: ['load_bearing', 'rcc', 'steel_frame', 'other'] },
    constructionTypeOther: String,
    localConstructionPractices: Boolean,
    materialSourceDistance: String,
    localMaterialsPercent: { type: Number, min: 0, max: 100 },
    insulationMaterial: String,
    scrapMaterialsUsed: String,
    reusePolicy: String,

    // ── OPENINGS SUMMARY ──
    openingSummary: {
      totalWindows: Number,
      totalDoors: Number,
      totalClerestoryWindows: Number,
      totalSunshades: Number,
    },

    // ── REMARKS ──
    remarks: String,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ── Virtuals ──────────────────────────────────────────────────────────────────

buildingSchema.virtual('overallStatus').get(function (this: IBuildingDocument): OverallStatus {
  const statuses: SectionStatusValue[] = [
    this.overviewStatus,
    this.civilStatus,
    this.electricalStatus,
    this.wasteStatus,
  ];

  const allNotStarted = statuses.every((s) => s === 'not_started');
  if (allNotStarted) return 'not_started';

  const allVerified = statuses.every((s) => s === 'verified');
  if (allVerified) return 'fully_verified';

  const anyTouched = statuses.some((s) => s !== 'not_started');
  if (anyTouched) return 'in_progress';

  return 'partial';
});

// Backward-compat alias
buildingSchema.virtual('submissionStatus').get(function (this: IBuildingDocument): OverallStatus {
  return this.overallStatus;
});

// ── Indexes ──────────────────────────────────────────────────────────────────

buildingSchema.index({ name: 'text' });
buildingSchema.index({ type: 1, civilStatus: 1 });
buildingSchema.index({ type: 1, electricalStatus: 1 });
buildingSchema.index({ type: 1, wasteStatus: 1 });
buildingSchema.index({ campusId: 1, type: 1 });
buildingSchema.index({ campusId: 1, isActive: 1 });
buildingSchema.index({ campusId: 1, civilStatus: 1 });

export const Building = mongoose.model<IBuildingDocument>('Building', buildingSchema);
