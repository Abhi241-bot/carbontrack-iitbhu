import mongoose from 'mongoose';
import CampusRecord, { ICampusRecordDocument } from '../models/CampusRecord.model';
import { calculateCampusCarbon } from '../engine/campus';
import { AppError } from '../utils/AppError';
import { redisClient } from '../config/redis';
import { ICampusData } from '@shared/types/submission.types';

const CAMPUS_ID = 'iitbhu-main';

// Get or create the singleton campus record
export async function getOrCreateCampusDraft(): Promise<ICampusRecordDocument> {
  let record = await CampusRecord.findOne({ campusId: CAMPUS_ID });
  if (!record) {
    record = await CampusRecord.create({
      campusId: CAMPUS_ID,
      campusName: 'IIT BHU Campus',
      institution: 'IIT (BHU) Varanasi',
      status: 'draft',
      version: 1,
      data: {
        roads: { segments: [], hasStreetLighting: false },
        vegetation: { categories: [] },
        waterBodies: { waterBodies: [] },
      },
      estimatedFields: [],
      confidenceScore: 0,
    });
  }
  return record;
}

// Update campus draft data
export async function updateCampusDraft(
  data: Partial<ICampusData>,
  userId: string
): Promise<ICampusRecordDocument> {
  const record = await CampusRecord.findOne({ campusId: CAMPUS_ID });
  if (!record) throw new AppError('Campus record not found', 404);

  if (!['not_started', 'draft', 'revision_requested'].includes(record.status)) {
    throw new AppError('Campus record is not in an editable state', 400);
  }

  if (data.roads)
    record.data.roads = { ...record.data.roads, ...data.roads } as typeof record.data.roads;
  if (data.vegetation)
    record.data.vegetation = {
      ...record.data.vegetation,
      ...data.vegetation,
    } as typeof record.data.vegetation;
  if (data.waterBodies)
    record.data.waterBodies = {
      ...record.data.waterBodies,
      ...data.waterBodies,
    } as typeof record.data.waterBodies;

  record.markModified('data');
  record.status = 'draft';
  record.submittedBy = new mongoose.Types.ObjectId(userId) as unknown as mongoose.Types.ObjectId;
  await record.save();
  return record;
}

// Validate campus data and return warnings
export async function validateCampusRecord(): Promise<{
  warnings: string[];
  estimatedFields: string[];
  completenessScore: number;
}> {
  const record = await CampusRecord.findOne({ campusId: CAMPUS_ID });
  if (!record) {
    return {
      warnings: ['Campus record has not been started yet'],
      estimatedFields: [],
      completenessScore: 0,
    };
  }

  const warnings: string[] = [];
  const data = record.data;

  // Roads
  if (!data.roads?.segments?.length) {
    warnings.push('No road segments entered — road embodied carbon will not be calculated');
  } else {
    const incomplete = (
      data.roads.segments as Array<{ lengthM?: number; widthM?: number; roadName?: string }>
    ).filter((s) => !s.lengthM || !s.widthM || !s.roadName);
    if (incomplete.length > 0) {
      warnings.push(`${incomplete.length} road segment(s) are missing name, length or width`);
    }
  }

  if (data.roads?.hasStreetLighting && !data.roads.streetLightCount) {
    warnings.push('Street lighting is marked as present but count is missing');
  }

  // Vegetation
  if (!data.vegetation?.categories?.length) {
    warnings.push('No vegetation data — carbon sequestration from trees will not be calculated');
  } else {
    const emptyCategories = (
      data.vegetation.categories as Array<{ numberOfTrees?: number; areaAcres?: number }>
    ).filter((c) => !c.numberOfTrees && !c.areaAcres);
    if (emptyCategories.length > 0) {
      warnings.push(
        `${emptyCategories.length} vegetation category/categories have no count or area data`
      );
    }
  }

  let score = 0;
  if ((data.roads?.segments ?? []).length > 0) score += 30;
  if (
    (
      (data.vegetation?.categories as Array<{ numberOfTrees?: number; areaAcres?: number }>) ?? []
    ).some((c) => c.numberOfTrees || c.areaAcres)
  )
    score += 30;
  if ((data.waterBodies?.waterBodies ?? []).length > 0) score += 20;
  if (warnings.length === 0) score += 20;

  return { warnings, estimatedFields: [], completenessScore: Math.min(score, 100) };
}

// Submit campus record for review
export async function submitCampusRecord(userId: string): Promise<ICampusRecordDocument> {
  const record = await CampusRecord.findOne({ campusId: CAMPUS_ID });
  if (!record) throw new AppError('Campus record not found', 404);

  const { completenessScore } = await validateCampusRecord();
  if (completenessScore < 20) {
    throw new AppError('Please enter at least some road or vegetation data before submitting', 400);
  }

  const estimatedFields: string[] = [];
  const carbonResults = calculateCampusCarbon(
    record.data as unknown as ICampusData,
    estimatedFields
  );

  record.carbonResults = carbonResults as unknown as typeof record.carbonResults;
  record.estimatedFields = estimatedFields;
  record.confidenceScore = carbonResults.confidenceScore;
  record.status = 'submitted';
  record.submittedBy = new mongoose.Types.ObjectId(userId) as unknown as mongoose.Types.ObjectId;
  record.submittedAt = new Date();

  await record.save();
  await invalidateCampusCache();
  return record;
}

// Approve campus record
export async function approveCampusRecord(reviewerId: string): Promise<ICampusRecordDocument> {
  const record = await CampusRecord.findOne({ campusId: CAMPUS_ID });
  if (!record) throw new AppError('Campus record not found', 404);
  if (record.status !== 'submitted')
    throw new AppError('Record must be submitted before approval', 400);

  record.status = 'verified';
  record.reviewedBy = new mongoose.Types.ObjectId(reviewerId) as unknown as mongoose.Types.ObjectId;
  record.reviewedAt = new Date();
  await record.save();
  await invalidateCampusCache();
  return record;
}

// Request revision
export async function requestCampusRevision(
  reviewerId: string,
  notes: string
): Promise<ICampusRecordDocument> {
  const record = await CampusRecord.findOne({ campusId: CAMPUS_ID });
  if (!record) throw new AppError('Campus record not found', 404);

  record.status = 'revision_requested';
  record.reviewNotes = notes;
  record.reviewedBy = new mongoose.Types.ObjectId(reviewerId) as unknown as mongoose.Types.ObjectId;
  record.reviewedAt = new Date();
  await record.save();
  return record;
}

// Start a new version when verified record needs updating
export async function startNewCampusVersion(userId: string): Promise<ICampusRecordDocument> {
  const existing = await CampusRecord.findOne({ campusId: CAMPUS_ID });
  if (!existing || existing.status !== 'verified') {
    throw new AppError('No verified campus record to update', 400);
  }

  const archiveId = `${CAMPUS_ID}-v${existing.version}-${Date.now()}`;
  const archiveData = existing.toObject();
  await CampusRecord.create({
    ...archiveData,
    _id: new mongoose.Types.ObjectId(),
    campusId: archiveId,
  });

  existing.previousVersionId = existing._id as mongoose.Types.ObjectId;
  existing.version += 1;
  existing.status = 'draft';
  existing.submittedBy = new mongoose.Types.ObjectId(userId) as unknown as mongoose.Types.ObjectId;
  existing.submittedAt = undefined as unknown as Date;
  existing.reviewedBy = undefined as unknown as mongoose.Types.ObjectId;
  existing.reviewedAt = undefined as unknown as Date;
  existing.reviewNotes = undefined;
  await existing.save();
  return existing;
}

// Get campus record (public view)
export async function getCampusRecord() {
  return CampusRecord.findOne({ campusId: CAMPUS_ID })
    .populate('submittedBy', 'name email')
    .populate('reviewedBy', 'name email');
}

async function invalidateCampusCache() {
  if (!redisClient) return;
  await Promise.all([
    redisClient.del('campus:record').catch(() => undefined),
    redisClient.del('dashboard:public-stats').catch(() => undefined),
    redisClient.del('analytics:domain-breakdown').catch(() => undefined),
  ]);
}
