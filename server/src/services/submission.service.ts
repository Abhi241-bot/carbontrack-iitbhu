import mongoose from 'mongoose';
import merge from 'lodash/merge';
import { Building } from '../models/Building.model';
import { Submission } from '../models/Submission.model';
import { AuditLog } from '../models/AuditLog.model';
import {
  SectionType,
  DataLifecycle,
  IBuildingOverview,
  ICivilSectionData,
  IElectricalSectionData,
  IWasteSectionData,
  ICarbonResults,
  SolidWasteDisposalMethod,
} from '@shared/types/submission.types';
import { UserRole } from '@shared/types/user.types';
import { loadEmissionFactors } from '../engine';
import { calculateEmbodiedCarbon } from '../engine/embodied';
import { calculateOperationalCarbon } from '../engine/operational';
import { calculateWasteCarbon } from '../engine/waste';
import { buildEngineInput } from '../engine/adapter';
import { invalidateAnalyticsCache } from './analytics.service';
import User from '../models/User.model';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLACEHOLDER_USER_ID = '000000000000000000000001';

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

function makeError(msg: string, code: string): Error {
  const err = new Error(msg);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function lifecycleFor(section: SectionType | 'overview'): DataLifecycle {
  return section === 'civil' || section === 'overview' ? 'static' : 'dynamic';
}

// ── getOrCreateDraft ──────────────────────────────────────────────────────────

export async function getOrCreateDraft(
  buildingId: string,
  section: SectionType | 'overview',
  userId: string
) {
  const building = await Building.findById(buildingId);
  if (!building) throw makeError('Building not found', '404');

  const uid = toObjectId(userId || PLACEHOLDER_USER_ID);
  const bid = toObjectId(buildingId);

  // Find existing draft for this user+building+section
  const existing = await Submission.findOne({
    buildingId: bid,
    submittedBy: uid,
    section,
    status: 'draft',
  }).sort({ updatedAt: -1 });

  if (existing) return existing;

  const user = await User.findById(userId).lean();
  if (user?.role === UserRole.VIEWER) {
    throw makeError('Viewers are not authorized to create submissions', '403');
  }

  // Create a new draft
  const lifecycle = lifecycleFor(section);
  const submission = await Submission.create({
    buildingId: bid,
    submittedBy: uid,
    section,
    lifecycle,
    entryMode: 'cumulative',
    status: 'draft',
    version: 1,
    data: {},
    estimatedFields: [],
    confidenceScore: 0,
  });

  return submission;
}

// ── updateSectionDraft ────────────────────────────────────────────────────────

export async function updateSectionDraft(
  submissionId: string,
  userId: string,
  data: Record<string, unknown>,
  entryMode?: 'cumulative' | 'room_level'
) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw makeError('Submission not found', '404');

  // Authorization: must be submitter, or admin/reviewer
  const user = await User.findById(userId).lean();
  if (user?.role === UserRole.VIEWER) {
    throw makeError('Viewers are not authorized to update submissions', '403');
  }

  const isPrivileged = user?.role === UserRole.ADMIN || user?.role === UserRole.REVIEWER;
  if (submission.submittedBy.toString() !== userId && !isPrivileged) {
    throw makeError('Not authorized to edit this submission', '403');
  }

  if (submission.status !== 'draft') {
    throw makeError('Cannot update — submission is not in draft status', '400');
  }

  // Lock check for static sections
  if (submission.lifecycle === 'static' && !isPrivileged) {
    const building = await Building.findById(submission.buildingId).lean();
    if (building) {
      const field = `${submission.section}Status`;
      const buildingAny = building as Record<string, unknown>;
      if (buildingAny[field] === 'verified') {
        throw makeError('This section is locked after approval. Contact admin.', '403');
      }
    }
  }

  // Deep-merge incoming data
  const existingData = (submission.data as Record<string, unknown>) ?? {};
  submission.data = merge({}, existingData, data);
  submission.markModified('data');

  if (entryMode) submission.entryMode = entryMode;

  await submission.save();
  return submission;
}

// ── getLatestSectionSubmission ────────────────────────────────────────────────

export async function getLatestSectionSubmission(
  buildingId: string,
  section: SectionType | 'overview',
  statusFilter?: string[]
) {
  const query: Record<string, unknown> = {
    buildingId: toObjectId(buildingId),
    section,
  };
  if (statusFilter?.length) {
    query.status = { $in: statusFilter };
  }

  return Submission.findOne(query).sort({ version: -1, updatedAt: -1 });
}

// ── getAllSectionSubmissions ───────────────────────────────────────────────────

export async function getAllSectionSubmissions(
  buildingId: string,
  section: SectionType | 'overview'
) {
  return Submission.find({ buildingId: toObjectId(buildingId), section })
    .sort({ version: -1 })
    .populate('submittedBy', 'name email')
    .populate('reviewedBy', 'name');
}

// ── validateSection ───────────────────────────────────────────────────────────

export async function validateSection(submissionId: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw makeError('Submission not found', '404');

  const data = submission.data as Record<string, unknown> | null;
  const warnings: string[] = [];
  const estimatedFields: string[] = [];
  let completenessScore = 0;

  const section = submission.section;

  if (section === 'civil') {
    const structure = data?.structure as Record<string, unknown> | undefined;
    const materials = data?.materials as Record<string, unknown> | undefined;

    const entryMode = structure?.entryMode as string | undefined;
    const rooms = structure?.rooms as unknown[] | undefined;
    const totalRooms = structure?.totalRooms as number | undefined;

    if (entryMode === 'room_level' && (!rooms || rooms.length === 0)) {
      warnings.push('Room-level mode selected but no rooms entered');
    }
    if (entryMode === 'cumulative' && (totalRooms === 0 || totalRooms === undefined)) {
      warnings.push('Total rooms is 0 — enter at least a count in cumulative mode');
    }

    // Completeness
    if ((rooms && rooms.length > 0) || (totalRooms && totalRooms > 0)) {
      completenessScore += 30;
    }
    if (materials?.estimationMode) {
      completenessScore += 20;
    }
    if (warnings.length === 0) completenessScore += 50;
  } else if (section === 'electrical') {
    const energy = data?.energy as Record<string, unknown> | undefined;
    const appliances = data?.appliances as Record<string, unknown> | undefined;
    const appList = appliances?.appliances as unknown[] | undefined;

    const entryMode = appliances?.entryMode as string | undefined;
    const primarySource = energy?.primarySource as string | undefined;
    const monthlyKwh = energy?.monthlyConsumptionKwh as number | undefined;
    const isEstimated = energy?.isEstimated as boolean | undefined;

    if (!primarySource) {
      warnings.push('Energy source not selected');
      estimatedFields.push('energy.primarySource');
    }
    if ((!appList || appList.length === 0) && entryMode !== 'room_level') {
      warnings.push('No appliances entered for cumulative mode');
    }
    if (!monthlyKwh && isEstimated === false) {
      warnings.push('Monthly consumption not provided and not marked as estimated');
      estimatedFields.push('energy.monthlyConsumptionKwh');
    }
    if (!monthlyKwh) estimatedFields.push('energy.monthlyConsumptionKwh');

    // Completeness
    if (primarySource) completenessScore += 30;
    if (appList && appList.length > 0) completenessScore += 20;
    if (warnings.length === 0) completenessScore += 50;
  } else if (section === 'waste') {
    const wasteData = data as Record<string, unknown> | undefined;
    const streams = wasteData?.wasteStreams as
      | Array<{ fractionPercent: number; disposalMethod: string }>
      | undefined;
    const hasData = wasteData?.hasWasteData as boolean | undefined;
    const treatmentType = wasteData?.wastewaterTreatmentType as string | undefined;

    if (!streams || streams.length === 0) {
      warnings.push('No waste streams defined');
    } else {
      const total = streams.reduce((sum, s) => sum + (s.fractionPercent ?? 0), 0);
      if (Math.abs(total - 100) > 1) {
        warnings.push(`Waste stream fractions sum to ${total.toFixed(0)}% — must equal 100%`);
      }
      const hasBurning = streams.some(
        (s) => s.disposalMethod === SolidWasteDisposalMethod.OPEN_BURNING && s.fractionPercent > 0
      );
      if (hasBurning) {
        warnings.push('[HIGH SEVERITY] Open burning detected — this method has high carbon impact');
      }
    }
    if (!hasData) {
      warnings.push('Waste step was skipped — defaults will be used for carbon calculation');
    }

    // Completeness
    if (streams && streams.length > 0) {
      const total = streams.reduce((sum, s) => sum + (s.fractionPercent ?? 0), 0);
      if (Math.abs(total - 100) <= 1) completenessScore += 40;
    }
    if (treatmentType) completenessScore += 20;
    if (warnings.length === 0) completenessScore += 40;
  } else if (section === 'overview') {
    // Overview validation: just check required fields
    const overview = data as Record<string, unknown> | undefined;
    if (!overview?.buildingName) warnings.push('Building name is required');
    if (!overview?.buildingType) warnings.push('Building type is required');
    if (!overview?.numberOfFloors) warnings.push('Number of floors is required');
    if (!overview?.operatingHoursPerDay) warnings.push('Operating hours per day is required');
    if (!overview?.operatingDaysPerWeek) warnings.push('Operating days per week is required');

    completenessScore = warnings.length === 0 ? 100 : Math.max(0, 100 - warnings.length * 20);
  }

  return { warnings, estimatedFields, completenessScore };
}

// ── submitSection ─────────────────────────────────────────────────────────────

export async function submitSection(submissionId: string, userId: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw makeError('Submission not found', '404');

  if (submission.status !== 'draft') {
    throw makeError('Cannot submit — submission is not in draft status', '400');
  }

  const { completenessScore } = await validateSection(submissionId);
  if (completenessScore < 20) {
    throw makeError('Please fill in at least basic data before submitting', '400');
  }

  const buildingId = submission.buildingId.toString();
  const section = submission.section;
  const sectionData = submission.data as Record<string, unknown>;

  // Load building and overview for context
  const building = await Building.findById(buildingId);
  if (!building) throw makeError('Building not found', '404');

  const overviewSubmission = await getLatestSectionSubmission(buildingId, 'overview', ['verified']);
  const overviewData = (overviewSubmission?.data ?? {
    buildingName: building.name,
    buildingType: building.type,
    numberOfFloors: building.floors,
    operatingHoursPerDay: 10,
    operatingDaysPerWeek: 6,
    peakMonths: [],
    acUsageMonths: [],
    occupancyDuringBreaks: 'partial',
  }) as IBuildingOverview;

  const factors = await loadEmissionFactors();
  const estimatedFields: string[] = [];

  if (section === 'civil') {
    const civilData = sectionData as unknown as ICivilSectionData;
    const engineInput = buildEngineInput(overviewData, civilData, undefined, undefined);
    const result = calculateEmbodiedCarbon(engineInput, factors, estimatedFields);
    submission.carbonResults = {
      embodiedCarbon: result.total,
      breakdown: result.breakdown,
    };
  } else if (section === 'electrical') {
    const electricalData = sectionData as unknown as IElectricalSectionData;
    const engineInput = buildEngineInput(overviewData, undefined, electricalData, undefined);
    const result = calculateOperationalCarbon(engineInput, factors, estimatedFields);
    submission.carbonResults = {
      operationalCarbonPerYear: result.total,
      breakdown: { byScope: { scope1: result.scope1, scope2: result.scope2, scope3: 0 } },
    };
  } else if (section === 'waste') {
    const wasteSection = sectionData as unknown as IWasteSectionData;
    const engineInput = buildEngineInput(overviewData, undefined, undefined, wasteSection);
    const usageForEngine = {
      operatingHoursPerDay: overviewData.operatingHoursPerDay ?? 10,
      operatingDaysPerWeek: overviewData.operatingDaysPerWeek ?? 6,
    };
    const result = calculateWasteCarbon(
      engineInput.waste as Parameters<typeof calculateWasteCarbon>[0],
      usageForEngine,
      building.type,
      factors,
      estimatedFields
    );
    submission.carbonResults = {
      wasteCarbonPerYear: result.total,
      breakdown: result.breakdown,
    };
  }
  submission.estimatedFields = estimatedFields;
  submission.confidenceScore = Math.max(0, 100 - estimatedFields.length * 10);
  submission.status = 'submitted';
  await submission.save();

  // Update building section status
  await Building.findByIdAndUpdate(buildingId, {
    [`${section}Status`]: 'submitted',
    [`${section}SubmissionId`]: submission._id,
  });

  try {
    await invalidateAnalyticsCache();
  } catch {
    /* Redis unavailable — not fatal */
  }

  return submission;
}

// ── approveSection ────────────────────────────────────────────────────────────

export async function approveSection(submissionId: string, reviewerId: string, notes?: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw makeError('Submission not found', '404');

  if (submission.status !== 'submitted' && submission.status !== 'verified') {
    throw makeError('Only submitted sections can be approved', '400');
  }

  // If already verified (e.g. approved via admin panel without building sync),
  // skip re-saving the submission but still sync the building status below.
  const alreadyVerified = submission.status === 'verified';

  if (!alreadyVerified) {
    submission.status = 'verified';
    submission.reviewedBy = toObjectId(reviewerId);
    submission.reviewedAt = new Date();
    if (notes) submission.reviewNotes = notes;
    await submission.save();
  }

  const section = submission.section;
  const lifecycle = submission.lifecycle;
  const buildingId = submission.buildingId.toString();

  const buildingUpdate: Record<string, unknown> = {
    [`${section}Status`]: 'verified',
    [`${section}SubmissionId`]: submission._id,
  };
  // For dynamic sections, increment the version counter on the building
  if (lifecycle === 'dynamic') {
    buildingUpdate[`${section}Version`] = submission.version;
  }
  await Building.findByIdAndUpdate(buildingId, buildingUpdate);

  // ── Sync civil section research-format fields onto the Building document ──
  if (section === 'civil') {
    const sub = await Submission.findById(submissionId).lean();
    if (sub?.data) {
      const overview =
        ((sub.data as Record<string, unknown>).overview as Record<string, unknown>) ?? {};
      const dims =
        ((sub.data as Record<string, unknown>).dimensions as Record<string, unknown>) ?? {};
      const roof = ((sub.data as Record<string, unknown>).roof as Record<string, unknown>) ?? {};
      const constr =
        ((sub.data as Record<string, unknown>).construction as Record<string, unknown>) ?? {};
      const elements =
        ((((sub.data as Record<string, unknown>).openings as Record<string, unknown>) ?? {})
          .elements as Record<string, unknown>[]) ?? [];

      const civilUpdate: Record<string, unknown> = {};

      const overviewFields = [
        'usagesOfBuilding',
        'frequencyOfUsagePerDay',
        'numberOfBuildings',
        'numberOfOccupantsPerBuilding',
        'areaOfOneBuildingSqFt',
        'ventilationType',
        'buildingNature',
        'orientationNorthPct',
        'orientationEastPct',
        'orientationSouthPct',
        'orientationWestPct',
        'landUseOpenPlayAreaAcres',
        'landUseGreenPermeableAcres',
        'landUsePavedAcres',
        'landUseCoveredBuiltUpAcres',
        'landUseCustomCategories',
        'remarks',
        'totalFloorArea',
        'yearBuilt',
        'primaryPurpose',
        'operatingHoursPerDay',
        'operatingDaysPerWeek',
        'averageDailyOccupants',
      ];
      for (const f of overviewFields) {
        if (overview[f] !== undefined) civilUpdate[f] = overview[f];
      }

      const dimFields = [
        'wallThicknessMm',
        'internalPartitionMm',
        'slabThicknessMm',
        'beamSize',
        'columnSize',
        'numberOfRooms',
        'numberOfWindows',
        'clearRoomHeightFt',
      ];
      for (const f of dimFields) {
        if (dims[f] !== undefined) civilUpdate[f] = dims[f];
      }

      if (roof.roofMaterials) civilUpdate.roofMaterials = roof.roofMaterials;
      if (roof.roofThicknessMm) civilUpdate.roofThicknessMm = roof.roofThicknessMm;

      const constrFields = [
        'constructionType',
        'constructionTypeOther',
        'localConstructionPractices',
        'materialSourceDistance',
        'localMaterialsPercent',
        'insulationMaterial',
        'scrapMaterialsUsed',
        'reusePolicy',
      ];
      for (const f of constrFields) {
        if (constr[f] !== undefined) civilUpdate[f] = constr[f];
      }

      civilUpdate.openingSummary = {
        totalWindows: elements.filter((e) => e.elementType === 'window').length,
        totalDoors: elements.filter((e) => e.elementType === 'door').length,
        totalClerestoryWindows: elements.filter((e) => e.elementType === 'clerestory_window')
          .length,
        totalSunshades: elements.filter((e) => e.elementType === 'sunshade_chajja').length,
      };

      if (Object.keys(civilUpdate).length > 0) {
        await Building.findByIdAndUpdate(buildingId, civilUpdate);
      }
    }
  }

  // Check if all four sections are now verified → compute combined carbon
  const building = await Building.findById(buildingId);
  if (
    building &&
    building.overviewStatus === 'verified' &&
    building.civilStatus === 'verified' &&
    building.electricalStatus === 'verified' &&
    building.wasteStatus === 'verified'
  ) {
    try {
      const combined = await calculateCombinedCarbon(buildingId);
      await Building.findByIdAndUpdate(buildingId, {
        combinedCarbonResults: combined,
        lastCarbonCalculatedAt: new Date(),
      });
    } catch (err) {
      // Combined calc failure is non-fatal — sections are still approved
      console.error('[approveSection] combined carbon calculation failed:', err);
    }
  }

  try {
    await invalidateAnalyticsCache();
  } catch {
    /* Redis unavailable */
  }

  return submission;
}

// ── requestRevision ───────────────────────────────────────────────────────────

export async function requestRevision(submissionId: string, reviewerId: string, notes: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw makeError('Submission not found', '404');

  if (submission.status !== 'submitted') {
    throw makeError('Only submitted sections can have revision requested', '400');
  }

  submission.status = 'revision_requested';
  submission.reviewNotes = notes;
  submission.reviewedBy = toObjectId(reviewerId);
  submission.reviewedAt = new Date();
  await submission.save();

  await Building.findByIdAndUpdate(submission.buildingId, {
    [`${submission.section}Status`]: 'revision_requested',
  });

  return submission;
}

// ── startNewVersion ───────────────────────────────────────────────────────────

export async function startNewVersion(
  buildingId: string,
  section: SectionType | 'overview',
  userId: string
) {
  const lifecycle = lifecycleFor(section);

  // Static sections cannot be re-entered without admin unlock
  if (lifecycle === 'static') {
    throw makeError('Static sections can only be updated by admin', '403');
  }

  const current = await getLatestSectionSubmission(buildingId, section, ['verified']);
  if (!current) {
    throw makeError('No verified submission found for this section', '404');
  }

  const newDraft = await Submission.create({
    buildingId: toObjectId(buildingId),
    submittedBy: toObjectId(userId || PLACEHOLDER_USER_ID),
    section,
    lifecycle,
    entryMode: current.entryMode,
    status: 'draft',
    version: current.version + 1,
    previousVersionId: current._id,
    data: JSON.parse(JSON.stringify(current.data)), // deep copy
    estimatedFields: [],
    confidenceScore: 0,
  });

  await Building.findByIdAndUpdate(buildingId, {
    [`${section}Status`]: 'draft',
  });

  return newDraft;
}

// ── unlockStaticSection ───────────────────────────────────────────────────────

export async function unlockStaticSection(
  buildingId: string,
  section: SectionType | 'overview',
  adminId: string,
  reason: string
) {
  // Verify admin role
  const admin = await User.findById(adminId).lean();
  if (!admin || admin.role !== UserRole.ADMIN) {
    throw makeError('Only admins can unlock static sections', '403');
  }

  const current = await getLatestSectionSubmission(buildingId, section, ['verified']);
  if (!current) {
    throw makeError('No verified submission found to unlock', '404');
  }

  const newDraft = await Submission.create({
    buildingId: toObjectId(buildingId),
    submittedBy: toObjectId(adminId),
    section,
    lifecycle: lifecycleFor(section),
    entryMode: current.entryMode,
    status: 'draft',
    version: current.version + 1,
    previousVersionId: current._id,
    data: JSON.parse(JSON.stringify(current.data)),
    estimatedFields: [],
    confidenceScore: 0,
  });

  await Building.findByIdAndUpdate(buildingId, {
    [`${section}Status`]: 'draft',
  });

  await AuditLog.create({
    action: 'section.unlock',
    entityType: 'Submission',
    entityId: newDraft._id,
    performedBy: adminId,
    changes: { section, reason, adminId },
  });

  return newDraft;
}

// ── calculateCombinedCarbon ───────────────────────────────────────────────────

export async function calculateCombinedCarbon(buildingId: string): Promise<ICarbonResults> {
  const [overviewSub, civilSub, electricalSub, wasteSub, building] = await Promise.all([
    getLatestSectionSubmission(buildingId, 'overview', ['verified']),
    getLatestSectionSubmission(buildingId, 'civil', ['verified']),
    getLatestSectionSubmission(buildingId, 'electrical', ['verified']),
    getLatestSectionSubmission(buildingId, 'waste', ['verified']),
    Building.findById(buildingId),
  ]);

  if (!building) throw makeError('Building not found', '404');

  const overviewData: IBuildingOverview = (overviewSub?.data ?? {
    buildingName: building.name,
    buildingType: building.type,
    numberOfFloors: building.floors,
    operatingHoursPerDay: 10,
    operatingDaysPerWeek: 6,
    peakMonths: [],
    acUsageMonths: [],
    occupancyDuringBreaks: 'partial',
  }) as IBuildingOverview;

  const civilData = civilSub?.data as ICivilSectionData | undefined;
  const electricalData = electricalSub?.data as IElectricalSectionData | undefined;
  const wasteData = wasteSub?.data as IWasteSectionData | undefined;

  const engineInput = buildEngineInput(overviewData, civilData, electricalData, wasteData);
  const factors = await loadEmissionFactors();
  const estimatedFields: string[] = [];

  const embodied = calculateEmbodiedCarbon(engineInput, factors, estimatedFields);
  const operational = calculateOperationalCarbon(engineInput, factors, estimatedFields);
  const waste = calculateWasteCarbon(
    engineInput.waste as Parameters<typeof calculateWasteCarbon>[0],
    engineInput.usage,
    building.type,
    factors,
    estimatedFields
  );

  const totalLifecycle = embodied.total + operational.total * 50 + waste.total * 50;

  return {
    embodiedCarbon: parseFloat(embodied.total.toFixed(3)),
    operationalCarbonPerYear: parseFloat(operational.total.toFixed(3)),
    wasteCarbonPerYear: parseFloat(waste.total.toFixed(3)),
    transportCarbonPerYear: 0,
    totalLifecycle: parseFloat(totalLifecycle.toFixed(3)),
    breakdown: {
      byScope: {
        scope1: parseFloat(operational.scope1.toFixed(3)),
        scope2: parseFloat(operational.scope2.toFixed(3)),
        scope3: parseFloat((embodied.total + waste.total).toFixed(3)),
      },
      byCategory: {
        energy: parseFloat(operational.total.toFixed(3)),
        materials: parseFloat(embodied.total.toFixed(3)),
        transport: 0,
        waste: parseFloat(waste.total.toFixed(3)),
        solidWaste: parseFloat(waste.solidWasteCO2ePerYear.toFixed(3)),
        liquidWaste: parseFloat(waste.liquidWasteCO2ePerYear.toFixed(3)),
        evCharging: 0,
        vehicleDiesel: 0,
        vehicleKerosene: 0,
      },
    },
    estimatedFields,
    confidenceScore: Math.max(0, 100 - estimatedFields.length * 10),
    computedAt: new Date(),
    sectionVersions: {
      civil: civilSub?.version,
      electrical: electricalSub?.version,
      waste: wasteSub?.version,
    },
  };
}

// ── getSectionSummary ─────────────────────────────────────────────────────────

export async function getSectionSummary(buildingId: string, requestingUserId?: string) {
  const building = await Building.findById(buildingId);
  if (!building) throw makeError('Building not found', '404');

  const isAssigned = requestingUserId
    ? building.assignedMembers.some((m) => m.toString() === requestingUserId)
    : false;

  const sections = ['overview', 'civil', 'electrical', 'waste'] as const;

  const summary: Record<string, unknown> = {};

  for (const section of sections) {
    const statusField = `${section}Status` as keyof typeof building;
    const submissionIdField = `${section}SubmissionId` as keyof typeof building;
    const versionField = `${section}Version` as keyof typeof building;

    let status = (building[statusField] as string) ?? 'not_started';
    const submissionId = building[submissionIdField] as mongoose.Types.ObjectId | undefined;
    const isDynamic = section === 'electrical' || section === 'waste';

    let submittedBy: unknown = null;
    let verifiedAt: Date | undefined;
    let updatedAt: Date | undefined;
    let reviewNotes: string | null = null;
    let actualSubmissionId: string | null = null;
    let version = isDynamic ? ((building[versionField] as number) ?? 0) : undefined;

    // Primary lookup: use the building's stored submissionId pointer.
    // Fallback: if the pointer is missing or the submission is gone, look up
    // the latest verified/submitted submission directly — this recovers stale
    // building documents that were never back-filled after admin approval.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sub: Record<string, any> | null = null;
    if (submissionId) {
      sub = await Submission.findById(submissionId).populate('submittedBy', 'name email').lean();
    }
    if (!sub) {
      sub = await Submission.findOne({
        buildingId: toObjectId(buildingId),
        section,
        status: { $in: ['verified', 'submitted'] },
      })
        .sort({ version: -1, updatedAt: -1 })
        .populate('submittedBy', 'name email')
        .lean();
    }

    if (sub) {
      submittedBy = sub.submittedBy;
      verifiedAt = sub.reviewedAt as Date | undefined;
      version = sub.version as number | undefined;
      reviewNotes = (sub.reviewNotes as string) ?? null;
      actualSubmissionId = (sub._id as mongoose.Types.ObjectId).toString();
      updatedAt = sub.updatedAt as Date | undefined;
      // Sync status from actual submission if building doc is stale
      const subStatus = sub.status as string;
      if ((subStatus === 'verified' || subStatus === 'submitted') && status !== subStatus) {
        status = subStatus;
        // Back-fill the building document so future reads are fast
        await Building.findByIdAndUpdate(buildingId, {
          [statusField]: subStatus,
          [submissionIdField]: sub._id,
        });
      }
    }

    summary[section] = {
      status,
      version: version ?? 0,
      submittedBy,
      submissionId: actualSubmissionId,
      reviewNotes,
      ...(verifiedAt ? { verifiedAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      // canUpdate: dynamic sections only, when verified, and requestor is assigned
      ...(isDynamic ? { canUpdate: status === 'verified' && isAssigned } : {}),
    };
  }

  return summary;
}

// ── discardDraft ──────────────────────────────────────────────────────────────

export async function discardDraft(submissionId: string, userId: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw makeError('Submission not found', '404');

  if (submission.status !== 'draft') {
    throw makeError('Can only discard draft submissions', '400');
  }

  // Authorization
  const user = await User.findById(userId).lean();
  const isPrivileged = user?.role === UserRole.ADMIN || user?.role === UserRole.REVIEWER;
  if (submission.submittedBy.toString() !== userId && !isPrivileged) {
    throw makeError('Not authorized to discard this draft', '403');
  }

  const buildingId = submission.buildingId.toString();
  const section = submission.section;

  await submission.deleteOne();

  // Find the most recent non-draft submission for this section to restore building status
  const previous = await Submission.findOne({
    buildingId: toObjectId(buildingId),
    section,
    status: { $ne: 'draft' },
  }).sort({ version: -1, updatedAt: -1 });

  if (previous) {
    await Building.findByIdAndUpdate(buildingId, {
      [`${section}Status`]: previous.status,
      [`${section}SubmissionId`]: previous._id,
    });
  } else {
    await Building.findByIdAndUpdate(buildingId, {
      [`${section}Status`]: 'not_started',
      [`${section}SubmissionId`]: null,
    });
  }

  return { discarded: true };
}

// ── withdrawSubmission ────────────────────────────────────────────────────────
// Revert a submitted (awaiting review) submission back to draft state.

export async function withdrawSubmission(submissionId: string, userId: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw makeError('Submission not found', '404');

  if (submission.status !== 'submitted') {
    throw makeError('Can only withdraw submitted (awaiting review) submissions', '400');
  }

  const user = await User.findById(userId).lean();
  const isPrivileged = user?.role === UserRole.ADMIN || user?.role === UserRole.REVIEWER;
  if (submission.submittedBy.toString() !== userId && !isPrivileged) {
    throw makeError('Not authorized to withdraw this submission', '403');
  }

  submission.status = 'draft';
  await submission.save();

  // Update building section status back to draft
  const buildingId = submission.buildingId.toString();
  const section = submission.section;
  await Building.findByIdAndUpdate(buildingId, {
    [`${section}Status`]: 'draft',
  });

  return submission;
}

// ── getResults ────────────────────────────────────────────────────────────────

export async function getResults(submissionId: string) {
  return Submission.findById(submissionId).populate('buildingId', 'name type totalArea floors');
}

export async function getBuildingResults(buildingId: string) {
  const building = await Building.findById(buildingId).lean();
  if (!building) throw makeError('Building not found', '404');
  return {
    combinedCarbonResults: (building as Record<string, unknown>).combinedCarbonResults ?? null,
    lastCarbonCalculatedAt: (building as Record<string, unknown>).lastCarbonCalculatedAt ?? null,
    overallStatus: (building as Record<string, unknown>).overallStatus,
  };
}

export async function getSectionResults(buildingId: string, section: string) {
  const latest = await getLatestSectionSubmission(buildingId, section as SectionType, [
    'verified',
    'submitted',
  ]);
  if (!latest) throw makeError('No results found for this section', '404');
  return {
    section,
    carbonResults: latest.carbonResults,
    version: latest.version,
    status: latest.status,
    confidenceScore: latest.confidenceScore,
  };
}

// ── getCarbonSummary ──────────────────────────────────────────────────────────

export async function getCarbonSummary(buildingId: string) {
  const building = await Building.findById(buildingId).lean();
  if (!building) throw makeError('Building not found', '404');

  const sections = ['civil', 'electrical', 'waste'] as const;
  const sectionResults: Record<string, unknown> = {};

  let latestAt: Date | null = null;
  let efSnapshot: unknown = null;
  let totalEmbodied = 0;
  let totalEmbodiedPerYear = 0;
  let totalOperational = 0;
  let totalWaste = 0;
  let scope1 = 0,
    scope2 = 0,
    scope3 = 0;
  let confidenceSum = 0,
    confidenceCount = 0;
  let hasAnyVerified = false;

  // Merge byComponent across sections
  const mergedByComponent: Record<string, number> = {};

  for (const section of sections) {
    const sub = await Submission.findOne({
      buildingId: toObjectId(buildingId),
      section,
      status: 'verified',
    })
      .sort({ version: -1 })
      .lean();

    if (!sub?.carbonResults) {
      sectionResults[section] = null;
      continue;
    }

    hasAnyVerified = true;
    const cr = sub.carbonResults as Record<string, unknown>;
    const bd = cr.breakdown as Record<string, unknown> | undefined;
    const byScope = bd?.byScope as Record<string, number> | undefined;
    const byComponent = bd?.byComponent as Record<string, number> | undefined;

    // Merge byComponent into aggregate
    if (byComponent) {
      for (const [key, val] of Object.entries(byComponent)) {
        if (typeof val === 'number') {
          mergedByComponent[key] = (mergedByComponent[key] ?? 0) + val;
        }
      }
    }

    sectionResults[section] = {
      status: sub.status,
      version: sub.version,
      verifiedAt: sub.verifiedAt,
      embodiedCarbon: (cr.embodiedCarbon as number) ?? 0,
      embodiedCarbonPerYear: (cr.embodiedCarbonPerYear as number) ?? 0,
      operationalCarbonPerYear: (cr.operationalCarbonPerYear as number) ?? 0,
      wasteCarbonPerYear: (cr.wasteCarbonPerYear as number) ?? 0,
      carbonResults: cr,
      confidenceScore: typeof cr.confidenceScore === 'number' ? cr.confidenceScore : null,
    };

    totalEmbodied += (cr.embodiedCarbon as number) ?? 0;
    totalEmbodiedPerYear += (cr.embodiedCarbonPerYear as number) ?? 0;
    totalOperational += (cr.operationalCarbonPerYear as number) ?? 0;
    totalWaste += (cr.wasteCarbonPerYear as number) ?? 0;
    scope1 += byScope?.scope1 ?? 0;
    scope2 += byScope?.scope2 ?? 0;
    scope3 += byScope?.scope3 ?? 0;

    if (typeof cr.confidenceScore === 'number') {
      confidenceSum += cr.confidenceScore;
      confidenceCount++;
    }

    if (!efSnapshot && cr.efSnapshot) efSnapshot = cr.efSnapshot;

    const at = sub.verifiedAt ?? (sub as { updatedAt?: Date }).updatedAt;
    if (at && (!latestAt || at > latestAt)) latestAt = at;
  }

  return {
    buildingId,
    buildingName: (building as Record<string, unknown>).name as string,
    hasAnyVerified,
    totalAnnualCO2e: parseFloat((totalOperational + totalWaste + totalEmbodiedPerYear).toFixed(3)),
    totalEmbodiedCarbon: parseFloat(totalEmbodied.toFixed(3)),
    totalEmbodiedCarbonPerYear: parseFloat(totalEmbodiedPerYear.toFixed(3)),
    byScope: {
      scope1: parseFloat(scope1.toFixed(3)),
      scope2: parseFloat(scope2.toFixed(3)),
      scope3: parseFloat(scope3.toFixed(3)),
    },
    byComponent: Object.keys(mergedByComponent).length > 0 ? mergedByComponent : null,
    bySource: {
      embodied: parseFloat(totalEmbodied.toFixed(3)),
      embodiedPerYear: parseFloat(totalEmbodiedPerYear.toFixed(3)),
      operational: parseFloat(totalOperational.toFixed(3)),
      waste: parseFloat(totalWaste.toFixed(3)),
    },
    confidenceScore: confidenceCount > 0 ? Math.round(confidenceSum / confidenceCount) : null,
    efSnapshot,
    sections: sectionResults,
    lastCalculatedAt: latestAt,
  };
}
