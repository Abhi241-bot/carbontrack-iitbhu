import {
  ISubmissionData,
  IDGSet,
  IDGGenerationRecord,
  IElectricalSectionData,
  IPlantGenerationMonthly,
  ISolarResourceMonthly,
  IRenewableAssessmentRecord,
  IRefrigerantRecord,
  IFireExtinguisherRecord,
  IScope3Activities,
} from '@shared/types/submission.types';
import { CEA_EMISSION_FACTORS_BY_YEAR as CEA_EF_SHARED } from '@shared/constants/defaults';
import {
  EmissionFactors,
  GRID_EMISSION_FACTOR_KG_KWH,
  DIESEL_EF_KG_L,
  PETROL_EF_KG_L,
  LPG_EF_KG_KG,
  LPG_CYLINDER_KG,
  REFRIGERANT_EF,
  DEFAULT_REFRIGERANT_LEAKAGE_RATE,
  CEA_EMISSION_FACTORS_BY_YEAR,
} from './defaults';
import { ResolvedEmissionFactors } from './efLoader';

// ── DATA SOURCE PRIORITY HELPERS ─────────────────────────────────────────────

/**
 * Returns the best available annual grid consumption figure.
 * Priority: actual bill totals > manual monthly estimate > appliance estimate.
 */
function resolveAnnualGridKwh(
  electrical: IElectricalSectionData | null | undefined,
  data: ISubmissionData,
  estimatedFields: string[]
): { annualKwh: number; source: 'bills' | 'manual' | 'estimated' } {
  const bills = electrical?.operational?.utilityBills ?? [];

  if (bills.length > 0) {
    // Deduplicate by consumer+month, then sum
    const seen = new Set<string>();
    let totalKwh = 0;
    for (const bill of bills) {
      const key = `${bill.consumerNumber}||${bill.month}`;
      if (!seen.has(key) && bill.unitConsumedKwhr) {
        seen.add(key);
        totalKwh += bill.unitConsumedKwhr;
      }
    }
    const uniqueMonths = new Set(bills.map((b) => `${b.consumerNumber}||${b.month}`)).size;
    // Annualise if less than 12 months of data
    const annualKwh = uniqueMonths < 12 ? (totalKwh / uniqueMonths) * 12 : totalKwh;
    if (uniqueMonths < 12) {
      estimatedFields.push(`operational.utilityBills.annualised(${uniqueMonths}months)`);
    }
    return { annualKwh, source: 'bills' };
  }

  // Fallback: manual estimate
  const manual = electrical?.energy?.monthlyConsumptionKwh;
  if (manual && !electrical?.energy?.isEstimated) {
    return { annualKwh: manual * 12, source: 'manual' };
  }

  // Last resort: estimate from appliances
  estimatedFields.push('energy.monthlyConsumptionKwh');
  const hoursPerYear =
    (data.usage?.operatingHoursPerDay ?? 10) * (data.usage?.operatingDaysPerWeek ?? 6) * 52;
  return { annualKwh: estimateAnnualKwh(data, hoursPerYear), source: 'estimated' };
}

/**
 * Returns the best annual fuel consumption for one DG set.
 * Priority: actual generation records > Phase 1 monthly averages > capacity estimate.
 */
function resolveDGFuelAnnual(
  dgSet: IDGSet,
  generationRecords: IDGGenerationRecord[],
  factors: EmissionFactors,
  estimatedFields: string[]
): { fuelL: number; source: 'actual' | 'average' | 'estimated' } {
  const records = generationRecords.filter((r) => r.dgId === dgSet.dgId);

  if (records.length > 0) {
    const totalFuel = records.reduce((s, r) => s + (r.totalFuelConsumptionL ?? 0), 0);
    const totalMonths = new Set(records.map((r) => r.month)).size;
    const annualFuel = totalMonths < 12 ? (totalFuel / totalMonths) * 12 : totalFuel;
    if (totalMonths < 12) {
      estimatedFields.push(`dgGeneration.${dgSet.dgId}.annualised(${totalMonths}months)`);
    }
    return { fuelL: annualFuel, source: 'actual' };
  }

  // Phase 1 monthly average
  if (dgSet.monthlyFuelConsumptionL) {
    return { fuelL: dgSet.monthlyFuelConsumptionL * 12, source: 'average' };
  }

  // Estimate from energy generation + SFC
  const efPerL = dgSet.emissionFactorKgCo2PerL ?? factors.dieselKgCo2PerLitre;
  const efPerKwhr = dgSet.emissionFactorKgCo2PerKwhr ?? null;
  const sfc = dgSet.specificFuelConsumptionLPerKwh ?? 0.25;

  if (dgSet.monthlyEnergyGenerationKwhr) {
    const monthlyFuel = efPerKwhr
      ? dgSet.monthlyEnergyGenerationKwhr * (efPerL / (efPerKwhr > 0 ? efPerKwhr : efPerL))
      : dgSet.monthlyEnergyGenerationKwhr * sfc;
    estimatedFields.push(`dgSets.${dgSet.dgId}.fuelEstimated`);
    return { fuelL: monthlyFuel * 12, source: 'estimated' };
  }

  if (dgSet.monthlyRuntimeHours && dgSet.capacityKva) {
    const kw = dgSet.capacityKva * 0.8;
    const monthlyKwh = kw * 0.75 * dgSet.monthlyRuntimeHours;
    estimatedFields.push(`dgSets.${dgSet.dgId}.fuelEstimated`);
    return { fuelL: monthlyKwh * sfc * 12, source: 'estimated' };
  }

  estimatedFields.push(`dgSets.${dgSet.dgId}.noOperationalData`);
  return { fuelL: 0, source: 'estimated' };
}

// ── GRID EMISSION FACTOR RESOLUTION ─────────────────────────────────────────
/**
 * Resolves the effective grid emission factor to use in carbon calculations.
 * Priority: user-entered EF > CEA published factor for year > hardcoded fallback.
 * T&D losses are applied as a gross-up: grossEF = EF / (1 - tdLoss/100)
 */
function resolveGridEmissionFactor(
  electrical: IElectricalSectionData | null | undefined,
  hardcodedDefault: number,
  estimatedFields: string[],
  currentYear: number = new Date().getFullYear()
): { ef: number; source: string; tdLossApplied: number } {
  const efRecords = electrical?.gridEmissionFactors ?? [];

  if (efRecords.length > 0) {
    const sorted = [...efRecords].sort((a, b) => b.year - a.year);
    const match = sorted.find((r) => r.year <= currentYear && r.emissionFactorKgCo2PerKwhr > 0);

    if (match) {
      const tdLoss = match.tdLossPercent ?? 0;
      const grossEF =
        tdLoss > 0
          ? match.emissionFactorKgCo2PerKwhr / (1 - tdLoss / 100)
          : match.emissionFactorKgCo2PerKwhr;

      return {
        ef: parseFloat(grossEF.toFixed(5)),
        source: `user_entered_${match.year}_${match.source}`,
        tdLossApplied: tdLoss,
      };
    }
  }

  // Fall back to CEA published factor for the year
  const ceaYears = Object.keys(CEA_EF_SHARED)
    .map(Number)
    .sort((a, b) => b - a);
  const ceaYear = ceaYears.find((y) => y <= currentYear);
  if (ceaYear) {
    estimatedFields.push(`gridEF.cea_${ceaYear}`);
    return {
      ef: CEA_EF_SHARED[ceaYear],
      source: `cea_${ceaYear}`,
      tdLossApplied: 0,
    };
  }

  // Final hardcoded fallback
  estimatedFields.push('gridEF.hardcoded_fallback');
  return { ef: hardcodedDefault, source: 'hardcoded_0716', tdLossApplied: 0 };
}

// ── MAIN OPERATIONAL CARBON FUNCTION ─────────────────────────────────────────
export function calculateOperationalCarbon(
  data: ISubmissionData,
  factors: EmissionFactors | ResolvedEmissionFactors,
  estimatedFields: string[]
): {
  total: number;
  scope1: number;
  scope2: number;
  scope3: number;
  breakdown: Record<string, unknown>;
  dataSource: Record<string, unknown>;
} {
  const electrical = data.electrical as IElectricalSectionData | null | undefined;
  const genRecords = electrical?.operational?.dgGenerationRecords ?? [];

  // ── GRID ELECTRICITY ──────────────────────────────────────────────────────
  const { annualKwh, source: gridSource } = resolveAnnualGridKwh(electrical, data, estimatedFields);

  // ── RENEWABLE OFFSET (5-level hierarchy) ─────────────────────────────────
  let solarOffsetKwh = 0;
  let solarOffsetSource: string = 'none';

  const elec = electrical;

  // LEVEL 1 — Actual measured plant generation from 3.1 logs
  const plantGenMonthly = (elec as IElectricalSectionData)?.plantGenerationMonthly ?? [];
  if (plantGenMonthly.length > 0) {
    const solarPlants = plantGenMonthly.filter(
      (r: IPlantGenerationMonthly) => r.technology.startsWith('solar') && r.totalKwhGenerated
    );
    if (solarPlants.length > 0) {
      const totalGenKwh = solarPlants.reduce(
        (s: number, r: IPlantGenerationMonthly) => s + (r.totalKwhGenerated ?? 0),
        0
      );
      const uniqueMonths = new Set(
        solarPlants.map((r: IPlantGenerationMonthly) => `${r.year}-${r.monthIndex}`)
      ).size;
      solarOffsetKwh = uniqueMonths < 12 ? (totalGenKwh / uniqueMonths) * 12 : totalGenKwh;
      if (uniqueMonths < 12) estimatedFields.push(`solarOffset.scaledFrom${uniqueMonths}Months`);
      solarOffsetSource = 'plant_generation_log';
    }
  }

  // LEVEL 2 — GHI-derived yield from 3.2 solar resource measurements
  const solarResourceMonthly = (elec as IElectricalSectionData)?.solarResourceMonthly ?? [];
  if (solarOffsetKwh === 0 && solarResourceMonthly.length > 0 && elec?.energy?.solarCapacityKw) {
    const capacityKwp = elec.energy.solarCapacityKw;
    const prsWithValue = plantGenMonthly.filter(
      (r: IPlantGenerationMonthly) => r.avgPerformanceRatio
    );
    const avgPR = prsWithValue.length
      ? prsWithValue.reduce(
          (s: number, r: IPlantGenerationMonthly) => s + (r.avgPerformanceRatio ?? 80),
          0
        ) /
        prsWithValue.length /
        100
      : 0.8;

    let ghiDerivedKwh = 0;
    for (const month of solarResourceMonthly as ISolarResourceMonthly[]) {
      if (month.peakSunHours) {
        ghiDerivedKwh += month.peakSunHours * capacityKwp * avgPR;
      } else if (month.avgGhiWm2) {
        const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month.monthIndex - 1];
        const peakSunH = (month.avgGhiWm2 / 1000) * daysInMonth;
        ghiDerivedKwh += peakSunH * capacityKwp * avgPR;
      }
    }
    if (ghiDerivedKwh > 0) {
      const uniqueMonths = solarResourceMonthly.length;
      solarOffsetKwh = uniqueMonths < 12 ? (ghiDerivedKwh / uniqueMonths) * 12 : ghiDerivedKwh;
      if (uniqueMonths < 12) estimatedFields.push(`solarOffset.ghiScaledFrom${uniqueMonths}Months`);
      solarOffsetSource = 'ghi_derived';
    }
  }

  // LEVEL 3 — 3.6 Assessment annual generation potential
  const renewableAssessment = (elec as IElectricalSectionData)?.renewableAssessment ?? [];
  if (solarOffsetKwh === 0 && renewableAssessment.length > 0) {
    const solarAssessments = (renewableAssessment as IRenewableAssessmentRecord[]).filter(
      (a) => a.energySource.startsWith('solar') && a.approxAnnualGenerationPotentialMwh
    );
    if (solarAssessments.length > 0) {
      solarOffsetKwh = solarAssessments.reduce(
        (s, a) => s + (a.approxAnnualGenerationPotentialMwh ?? 0) * 1000,
        0
      );
      estimatedFields.push('solarOffset.fromAssessmentEstimate');
      solarOffsetSource = 'assessment_estimate';
    }
  }

  // LEVEL 4 — Phase 2 utility bill solar figures
  const bills = elec?.operational?.utilityBills ?? [];
  if (solarOffsetKwh === 0 && bills.length > 0) {
    const billSolar = bills.reduce((s, b) => s + (b.solarUnitGeneratedKwhr ?? 0), 0);
    if (billSolar > 0) {
      const billMonths = bills.filter((b) => b.solarUnitGeneratedKwhr).length;
      solarOffsetKwh = billMonths < 12 ? (billSolar / billMonths) * 12 : billSolar;
      if (billMonths < 12) estimatedFields.push(`solarOffset.billScaledFrom${billMonths}Months`);
      solarOffsetSource = 'utility_bill_solar';
    }
  }

  // LEVEL 5 — Phase 1 capacity × 1200 peak sun hours (Varanasi)
  if (solarOffsetKwh === 0 && elec?.energy?.solarCapacityKw) {
    solarOffsetKwh = elec.energy.solarCapacityKw * 1200;
    estimatedFields.push('solarOffset.phase1CapacityEstimate');
    solarOffsetSource = 'capacity_estimate';
  }

  // WIND OFFSET — from 3.1 plant generation log (wind plants)
  let windOffsetKwh = 0;
  if (plantGenMonthly.length > 0) {
    const windPlants = plantGenMonthly.filter(
      (r: IPlantGenerationMonthly) => r.technology === 'wind_turbine' && r.totalKwhGenerated
    );
    if (windPlants.length > 0) {
      const totalWindKwh = windPlants.reduce(
        (s: number, r: IPlantGenerationMonthly) => s + (r.totalKwhGenerated ?? 0),
        0
      );
      const uniqueMonths = new Set(
        windPlants.map((r: IPlantGenerationMonthly) => `${r.year}-${r.monthIndex}`)
      ).size;
      windOffsetKwh = uniqueMonths < 12 ? (totalWindKwh / uniqueMonths) * 12 : totalWindKwh;
    }
  }

  // ── GRID EMISSION FACTOR RESOLUTION (Phase 6) ───────────────────────────
  const efResolved = resolveGridEmissionFactor(
    electrical,
    factors.electricityKgCo2PerKwh,
    estimatedFields
  );
  const electricityKgCo2PerKwh = efResolved.ef;

  const totalRenewableOffsetKwh = solarOffsetKwh + windOffsetKwh;
  const renewableOffsetTco2e = (totalRenewableOffsetKwh * electricityKgCo2PerKwh) / 1000;

  const netGridKwh = Math.max(annualKwh - totalRenewableOffsetKwh, 0);
  const gridCo2Tco2e = (netGridKwh * electricityKgCo2PerKwh) / 1000;

  // ── TRANSFORMER LOSSES (scope 2) ─────────────────────────────────────────
  let transformerLossTco2e = 0;
  for (const tr of electrical?.transformers ?? []) {
    const noLoad = ((tr.noLoadLossKw ?? 0) * 8760 * electricityKgCo2PerKwh) / 1000;
    const loadLoss = ((tr.loadLossKw ?? 0) * 0.5 * 8760 * electricityKgCo2PerKwh) / 1000;
    transformerLossTco2e += noLoad + loadLoss;
  }

  // ── DG SETS (scope 1) ─────────────────────────────────────────────────────
  let dgScope1Tco2e = 0;
  const dgBreakdown: Record<string, number> = {};
  let dgDataSource: 'actual' | 'average' | 'estimated' = 'estimated';

  for (const dg of electrical?.dgSets ?? []) {
    const efPerL = dg.emissionFactorKgCo2PerL ?? factors.dieselKgCo2PerLitre;
    const retrofit = dg.emissionReductionRetrofitPercent
      ? 1 - dg.emissionReductionRetrofitPercent / 100
      : 1;

    const { fuelL, source } = resolveDGFuelAnnual(dg, genRecords, factors, estimatedFields);
    if (source === 'actual') dgDataSource = 'actual';
    else if (source === 'average' && dgDataSource !== 'actual') dgDataSource = 'average';

    const co2Tco2e = (fuelL * efPerL * retrofit) / 1000;
    dgScope1Tco2e += co2Tco2e;
    dgBreakdown[dg.dgId || dg.id] = parseFloat(co2Tco2e.toFixed(3));
  }

  // ── EV CHARGING — Scope 2 (Phase 9.1) ────────────────────────────────────
  let evChargingKwhPerYear = 0;
  let evChargingTco2ePerYear = 0;

  const evChargers = electrical?.evChargers ?? [];
  for (const ev of evChargers) {
    if (ev.monthlyKwhConsumption) {
      evChargingKwhPerYear += ev.monthlyKwhConsumption * 12;
    } else if (ev.ratingKw && ev.quantity) {
      const diversity = ev.diversityFactor ?? 0.4;
      const hours = ev.operatingHoursPerDay ?? 8;
      evChargingKwhPerYear += ev.ratingKw * ev.quantity * diversity * hours * 365;
      estimatedFields.push(`evCharging.${ev.evseId}.estimated`);
    }
  }
  if (evChargingKwhPerYear > 0) {
    evChargingTco2ePerYear = (evChargingKwhPerYear * electricityKgCo2PerKwh) / 1000;
  }

  // ── VEHICLE FLEET — Scope 1 transport (Phase 9.2) ────────────────────────
  let vehicleDieselCo2KgPerYear = 0;
  let vehicleKeroseneCo2KgPerYear = 0;

  const vehicleRecords = electrical?.vehicleFuelRecords ?? [];
  for (const v of vehicleRecords) {
    const annualDieselL =
      v.annualDieselLitres ?? (v.monthlyDieselLitres ? v.monthlyDieselLitres * 12 : 0);
    const dieselEF = v.dieselEmissionFactorKgCo2PerL ?? factors.dieselKgCo2PerLitre;
    vehicleDieselCo2KgPerYear += annualDieselL * dieselEF;

    const annualKerL =
      v.annualKeroseneLitres ?? (v.monthlyKeroseneLitres ? v.monthlyKeroseneLitres * 12 : 0);
    const kerEF = v.keroseneEmissionFactorKgCo2PerL ?? 2.54;
    vehicleKeroseneCo2KgPerYear += annualKerL * kerEF;
  }

  const vehicleTransportTco2ePerYear =
    (vehicleDieselCo2KgPerYear + vehicleKeroseneCo2KgPerYear) / 1000;

  if (vehicleRecords.length === 0) estimatedFields.push('vehicleTransport.noData');

  // ── REFRIGERANT LEAKAGE & FIRE EXTINGUISHERS ───────────────────────────────
  const { refrigerantTco2e, fireExtTco2e } = calculateRefrigerantEmissions(electrical, factors);

  // ── SCOPE 3 ACTIVITIES ─────────────────────────────────────────────────────
  const scope3Activities = (electrical as IElectricalSectionData | null | undefined)
    ?.scope3Activities;
  const { commuteTco2e, airTravelTco2e, officeEquipTco2e } = calculateScope3Activities(
    scope3Activities,
    factors
  );
  const scope3 = commuteTco2e + airTravelTco2e + officeEquipTco2e;

  // ── TOTALS ─────────────────────────────────────────────────────────────────
  const electricityTco2e = gridCo2Tco2e;
  const transformerTco2e = transformerLossTco2e;
  const scope2 = electricityTco2e + transformerTco2e + evChargingTco2ePerYear;
  const scope1 = dgScope1Tco2e + vehicleTransportTco2ePerYear + refrigerantTco2e + fireExtTco2e;
  const total = scope1 + scope2 + scope3;

  // Availability flags
  const avail = {
    gridSource,
    dgDataSource,
    solarOffsetSource,
  };

  return {
    total,
    scope1,
    scope2,
    scope3,
    breakdown: {
      ...avail,
      gridKwhAnnual: annualKwh,
      solarOffsetKwh,
      windOffsetKwh,
      renewableOffsetKwh: totalRenewableOffsetKwh,
      renewableOffset: -renewableOffsetTco2e,
      electricity: gridCo2Tco2e,
      transformerLosses: transformerTco2e,
      dgSets: dgBreakdown,
      evCharging: parseFloat(evChargingTco2ePerYear.toFixed(3)),
      vehicleDiesel: parseFloat((vehicleDieselCo2KgPerYear / 1000).toFixed(3)),
      vehicleKerosene: parseFloat((vehicleKeroseneCo2KgPerYear / 1000).toFixed(3)),
      refrigerants: parseFloat(refrigerantTco2e.toFixed(4)),
      fire_extinguishers: parseFloat(fireExtTco2e.toFixed(4)),
      commute: parseFloat(commuteTco2e.toFixed(4)),
      air_travel: parseFloat(airTravelTco2e.toFixed(4)),
      office_equipment: parseFloat(officeEquipTco2e.toFixed(4)),
    },
    dataSource: {
      ...avail,
      renewableOffsetKwh: totalRenewableOffsetKwh,
      gridEmissionFactorSource: efResolved.source,
      gridEmissionFactorValue: efResolved.ef,
      tdLossApplied: efResolved.tdLossApplied,
      transportDataSource: vehicleRecords.length > 0 ? 'measured' : 'none',
    },
  };
}

// ── GWP-based refrigerant & fire extinguisher emission calculation ────────────
// GWP fallbacks (IPCC AR5) used when ef.refrigerants is absent (plain EmissionFactors).
const GWP_FALLBACK: Record<string, number> = {
  r22: 1960,
  r407c: 1908,
  r134a: 1530,
  r410a: 2256,
  r404a: 4728,
  r32: 771,
};

function calculateRefrigerantEmissions(
  electrical: IElectricalSectionData | null | undefined,
  factors: EmissionFactors | ResolvedEmissionFactors
): { refrigerantTco2e: number; fireExtTco2e: number } {
  const gwpMap: Record<string, number> =
    'refrigerants' in factors && factors.refrigerants
      ? (factors as ResolvedEmissionFactors).refrigerants
      : GWP_FALLBACK;

  const fireExtGwp =
    'fireExtinguisher' in factors &&
    typeof (factors as ResolvedEmissionFactors).fireExtinguisher === 'number'
      ? (factors as ResolvedEmissionFactors).fireExtinguisher
      : 1.0;

  let refrigerantKgCo2e = 0;
  for (const rec of (electrical?.refrigerantRecords ?? []) as IRefrigerantRecord[]) {
    let leakedKg: number;
    if ((rec.annualTopUpKg ?? 0) > 0) {
      leakedKg = rec.annualTopUpKg!;
    } else if ((rec.installationChargeKg ?? 0) > 0) {
      leakedKg = rec.installationChargeKg! * ((rec.annualLeakageRatePercent ?? 5) / 100);
    } else {
      continue;
    }
    const gwp = gwpMap[rec.refrigerantType.toLowerCase()] ?? 0;
    refrigerantKgCo2e += leakedKg * gwp;
  }

  let fireExtKgCo2e = 0;
  for (const rec of (electrical?.fireExtinguisherRecords ?? []) as IFireExtinguisherRecord[]) {
    const dischargedKg =
      ((rec.co2ChargeKg ?? 0) * (rec.count ?? 1) * (rec.annualDischargePercent ?? 5)) / 100;
    fireExtKgCo2e += dischargedKg * fireExtGwp;
  }

  return {
    refrigerantTco2e: refrigerantKgCo2e / 1000,
    fireExtTco2e: fireExtKgCo2e / 1000,
  };
}

// ── Scope 3 activity emission calculation ─────────────────────────────────────
const INR_TO_USD_2022 = 83;

function calculateScope3Activities(
  activities: IScope3Activities | null | undefined,
  factors: EmissionFactors | ResolvedEmissionFactors
): { commuteTco2e: number; airTravelTco2e: number; officeEquipTco2e: number } {
  const commuteEF =
    'employeeCommute' in factors ? (factors as ResolvedEmissionFactors).employeeCommute : 0.15;
  const airEF =
    'airTravelDomestic' in factors ? (factors as ResolvedEmissionFactors).airTravelDomestic : 0.2;
  const equipEF =
    'officeEquipment' in factors ? (factors as ResolvedEmissionFactors).officeEquipment : 0.246;

  let commuteTco2e = 0;
  for (const rec of activities?.commuteRecords ?? []) {
    const totalKm =
      (rec.numberOfCommuters ?? 0) *
      2 *
      (rec.averageOnewayDistanceKm ?? 0) *
      (rec.commuteDaysPerYear ?? 0);
    commuteTco2e += (totalKm * commuteEF) / 1000;
  }

  let airTravelTco2e = 0;
  for (const rec of activities?.airTravelRecords ?? []) {
    let passengerKm: number;
    if ((rec.totalPassengerKm ?? 0) > 0) {
      passengerKm = rec.totalPassengerKm!;
    } else {
      const legs = rec.isRoundTrip ? 2 : 1;
      passengerKm = (rec.numberOfTrips ?? 0) * (rec.averageDistanceKmPerTrip ?? 0) * legs;
    }
    airTravelTco2e += (passengerKm * airEF) / 1000;
  }

  let officeEquipTco2e = 0;
  for (const rec of activities?.officeEquipmentRecords ?? []) {
    const usd =
      (rec.totalSpend2022USD ?? 0) > 0
        ? rec.totalSpend2022USD!
        : (rec.totalSpendINR ?? 0) / INR_TO_USD_2022;
    officeEquipTco2e += (usd * equipEF) / 1000;
  }

  return { commuteTco2e, airTravelTco2e, officeEquipTco2e };
}

// IE class correction map — same values as shared constants but inlined to avoid
// a circular dep between server engine and shared constants at runtime.
const IE_CLASS_CORRECTION_MAP: Record<string, number> = {
  IE1: 1.08,
  IE2: 1.04,
  IE3: 1.0,
  IE4: 0.97,
  unknown: 1.05,
};

// ── APPLIANCE-BASED MONTHLY KWH ESTIMATE (fallback) ──────────────────────────
// Returns MONTHLY kWh. Caller multiplies × 12 for annual.
function estimateKwhFromAppliances(data: ISubmissionData): number {
  const hoursPerDay = data.usage?.operatingHoursPerDay ?? 10;
  const daysPerMonth = (data.usage?.operatingDaysPerWeek ?? 6) * 4.33;
  const elec = data.electrical as IElectricalSectionData | null | undefined;

  let totalMonthlyKwh = 0;

  // ── LIGHTING SURVEY (Phase 4 — most accurate for lighting) ──────
  if (elec?.lightingSurvey?.length) {
    const summerM = 6; // April–September
    const winterM = 6; // October–March
    const dpm = 30;

    for (const fixture of elec.lightingSurvey) {
      const annualKwh =
        ((fixture.quantity * fixture.wattageEach) / 1000) *
        (fixture.hoursPerDaySummer * summerM * dpm + fixture.hoursPerDayWinter * winterM * dpm);
      totalMonthlyKwh += annualKwh / 12;
    }
  } else {
    // Fall back to Phase 1 appliance lighting entries
    const cats = elec?.appliances?.appliances ?? [];
    const lightingAppliances = cats.filter((a) => a.category === 'lighting');
    for (const a of lightingAppliances) {
      const hours = a.hoursPerDay ?? hoursPerDay;
      const watts = a.wattsEach ?? 10;
      totalMonthlyKwh += (a.count * watts * hours * daysPerMonth) / 1000;
    }
  }

  // ── MOTORS & PUMPS (Phase 4) ──────────────────────────────────
  if (elec?.motorsPumps?.length) {
    for (const motor of elec.motorsPumps) {
      if (motor.duty === 'standby') continue; // standby rarely runs

      const ieCorrection = IE_CLASS_CORRECTION_MAP[motor.efficiencyClass] ?? 1.05;
      const effectiveKw = motor.ratedPowerKw * ieCorrection;
      const mHoursPerDay = motor.operatingHoursPerDay;
      const daysPerYear = motor.operatingDaysPerYear ?? 365;
      const annualKwh = effectiveKw * mHoursPerDay * daysPerYear;
      totalMonthlyKwh += annualKwh / 12;
    }
  }

  // ── NON-LIGHTING PHASE 1 APPLIANCES ──────────────────────────
  const cats = elec?.appliances?.appliances ?? [];
  const legacyCats = data.appliances?.categories;
  const allAppliances = cats.length
    ? cats
    : legacyCats
      ? [
          ...(legacyCats.lighting ?? []),
          ...(legacyCats.temperature_control ?? legacyCats.cooling ?? []),
          ...(legacyCats.computing ?? []),
          ...(legacyCats.labEquipment ?? []),
          ...(legacyCats.misc ?? []),
        ]
      : [];

  const nonLightingAppliances = allAppliances.filter((a) => a.category !== 'lighting');
  for (const a of nonLightingAppliances) {
    const hours = a.hoursPerDay ?? hoursPerDay;
    const watts = a.wattsEach ?? 100;

    if (a.qtyEfficientUnits !== undefined && a.qtyNonEfficientUnits !== undefined) {
      totalMonthlyKwh += (a.qtyEfficientUnits * watts * hours * daysPerMonth) / 1000;
      totalMonthlyKwh += (a.qtyNonEfficientUnits * watts * 1.4 * hours * daysPerMonth) / 1000;
    } else {
      totalMonthlyKwh += ((a.count ?? 1) * watts * hours * daysPerMonth) / 1000;
    }
  }

  // If nothing at all was found, return a non-zero default so the engine doesn't break
  return totalMonthlyKwh || 5000;
}

function estimateAnnualKwh(data: ISubmissionData, hoursPerYear: number): number {
  const cats = data.appliances?.categories;
  if (!cats) return 60000;

  const all = [
    ...(cats.lighting ?? []),
    ...(cats.temperature_control ?? cats.cooling ?? []),
    ...(cats.computing ?? []),
    ...(cats.labEquipment ?? []),
    ...(cats.misc ?? []),
  ];

  let totalWh = 0;
  for (const a of all) {
    const ratio = (a.hoursPerDay ?? 10) / 10;
    totalWh += a.count * (a.wattsEach ?? 100) * hoursPerYear * ratio;
  }
  return totalWh / 1000;
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW ENGINE (Task 1.2) — calculateOperational
// Uses field names from the calculation sheets; gracefully falls back to legacy
// Phase 2 paths when new fields are absent.
// ══════════════════════════════════════════════════════════════════════════════

export interface OperationalResult {
  totalOperationalCO2e: number;
  scope1: number;
  scope2: number;
  byComponent: {
    gridElectricity: number;
    dieselGenerator: number;
    lpgCooking: number;
    vehicleFleet: number;
    refrigerantLeakage: number;
    transformerLosses: number;
    evCharging: number;
  };
  meta: {
    gridKwh: number;
    solarOffsetKwh: number;
    windOffsetKwh: number;
    netGridKwh: number;
    gridEFUsed: number;
    gridEFSource: string;
    dgLitres: number;
    dgFuelSource: string;
  };
}

export function calculateOperational(
  data: ISubmissionData,
  ef: ResolvedEmissionFactors
): OperationalResult {
  const electrical = data.electrical as IElectricalSectionData | null | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const energy = (electrical?.energy as any) ?? {};

  // ── Sub-calc H: Renewable offsets (needed before grid calc) ──────────────
  let solarOffsetKwh = 0;

  // P1: 12-element monthly array
  const solarMonthly: number[] | undefined = energy.solarGenerationKwh;
  if (Array.isArray(solarMonthly) && solarMonthly.length > 0) {
    solarOffsetKwh = solarMonthly.reduce((a: number, b: number) => a + (b ?? 0), 0);
  }
  // P2: annual scalar
  if (solarOffsetKwh === 0 && energy.solarAnnualKwh) {
    solarOffsetKwh = energy.solarAnnualKwh as number;
  }
  // P3: renewables assessment current annual yield
  if (solarOffsetKwh === 0) {
    const assessments = (electrical as any)?.renewableAssessment ?? [];
    const solarAssessments = assessments.filter(
      (a: any) => a.energySource?.startsWith('solar') && a.approxAnnualGenerationPotentialMwh
    );
    if (solarAssessments.length > 0) {
      solarOffsetKwh = solarAssessments.reduce(
        (s: number, a: any) => s + (a.approxAnnualGenerationPotentialMwh ?? 0) * 1000,
        0
      );
    }
  }
  // P4: PV siting estimated annual yield
  if (solarOffsetKwh === 0) {
    const pvSiting = (electrical as any)?.pvSiting ?? [];
    const pvYield = pvSiting.reduce((s: number, r: any) => s + (r.estimatedAnnualYieldKwh ?? 0), 0);
    if (pvYield > 0) solarOffsetKwh = pvYield;
  }
  // P5: plant generation log (solar plants)
  if (solarOffsetKwh === 0) {
    const plantGen: any[] = (electrical as any)?.plantGenerationMonthly ?? [];
    const solarPlants = plantGen.filter(
      (r) => r.technology?.startsWith('solar') && (r.totalKwhGenerated ?? 0) > 0
    );
    if (solarPlants.length > 0) {
      const totalKwh = solarPlants.reduce((s: number, r: any) => s + (r.totalKwhGenerated ?? 0), 0);
      const uniqueMonths = new Set(solarPlants.map((r: any) => `${r.year}-${r.monthIndex}`)).size;
      solarOffsetKwh = uniqueMonths < 12 ? (totalKwh / uniqueMonths) * 12 : totalKwh;
    }
  }
  // Capacity-based fallback
  if (solarOffsetKwh === 0 && electrical?.energy?.solarCapacityKw) {
    solarOffsetKwh = electrical.energy.solarCapacityKw * 1200;
  }

  // Wind offset
  let windOffsetKwh = 0;
  if (energy.windAnnualKwh) {
    windOffsetKwh = energy.windAnnualKwh as number;
  } else {
    const plantGen: any[] = (electrical as any)?.plantGenerationMonthly ?? [];
    const windPlants = plantGen.filter(
      (r) => r.technology === 'wind_turbine' && (r.totalKwhGenerated ?? 0) > 0
    );
    if (windPlants.length > 0) {
      const totalKwh = windPlants.reduce((s: number, r: any) => s + (r.totalKwhGenerated ?? 0), 0);
      const uniqueMonths = new Set(windPlants.map((r: any) => `${r.year}-${r.monthIndex}`)).size;
      windOffsetKwh = uniqueMonths < 12 ? (totalKwh / uniqueMonths) * 12 : totalKwh;
    }
  }

  // ── Sub-calc A: Grid Electricity (Scope 2) ───────────────────────────────
  let rawGridKwh = 0;

  // P1: sum monthly array
  const monthlyFromGrid: number[] | undefined = energy.monthlyKwhFromGrid;
  if (Array.isArray(monthlyFromGrid) && monthlyFromGrid.length > 0) {
    rawGridKwh = monthlyFromGrid.reduce((a: number, b: number) => a + (b ?? 0), 0);
  }
  // P2: annual scalar
  else if (energy.annualKwhFromGrid) {
    rawGridKwh = energy.annualKwhFromGrid as number;
  }
  // P3: estimated annual
  else if (energy.estimatedAnnualKwh) {
    rawGridKwh = energy.estimatedAnnualKwh as number;
  }
  // Fallback: Phase 2 utility bills → monthly reading → appliance estimate
  else {
    const bills = electrical?.operational?.utilityBills ?? [];
    if (bills.length > 0) {
      const seen = new Set<string>();
      let billTotal = 0;
      for (const bill of bills) {
        const key = `${bill.consumerNumber}||${bill.month}`;
        if (!seen.has(key) && bill.unitConsumedKwhr) {
          seen.add(key);
          billTotal += bill.unitConsumedKwhr;
        }
      }
      const uniqueMonths = new Set(bills.map((b) => `${b.consumerNumber}||${b.month}`)).size;
      rawGridKwh = uniqueMonths < 12 ? (billTotal / uniqueMonths) * 12 : billTotal;
    } else if (electrical?.energy?.monthlyConsumptionKwh) {
      rawGridKwh = electrical.energy.monthlyConsumptionKwh * 12;
    }
  }

  // Grid EF priority
  let gridEFKgKwh: number;
  let gridEFSource: string;

  const userGridEF: number | undefined = energy.gridEmissionFactor;
  if (userGridEF && userGridEF > 0) {
    // user value in tCO2e/kWh when > 1; otherwise already in kg/kWh
    gridEFKgKwh = userGridEF > 1 ? userGridEF / 1000 : userGridEF;
    gridEFSource = 'user_entered';
  } else {
    const gridYear: number | undefined = energy.gridYear;
    const ceaFactor = gridYear ? CEA_EMISSION_FACTORS_BY_YEAR[gridYear] : undefined;
    if (ceaFactor) {
      gridEFKgKwh = ceaFactor;
      gridEFSource = 'cea_table';
    } else {
      gridEFKgKwh = ef.gridElectricity ?? GRID_EMISSION_FACTOR_KG_KWH;
      gridEFSource = 'default_0.82';
    }
  }

  // T&D loss gross-up
  const tdLossPercent: number = energy.transmissionLossPercent ?? 0;
  const grossEF = tdLossPercent > 0 ? gridEFKgKwh / (1 - tdLossPercent / 100) : gridEFKgKwh;

  const netGridKwh = Math.max(0, rawGridKwh - solarOffsetKwh - windOffsetKwh);
  const gridCO2e = (netGridKwh * grossEF) / 1000;

  // ── Sub-calc B: Diesel Generator (Scope 1) ───────────────────────────────
  let dgLitres = 0;
  let dgFuelSource: string;

  // P1: monthly actuals with fuelConsumedLitres
  const dgRecords: any[] =
    energy.dgGenerationRecords ?? electrical?.operational?.dgGenerationRecords ?? [];
  const recordsWithFuel = dgRecords.filter((r: any) => (r.fuelConsumedLitres ?? 0) > 0);

  if (recordsWithFuel.length > 0) {
    const totalFuel = recordsWithFuel.reduce(
      (s: number, r: any) => s + (r.fuelConsumedLitres ?? 0),
      0
    );
    const months = new Set(recordsWithFuel.map((r: any) => r.month)).size;
    dgLitres = months > 0 && months < 12 ? (totalFuel / months) * 12 : totalFuel;
    dgFuelSource = 'monthly_actuals';
  }
  // P2: annual scalar
  else if (energy.dgFuelConsumedLitresPerYear) {
    dgLitres = energy.dgFuelConsumedLitresPerYear as number;
    dgFuelSource = 'annual_scalar';
  }
  // P3: derive from DG set specs
  else {
    const DIESEL_CAL_VALUE = 10.8; // kWh/L
    const DG_EFF = 0.35;
    for (const dg of electrical?.dgSets ?? []) {
      const annualHrs =
        (dg as any).annualRunningHours ??
        (dg.monthlyRuntimeHours ? dg.monthlyRuntimeHours * 12 : 0);
      const annualKwh = dg.capacityKva * 0.8 * annualHrs;
      if (annualKwh > 0) {
        dgLitres += annualKwh / (DIESEL_CAL_VALUE * DG_EFF);
      } else if (dg.monthlyFuelConsumptionL) {
        dgLitres += dg.monthlyFuelConsumptionL * 12;
      }
    }
    dgFuelSource = 'derived';
  }

  const dgEF = ef.diesel ?? DIESEL_EF_KG_L;
  const dgCO2e = (dgLitres * dgEF) / 1000;

  // ── Sub-calc C: LPG Cooking Fuel (Scope 1) ───────────────────────────────
  let lpgCO2e = 0;
  const lpgEF = ef.lpg ?? LPG_EF_KG_KG;

  if (energy.lpgAnnualKg && (energy.lpgAnnualKg as number) > 0) {
    lpgCO2e = ((energy.lpgAnnualKg as number) * lpgEF) / 1000;
  } else {
    const cylPerMonth: number = energy.lpgCylindersPerMonth ?? 0;
    const cylPerYear: number = energy.lpgCylindersPerYear ?? 0;
    const annualCyl = cylPerMonth > 0 ? cylPerMonth * 12 : cylPerYear;
    if (annualCyl > 0) {
      lpgCO2e = (annualCyl * LPG_CYLINDER_KG * lpgEF) / 1000;
    }
  }

  // ── Sub-calc D: Vehicle Fleet (Scope 1) ──────────────────────────────────
  let vehicleCO2e = 0;
  for (const v of electrical?.vehicleFuelRecords ?? []) {
    const fuelType: string = (v as any).type ?? v.vehicleType ?? 'diesel';
    const annualLitres: number = (v as any).annualLitres ?? v.annualDieselLitres ?? 0;
    const annualKg: number = (v as any).annualKg ?? 0;
    const annualKerL: number = v.annualKeroseneLitres ?? 0;

    let fuelEF: number;
    let fuelAmt: number;

    if (fuelType === 'petrol') {
      fuelEF = PETROL_EF_KG_L;
      fuelAmt = annualLitres;
    } else if (fuelType === 'cng') {
      fuelEF = 1.96; // kg CO2/kg CNG
      fuelAmt = annualKg > 0 ? annualKg : annualLitres;
    } else if (fuelType === 'lpg') {
      fuelEF = LPG_EF_KG_KG;
      fuelAmt = annualKg > 0 ? annualKg : annualLitres;
    } else {
      // diesel / kerosene / default
      fuelEF = DIESEL_EF_KG_L;
      fuelAmt = annualLitres;
    }

    vehicleCO2e += (fuelAmt * fuelEF) / 1000;
    // legacy kerosene field
    if (annualKerL > 0) vehicleCO2e += (annualKerL * 2.54) / 1000;
  }

  // ── Sub-calc E: Fugitive Emissions — Refrigerants (Scope 1) ─────────────
  let refrigerantCO2e = 0;
  for (const rec of electrical?.refrigerantRecords ?? []) {
    const gwp =
      REFRIGERANT_EF[rec.refrigerantType.toUpperCase()] ??
      REFRIGERANT_EF[rec.refrigerantType.toLowerCase()] ??
      0;
    if (gwp === 0) continue;

    let co2e: number;
    if ((rec.annualTopUpKg ?? 0) > 0) {
      // total measured top-up for all units of this type
      co2e = (rec.annualTopUpKg! * gwp) / 1000;
    } else if ((rec.installationChargeKg ?? 0) > 0) {
      const leakRate =
        (rec.annualLeakageRatePercent ?? DEFAULT_REFRIGERANT_LEAKAGE_RATE * 100) / 100;
      const qty = (rec as any).quantity ?? 1;
      co2e = (qty * leakRate * rec.installationChargeKg! * gwp) / 1000;
    } else {
      continue;
    }
    refrigerantCO2e += co2e;
  }

  // ── Sub-calc F: Transformer Losses (Scope 2) ─────────────────────────────
  let transformerCO2e = 0;
  if (energy.transformerLossesKwh) {
    transformerCO2e = ((energy.transformerLossesKwh as number) * grossEF) / 1000;
  } else {
    for (const tr of electrical?.transformers ?? []) {
      const loadFactor: number = (tr as any).loadFactor ?? 0.7;
      const annualLossKwh =
        (tr.noLoadLossKw ?? 0) * 8760 + (tr.loadLossKw ?? 0) * loadFactor * 8760;
      transformerCO2e += (annualLossKwh * grossEF) / 1000;
    }
  }

  // ── Sub-calc G: EV Charging (Scope 2) ────────────────────────────────────
  let evCO2e = 0;
  for (const ev of electrical?.evChargers ?? []) {
    let evKwh = 0;
    if ((ev as any).annualKwhConsumed) {
      evKwh = (ev as any).annualKwhConsumed as number;
    } else if ((ev as any).monthlyChargingSessions && (ev as any).avgSessionKwh) {
      evKwh = (ev as any).monthlyChargingSessions * (ev as any).avgSessionKwh * 12;
    } else if (ev.monthlyKwhConsumption) {
      evKwh = ev.monthlyKwhConsumption * 12;
    } else if (ev.ratingKw && ev.quantity) {
      const diversity = ev.diversityFactor ?? 0.4;
      const hours = ev.operatingHoursPerDay ?? 8;
      evKwh = ev.ratingKw * ev.quantity * diversity * hours * 365;
    }
    evCO2e += (evKwh * grossEF) / 1000;
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const scope1 = dgCO2e + lpgCO2e + vehicleCO2e + refrigerantCO2e;
  const scope2 = gridCO2e + transformerCO2e + evCO2e;

  return {
    totalOperationalCO2e: scope1 + scope2,
    scope1,
    scope2,
    byComponent: {
      gridElectricity: parseFloat(gridCO2e.toFixed(4)),
      dieselGenerator: parseFloat(dgCO2e.toFixed(4)),
      lpgCooking: parseFloat(lpgCO2e.toFixed(4)),
      vehicleFleet: parseFloat(vehicleCO2e.toFixed(4)),
      refrigerantLeakage: parseFloat(refrigerantCO2e.toFixed(4)),
      transformerLosses: parseFloat(transformerCO2e.toFixed(4)),
      evCharging: parseFloat(evCO2e.toFixed(4)),
    },
    meta: {
      gridKwh: rawGridKwh,
      solarOffsetKwh,
      windOffsetKwh,
      netGridKwh,
      gridEFUsed: parseFloat(grossEF.toFixed(5)),
      gridEFSource,
      dgLitres: parseFloat(dgLitres.toFixed(2)),
      dgFuelSource,
    },
  };
}
