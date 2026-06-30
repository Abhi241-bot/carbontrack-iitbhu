import mongoose from 'mongoose';
import User from '../models/User.model';
import { Building } from '../models/Building.model';
import { Submission, SubmissionStatus } from '../models/Submission.model';
import { EmissionFactor } from '../models/EmissionFactor.model';
import { AuditLog } from '../models/AuditLog.model';
import { UserRole } from '@shared/types/user.types';
import { AppError } from '../utils/AppError';
import { loadEmissionFactors, buildEfSnapshot, calculateCarbon } from '../engine';
import { buildEngineInput } from '../engine/adapter';
import {
  IBuildingOverview,
  ICivilSectionData,
  IElectricalSectionData,
  IWasteSectionData,
} from '@shared/types/submission.types';

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getAdminStats() {
  const [totalUsers, submissionsByStatus, buildingsWithoutMembers, recentLogs] = await Promise.all([
    User.countDocuments(),
    Submission.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Building.countDocuments({ isActive: true, assignedMembers: { $size: 0 } }),
    AuditLog.find().populate('performedBy', 'name email').sort({ timestamp: -1 }).limit(10).lean(),
  ]);

  const byStatus: Record<string, number> = {};
  for (const s of submissionsByStatus) {
    byStatus[s._id as string] = s.count as number;
  }

  return { totalUsers, submissionsByStatus: byStatus, buildingsWithoutMembers, recentLogs };
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(params: {
  search?: string;
  role?: string;
  page?: number;
  limit?: number;
}) {
  const { search, role, page = 1, limit = 20 } = params;
  const query: Record<string, unknown> = {};

  if (role) query.role = role;
  if (search) {
    query.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
  }

  const skip = (Math.max(1, page) - 1) * Math.min(100, limit);

  const [users, total] = await Promise.all([
    User.find(query)
      .select('name email role department createdAt assignedBuildings')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(100, limit))
      .lean(),
    User.countDocuments(query),
  ]);

  return { users, total };
}

export async function changeUserRole(userId: string, newRole: UserRole, adminId: string) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  // Cannot demote the last admin
  if (user.role === UserRole.ADMIN && newRole !== UserRole.ADMIN) {
    const adminCount = await User.countDocuments({ role: UserRole.ADMIN });
    if (adminCount <= 1) {
      throw new AppError('Cannot demote the last admin', 400);
    }
  }

  const previousRole = user.role;
  user.role = newRole;
  await user.save();

  await AuditLog.create({
    action: 'user.role_change',
    entityType: 'User',
    entityId: user._id,
    performedBy: adminId,
    changes: { previousRole, newRole },
  });

  return user;
}

// ── Audit Logs ───────────────────────────────────────────────────────────────

export async function getAuditLogs(params: { page?: number; limit?: number }) {
  const { page = 1, limit = 20 } = params;
  const skip = (Math.max(1, page) - 1) * Math.min(100, limit);

  const [logs, total] = await Promise.all([
    AuditLog.find()
      .populate('performedBy', 'name email')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Math.min(100, limit))
      .lean(),
    AuditLog.countDocuments(),
  ]);

  return { logs, total };
}

// ── Carbon Snapshot ───────────────────────────────────────────────────────────

/**
 * Loads the current active emission factors from the DB, re-runs the full
 * carbon calculation across all available sections for the building, and
 * returns the result together with the EF snapshot. Called on approval and
 * on explicit recalculation.
 */
export async function computeCarbonSnapshotForSubmission(submissionId: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw new AppError('Submission not found', 404);

  const building = await Building.findById(submission.buildingId);
  if (!building) throw new AppError('Building not found', 404);

  // Gather the latest verified (or submitted) data for all sections
  const [overviewSub, civilSub, electricalSub, wasteSub] = await Promise.all(
    (['overview', 'civil', 'electrical', 'waste'] as const).map((sec) =>
      Submission.findOne(
        { buildingId: building._id, section: sec, status: { $in: ['verified', 'submitted'] } },
        {},
        { sort: { version: -1 } }
      ).lean()
    )
  );

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

  // Load live EFs — snapshot timestamp is captured inside the loader
  const factors = await loadEmissionFactors();

  const result = await calculateCarbon(engineInput, factors);

  const efSnapshot = buildEfSnapshot(factors);

  return { carbonResults: result, efSnapshot, factors };
}

export async function recalculateVerifiedSubmission(submissionId: string, adminId: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw new AppError('Submission not found', 404);
  if (submission.status !== 'verified') {
    throw new AppError('Only verified submissions can be recalculated', 400);
  }

  const { carbonResults, efSnapshot } = await computeCarbonSnapshotForSubmission(submissionId);

  submission.set('carbonResults.embodiedCarbon', carbonResults.embodiedCarbon);
  submission.set('carbonResults.embodiedCarbonPerYear', carbonResults.embodiedCarbonPerYear);
  submission.set('carbonResults.operationalCarbonPerYear', carbonResults.operationalCarbonPerYear);
  submission.set('carbonResults.wasteCarbonPerYear', carbonResults.wasteCarbonPerYear);
  submission.set('carbonResults.breakdown', carbonResults.breakdown);
  submission.set('carbonResults.meta', carbonResults.meta);
  submission.set('carbonResults.dataSourceInfo', carbonResults.dataSourceInfo);
  submission.set('carbonResults.efSnapshot', efSnapshot);
  submission.set('carbonResults.calculatedAt', new Date());
  submission.reviewHistory.push({
    action: 'recalculated',
    adminId: new mongoose.Types.ObjectId(adminId),
    notes: `Recalculated with EF snapshot ${efSnapshot._snapshotTimestamp.toISOString()}`,
    timestamp: new Date(),
  });

  await submission.save();

  await AuditLog.create({
    action: 'submission.recalculate',
    entityType: 'Submission',
    entityId: submission._id,
    performedBy: adminId,
    changes: { efSnapshot },
  });

  return submission.carbonResults;
}

// ── Emission Factors ─────────────────────────────────────────────────────────

export async function getAllEmissionFactors() {
  return EmissionFactor.find({ isActive: true }).sort({ category: 1, name: 1 }).lean();
}

export async function updateEmissionFactorValue(id: string, value: number, adminId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid emission factor ID', 400);
  }

  const factor = await EmissionFactor.findById(id);
  if (!factor) throw new AppError('Emission factor not found', 404);

  const previousValue = factor.value;
  factor.value = value;
  await factor.save();

  await AuditLog.create({
    action: 'emission_factor.update',
    entityType: 'EmissionFactor',
    entityId: factor._id,
    performedBy: adminId,
    changes: { previousValue, newValue: value },
  });

  return factor;
}

export async function createEmissionFactor(
  data: {
    category: string;
    name: string;
    value: number;
    unit: string;
    scope: string;
    source?: string;
    year?: number;
    region?: string;
    subcategory?: string;
  },
  adminId: string
) {
  const existing = await EmissionFactor.findOne({ category: data.category, name: data.name });
  if (existing) {
    throw new AppError('An emission factor with this category and name already exists', 409);
  }

  const factor = await EmissionFactor.create({ ...data, isDefault: false, isActive: true });

  await AuditLog.create({
    action: 'emission_factor.create',
    entityType: 'EmissionFactor',
    entityId: factor._id,
    performedBy: adminId,
    changes: { created: data },
  });

  return factor;
}

export async function softDeleteEmissionFactor(id: string, adminId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid emission factor ID', 400);
  }

  const factor = await EmissionFactor.findById(id);
  if (!factor) throw new AppError('Emission factor not found', 404);

  factor.isActive = false;
  await factor.save();

  await AuditLog.create({
    action: 'emission_factor.delete',
    entityType: 'EmissionFactor',
    entityId: factor._id,
    performedBy: adminId,
    changes: { isActive: false },
  });

  return factor;
}

export async function setDefaultEmissionFactor(id: string, adminId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid emission factor ID', 400);
  }

  const factor = await EmissionFactor.findById(id);
  if (!factor) throw new AppError('Emission factor not found', 404);
  if (!factor.isActive) throw new AppError('Cannot set an inactive factor as default', 400);

  // Clear existing default for this category, then set new one
  await EmissionFactor.updateMany(
    { category: factor.category, _id: { $ne: factor._id } },
    { $set: { isDefault: false } }
  );
  factor.isDefault = true;
  await factor.save();

  await AuditLog.create({
    action: 'emission_factor.set_default',
    entityType: 'EmissionFactor',
    entityId: factor._id,
    performedBy: adminId,
    changes: { isDefault: true, category: factor.category },
  });

  return factor;
}

// ── Submissions (admin view) ──────────────────────────────────────────────────

export async function listSubmissionsAdmin(params: {
  status?: string;
  section?: string;
  page?: number;
  limit?: number;
}) {
  const { status, section, page = 1, limit = 20 } = params;
  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (section) query.section = section;

  const skip = (Math.max(1, page) - 1) * Math.min(100, limit);

  const [submissions, total] = await Promise.all([
    Submission.find(query)
      .populate('buildingId', 'name shortName')
      .populate('submittedBy', 'name email')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Math.min(100, limit))
      .lean(),
    Submission.countDocuments(query),
  ]);

  return { submissions, total };
}

export async function approveSubmissionAdmin(submissionId: string, adminId: string) {
  if (!mongoose.Types.ObjectId.isValid(submissionId)) {
    throw new AppError('Invalid submission ID', 400);
  }

  const submission = await Submission.findById(submissionId);
  if (!submission) throw new AppError('Submission not found', 404);
  if (submission.status !== SubmissionStatus.SUBMITTED) {
    throw new AppError('Only submitted submissions can be approved', 400);
  }

  submission.status = SubmissionStatus.VERIFIED;
  submission.reviewedBy = new mongoose.Types.ObjectId(adminId);
  await submission.save();

  // Update building submission status
  await Building.findByIdAndUpdate(submission.buildingId, {
    submissionStatus: SubmissionStatus.VERIFIED,
  });

  await AuditLog.create({
    action: 'submission.approve',
    entityType: 'Submission',
    entityId: submission._id,
    performedBy: adminId,
  });

  return submission;
}

export async function requestRevisionAdmin(submissionId: string, adminId: string, notes: string) {
  if (!mongoose.Types.ObjectId.isValid(submissionId)) {
    throw new AppError('Invalid submission ID', 400);
  }

  const submission = await Submission.findById(submissionId);
  if (!submission) throw new AppError('Submission not found', 404);
  if (submission.status !== SubmissionStatus.SUBMITTED) {
    throw new AppError('Only submitted submissions can have revision requested', 400);
  }

  submission.status = SubmissionStatus.REVISION_REQUESTED;
  submission.reviewNotes = notes;
  submission.reviewedBy = new mongoose.Types.ObjectId(adminId);
  await submission.save();

  await Building.findByIdAndUpdate(submission.buildingId, {
    submissionStatus: SubmissionStatus.REVISION_REQUESTED,
  });

  await AuditLog.create({
    action: 'submission.request_revision',
    entityType: 'Submission',
    entityId: submission._id,
    performedBy: adminId,
    changes: { notes },
  });

  return submission;
}
