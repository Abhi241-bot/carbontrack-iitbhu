import mongoose from 'mongoose';
import Campus, { ICampusDocument } from '../models/Campus.model';
import { Building } from '../models/Building.model';
import User from '../models/User.model';
import { AuditLog } from '../models/AuditLog.model';
import { calculateCampusCarbon } from '../engine/campus';
import { loadEmissionFactors } from '../engine/efLoader';
import { AppError } from '../utils/AppError';
import { redisClient } from '../config/redis';

// ── CAMPUS CRUD ───────────────────────────────────────────────────────────────

export async function getAllCampuses(): Promise<
  (ICampusDocument & { buildingCount: number; verifiedBuildingCount: number })[]
> {
  const campuses = (await Campus.find({ isActive: true })
    .sort({ name: 1 })
    .lean()) as unknown as ICampusDocument[];

  if (campuses.length === 0) return campuses as never[];

  const campusIds = campuses.map((c) => (c as unknown as { _id: mongoose.Types.ObjectId })._id);

  const counts = await Building.aggregate<{
    _id: mongoose.Types.ObjectId;
    total: number;
    verified: number;
  }>([
    { $match: { campusId: { $in: campusIds }, isActive: true } },
    {
      $group: {
        _id: '$campusId',
        total: { $sum: 1 },
        verified: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$civilStatus', 'verified'] },
                  { $eq: ['$electricalStatus', 'verified'] },
                  { $eq: ['$wasteStatus', 'verified'] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const countMap = new Map(counts.map((c) => [c._id.toString(), c]));

  return campuses.map((campus) => {
    const id = (campus as unknown as { _id: mongoose.Types.ObjectId })._id.toString();
    const c = countMap.get(id);
    return { ...campus, buildingCount: c?.total ?? 0, verifiedBuildingCount: c?.verified ?? 0 };
  }) as (ICampusDocument & { buildingCount: number; verifiedBuildingCount: number })[];
}

export async function getCampusWithStats(
  slug: string
): Promise<Record<string, unknown> & { buildingCount: number; verifiedBuildingCount: number }> {
  const campus = (await Campus.findOne({ slug, isActive: true })
    .populate('createdBy', 'name email')
    .populate('overviewSubmittedBy', 'name email')
    .lean()) as Record<string, unknown> | null;

  if (!campus) throw new AppError('Campus not found', 404);

  const [buildingCount, verifiedBuildingCount] = await Promise.all([
    Building.countDocuments({ campusId: campus._id, isActive: true }),
    Building.countDocuments({
      campusId: campus._id,
      isActive: true,
      civilStatus: 'verified',
      electricalStatus: 'verified',
      wasteStatus: 'verified',
    }),
  ]);

  return { ...campus, buildingCount, verifiedBuildingCount };
}

export async function createCampus(
  data: {
    name: string;
    institution: string;
    shortName?: string;
    city: string;
    state: string;
    country?: string;
    totalAreaAcres?: number;
    establishedYear?: number;
    website?: string;
    contactEmail?: string;
    description?: string;
  },
  createdBy: string
): Promise<ICampusDocument> {
  // Generate slug from institution + city
  const baseSlug = `${data.institution} ${data.city}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 40);

  // Ensure slug is unique
  let slug = baseSlug;
  let counter = 1;
  while (await Campus.exists({ slug })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const campus = await Campus.create({
    ...data,
    slug,
    country: data.country ?? 'India',
    createdBy,
    infrastructureData: {
      roads: {
        segments: [],
        hasStreetLighting: false,
      },
      vegetation: {
        categories: [
          {
            id: 'veg-native',
            categoryType: 'native_trees',
            definitionScope: 'e.g. Neem, Banyan, Peepal',
          },
          {
            id: 'veg-ornamental',
            categoryType: 'ornamental_trees',
            definitionScope: 'e.g. Gulmohar, Ashoka, Silver Oak',
          },
          {
            id: 'veg-shrubs',
            categoryType: 'shrubs_grassland',
            definitionScope: 'e.g. native grass species',
          },
          {
            id: 'veg-agroforestry',
            categoryType: 'agroforestry',
            definitionScope: 'e.g. Mango, Teak',
          },
          {
            id: 'veg-arboriculture',
            categoryType: 'arboriculture',
            definitionScope: 'Street trees, heritage trees',
          },
        ],
      },
      waterBodies: { waterBodies: [] },
    },
  });

  return campus;
}

export async function updateCampusOverview(
  slug: string,
  data: Partial<ICampusDocument>,
  userId: string
): Promise<ICampusDocument> {
  const campus = await Campus.findOne({ slug });
  if (!campus) throw new AppError('Campus not found', 404);

  const allowedFields = [
    'name',
    'institution',
    'shortName',
    'city',
    'state',
    'country',
    'totalAreaAcres',
    'establishedYear',
    'website',
    'contactEmail',
    'description',
  ];

  for (const field of allowedFields) {
    if ((data as any)[field] !== undefined) {
      (campus as any)[field] = (data as any)[field];
    }
  }

  campus.overviewStatus = 'submitted';
  campus.overviewVersion = (campus.overviewVersion ?? 0) + 1;
  campus.overviewSubmittedBy = userId as any;

  await campus.save();
  return campus;
}

export async function approveCampusOverview(slug: string, reviewerId: string) {
  const campus = await Campus.findOne({ slug });
  if (!campus) throw new AppError('Campus not found', 404);
  campus.overviewStatus = 'verified';
  campus.overviewVerifiedAt = new Date();
  campus.overviewReviewedBy = reviewerId as any;
  await campus.save();
  return campus;
}

// ── INFRASTRUCTURE (roads, vegetation, water bodies) ─────────────────────────

export async function getCampusInfrastructureDraft(slug: string) {
  const campus = await Campus.findOne({ slug });
  if (!campus) throw new AppError('Campus not found', 404);
  return campus;
}

export async function updateInfrastructureDraft(
  slug: string,
  data: { roads?: unknown; vegetation?: unknown; waterBodies?: unknown },
  userId: string
) {
  const campus = await Campus.findOne({ slug });
  if (!campus) throw new AppError('Campus not found', 404);

  if (data.roads)
    campus.infrastructureData.roads = { ...campus.infrastructureData.roads, ...data.roads } as any;
  if (data.vegetation)
    campus.infrastructureData.vegetation = {
      ...campus.infrastructureData.vegetation,
      ...data.vegetation,
    } as any;
  if (data.waterBodies)
    campus.infrastructureData.waterBodies = {
      ...campus.infrastructureData.waterBodies,
      ...data.waterBodies,
    } as any;

  campus.markModified('infrastructureData');
  campus.infrastructureStatus = 'draft';
  campus.infrastructureSubmittedBy = userId as any;
  await campus.save();
  return campus;
}

export async function submitInfrastructure(slug: string, userId: string) {
  const campus = await Campus.findOne({ slug });
  if (!campus) throw new AppError('Campus not found', 404);

  const estimatedFields: string[] = [];
  let ef;
  try {
    ef = await loadEmissionFactors();
  } catch {
    /* use defaults */
  }
  const carbonResults = calculateCampusCarbon(
    campus.infrastructureData as any,
    estimatedFields,
    undefined,
    ef
  );

  campus.infrastructureCarbonResults = carbonResults as any;
  campus.infrastructureStatus = 'submitted';
  campus.infrastructureVersion = (campus.infrastructureVersion ?? 0) + 1;
  campus.infrastructureSubmittedBy = userId as any;
  await campus.save();
  await invalidateCampusCache(slug);
  return campus;
}

export async function approveInfrastructure(slug: string, reviewerId: string) {
  const campus = await Campus.findOne({ slug });
  if (!campus) throw new AppError('Campus not found', 404);

  // Re-run engine with live EFs at approval time
  try {
    const ef = await loadEmissionFactors();
    const estimatedFields: string[] = [];
    const carbonResults = calculateCampusCarbon(
      campus.infrastructureData as any,
      estimatedFields,
      undefined,
      ef
    );
    campus.infrastructureCarbonResults = carbonResults as any;
  } catch {
    /* non-fatal: approval proceeds even if engine fails */
  }

  campus.infrastructureStatus = 'verified';
  campus.infrastructureVerifiedAt = new Date();
  campus.infrastructureReviewedBy = reviewerId as any;
  await campus.save();
  await invalidateCampusCache(slug);
  return campus;
}

export async function recalculateCampusCarbon(slug: string) {
  const campus = await Campus.findOne({ slug });
  if (!campus) throw new AppError('Campus not found', 404);
  if (campus.infrastructureStatus !== 'verified') {
    throw new AppError('Only verified campus infrastructure can be recalculated', 400);
  }

  const ef = await loadEmissionFactors();
  const estimatedFields: string[] = [];
  const carbonResults = calculateCampusCarbon(
    campus.infrastructureData as any,
    estimatedFields,
    undefined,
    ef
  );

  campus.infrastructureCarbonResults = carbonResults as any;
  campus.markModified('infrastructureCarbonResults');
  await campus.save();
  await invalidateCampusCache(slug);
  return carbonResults;
}

export async function requestInfrastructureRevision(
  slug: string,
  reviewerId: string,
  notes: string
) {
  const campus = await Campus.findOne({ slug });
  if (!campus) throw new AppError('Campus not found', 404);
  campus.infrastructureStatus = 'revision_requested';
  campus.infrastructureReviewNotes = notes;
  campus.infrastructureReviewedBy = reviewerId as any;
  await campus.save();
  return campus;
}

// ── INFRASTRUCTURE MEMBER ASSIGNMENT ─────────────────────────────────────────

export async function getInfrastructureMembers(slug: string) {
  const campus = await Campus.findOne({ slug, isActive: true }).populate(
    'infrastructureAssignedMembers',
    'name email department role'
  );
  if (!campus) throw new AppError('Campus not found', 404);
  return campus.infrastructureAssignedMembers;
}

export async function assignInfrastructureMember(slug: string, userId: string, adminId: string) {
  const [campus, user] = await Promise.all([
    Campus.findOne({ slug, isActive: true }),
    User.findById(userId),
  ]);
  if (!campus) throw new AppError('Campus not found', 404);
  if (!user) throw new AppError('User not found', 404);

  const alreadyAssigned = campus.infrastructureAssignedMembers.some((m) => m.toString() === userId);
  if (alreadyAssigned)
    throw new AppError('User already assigned to this campus infrastructure', 400);

  campus.infrastructureAssignedMembers.push(new mongoose.Types.ObjectId(userId));
  user.assignedCampuses.push(campus._id as mongoose.Types.ObjectId);
  await Promise.all([campus.save(), user.save()]);

  await AuditLog.create({
    action: 'campus.infrastructure.member_assign',
    entityType: 'Campus',
    entityId: campus._id,
    performedBy: adminId,
    changes: { assignedUserId: userId },
  });

  return campus.populate('infrastructureAssignedMembers', 'name email department role');
}

export async function removeInfrastructureMember(slug: string, userId: string, adminId: string) {
  const [campus, user] = await Promise.all([
    Campus.findOne({ slug, isActive: true }),
    User.findById(userId),
  ]);
  if (!campus) throw new AppError('Campus not found', 404);
  if (!user) throw new AppError('User not found', 404);

  campus.infrastructureAssignedMembers = campus.infrastructureAssignedMembers.filter(
    (m) => m.toString() !== userId
  ) as typeof campus.infrastructureAssignedMembers;

  user.assignedCampuses = user.assignedCampuses.filter(
    (c) => c.toString() !== campus._id.toString()
  ) as typeof user.assignedCampuses;

  await Promise.all([campus.save(), user.save()]);

  await AuditLog.create({
    action: 'campus.infrastructure.member_remove',
    entityType: 'Campus',
    entityId: campus._id,
    performedBy: adminId,
    changes: { removedUserId: userId },
  });

  return campus;
}

// ── LIST BUILDINGS SCOPED TO A CAMPUS ────────────────────────────────────────

export async function getBuildingsByCampus(
  slug: string,
  query: { page?: number; limit?: number; type?: string; search?: string }
) {
  const campus = await Campus.findOne({ slug, isActive: true });
  if (!campus) throw new AppError('Campus not found', 404);

  const filter: Record<string, unknown> = { campusId: campus._id, isActive: true };
  if (query.type) filter.type = query.type;
  if (query.search)
    filter.$or = [
      { name: new RegExp(query.search, 'i') },
      { shortName: new RegExp(query.search, 'i') },
    ];

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const [buildings, total] = await Promise.all([
    Building.find(filter).skip(skip).limit(limit).sort({ name: 1 }),
    Building.countDocuments(filter),
  ]);

  return { buildings, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ── CAMPUS CARBON GET ─────────────────────────────────────────────────────────

export async function getCampusCarbon(slug: string) {
  const campus = await Campus.findOne({ slug, isActive: true }).lean();
  if (!campus) throw new AppError('Campus not found', 404);

  const existingResults = (campus as any).infrastructureCarbonResults;
  const hasData =
    campus.infrastructureStatus === 'verified' ||
    campus.infrastructureStatus === 'submitted' ||
    !!existingResults;

  if (!hasData) {
    return {
      campusId: String((campus as any)._id),
      campusName: campus.name,
      campusSlug: campus.slug,
      carbonResults: null,
      calculatedAt: null,
      dataAvailable: false,
    };
  }

  let carbonResults = existingResults;
  if (!carbonResults && campus.infrastructureData) {
    try {
      const ef = await loadEmissionFactors();
      carbonResults = calculateCampusCarbon(campus.infrastructureData as any, [], undefined, ef);
    } catch {
      // return null results rather than failing
    }
  }

  return {
    campusId: String((campus as any)._id),
    campusName: campus.name,
    campusSlug: campus.slug,
    carbonResults: carbonResults ?? null,
    calculatedAt: (carbonResults as any)?.computedAt ?? null,
    dataAvailable: !!carbonResults,
  };
}

// ── INTERNAL ──────────────────────────────────────────────────────────────────

async function invalidateCampusCache(slug: string) {
  if (!redisClient) return;
  await Promise.allSettled([
    redisClient.del(`campus:${slug}`),
    redisClient.del('dashboard:public-stats'),
    redisClient.del('analytics:domain-breakdown'),
  ]);
}
