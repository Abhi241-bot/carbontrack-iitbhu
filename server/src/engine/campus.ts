import { ICampusData, ICampusCarbonResults } from '@shared/types/submission.types';
import { ResolvedEmissionFactors } from './efLoader';
import {
  ROAD_CONSTRUCTION_EF_T_LANE_KM_YR,
  ROAD_MAINTENANCE_EF_T_LANE_KM_YR,
  ROAD_TOTAL_EF_T_LANE_KM_YR,
  VEGETATION_SEQUESTRATION_T_HA_YR,
  COMMUTE_EF_KG_KM,
  AIR_TRAVEL_EF_KG_KM,
  PURCHASED_GOODS_EF_KG_USD,
  INR_TO_USD_2022,
  GRID_EMISSION_FACTOR_KG_KWH,
} from './defaults';

// ── Legacy road EF (kg CO₂e/m² surface area, used when lane/km data absent) ─
const ROAD_EF_PER_M2: Record<string, number> = {
  paved_concrete: 131,
  paved_asphalt: 49,
  paved_brick: 85,
  unpaved_gravel: 3,
  unpaved_dirt: 0,
  mixed: 75,
  other: 50,
};

// ── Vegetation sequestration — per-tree / per-acre fallbacks (legacy) ────────
const VEG_SEQUESTRATION_LEGACY: Record<string, { perTree?: number; perAcre?: number }> = {
  native_trees: { perTree: 22 },
  ornamental_trees: { perTree: 15 },
  shrubs_grassland: { perAcre: 800 },
  agroforestry: { perTree: 18 },
  arboriculture: { perTree: 25 },
  custom: { perTree: 18, perAcre: 500 },
};

export interface CampusResult {
  roadConstructionCO2e: number;
  roadMaintenanceCO2e: number;
  roadLightingCO2e: number;
  vegetationSequestration: number; // negative (sink)
  commutationCO2e: number;
  airTravelCO2e: number;
  purchasedGoodsCO2e: number;
  netCampusCO2e: number;
  byRoadSegment: Array<{ name: string; constructionCO2e: number; maintenanceCO2e: number }>;
  byVegetation: Array<{ type: string; areaSqm: number; sequestration: number }>;
}

export function calculateCampusCarbon(
  data: ICampusData,
  estimatedFields: string[],
  gridElectricityEF?: number,
  ef?: ResolvedEmissionFactors
): ICampusCarbonResults {
  const GRID_EF = ef?.gridElectricity ?? gridElectricityEF ?? GRID_EMISSION_FACTOR_KG_KWH;

  // ── ROADS: new lane-km EF when lengthKm + lanes are available ─────────────
  let roadsConstructionTco2e = 0;
  let roadsMaintenanceTco2e = 0;
  let roadsTotalTco2e = 0;
  const byRoadSegment: CampusResult['byRoadSegment'] = [];

  for (const seg of data.roads?.segments ?? []) {
    const segAny = seg as any;

    if (segAny.lengthKm != null && segAny.lanes != null) {
      // New lane-km method
      const laneKm = segAny.lengthKm * segAny.lanes;
      const constr = laneKm * ROAD_CONSTRUCTION_EF_T_LANE_KM_YR;
      const maint = laneKm * ROAD_MAINTENANCE_EF_T_LANE_KM_YR;
      roadsConstructionTco2e += constr;
      roadsMaintenanceTco2e += maint;
      roadsTotalTco2e += laneKm * ROAD_TOTAL_EF_T_LANE_KM_YR;
      byRoadSegment.push({ name: seg.roadName, constructionCO2e: constr, maintenanceCO2e: maint });
    } else {
      // Legacy area-based method
      const areaM2 = (seg.lengthM ?? 0) * (seg.widthM ?? 0);
      const efKg = ROAD_EF_PER_M2[seg.surfaceType] ?? ROAD_EF_PER_M2.other;
      const constr = (areaM2 * efKg) / 1000;
      roadsConstructionTco2e += constr;
      roadsTotalTco2e += constr;
      byRoadSegment.push({ name: seg.roadName, constructionCO2e: constr, maintenanceCO2e: 0 });
    }
  }

  if ((data.roads?.segments ?? []).length === 0) estimatedFields.push('roads.segments');

  // ── ROAD LIGHTING: Operational carbon ─────────────────────────────────────
  let roadLightingKgPerYear = 0;
  const roads = data.roads;
  if (roads?.hasStreetLighting && roads.streetLightCount && roads.streetLightWattsEach) {
    const hoursPerDay = roads.streetLightHoursPerDay ?? 10;
    const annualKwh =
      (roads.streetLightCount * roads.streetLightWattsEach * hoursPerDay * 365) / 1000;
    roadLightingKgPerYear = annualKwh * GRID_EF;
    if (!roads.streetLightHoursPerDay) estimatedFields.push('roads.streetLightHoursPerDay');
  } else if (roads?.hasStreetLighting) {
    estimatedFields.push('roads.streetLightCount');
  }

  // Per-segment lighting (new schema field `lightsPerKm`, `wattsPerLight`, `hoursPerDay`)
  for (const seg of data.roads?.segments ?? []) {
    const s = seg as any;
    if (s.lightsPerKm && s.wattsPerLight && s.lengthKm) {
      const kwh =
        s.lightsPerKm * (s.wattsPerLight / 1000) * (s.hoursPerDay ?? 10) * 365 * s.lengthKm;
      roadLightingKgPerYear += kwh * GRID_EF;
    }
  }

  // ── VEGETATION: Sequestration (negative = sink) ───────────────────────────
  let vegSeqKgPerYear = 0;
  const byVegetation: CampusResult['byVegetation'] = [];

  for (const cat of data.vegetation?.categories ?? []) {
    let seqKg = 0;

    // New area-based method: areaSqm + category type from VEGETATION_SEQUESTRATION_T_HA_YR
    if ((cat as any).areaSqm != null) {
      const ha = (cat as any).areaSqm / 10000;
      const tHaYr = VEGETATION_SEQUESTRATION_T_HA_YR[cat.categoryType];
      if (tHaYr != null) {
        seqKg = ha * tHaYr * 1000; // tCO2/ha/yr × 1000 → kgCO2/yr (already negative)
      } else if (cat.areaAcres) {
        const legacy =
          VEG_SEQUESTRATION_LEGACY[cat.categoryType] ?? VEG_SEQUESTRATION_LEGACY.custom;
        if (legacy.perAcre) seqKg = -(cat.areaAcres * legacy.perAcre);
      }
      byVegetation.push({
        type: cat.categoryType,
        areaSqm: (cat as any).areaSqm,
        sequestration: parseFloat((seqKg / 1000).toFixed(4)),
      });
    } else {
      // Legacy per-tree / per-acre method
      const rates = VEG_SEQUESTRATION_LEGACY[cat.categoryType] ?? VEG_SEQUESTRATION_LEGACY.custom;
      if (cat.numberOfTrees && rates.perTree) seqKg -= cat.numberOfTrees * rates.perTree;
      if (cat.areaAcres && rates.perAcre) seqKg -= cat.areaAcres * rates.perAcre;
      byVegetation.push({
        type: cat.categoryType,
        areaSqm: cat.areaAcres ? cat.areaAcres * 4047 : 0,
        sequestration: parseFloat((seqKg / 1000).toFixed(4)),
      });
    }
    vegSeqKgPerYear += seqKg;
  }

  if ((data.vegetation?.categories ?? []).length === 0)
    estimatedFields.push('vegetation.categories');

  // ── COMMUTATION (Scope 3) ─────────────────────────────────────────────────
  let commutationKgPerYear = 0;
  const campusAny = data as any;

  if (campusAny.commutation) {
    const c = campusAny.commutation;
    commutationKgPerYear =
      (c.noOccupants ?? 0) *
      (c.avgDailyDistanceKm ?? 0) *
      (c.workingDays ?? 250) *
      COMMUTE_EF_KG_KM;
  }

  // ── AIR TRAVEL (Scope 3) ──────────────────────────────────────────────────
  let airTravelKgPerYear = 0;
  if (campusAny.airTravel) {
    const at = campusAny.airTravel;
    const passengerKm =
      at.totalPassengerKm ?? (at.noTravellers ?? 0) * (at.totalDistancePerPersonKm ?? 0);
    airTravelKgPerYear = passengerKm * AIR_TRAVEL_EF_KG_KM;
  }

  // ── PURCHASED GOODS (Scope 3) ─────────────────────────────────────────────
  let purchasedGoodsKgPerYear = 0;
  if (campusAny.purchasedGoods) {
    const pg = campusAny.purchasedGoods;
    const spendUSD = pg.totalSpend2022USD ?? (pg.totalSpendINR ?? 0) / INR_TO_USD_2022;
    purchasedGoodsKgPerYear = spendUSD * PURCHASED_GOODS_EF_KG_USD;
  }

  // ── TOTALS ────────────────────────────────────────────────────────────────
  const roadLightingTco2ePerYear = roadLightingKgPerYear / 1000;
  const vegSeqTco2ePerYear = vegSeqKgPerYear / 1000; // already negative
  const commutationTco2e = commutationKgPerYear / 1000;
  const airTravelTco2e = airTravelKgPerYear / 1000;
  const purchasedGoodsTco2e = purchasedGoodsKgPerYear / 1000;

  const netCampusPerYear =
    roadLightingTco2ePerYear +
    vegSeqTco2ePerYear +
    commutationTco2e +
    airTravelTco2e +
    purchasedGoodsTco2e;

  const confidenceScore = Math.max(
    100 -
      estimatedFields.length * 15 -
      ((data.roads?.segments ?? []).length === 0 ? 20 : 0) -
      ((data.vegetation?.categories ?? []).length === 0 ? 15 : 0),
    0
  );

  return {
    roadsEmbodiedCarbon: parseFloat(roadsTotalTco2e.toFixed(3)),
    roadLightingCarbonPerYear: parseFloat(roadLightingTco2ePerYear.toFixed(3)),
    vegetationSequestrationPerYear: parseFloat(vegSeqTco2ePerYear.toFixed(3)),
    netCampusCarbonPerYear: parseFloat(netCampusPerYear.toFixed(3)),
    totalCampusEmbodied: parseFloat(roadsTotalTco2e.toFixed(3)),
    breakdown: {
      roadConstruction: roadsConstructionTco2e,
      roadLighting: roadLightingTco2ePerYear,
      vegetation: vegSeqTco2ePerYear,
      // expose new components in extended breakdown
      ...(roadsMaintenanceTco2e > 0 && {
        roadMaintenance: parseFloat(roadsMaintenanceTco2e.toFixed(3)),
      }),
      ...(commutationTco2e > 0 && { commutation: parseFloat(commutationTco2e.toFixed(3)) }),
      ...(airTravelTco2e > 0 && { airTravel: parseFloat(airTravelTco2e.toFixed(3)) }),
      ...(purchasedGoodsTco2e > 0 && {
        purchasedGoods: parseFloat(purchasedGoodsTco2e.toFixed(3)),
      }),
    },
    estimatedFields,
    confidenceScore,
    computedAt: new Date(),
  };
}
