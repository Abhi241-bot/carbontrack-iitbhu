import mongoose from 'mongoose';
import { redisClient } from '../config/redis';
import { Building } from '../models/Building.model';
import { Submission } from '../models/Submission.model';
import Campus from '../models/Campus.model';

const TTL = 900; // 15 minutes

// ─── Campus building filter helper ───────────────────────────────────────────

async function getCampusBuildingIds(campusSlug: string): Promise<mongoose.Types.ObjectId[] | null> {
  const campus = await Campus.findOne({ slug: campusSlug });
  if (!campus) return null;
  const buildings = await Building.find({ campusId: campus._id, isActive: true }, { _id: 1 });
  return buildings.map((b) => b._id as mongoose.Types.ObjectId);
}

async function getCached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
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
      await redisClient.set(key, JSON.stringify(data), { ex: ttl });
    } catch {
      // Redis write failure is non-fatal
    }
  }
  return data;
}

const ACTIVE_STATUSES = ['verified'];

// ─── getDomainBreakdown ───────────────────────────────────────────────────────

export async function getDomainBreakdown(campusSlug?: string) {
  const cacheKey = campusSlug
    ? `analytics:domain-breakdown:${campusSlug}`
    : 'analytics:domain-breakdown';
  return getCached(cacheKey, TTL, async () => {
    const submissionMatch: Record<string, unknown> = { status: { $in: ACTIVE_STATUSES } };
    if (campusSlug) {
      const ids = await getCampusBuildingIds(campusSlug);
      if (ids) submissionMatch.buildingId = { $in: ids };
    }

    // byBuildingType
    const buildingMatch: Record<string, unknown> = { isActive: true, combinedCarbonResults: { $exists: true } };
    if (campusSlug) {
      const ids = await getCampusBuildingIds(campusSlug);
      if (ids) buildingMatch._id = { $in: ids };
    }

    const byTypeBuildingAgg = await Building.aggregate([
      { $match: buildingMatch },
      {
        $group: {
          _id: '$type',
          buildingCount: { $sum: 1 },
          embodiedCarbon: { $sum: '$combinedCarbonResults.embodiedCarbon' },
          operationalCarbon: { $sum: '$combinedCarbonResults.operationalCarbonPerYear' },
          totalArea: { $sum: '$totalArea' },
          scope1: { $sum: '$combinedCarbonResults.breakdown.byScope.scope1' },
          scope2: { $sum: '$combinedCarbonResults.breakdown.byScope.scope2' },
          scope3: { $sum: '$combinedCarbonResults.breakdown.byScope.scope3' },
          solidWasteCO2e: { $sum: '$combinedCarbonResults.breakdown.byCategory.solidWaste' },
          liquidWasteCO2e: { $sum: '$combinedCarbonResults.breakdown.byCategory.liquidWaste' },
          wasteCO2e: { $sum: '$combinedCarbonResults.breakdown.byCategory.waste' },
          wasteCarbonPerYear: { $sum: '$combinedCarbonResults.wasteCarbonPerYear' },
        },
      },
    ]);

    const byTypeMaterialsAgg = await Submission.aggregate([
      { $match: submissionMatch },
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
          woodKg: { $sum: '$data.materials.woodenFurnitureKg' },
          steelFurnitureKg: { $sum: '$data.materials.steelFurnitureKg' },
          plasticKg: { $sum: '$data.materials.plasticKg' },
          glassKg: { $sum: '$data.materials.glassKg' },
        },
      },
    ]);

    const byBuildingType = byTypeBuildingAgg.map((t) => {
      const mat = byTypeMaterialsAgg.find(m => m._id === t._id) || {};
      const totalCarbon = parseFloat(
        ((t.embodiedCarbon ?? 0) + (t.operationalCarbon ?? 0)).toFixed(3)
      );
      const count = t.buildingCount ?? 0;
      const area = t.totalArea ?? 0;
      return {
        type: t._id as string,
        buildingCount: count,
        embodiedCarbon: parseFloat((t.embodiedCarbon ?? 0).toFixed(3)),
        operationalCarbon: parseFloat((t.operationalCarbon ?? 0).toFixed(3)),
        totalCarbon,
        avgPerBuilding: count > 0 ? parseFloat((totalCarbon / count).toFixed(3)) : 0,
        avgIntensityPerSqm: area > 0 ? parseFloat((totalCarbon / area).toFixed(3)) : 0,
        scope1: parseFloat((t.scope1 ?? 0).toFixed(3)),
        scope2: parseFloat((t.scope2 ?? 0).toFixed(3)),
        scope3: parseFloat((t.scope3 ?? 0).toFixed(3)),
        solidWasteCO2e: parseFloat((t.solidWasteCO2e ?? 0).toFixed(3)),
        liquidWasteCO2e: parseFloat((t.liquidWasteCO2e ?? 0).toFixed(3)),
        wasteCO2e: parseFloat((t.wasteCO2e ?? 0).toFixed(3)),
        wasteCarbonPerYear: parseFloat((t.wasteCarbonPerYear ?? 0).toFixed(3)),
        woodKg: parseFloat((mat.woodKg ?? 0).toFixed(1)),
        steelFurnitureKg: parseFloat((mat.steelFurnitureKg ?? 0).toFixed(1)),
        plasticKg: parseFloat((mat.plasticKg ?? 0).toFixed(1)),
        glassKg: parseFloat((mat.glassKg ?? 0).toFixed(1)),
      };
    });

    // byScope (global or campus-scoped)
    const buildingScopeAgg = await Building.aggregate([
      { $match: buildingMatch },
      {
        $group: {
          _id: null,
          scope1: { $sum: '$combinedCarbonResults.breakdown.byScope.scope1' },
          scope2: { $sum: '$combinedCarbonResults.breakdown.byScope.scope2' },
          scope3: { $sum: '$combinedCarbonResults.breakdown.byScope.scope3' },
          wasteCarbonTotal: { $sum: '$combinedCarbonResults.wasteCarbonPerYear' },
        },
      },
    ]);
    const rawScope = buildingScopeAgg[0] ?? { scope1: 0, scope2: 0, scope3: 0, wasteCarbonTotal: 0 };

    const solarAgg = await Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: null,
          solarAdoptionCount: {
            $sum: {
              $cond: [{ $gt: ['$data.energy.solarCapacityKw', 0] }, 1, 0],
            },
          },
        },
      },
    ]);
    const solarAdoptionCount = solarAgg[0]?.solarAdoptionCount ?? 0;

    const scopeTotal = (rawScope.scope1 ?? 0) + (rawScope.scope2 ?? 0) + (rawScope.scope3 ?? 0);
    const byScope = {
      scope1: parseFloat((rawScope.scope1 ?? 0).toFixed(3)),
      scope2: parseFloat((rawScope.scope2 ?? 0).toFixed(3)),
      scope3: parseFloat((rawScope.scope3 ?? 0).toFixed(3)),
      total: parseFloat(scopeTotal.toFixed(3)),
      wasteCarbonTotal: parseFloat((rawScope.wasteCarbonTotal ?? 0).toFixed(3)),
      solarAdoptionCount,
    };

    // byApplianceCategory — iterate submission.data.appliances.categories
    const submissions = await Submission.find(submissionMatch as Record<string, unknown>, {
      'data.appliances': 1,
    }).lean();

    const GRID_FACTOR = 0.716; // kgCO2/kWh
    const categoryTotals: Record<string, { kwh: number; co2: number }> = {
      lighting: { kwh: 0, co2: 0 },
      cooling: { kwh: 0, co2: 0 },
      computing: { kwh: 0, co2: 0 },
      labEquipment: { kwh: 0, co2: 0 },
      misc: { kwh: 0, co2: 0 },
    };

    for (const sub of submissions) {
      const appData = (sub.data as Record<string, unknown> | null)?.appliances as
        | Record<string, unknown>
        | undefined;
      const categories = appData?.categories as
        | Record<
            string,
            Array<{
              count?: number;
              wattsEach?: number;
              hoursPerDay?: number;
              operatingDays?: number;
            }>
          >
        | undefined;

      if (!categories) continue;

      for (const [cat, appliances] of Object.entries(categories)) {
        const key = cat in categoryTotals ? cat : 'misc';
        for (const app of appliances) {
          const kwh =
            ((app.count ?? 0) *
              (app.wattsEach ?? 0) *
              (app.hoursPerDay ?? 0) *
              (app.operatingDays ?? 365)) /
            1000;
          categoryTotals[key].kwh += kwh;
          categoryTotals[key].co2 += kwh * GRID_FACTOR;
        }
      }
    }

    const totalCo2 = Object.values(categoryTotals).reduce((s, c) => s + c.co2, 0);
    const byApplianceCategory = Object.entries(categoryTotals).map(([category, vals]) => ({
      category,
      estimatedKwh: parseFloat(vals.kwh.toFixed(3)),
      estimatedCO2: parseFloat((vals.co2 / 1000).toFixed(3)), // convert to tCO2e
      percentage: totalCo2 > 0 ? parseFloat(((vals.co2 / totalCo2) * 100).toFixed(1)) : 0,
    }));

    // embodiedVsOperational
    const evOpAgg = await Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: null,
          embodiedTotal: { $sum: '$carbonResults.embodiedCarbon' },
          operationalTotal: { $sum: '$carbonResults.operationalCarbonPerYear' },
        },
      },
    ]);
    const evOp = evOpAgg[0] ?? { embodiedTotal: 0, operationalTotal: 0 };
    const evTotal = (evOp.embodiedTotal ?? 0) + (evOp.operationalTotal ?? 0);
    const embodiedVsOperational = {
      embodiedTotal: parseFloat((evOp.embodiedTotal ?? 0).toFixed(3)),
      operationalTotal: parseFloat((evOp.operationalTotal ?? 0).toFixed(3)),
      embodiedPercent:
        evTotal > 0 ? parseFloat(((evOp.embodiedTotal / evTotal) * 100).toFixed(1)) : 0,
      operationalPercent:
        evTotal > 0 ? parseFloat(((evOp.operationalTotal / evTotal) * 100).toFixed(1)) : 0,
    };

    return { byBuildingType, byScope, byApplianceCategory, embodiedVsOperational };
  });
}

// ─── getTimeSeries ────────────────────────────────────────────────────────────

export async function getTimeSeries(campusSlug?: string) {
  const cacheKey = campusSlug ? `analytics:time-series:${campusSlug}` : 'analytics:time-series';
  return getCached(cacheKey, TTL, async () => {
    const baseMatch: Record<string, unknown> = {};
    if (campusSlug) {
      const ids = await getCampusBuildingIds(campusSlug);
      if (ids) baseMatch.buildingId = { $in: ids };
    }

    // Build 18-month window
    const months: string[] = [];
    for (let i = 17; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      months.push(label);
    }

    // submissionsByMonth — all statuses
    const subAgg = await Submission.aggregate([
      ...(Object.keys(baseMatch).length ? [{ $match: baseMatch }] : []),
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const subMap: Record<string, number> = {};
    for (const item of subAgg) {
      const d = new Date(item._id.year, item._id.month - 1, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      subMap[label] = item.count;
    }

    let cumSub = 0;
    const submissionsByMonth = months.map((m) => {
      const count = subMap[m] ?? 0;
      cumSub += count;
      return { month: m, count, cumulative: cumSub };
    });

    // carbonAccumulation — verified only
    const carbonAgg = await Submission.aggregate([
      { $match: { ...baseMatch, status: 'verified' } },
      {
        $group: {
          _id: {
            year: { $year: '$reviewedAt' },
            month: { $month: '$reviewedAt' },
          },
          embodied: { $sum: '$carbonResults.embodiedCarbon' },
          operational: { $sum: '$carbonResults.operationalCarbonPerYear' },
        },
      },
    ]);

    const carbonMap: Record<string, { embodied: number; operational: number }> = {};
    for (const item of carbonAgg) {
      if (!item._id.year) continue;
      const d = new Date(item._id.year, item._id.month - 1, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      carbonMap[label] = { embodied: item.embodied ?? 0, operational: item.operational ?? 0 };
    }

    let cumTotal = 0;
    const carbonAccumulation = months.map((m) => {
      const vals = carbonMap[m] ?? { embodied: 0, operational: 0 };
      cumTotal += vals.embodied + vals.operational;
      return {
        month: m,
        embodied: parseFloat(vals.embodied.toFixed(3)),
        operational: parseFloat(vals.operational.toFixed(3)),
        cumulative: parseFloat(cumTotal.toFixed(3)),
      };
    });

    // buildingCoverage — how many buildings had first verified submission by each month
    const firstVerifiedAgg = await Submission.aggregate([
      { $match: { ...baseMatch, status: 'verified' } },
      { $sort: { reviewedAt: 1 } },
      {
        $group: {
          _id: '$buildingId',
          firstVerified: { $first: '$reviewedAt' },
        },
      },
    ]);

    const buildingCountFilter: Record<string, unknown> = { isActive: true };
    if (campusSlug) {
      const campus = await Campus.findOne({ slug: campusSlug });
      if (campus) buildingCountFilter.campusId = campus._id;
    }
    const totalBuildings = await Building.countDocuments(buildingCountFilter);

    const firstVerifiedMap: Record<string, number> = {};
    for (const item of firstVerifiedAgg) {
      if (!item.firstVerified) continue;
      const d = new Date(item.firstVerified);
      d.setDate(1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      firstVerifiedMap[label] = (firstVerifiedMap[label] ?? 0) + 1;
    }

    let cumCovered = 0;
    const buildingCoverage = months.map((m) => {
      cumCovered += firstVerifiedMap[m] ?? 0;
      const percent =
        totalBuildings > 0 ? parseFloat(((cumCovered / totalBuildings) * 100).toFixed(1)) : 0;
      return { month: m, covered: cumCovered, total: totalBuildings, percent };
    });

    return { submissionsByMonth, carbonAccumulation, buildingCoverage };
  });
}

// ─── getBuildingComparison ────────────────────────────────────────────────────

export async function getBuildingComparison(buildingIds: string[]) {
  // No caching — dynamic per request
  let ids = buildingIds.slice(0, 6);

  // If no IDs given, find top 5 by total carbon
  if (ids.length === 0) {
    const topAgg = await Submission.aggregate([
      { $match: { status: { $in: ACTIVE_STATUSES } } },
      {
        $addFields: {
          totalCarbon: {
            $add: [
              { $ifNull: ['$carbonResults.embodiedCarbon', 0] },
              { $ifNull: ['$carbonResults.operationalCarbonPerYear', 0] },
            ],
          },
        },
      },
      { $sort: { totalCarbon: -1 } },
      { $limit: 5 },
    ]);
    ids = topAgg.map((s) => String(s.buildingId));
  }

  const objectIds = ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const submissionAgg = await Submission.aggregate([
    { $match: { buildingId: { $in: objectIds }, status: { $in: ACTIVE_STATUSES } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$buildingId',
        latestSub: { $first: '$$ROOT' },
      },
    },
    {
      $lookup: {
        from: 'buildings',
        localField: '_id',
        foreignField: '_id',
        as: 'building',
      },
    },
    { $unwind: '$building' },
  ]);

  const buildings = submissionAgg.map((row) => {
    const b = row.building;
    const cr = row.latestSub?.carbonResults ?? {};
    const totalCarbon = parseFloat(
      ((cr.embodiedCarbon ?? 0) + (cr.operationalCarbonPerYear ?? 0)).toFixed(3)
    );
    const area = b.totalArea ?? 0;
    const floors = b.floors ?? 1;
    return {
      id: String(b._id),
      name: b.name as string,
      type: b.type as string,
      floors,
      totalArea: area,
      embodiedCarbon: parseFloat((cr.embodiedCarbon ?? 0).toFixed(3)),
      operationalCarbon: parseFloat((cr.operationalCarbonPerYear ?? 0).toFixed(3)),
      totalCarbon,
      intensityPerSqm: area > 0 ? parseFloat((totalCarbon / area).toFixed(3)) : 0,
      intensityPerFloor: floors > 0 ? parseFloat((totalCarbon / floors).toFixed(3)) : 0,
      confidenceScore: cr.confidenceScore ?? 0,
      scope1: parseFloat(
        (
          (cr.breakdown as Record<string, Record<string, number>> | undefined)?.byScope?.scope1 ?? 0
        ).toFixed(3)
      ),
      scope2: parseFloat(
        (
          (cr.breakdown as Record<string, Record<string, number>> | undefined)?.byScope?.scope2 ?? 0
        ).toFixed(3)
      ),
      scope3: parseFloat(
        (
          (cr.breakdown as Record<string, Record<string, number>> | undefined)?.byScope?.scope3 ?? 0
        ).toFixed(3)
      ),
    };
  });

  // Campus averages from all verified
  const avgAgg = await Submission.aggregate([
    { $match: { status: { $in: ACTIVE_STATUSES } } }, // no campus filter — campusAverages is always global
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
        _id: null,
        embodiedCarbon: { $avg: '$carbonResults.embodiedCarbon' },
        operationalCarbon: { $avg: '$carbonResults.operationalCarbonPerYear' },
        scope1: { $avg: '$carbonResults.breakdown.byScope.scope1' },
        scope2: { $avg: '$carbonResults.breakdown.byScope.scope2' },
        scope3: { $avg: '$carbonResults.breakdown.byScope.scope3' },
        totalAreaSum: { $sum: '$building.totalArea' },
        totalCarbonSum: {
          $sum: {
            $add: [
              { $ifNull: ['$carbonResults.embodiedCarbon', 0] },
              { $ifNull: ['$carbonResults.operationalCarbonPerYear', 0] },
            ],
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const avg = avgAgg[0] ?? {};
  const avgTotal = (avg.embodiedCarbon ?? 0) + (avg.operationalCarbon ?? 0);
  const campusAverages = {
    embodiedCarbon: parseFloat((avg.embodiedCarbon ?? 0).toFixed(3)),
    operationalCarbon: parseFloat((avg.operationalCarbon ?? 0).toFixed(3)),
    totalCarbon: parseFloat(avgTotal.toFixed(3)),
    intensityPerSqm:
      (avg.totalAreaSum ?? 0) > 0
        ? parseFloat(((avg.totalCarbonSum ?? 0) / avg.totalAreaSum).toFixed(3))
        : 0,
    scope1: parseFloat((avg.scope1 ?? 0).toFixed(3)),
    scope2: parseFloat((avg.scope2 ?? 0).toFixed(3)),
    scope3: parseFloat((avg.scope3 ?? 0).toFixed(3)),
  };

  return { buildings, campusAverages };
}

// ─── getIntensityScatter ──────────────────────────────────────────────────────

export async function getIntensityScatter(campusSlug?: string) {
  const cacheKey = campusSlug
    ? `analytics:intensity-scatter:${campusSlug}`
    : 'analytics:intensity-scatter';
  return getCached(cacheKey, TTL, async () => {
    const submissionMatch: Record<string, unknown> = { status: { $in: ACTIVE_STATUSES } };
    if (campusSlug) {
      const ids = await getCampusBuildingIds(campusSlug);
      if (ids) submissionMatch.buildingId = { $in: ids };
    }
    const agg = await Submission.aggregate([
      { $match: submissionMatch },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$buildingId',
          latestSub: { $first: '$$ROOT' },
        },
      },
      {
        $lookup: {
          from: 'buildings',
          localField: '_id',
          foreignField: '_id',
          as: 'building',
        },
      },
      { $unwind: '$building' },
      { $match: { 'building.totalArea': { $gt: 0 } } },
    ]);

    return agg.map((row) => {
      const b = row.building;
      const cr = row.latestSub?.carbonResults ?? {};
      const totalCarbon = (cr.embodiedCarbon ?? 0) + (cr.operationalCarbonPerYear ?? 0);
      const area = b.totalArea ?? 1;
      return {
        id: String(b._id),
        name: b.name as string,
        type: b.type as string,
        totalArea: area,
        floors: b.floors ?? 1,
        totalCarbon: parseFloat(totalCarbon.toFixed(3)),
        intensityPerSqm: parseFloat((totalCarbon / area).toFixed(3)),
        operationalCarbon: parseFloat((cr.operationalCarbonPerYear ?? 0).toFixed(3)),
        embodiedCarbon: parseFloat((cr.embodiedCarbon ?? 0).toFixed(3)),
        confidenceScore: cr.confidenceScore ?? 0,
      };
    });
  });
}

// ─── getLeaderboard ───────────────────────────────────────────────────────────

export async function getLeaderboard(limit = 15, campusSlug?: string) {
  const cacheKey = campusSlug ? `analytics:leaderboard:${campusSlug}` : 'analytics:leaderboard';
  return getCached(cacheKey, TTL, async () => {
    const submissionMatch: Record<string, unknown> = { status: { $in: ACTIVE_STATUSES } };
    if (campusSlug) {
      const ids = await getCampusBuildingIds(campusSlug);
      if (ids) submissionMatch.buildingId = { $in: ids };
    }
    const agg = await Submission.aggregate([
      { $match: submissionMatch },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$buildingId',
          latestSub: { $first: '$$ROOT' },
        },
      },
      {
        $lookup: {
          from: 'buildings',
          localField: '_id',
          foreignField: '_id',
          as: 'building',
        },
      },
      { $unwind: '$building' },
      {
        $addFields: {
          totalCarbon: {
            $add: [
              { $ifNull: ['$latestSub.carbonResults.embodiedCarbon', 0] },
              { $ifNull: ['$latestSub.carbonResults.operationalCarbonPerYear', 0] },
            ],
          },
        },
      },
      { $sort: { totalCarbon: -1 } },
      { $limit: limit },
    ]);

    return agg.map((row, i) => {
      const b = row.building;
      const cr = row.latestSub?.carbonResults ?? {};
      const totalCarbon = (cr.embodiedCarbon ?? 0) + (cr.operationalCarbonPerYear ?? 0);
      const area = b.totalArea ?? 0;
      return {
        rank: i + 1,
        buildingId: String(b._id),
        name: b.name as string,
        type: b.type as string,
        totalCarbon: parseFloat(totalCarbon.toFixed(3)),
        embodiedCarbon: parseFloat((cr.embodiedCarbon ?? 0).toFixed(3)),
        operationalCarbon: parseFloat((cr.operationalCarbonPerYear ?? 0).toFixed(3)),
        intensityPerSqm: area > 0 ? parseFloat((totalCarbon / area).toFixed(3)) : 0,
        confidenceScore: cr.confidenceScore ?? 0,
        submissionStatus: row.latestSub?.status ?? 'unknown',
      };
    });
  });
}

// ─── getWasteBreakdown ────────────────────────────────────────────────────────

export async function getWasteBreakdown(campusSlug?: string) {
  const cacheKey = campusSlug
    ? `analytics:waste-breakdown:${campusSlug}`
    : 'analytics:waste-breakdown';
  return getCached(cacheKey, TTL, async () => {
    const submissionMatch: Record<string, unknown> = { status: { $in: ACTIVE_STATUSES } };
    if (campusSlug) {
      const ids = await getCampusBuildingIds(campusSlug);
      if (ids) submissionMatch.buildingId = { $in: ids };
    }

    // Aggregation 1 — solid waste streams by building type
    const streamAgg = await Submission.aggregate([
      { $match: submissionMatch },
      {
        $lookup: {
          from: 'buildings',
          localField: 'buildingId',
          foreignField: '_id',
          as: 'building',
        },
      },
      { $unwind: '$building' },
      { $unwind: { path: '$data.waste.wasteStreams', preserveNullAndEmptyArrays: false } },
      { $match: { 'data.waste.wasteStreams.disposalMethod': { $exists: true, $ne: null } } },
      {
        $group: {
          _id: {
            buildingType: '$building.type',
            disposalMethod: '$data.waste.wasteStreams.disposalMethod',
          },
          avgFractionPercent: { $avg: '$data.waste.wasteStreams.fractionPercent' },
        },
      },
    ]);

    // Solid waste CO2e per type
    const solidCO2eAgg = await Submission.aggregate([
      { $match: submissionMatch },
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
          solidWasteCO2ePerYear: { $sum: '$carbonResults.breakdown.byCategory.solidWaste' },
        },
      },
    ]);

    const solidCO2eMap: Record<string, number> = {};
    for (const row of solidCO2eAgg) {
      solidCO2eMap[row._id as string] = parseFloat((row.solidWasteCO2ePerYear ?? 0).toFixed(3));
    }

    // Group streams by building type
    const streamsByType: Record<
      string,
      Array<{ disposalMethod: string; avgFractionPercent: number }>
    > = {};
    for (const row of streamAgg) {
      const type = row._id.buildingType as string;
      if (!streamsByType[type]) streamsByType[type] = [];
      streamsByType[type].push({
        disposalMethod: row._id.disposalMethod as string,
        avgFractionPercent: parseFloat((row.avgFractionPercent ?? 0).toFixed(1)),
      });
    }

    const solidWasteByType = Object.keys(solidCO2eMap).map((type) => ({
      type,
      solidWasteCO2ePerYear: solidCO2eMap[type] ?? 0,
      wasteStreams: streamsByType[type] ?? [],
    }));

    // Aggregation 2 — wastewater treatment by building type
    const treatmentAgg = await Submission.aggregate([
      { $match: submissionMatch },
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
          _id: {
            buildingType: '$building.type',
            treatmentType: '$data.waste.wastewaterTreatmentType',
          },
          count: { $sum: 1 },
          liquidCO2e: { $sum: '$carbonResults.breakdown.byCategory.liquidWaste' },
        },
      },
    ]);

    // Group by building type
    const treatmentByTypeMap: Record<
      string,
      {
        liquidWasteCO2ePerYear: number;
        treatmentDistribution: {
          unmanaged_septic: number;
          municipal_stp: number;
          campus_stp: number;
        };
      }
    > = {};

    for (const row of treatmentAgg) {
      const bType = row._id.buildingType as string;
      const tType = (row._id.treatmentType as string) ?? 'unknown';
      if (!treatmentByTypeMap[bType]) {
        treatmentByTypeMap[bType] = {
          liquidWasteCO2ePerYear: 0,
          treatmentDistribution: { unmanaged_septic: 0, municipal_stp: 0, campus_stp: 0 },
        };
      }
      treatmentByTypeMap[bType].liquidWasteCO2ePerYear += row.liquidCO2e ?? 0;
      const dist = treatmentByTypeMap[bType].treatmentDistribution;
      if (tType === 'unmanaged_septic') dist.unmanaged_septic += row.count ?? 0;
      else if (tType === 'municipal_stp') dist.municipal_stp += row.count ?? 0;
      else if (tType === 'campus_stp') dist.campus_stp += row.count ?? 0;
    }

    const wastewaterByType = Object.entries(treatmentByTypeMap).map(([type, vals]) => ({
      type,
      liquidWasteCO2ePerYear: parseFloat(vals.liquidWasteCO2ePerYear.toFixed(3)),
      treatmentDistribution: vals.treatmentDistribution,
    }));

    // Aggregation 3 — campus totals
    const totalsAgg = await Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: null,
          totalWasteCO2eYear: { $sum: '$carbonResults.wasteCarbonPerYear' },
          solidWasteCO2e: { $sum: '$carbonResults.breakdown.byCategory.solidWaste' },
          liquidWasteCO2e: { $sum: '$carbonResults.breakdown.byCategory.liquidWaste' },
        },
      },
    ]);
    const totalsRaw = totalsAgg[0] ?? {
      totalWasteCO2eYear: 0,
      solidWasteCO2e: 0,
      liquidWasteCO2e: 0,
    };
    const campusTotals = {
      totalWasteCO2eYear: parseFloat((totalsRaw.totalWasteCO2eYear ?? 0).toFixed(3)),
      solidWasteCO2e: parseFloat((totalsRaw.solidWasteCO2e ?? 0).toFixed(3)),
      liquidWasteCO2e: parseFloat((totalsRaw.liquidWasteCO2e ?? 0).toFixed(3)),
    };

    return { solidWasteByType, wastewaterByType, campusTotals };
  });
}

// ─── getCampusSummary ─────────────────────────────────────────────────────────

export async function getCampusSummary() {
  return getCached('analytics:campus-summary', TTL, async () => {
    const [campuses, submissionAgg, buildingCountAgg] = await Promise.all([
      Campus.find({ isActive: true }).lean(),
      Submission.aggregate([
        { $match: { status: { $in: ACTIVE_STATUSES } } },
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
            _id: '$building.campusId',
            totalEmbodied: { $sum: '$carbonResults.embodiedCarbon' },
            totalOperational: { $sum: '$carbonResults.operationalCarbonPerYear' },
            totalWaste: { $sum: '$carbonResults.wasteCarbonPerYear' },
            scope1: { $sum: '$carbonResults.breakdown.byScope.scope1' },
            scope2: { $sum: '$carbonResults.breakdown.byScope.scope2' },
            scope3: { $sum: '$carbonResults.breakdown.byScope.scope3' },
            verifiedBuildings: { $addToSet: '$buildingId' },
            totalArea: { $sum: '$building.totalArea' },
          },
        },
      ]),
      Building.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$campusId', count: { $sum: 1 } } },
      ]),
    ]);

    const subMap = new Map(submissionAgg.map((s) => [String(s._id), s]));
    const countMap = new Map(buildingCountAgg.map((b) => [String(b._id), b.count as number]));

    return campuses.map((campus) => {
      const id = String((campus as unknown as { _id: mongoose.Types.ObjectId })._id);
      const s = subMap.get(id);
      const cr = (campus as Record<string, unknown>).infrastructureCarbonResults as
        | Record<string, number>
        | undefined;
      const verifiedCount = s ? (s.verifiedBuildings as unknown[]).length : 0;
      const totalCarbon = (s?.totalEmbodied ?? 0) + (s?.totalOperational ?? 0);
      const area = (s?.totalArea as number) ?? 0;

      return {
        slug: campus.slug,
        name: campus.name,
        institution: campus.institution,
        shortName: (campus as Record<string, unknown>).shortName as string | undefined,
        city: campus.city,
        state: campus.state,
        country: (campus as Record<string, unknown>).country ?? 'India',
        totalAreaAcres: campus.totalAreaAcres,
        establishedYear: campus.establishedYear,
        overviewStatus: campus.overviewStatus,
        infrastructureStatus: campus.infrastructureStatus,
        buildingCount: countMap.get(id) ?? 0,
        verifiedBuildingCount: verifiedCount,
        totalEmbodied: parseFloat(((s?.totalEmbodied as number) ?? 0).toFixed(3)),
        totalOperational: parseFloat(((s?.totalOperational as number) ?? 0).toFixed(3)),
        totalWaste: parseFloat(((s?.totalWaste as number) ?? 0).toFixed(3)),
        totalCarbon: parseFloat(totalCarbon.toFixed(3)),
        scope1: parseFloat(((s?.scope1 as number) ?? 0).toFixed(3)),
        scope2: parseFloat(((s?.scope2 as number) ?? 0).toFixed(3)),
        scope3: parseFloat(((s?.scope3 as number) ?? 0).toFixed(3)),
        intensityPerSqm: area > 0 ? parseFloat((totalCarbon / area).toFixed(4)) : 0,
        vegetationSequestration: parseFloat((cr?.vegetationSequestrationPerYear ?? 0).toFixed(3)),
        infrastructureCarbon: parseFloat((cr?.netCampusCarbonPerYear ?? 0).toFixed(3)),
      };
    });
  });
}

// ─── invalidateAnalyticsCache ─────────────────────────────────────────────────

export async function invalidateAnalyticsCache() {
  const keys = [
    'analytics:domain-breakdown',
    'analytics:time-series',
    'analytics:intensity-scatter',
    'analytics:leaderboard',
    'analytics:waste-breakdown',
    'analytics:campus-summary',
    'dashboard:public-stats',
    'dashboard:by-type',
    'dashboard:top-buildings',
    'dashboard:timeline',
  ];
  if (redisClient) {
    await Promise.allSettled(keys.map((k) => redisClient!.del(k)));
  }
}
