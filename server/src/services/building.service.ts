import mongoose from 'mongoose';
import { Building } from '../models/Building.model';
import Campus from '../models/Campus.model';
import { AuditLog } from '../models/AuditLog.model';
import User from '../models/User.model';
import { AppError } from '../utils/AppError';

interface BuildingFilters {
  type?: string;
  status?: string;
  search?: string;
  campusSlug?: string;
  campusId?: string;
}

interface Pagination {
  page?: number;
  limit?: number;
}

export async function getAllBuildings(filters: BuildingFilters, pagination: Pagination) {
  const query: Record<string, unknown> = { isActive: true };

  if (filters.type) query.type = filters.type;
  if (filters.status) {
    // Map legacy status filter to the section-level fields
    // 'verified' = at least one section verified; 'not_started' = all sections not started
    if (filters.status === 'verified') {
      query.$or = [
        { civilStatus: 'verified' },
        { electricalStatus: 'verified' },
        { wasteStatus: 'verified' },
      ];
    } else if (filters.status === 'not_started') {
      query.civilStatus = 'not_started';
      query.electricalStatus = 'not_started';
      query.wasteStatus = 'not_started';
    } else {
      // For other statuses (draft, submitted, etc.) check any section
      query.$or = [
        { civilStatus: filters.status },
        { electricalStatus: filters.status },
        { wasteStatus: filters.status },
      ];
    }
  }
  if (filters.search) {
    query.$or = [
      { name: new RegExp(filters.search, 'i') },
      { shortName: new RegExp(filters.search, 'i') },
    ];
  }
  if (filters.campusId) {
    query.campusId = new mongoose.Types.ObjectId(filters.campusId);
  } else if (filters.campusSlug) {
    const campus = await Campus.findOne({ slug: filters.campusSlug });
    if (campus) query.campusId = campus._id;
  }

  const page = Math.max(1, pagination.page ?? 1);
  const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
  const skip = (page - 1) * limit;

  const [buildings, total] = await Promise.all([
    Building.find(query)
      .populate('assignedMembers', 'name email department')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Building.countDocuments(query),
  ]);

  return { buildings, total };
}

export async function getBuildingById(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid building ID', 400);
  }

  const building = await Building.findOne({ _id: id, isActive: true })
    .populate('campusId', 'slug name shortName')
    .populate('assignedMembers', 'name email department role')
    .populate('overviewSubmissionId', 'status version submittedBy updatedAt')
    .populate('civilSubmissionId', 'status version submittedBy updatedAt')
    .populate('electricalSubmissionId', 'status version submittedBy updatedAt')
    .populate('wasteSubmissionId', 'status version submittedBy updatedAt');

  if (!building) throw new AppError('Building not found', 404);
  return building;
}

export async function getBuildingStats() {
  const [total, submitted, verified] = await Promise.all([
    Building.countDocuments({ isActive: true }),
    Building.countDocuments({
      isActive: true,
      $or: [
        { civilStatus: { $in: ['submitted', 'verified'] } },
        { electricalStatus: { $in: ['submitted', 'verified'] } },
        { wasteStatus: { $in: ['submitted', 'verified'] } },
      ],
    }),
    Building.countDocuments({
      isActive: true,
      $or: [
        { civilStatus: 'verified' },
        { electricalStatus: 'verified' },
        { wasteStatus: 'verified' },
      ],
    }),
  ]);

  const typeAgg = await Building.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]);

  // Section-level status breakdown
  const sectionStatusAgg = await Building.aggregate([
    { $match: { isActive: true } },
    {
      $project: {
        civil: '$civilStatus',
        electrical: '$electricalStatus',
        waste: '$wasteStatus',
        overview: '$overviewStatus',
      },
    },
  ]);

  const byType = Object.fromEntries(typeAgg.map((t) => [t._id, t.count]));
  const sectionStatus = {
    civil: countByStatus(sectionStatusAgg.map((s) => s.civil)),
    electrical: countByStatus(sectionStatusAgg.map((s) => s.electrical)),
    waste: countByStatus(sectionStatusAgg.map((s) => s.waste)),
    overview: countByStatus(sectionStatusAgg.map((s) => s.overview)),
  };

  return {
    totalBuildings: total,
    submittedBuildings: submitted,
    verifiedBuildings: verified,
    byType,
    sectionStatus,
  };
}

function countByStatus(statuses: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of statuses) {
    counts[s ?? 'not_started'] = (counts[s ?? 'not_started'] ?? 0) + 1;
  }
  return counts;
}

export async function createBuilding(
  data: {
    name: string;
    shortName?: string;
    type: string;
    description?: string;
    floors: number;
    totalArea?: number;
    yearBuilt?: number;
    latitude?: number;
    longitude?: number;
    tags?: string[];
  },
  adminUserId?: string
) {
  const building = new Building(data);
  await building.save();

  if (adminUserId) {
    await AuditLog.create({
      action: 'building.create',
      entityType: 'Building',
      entityId: building._id,
      performedBy: adminUserId,
      changes: data,
    });
  }

  return building;
}

export async function deleteBuilding(id: string, adminUserId?: string) {
  const building = await getBuildingById(id);
  building.isActive = false;
  await building.save();

  if (adminUserId) {
    await AuditLog.create({
      action: 'building.delete',
      entityType: 'Building',
      entityId: building._id,
      performedBy: adminUserId,
    });
  }

  return building;
}

export async function updateBuilding(
  id: string,
  data: Record<string, unknown>,
  adminUserId?: string
) {
  const building = await getBuildingById(id);
  Object.assign(building, data);
  await building.save();

  if (adminUserId) {
    await AuditLog.create({
      action: 'building.update',
      entityType: 'Building',
      entityId: building._id,
      performedBy: adminUserId,
      changes: data,
    });
  }

  return building;
}

export async function assignMember(buildingId: string, userId: string, adminUserId?: string) {
  const [building, user] = await Promise.all([getBuildingById(buildingId), User.findById(userId)]);

  if (!user) throw new AppError('User not found', 404);

  const alreadyAssigned = building.assignedMembers.some((m) => m.toString() === userId);
  if (alreadyAssigned) throw new AppError('User already assigned to this building', 400);

  building.assignedMembers.push(new mongoose.Types.ObjectId(userId));
  user.assignedBuildings.push(new mongoose.Types.ObjectId(buildingId));
  await Promise.all([building.save(), user.save()]);

  if (adminUserId) {
    await AuditLog.create({
      action: 'member.assign',
      entityType: 'Building',
      entityId: building._id,
      performedBy: adminUserId,
      changes: { assignedUserId: userId },
    });
  }

  return building;
}

export async function removeMember(buildingId: string, userId: string, adminUserId?: string) {
  const [building, user] = await Promise.all([getBuildingById(buildingId), User.findById(userId)]);

  if (!user) throw new AppError('User not found', 404);

  building.assignedMembers = building.assignedMembers.filter(
    (m) => m.toString() !== userId
  ) as typeof building.assignedMembers;

  user.assignedBuildings = user.assignedBuildings.filter(
    (b) => b.toString() !== buildingId
  ) as typeof user.assignedBuildings;

  await Promise.all([building.save(), user.save()]);

  if (adminUserId) {
    await AuditLog.create({
      action: 'member.remove',
      entityType: 'Building',
      entityId: building._id,
      performedBy: adminUserId,
      changes: { removedUserId: userId },
    });
  }

  return building;
}
