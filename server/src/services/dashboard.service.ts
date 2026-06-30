import { redisClient } from '../config/redis';
import { Building } from '../models/Building.model';
import { Submission } from '../models/Submission.model';
import { BuildingType } from '@shared/types/building.types';
import Campus from '../models/Campus.model';

async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  if (redisClient) {
    try {
      const cached = await redisClient.get<string>(key);
      if (cached) {
        if (typeof cached === 'string') return JSON.parse(cached) as T;
        return cached as unknown as T;
      }
    } catch {
      // Redis unavailable — fall through to DB
    }
  }
  const data = await fetcher();
  if (redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(data), { ex: ttlSeconds });
    } catch {
      // Redis write failure is non-fatal
    }
  }
  return data;
}

export async function getPublicStats(campusSlug?: string) {
  const cacheKey = campusSlug ? `dashboard:public-stats:${campusSlug}` : 'dashboard:public-stats';
  return getCached(cacheKey, 600, async () => {
    const baseFilter: Record<string, unknown> = { isActive: true };

    if (campusSlug) {
      const campus = await Campus.findOne({ slug: campusSlug });
      if (campus) baseFilter.campusId = campus._id;
    }

    const [totalBuildings, submittedBuildings, verifiedBuildings, fullyVerifiedBuildings] =
      await Promise.all([
        Building.countDocuments(baseFilter),
        // At least one section has been submitted or verified
        Building.countDocuments({
          ...baseFilter,
          $or: [
            { civilStatus: { $in: ['submitted', 'verified'] } },
            { electricalStatus: { $in: ['submitted', 'verified'] } },
            { wasteStatus: { $in: ['submitted', 'verified'] } },
          ],
        }),
        // At least one section is verified
        Building.countDocuments({
          ...baseFilter,
          $or: [
            { civilStatus: 'verified' },
            { electricalStatus: 'verified' },
            { wasteStatus: 'verified' },
          ],
        }),
        // All four sections verified
        Building.countDocuments({
          ...baseFilter,
          overviewStatus: 'verified',
          civilStatus: 'verified',
          electricalStatus: 'verified',
          wasteStatus: 'verified',
        }),
      ]);

    const carbonAgg = await Submission.aggregate([
      { $match: { status: 'verified' } },
      {
        $group: {
          _id: null,
          totalEmbodiedCarbon: { $sum: '$carbonResults.embodiedCarbon' },
          totalOperationalCarbon: { $sum: '$carbonResults.operationalCarbonPerYear' },
        },
      },
    ]);

    const carbon = carbonAgg[0] ?? { totalEmbodiedCarbon: 0, totalOperationalCarbon: 0 };
    const coveragePercent =
      totalBuildings > 0 ? ((submittedBuildings / totalBuildings) * 100).toFixed(1) : '0.0';

    // Campus-level carbon data (use the scoped campus or IIT BHU as default)
    const campusSlugToUse = campusSlug ?? 'iitbhu';
    const campusDoc = await Campus.findOne({ slug: campusSlugToUse });
    const cr = campusDoc?.infrastructureCarbonResults as Record<string, number> | undefined;
    const campusStats =
      campusDoc?.infrastructureStatus === 'verified' && cr
        ? {
            roadsEmbodiedCarbon: cr.roadsEmbodiedCarbon ?? 0,
            roadLightingCarbonPerYear: cr.roadLightingCarbonPerYear ?? 0,
            vegetationSequestrationPerYear: cr.vegetationSequestrationPerYear ?? 0,
            netCampusCarbonPerYear: cr.netCampusCarbonPerYear ?? 0,
            campusDataStatus: campusDoc.infrastructureStatus,
            campusVersion: campusDoc.infrastructureVersion,
          }
        : {
            roadsEmbodiedCarbon: 0,
            roadLightingCarbonPerYear: 0,
            vegetationSequestrationPerYear: 0,
            netCampusCarbonPerYear: 0,
            campusDataStatus: campusDoc?.infrastructureStatus ?? 'not_started',
            campusVersion: 0,
          };

    return {
      totalBuildings,
      submittedBuildings,
      verifiedBuildings,
      fullyVerifiedBuildings,
      coveragePercent,
      totalEmbodiedCarbon: carbon.totalEmbodiedCarbon,
      totalOperationalCarbon: carbon.totalOperationalCarbon,
      lastUpdated: new Date(),
      campus: campusStats,
    };
  });
}

export async function getCampusByType() {
  return getCached('dashboard:by-type', 600, async () => {
    const types = Object.values(BuildingType);

    const [buildingCounts, carbonByBuilding] = await Promise.all([
      Building.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      Submission.aggregate([
        { $match: { status: 'verified' } },
        {
          $lookup: {
            from: 'buildings',
            localField: 'buildingId',
            foreignField: '_id',
            as: 'building',
          },
        },
        { $unwind: '$building' },
        {
          $group: {
            _id: '$building.type',
            embodiedCarbon: { $sum: '$carbonResults.embodiedCarbon' },
            operationalCarbon: { $sum: '$carbonResults.operationalCarbonPerYear' },
          },
        },
      ]),
    ]);

    const countMap = Object.fromEntries(buildingCounts.map((b) => [b._id, b.count]));
    const carbonMap = Object.fromEntries(
      carbonByBuilding.map((c) => [
        c._id,
        { embodiedCarbon: c.embodiedCarbon, operationalCarbon: c.operationalCarbon },
      ])
    );

    return types.map((type) => ({
      type,
      count: countMap[type] ?? 0,
      embodiedCarbon: carbonMap[type]?.embodiedCarbon ?? 0,
      operationalCarbon: carbonMap[type]?.operationalCarbon ?? 0,
    }));
  });
}

export async function getTopBuildings(limit = 10) {
  return getCached('dashboard:top-buildings', 600, async () => {
    const results = await Building.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'submissions',
          let: { bid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$buildingId', '$$bid'] }, { $eq: ['$status', 'verified'] }],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: 'latestSubmission',
        },
      },
      { $unwind: { path: '$latestSubmission', preserveNullAndEmptyArrays: false } },
      {
        $addFields: {
          totalCarbon: {
            $add: [
              { $ifNull: ['$latestSubmission.carbonResults.embodiedCarbon', 0] },
              { $ifNull: ['$latestSubmission.carbonResults.operationalCarbonPerYear', 0] },
            ],
          },
        },
      },
      { $sort: { totalCarbon: -1 } },
      { $limit: limit },
      {
        $project: {
          buildingId: '$_id',
          name: 1,
          type: 1,
          submissionStatus: 1,
          embodiedCarbon: '$latestSubmission.carbonResults.embodiedCarbon',
          operationalCarbon: '$latestSubmission.carbonResults.operationalCarbonPerYear',
        },
      },
    ]);

    return results;
  });
}

export async function getSubmissionTimeline() {
  return getCached('dashboard:timeline', 3600, async () => {
    // Build last 12 months list
    const months: Array<{ month: string; year: number; monthIndex: number; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.push({
        month: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        year: d.getFullYear(),
        monthIndex: d.getMonth() + 1, // 1-based
        count: 0,
      });
    }

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const agg = await Submission.aggregate([
      { $match: { createdAt: { $gte: oneYearAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
    ]);

    for (const item of agg) {
      const found = months.find((m) => m.year === item._id.year && m.monthIndex === item._id.month);
      if (found) found.count = item.count;
    }

    return months.map((m) => ({ month: m.month, count: m.count }));
  });
}

export async function getMyStats(userId: string) {
  const User = (await import('../models/User.model')).default;
  const user = await User.findById(userId)
    .populate({ path: 'assignedBuildings', model: 'Building' })
    .populate({ path: 'assignedCampuses', model: 'Campus' });

  if (!user) return { buildings: [], campuses: [] };

  const buildings = await Promise.all(
    user.assignedBuildings.map(async (buildingId) => {
      const building = await Building.findById(buildingId);
      if (!building) return null;

      const latestVerified = await Submission.findOne({
        buildingId: building._id,
        status: 'verified',
      }).sort({ createdAt: -1 });

      return {
        buildingId: building._id,
        name: building.name,
        type: building.type,
        submissionStatus: building.submissionStatus,
        carbonResults: (latestVerified?.carbonResults ?? null) as Record<string, unknown> | null,
      };
    })
  );

  // Assigned campuses (infrastructure data entry)
  const campuses = (user.assignedCampuses as any[]).map((campus: any) => ({
    campusId: campus._id,
    slug: campus.slug,
    name: campus.name,
    institution: campus.institution,
    infrastructureStatus: campus.infrastructureStatus,
  }));

  return { buildings: buildings.filter(Boolean), campuses };
}
