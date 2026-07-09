import {
  IStepWaste,
  IStepUsage,
  IWasteSectionData,
  IWaterSectionData,
  IWaterCarbonResults,
  IWastewaterGeneration,
  IWastewaterCharacteristicsRecord,
  IStpEtpPlant,
  IWastewaterCarbonResults,
  SolidWasteDisposalMethod,
  WastewaterTreatmentType,
  ISolidWasteGeneration,
  ILandfillSite,
  IIncinerationFacility,
  IMswPlant,
  ISolidWasteCarbonResults,
  ISubmissionData,
} from '@shared/types/submission.types';
import { WASTE_DEFAULTS_BY_BUILDING_TYPE } from '@shared/constants/defaults';
import {
  EmissionFactors,
  SOLID_WASTE_K,
  SOLID_WASTE_DOC,
  SOLID_WASTE_DOCf,
  SOLID_WASTE_F,
  LANDFILL_MCF,
  DEFAULT_LANDFILL_MCF,
  INCINERATION_CC,
  INCINERATION_FCF,
  INCINERATION_BOE,
  WASTEWATER_Bo,
  WASTEWATER_MCF,
  DEFAULT_WASTEWATER_MCF,
  WASTEWATER_N2O_EF_CENTRALIZED,
  WASTEWATER_BFCX,
  WASTEWATER_Tj,
  PROTEIN_FPC_KG_PERSON_YR,
  PROTEIN_DIGESTIBILITY,
  PROTEIN_N_FRACTION,
  PROTEIN_NPRC,
  N2O_N_TO_N2O,
  GWP_CH4,
  GWP_N2O,
  DEFAULT_BOD_MG_L,
  DEFAULT_TKN_MG_L,
  WTP_ENERGY_KWH_M3,
  RO_ENERGY_KWH_M3,
  STP_ENERGY_KWH_M3_DEFAULT,
  GRID_EMISSION_FACTOR_KG_KWH,
} from './defaults';
import { ResolvedEmissionFactors } from './efLoader';

// ── IPCC 2006 Vol. 5 constants for wastewater ─────────────────────
const IPCC_Bo = 0.6;
const IPCC_GWP_CH4 = 28;
const IPCC_GWP_N2O = 265;
const IPCC_N2O_EF_EFFLUENT = 0.005;

const MCF_BY_TREATMENT: Record<string, number> = {
  no_treatment: 1.0,
  preliminary_only: 0.9,
  primary_only: 0.6,
  aerobic_secondary: 0.1,
  aerobic_secondary_tertiary: 0.1,
  anaerobic_lagoon: 0.8,
  anaerobic_reactor: 0.8,
  septic_tank: 0.5,
  well_managed_aerobic: 0.1,
  unmanaged_lagoon: 0.8,
};

const STP_ENERGY_KWH_M3_ENGINE: Record<string, number> = {
  preliminary: 0.05,
  primary: 0.1,
  secondary: 0.35,
  tertiary: 0.45,
};

function deriveMcfFromTreatment(plant: IStpEtpPlant): number {
  const m = plant.treatmentMethods;
  if (!m) return MCF_BY_TREATMENT.no_treatment;
  if (m.isAnaerobic && m.secondary) return MCF_BY_TREATMENT.anaerobic_reactor;
  if (m.secondary && !m.isAnaerobic) return MCF_BY_TREATMENT.aerobic_secondary;
  if (m.primary && !m.secondary) return MCF_BY_TREATMENT.primary_only;
  if (m.preliminary && !m.primary && !m.secondary) return MCF_BY_TREATMENT.preliminary_only;
  return MCF_BY_TREATMENT.no_treatment;
}

// ── IPCC 2006 Vol. 5 — Solid Waste Landfill Constants ────────────
const IPCC_LANDFILL = {
  DOCf: 0.5,
  F: 0.5,
  OX: 0.1,
  GWP_CH4: 28,
};

const DOC_BY_CATEGORY: Record<string, number> = {
  domestic_wet_food: 0.15,
  domestic_dry: 0.05,
  domestic_ewaste: 0.0,
  domestic_bulky: 0.05,
  garden_grass_leaves: 0.2,
  garden_fruits_veg: 0.15,
  garden_twigs: 0.3,
  garden_misc: 0.2,
  hospital_nonbiomedical: 0.15,
  hospital_biomedical: 0.15,
  kitchen_solid: 0.15,
  construction: 0.03,
  other_organic: 0.15,
  scrap_inert: 0.0,
};

const MCF_BY_LANDFILL_TYPE: Record<string, number> = {
  managed_sanitary: 1.0,
  semi_controlled: 0.5,
  uncontrolled_open_dump: 0.4,
};

const INCINERATION_EF_ENGINE: Record<string, number> = {
  msw_incinerator: 0.91,
  biomedical_incinerator: 0.8,
  industrial_incinerator: 0.95,
  waste_to_energy: 0.84,
  other: 0.91,
};

const INCINERATION_N2O_KG_PER_TONNE = 0.04;
const MSW_PLANT_ENERGY_KWH_PER_TONNE = 35;

function computeWeightedDOC(gen: ISolidWasteGeneration, totalTonnes: number): number {
  if (totalTonnes <= 0) return 0.15;
  let docSum = 0;
  const add = (val: number | undefined, doc: number) => {
    if (val) docSum += val * doc;
  };
  add(gen.domesticWetWasteTonsPerAnnum?.current, DOC_BY_CATEGORY.domestic_wet_food);
  add(gen.domesticDryWasteTonsPerAnnum?.current, DOC_BY_CATEGORY.domestic_dry);
  add(gen.domesticEWasteTonsPerAnnum?.current, DOC_BY_CATEGORY.domestic_ewaste);
  add(gen.gardenGrassCuttingsLeaves?.current, DOC_BY_CATEGORY.garden_grass_leaves);
  add(gen.gardenFruitsVegetables?.current, DOC_BY_CATEGORY.garden_fruits_veg);
  add(gen.gardenTwigsBranches?.current, DOC_BY_CATEGORY.garden_twigs);
  add(gen.kitchenSolidFoodWaste?.current, DOC_BY_CATEGORY.kitchen_solid);
  add(gen.constructionGeneratedWaste?.current, DOC_BY_CATEGORY.construction);
  add(gen.otherAnimalWaste?.current, DOC_BY_CATEGORY.other_organic);
  add(gen.scrapVehicle?.current, DOC_BY_CATEGORY.scrap_inert);
  add(gen.scrapEWaste?.current, DOC_BY_CATEGORY.scrap_inert);
  return docSum / totalTonnes;
}

function sumOrganicTonnes(gen: ISolidWasteGeneration): number {
  return (
    (gen.domesticWetWasteTonsPerAnnum?.current ?? 0) +
    (gen.gardenGrassCuttingsLeaves?.current ?? 0) +
    (gen.gardenFruitsVegetables?.current ?? 0) +
    (gen.gardenTwigsBranches?.current ?? 0) +
    (gen.gardenMiscGreenWaste?.current ?? 0) +
    (gen.kitchenSolidFoodWaste?.current ?? 0) +
    (gen.hospitalNonBiomedicalWaste?.current ?? 0) +
    (gen.otherAnimalWaste?.current ?? 0) +
    (gen.otherSlaughterWaste?.current ?? 0)
  );
}

export function calculateSolidWastePhase3(
  generation: ISolidWasteGeneration | undefined,
  landfillSites: ILandfillSite[] | undefined,
  incinerationFacilities: IIncinerationFacility[] | undefined,
  mswPlants: IMswPlant[] | undefined,
  gridEfKgCo2PerKwh: number,
  estimatedFields: string[]
): ISolidWasteCarbonResults | null {
  const hasLandfill = (landfillSites?.length ?? 0) > 0;
  const hasIncineration = (incinerationFacilities?.length ?? 0) > 0;
  const hasGeneration =
    generation !== undefined &&
    Object.keys(generation).some((k) => (generation as Record<string, unknown>)[k] !== undefined);

  if (!hasLandfill && !hasIncineration && !hasGeneration) return null;

  let calculationMethod: ISolidWasteCarbonResults['calculationMethod'] = 'phase1_simple_ef';

  // ── LANDFILL CH4 ──
  let totalLandfillTonnes = 0;
  let landfillCh4Tco2e = 0;
  let weightedDocSum = 0;
  let weightedMcfSum = 0;
  let landfillMcfUsed = 1.0;
  let landfillDocUsed = 0.15;

  if (hasLandfill) {
    for (const site of landfillSites!) {
      let annualTonnes = 0;
      if (site.monthlyRecords.length > 0) {
        const recentYear = Math.max(...site.monthlyRecords.map((r) => r.year));
        annualTonnes = site.monthlyRecords
          .filter((r) => r.year === recentYear)
          .reduce((s, r) => s + (r.wasteTonnes ?? 0), 0);
        calculationMethod = 'ipcc_fod_monthly';
      } else if (site.yearWiseAnnualTotals?.length) {
        annualTonnes = site.yearWiseAnnualTotals[site.yearWiseAnnualTotals.length - 1]?.totalTonnes ?? 0;
        calculationMethod = 'ipcc_fod_annual';
      }
      if (annualTonnes <= 0) continue;
      totalLandfillTonnes += annualTonnes;
      const mcf = MCF_BY_LANDFILL_TYPE[site.landfillType ?? 'managed_sanitary'] ?? 1.0;
      weightedMcfSum += mcf * annualTonnes;
      const doc = generation ? computeWeightedDOC(generation, annualTonnes) : 0.15;
      weightedDocSum += doc * annualTonnes;
      const ch4Tonnes =
        annualTonnes *
        doc *
        IPCC_LANDFILL.DOCf *
        IPCC_LANDFILL.F *
        (16 / 12) *
        mcf *
        (1 - IPCC_LANDFILL.OX);
      const captureReduction = site.hasBiogasCapture
        ? (site.biogasCaptureEfficiency ?? 80) / 100
        : 0;
      const ch4Net = ch4Tonnes * (1 - captureReduction);
      landfillCh4Tco2e += ch4Net * IPCC_LANDFILL.GWP_CH4;
      if (captureReduction > 0) estimatedFields.push(`landfill.${site.id}.biogasCapture`);
    }
    if (totalLandfillTonnes > 0) {
      landfillMcfUsed = weightedMcfSum / totalLandfillTonnes;
      landfillDocUsed = weightedDocSum / totalLandfillTonnes;
    }
  } else if (hasGeneration) {
    const organic = sumOrganicTonnes(generation!);
    const doc = computeWeightedDOC(generation!, organic);
    totalLandfillTonnes = organic;
    const ch4 =
      organic *
      doc *
      IPCC_LANDFILL.DOCf *
      IPCC_LANDFILL.F *
      (16 / 12) *
      MCF_BY_LANDFILL_TYPE.managed_sanitary *
      (1 - IPCC_LANDFILL.OX);
    landfillCh4Tco2e = ch4 * IPCC_LANDFILL.GWP_CH4;
    landfillMcfUsed = 1.0;
    landfillDocUsed = doc;
    calculationMethod = 'ipcc_fod_annual';
    estimatedFields.push('solidWaste.landfill.estimatedFromGenerationCategories');
  }

  // ── INCINERATION CO2 + N2O ──
  let totalIncinerationTonnes = 0;
  let incinerationCo2Tco2e = 0;
  let incinerationN2oTco2e = 0;
  for (const facility of incinerationFacilities ?? []) {
    if (facility.monthlyRecords.length > 0) {
      const recentYear = Math.max(...facility.monthlyRecords.map((r) => r.year));
      const annual = facility.monthlyRecords
        .filter((r) => r.year === recentYear)
        .reduce((s, r) => s + (r.wasteTonnes ?? 0), 0);
      totalIncinerationTonnes += annual;
      const ef =
        facility.emissionFactorTco2PerTonne ??
        INCINERATION_EF_ENGINE[facility.incineratorType ?? 'msw_incinerator'];
      incinerationCo2Tco2e += annual * ef;
      incinerationN2oTco2e += ((annual * INCINERATION_N2O_KG_PER_TONNE) / 1000) * 265;
    }
  }

  // ── MSW PLANT ELECTRICITY (Scope 2) ──
  let mswAnnualKwh = 0;
  for (const plant of mswPlants ?? []) {
    const throughput = (plant.actualThroughputTpd ?? plant.plantCapacityTpd ?? 0) * 365;
    const ef = plant.energyConsumptionKwhPerTonne ?? MSW_PLANT_ENERGY_KWH_PER_TONNE;
    mswAnnualKwh += throughput * ef;
  }
  const mswScope2Tco2e = (mswAnnualKwh * gridEfKgCo2PerKwh) / 1000;

  // ── AVOIDED EMISSIONS (composting/RDF) ──
  let avoidedComposting = 0;
  let avoidedRdf = 0;
  for (const plant of mswPlants ?? []) {
    for (const frac of plant.sieveFractions) {
      if (!frac.percentOfTotalWaste || totalLandfillTonnes <= 0) continue;
      const fracTonnes = (frac.percentOfTotalWaste / 100) * totalLandfillTonnes;
      const ep = (frac.endProduct ?? '').toLowerCase();
      if (ep.includes('compost')) {
        avoidedComposting +=
          fracTonnes *
          landfillDocUsed *
          IPCC_LANDFILL.DOCf *
          IPCC_LANDFILL.F *
          (16 / 12) *
          0.75 *
          IPCC_LANDFILL.GWP_CH4;
      }
      if (ep.includes('rdf') || ep.includes('refuse')) {
        avoidedRdf += fracTonnes * 0.15;
      }
    }
  }

  const totalScope1 = landfillCh4Tco2e + incinerationCo2Tco2e + incinerationN2oTco2e;
  const totalScope2 = mswScope2Tco2e;

  return {
    totalLandfillTonnesPerYear: parseFloat(totalLandfillTonnes.toFixed(2)),
    landfillCh4TonnesPerYear: parseFloat((landfillCh4Tco2e / IPCC_LANDFILL.GWP_CH4).toFixed(3)),
    landfillCh4Co2eTco2ePerYear: parseFloat(landfillCh4Tco2e.toFixed(3)),
    landfillMcfUsed,
    landfillDocUsed: parseFloat(landfillDocUsed.toFixed(3)),
    totalIncinerationTonnesPerYear: parseFloat(totalIncinerationTonnes.toFixed(2)),
    incinerationCo2Tco2ePerYear: parseFloat(incinerationCo2Tco2e.toFixed(3)),
    incinerationN2oTco2ePerYear: parseFloat(incinerationN2oTco2e.toFixed(3)),
    mswPlantAnnualKwh: parseFloat(mswAnnualKwh.toFixed(2)),
    mswPlantScope2Tco2ePerYear: parseFloat(mswScope2Tco2e.toFixed(3)),
    avoidedLandfillFromComposting: parseFloat(avoidedComposting.toFixed(3)),
    avoidedLandfillFromRdf: parseFloat(avoidedRdf.toFixed(3)),
    totalSolidWasteScope1: parseFloat(totalScope1.toFixed(3)),
    totalSolidWasteScope2: parseFloat(totalScope2.toFixed(3)),
    totalSolidWaste: parseFloat((totalScope1 + totalScope2).toFixed(3)),
    calculationMethod,
    estimatedFields,
  };
}

export function calculateLiquidWastePhase2(
  wastewaterGeneration: IWastewaterGeneration | undefined,
  characteristics: IWastewaterCharacteristicsRecord[] | undefined,
  stpPlants: IStpEtpPlant[] | undefined,
  gridEfKgCo2PerKwh: number,
  estimatedFields: string[]
): IWastewaterCarbonResults | null {
  const totalInflowKld =
    (wastewaterGeneration?.totalSewageKld?.current ?? 0) +
    (wastewaterGeneration?.hospitalEffluentKld?.current ?? 0) +
    (wastewaterGeneration?.kitchenWastewaterKld?.current ?? 0) +
    (wastewaterGeneration?.vehicleWashWastewaterKld?.current ?? 0);

  if (totalInflowKld <= 0) return null;

  let mcfUsed = MCF_BY_TREATMENT.no_treatment;
  if (stpPlants && stpPlants.length > 0) {
    mcfUsed = Math.min(...stpPlants.map(deriveMcfFromTreatment));
    const captureEfficiency =
      stpPlants.reduce(
        (avg, p) =>
          avg +
          (p.treatmentMethods.hasBiogasCapture
            ? (p.treatmentMethods.biogasCaptureEfficiency ?? 80)
            : 0),
        0
      ) / stpPlants.length;
    if (captureEfficiency > 0) {
      estimatedFields.push(`stpPlants.biogasCapture.${captureEfficiency.toFixed(0)}percent`);
    }
  } else {
    estimatedFields.push('liquidWaste.mcfFromNoStpData');
  }

  const bodRecord = characteristics?.find((r) => r.parameter === 'bod');
  const bodValues = bodRecord
    ? Object.values(bodRecord.monthlyValues)
        .filter((v) => v !== undefined && v !== '')
        .map((v) => parseFloat(String(v)))
        .filter((n) => !isNaN(n))
    : [];

  let bodMgLUsed: number;
  let calculationMethod: IWastewaterCarbonResults['calculationMethod'];

  if (bodValues.length > 0) {
    bodMgLUsed = bodValues.reduce((a, b) => a + b, 0) / bodValues.length;
    calculationMethod = 'ipcc_tier1_bod_flow';
  } else {
    const hasHospital = (wastewaterGeneration?.hospitalEffluentKld?.current ?? 0) > 0;
    const hasKitchen = (wastewaterGeneration?.kitchenWastewaterKld?.current ?? 0) > 0;
    bodMgLUsed = hasHospital ? 350 : hasKitchen ? 600 : 250;
    estimatedFields.push('liquidWaste.bodDefaultForSourceType');
    calculationMethod = 'ipcc_tier1_flow_only';
  }

  const flowM3PerYear = totalInflowKld * 365;
  const towKgBodPerYear = (flowM3PerYear * bodMgLUsed) / 1000;

  const greywaterReductionKld = wastewaterGeneration?.greywaterReuseFeasible
    ? (wastewaterGeneration.greywaterReuseCapacityKld ?? 0)
    : 0;
  const adjustedTowKg = towKgBodPerYear * (1 - greywaterReductionKld / Math.max(totalInflowKld, 1));

  const ch4KgPerYear = adjustedTowKg * IPCC_Bo * mcfUsed;
  const ch4Co2eTco2e = (ch4KgPerYear * IPCC_GWP_CH4) / 1000;

  const tknRecord = characteristics?.find(
    (r) => r.parameter === 'total_kjeldahl_nitrogen' || r.parameter === 'ammonical_nitrogen'
  );
  const tknValues = tknRecord
    ? Object.values(tknRecord.monthlyValues)
        .filter((v) => v !== undefined && v !== '')
        .map((v) => parseFloat(String(v)))
        .filter((n) => !isNaN(n))
    : [];

  let tknMgLUsed: number;
  if (tknValues.length > 0) {
    tknMgLUsed = tknValues.reduce((a, b) => a + b, 0) / tknValues.length;
  } else {
    tknMgLUsed = 40;
    estimatedFields.push('liquidWaste.tknDefault40mgL');
  }

  const nEffluentKgPerYear = (flowM3PerYear * tknMgLUsed) / 1000;
  const n2oKgPerYear = nEffluentKgPerYear * IPCC_N2O_EF_EFFLUENT;
  const n2oCo2eTco2e = (n2oKgPerYear * IPCC_GWP_N2O) / 1000;

  let stpAnnualKwh = 0;
  for (const stp of stpPlants ?? []) {
    const m3day = (stp.actualInflowMld ?? stp.plantCapacityMld) * 1000;
    if (stp.energyConsumptionKwhPerM3) {
      stpAnnualKwh += stp.energyConsumptionKwhPerM3 * m3day * 365;
    } else {
      const m = stp.treatmentMethods;
      let ef =
        (m.preliminary ? STP_ENERGY_KWH_M3_ENGINE.preliminary : 0) +
        (m.primary ? STP_ENERGY_KWH_M3_ENGINE.primary : 0) +
        (m.secondary ? STP_ENERGY_KWH_M3_ENGINE.secondary : 0) +
        (m.tertiary ? STP_ENERGY_KWH_M3_ENGINE.tertiary : 0);
      if (ef === 0) {
        ef = STP_ENERGY_KWH_M3_ENGINE.secondary;
        estimatedFields.push(`stp.${stp.id}.defaultEnergy`);
      }
      stpAnnualKwh += ef * m3day * 365;
    }
  }
  const stpScope2Tco2e = (stpAnnualKwh * gridEfKgCo2PerKwh) / 1000;
  const totalTco2e = ch4Co2eTco2e + n2oCo2eTco2e + stpScope2Tco2e;

  return {
    inflowKldUsed: totalInflowKld,
    bodMgLUsed,
    tknMgLUsed,
    mcfUsed,
    calculationMethod,
    towKgBodPerYear: parseFloat(adjustedTowKg.toFixed(2)),
    ch4KgPerYear: parseFloat(ch4KgPerYear.toFixed(2)),
    ch4AsCo2eTco2ePerYear: parseFloat(ch4Co2eTco2e.toFixed(3)),
    nEffluentKgNPerYear: parseFloat(nEffluentKgPerYear.toFixed(2)),
    n2oKgPerYear: parseFloat(n2oKgPerYear.toFixed(4)),
    n2oAsCo2eTco2ePerYear: parseFloat(n2oCo2eTco2e.toFixed(3)),
    stpAnnualKwh: parseFloat(stpAnnualKwh.toFixed(2)),
    stpScope2Tco2ePerYear: parseFloat(stpScope2Tco2e.toFixed(3)),
    totalLiquidWasteTco2ePerYear: parseFloat(totalTco2e.toFixed(3)),
    scope1LiquidWaste: parseFloat((ch4Co2eTco2e + n2oCo2eTco2e).toFixed(3)),
    scope2LiquidWaste: parseFloat(stpScope2Tco2e.toFixed(3)),
    improvementNotes: [
      bodValues.length > 0
        ? `BOD from ${bodValues.length} months of measurements`
        : `BOD estimated (${bodMgLUsed} mg/L default)`,
      tknValues.length > 0 ? `TKN from measurements` : `TKN estimated (${tknMgLUsed} mg/L default)`,
      stpPlants?.length
        ? `MCF from STP treatment stages (${mcfUsed})`
        : `MCF from no-treatment default`,
    ],
  };
}

// ── WATER TREATMENT CARBON CALCULATION ───────────────────────────
const WTP_ENERGY_FACTORS_KWH_M3 = {
  preliminary: 0.04,
  primary: 0.09,
  secondary: 0.25,
  tertiary: 0.4,
};

const RO_ENERGY_KWH_M3_PRODUCT: Record<string, number> = {
  standard_ro: 0.65,
  nanofiltration: 0.5,
  ultrafiltration: 0.35,
  brackish_water_ro: 0.6,
  seawater_ro: 1.5,
  other: 0.75,
};

const MUNICIPAL_TREATMENT_SCOPE3_KWH_M3 = 0.3;

export function calculateWaterCarbon(
  water: IWaterSectionData | undefined | null,
  gridEfKgCo2PerKwh: number,
  estimatedFields: string[]
): IWaterCarbonResults {
  const zero: IWaterCarbonResults = {
    wtpAnnualKwh: 0,
    wtpCarbonTco2ePerYear: 0,
    roAnnualKwh: 0,
    roCarbonTco2ePerYear: 0,
    groundwaterPumpingAnnualKwh: 0,
    groundwaterPumpingTco2ePerYear: 0,
    municipalSupplyScope3Tco2ePerYear: 0,
    totalScope2WaterTco2ePerYear: 0,
    estimatedFields,
    gridEfUsed: gridEfKgCo2PerKwh,
  };

  if (!water) return zero;

  // ── WTP OPERATIONAL CARBON ───────────────────────────────────
  let wtpAnnualKwh = 0;
  for (const wtp of water.treatmentPlants ?? []) {
    const capacityM3PerDay = (wtp.actualTreatmentMld ?? wtp.plantCapacityMld) * 1000;
    if (wtp.energyConsumptionKwhPerM3) {
      wtpAnnualKwh += wtp.energyConsumptionKwhPerM3 * capacityM3PerDay * 365;
    } else {
      const m = wtp.treatmentMethods;
      let efSum = 0;
      if (m?.preliminary) efSum += WTP_ENERGY_FACTORS_KWH_M3.preliminary;
      if (m?.primary) efSum += WTP_ENERGY_FACTORS_KWH_M3.primary;
      if (m?.secondary) efSum += WTP_ENERGY_FACTORS_KWH_M3.secondary;
      if (m?.tertiary) efSum += WTP_ENERGY_FACTORS_KWH_M3.tertiary;
      if (efSum === 0) {
        efSum = WTP_ENERGY_FACTORS_KWH_M3.secondary;
        estimatedFields.push(`wtp.${wtp.id}.defaultTreatmentStage`);
      }
      wtpAnnualKwh += efSum * capacityM3PerDay * 365;
    }
  }
  const wtpCarbonTco2e = (wtpAnnualKwh * gridEfKgCo2PerKwh) / 1000;

  // ── RO PLANT CARBON ──────────────────────────────────────────
  let roAnnualKwh = 0;
  for (const ro of water.roPlants ?? []) {
    const productM3PerDay = (ro.treatedWaterOutputMld ?? ro.plantCapacityMld * 0.7) * 1000;
    if (ro.energyConsumptionKwhPerM3) {
      roAnnualKwh += ro.energyConsumptionKwhPerM3 * productM3PerDay * 365;
    } else {
      const tech = ro.roTechnologyType ?? 'standard_ro';
      const roEf = RO_ENERGY_KWH_M3_PRODUCT[tech] ?? RO_ENERGY_KWH_M3_PRODUCT.standard_ro;
      roAnnualKwh += roEf * productM3PerDay * 365;
      if (!ro.roTechnologyType) estimatedFields.push(`ro.${ro.id}.defaultTechnology`);
    }
  }
  const roCarbonTco2e = (roAnnualKwh * gridEfKgCo2PerKwh) / 1000;

  // ── GROUNDWATER PUMPING CARBON ───────────────────────────────
  let groundwaterPumpingKwh = 0;
  const gw = water.supply?.sources?.find((s) => s.sourceType === 'groundwater_borewell');
  if (gw?.currentKld) {
    const m3PerDay = gw.currentKld;
    const assumedHeadM = 50;
    const pumpEfficiency = 0.65;
    const energyKwhPerM3 = assumedHeadM / (367 * pumpEfficiency);
    groundwaterPumpingKwh = energyKwhPerM3 * m3PerDay * 365;
    estimatedFields.push('groundwater.pumpingHeadAssumed50m');
  }
  const groundwaterPumpingTco2e = (groundwaterPumpingKwh * gridEfKgCo2PerKwh) / 1000;

  // ── MUNICIPAL SCOPE 3 (reporting only) ───────────────────────
  const municipal = water.supply?.sources?.find((s) => s.sourceType === 'municipal');
  const municipalM3PerYear = (municipal?.currentKld ?? 0) * 365;
  const municipalScope3Tco2e =
    (municipalM3PerYear * MUNICIPAL_TREATMENT_SCOPE3_KWH_M3 * gridEfKgCo2PerKwh) / 1000;

  const totalScope2 = wtpCarbonTco2e + roCarbonTco2e + groundwaterPumpingTco2e;

  return {
    wtpAnnualKwh: parseFloat(wtpAnnualKwh.toFixed(2)),
    wtpCarbonTco2ePerYear: parseFloat(wtpCarbonTco2e.toFixed(3)),
    roAnnualKwh: parseFloat(roAnnualKwh.toFixed(2)),
    roCarbonTco2ePerYear: parseFloat(roCarbonTco2e.toFixed(3)),
    groundwaterPumpingAnnualKwh: parseFloat(groundwaterPumpingKwh.toFixed(2)),
    groundwaterPumpingTco2ePerYear: parseFloat(groundwaterPumpingTco2e.toFixed(3)),
    municipalSupplyScope3Tco2ePerYear: parseFloat(municipalScope3Tco2e.toFixed(3)),
    totalScope2WaterTco2ePerYear: parseFloat(totalScope2.toFixed(3)),
    estimatedFields,
    gridEfUsed: gridEfKgCo2PerKwh,
  };
}

export interface WasteResults {
  solidWasteCO2ePerYear: number;
  liquidWasteCO2ePerYear: number;
  waterCO2ePerYear: number;
  waterResults: IWaterCarbonResults;
  wastewaterResults: IWastewaterCarbonResults | null;
  solidWasteResults: ISolidWasteCarbonResults | null;
  total: number;
  breakdown: {
    solidByMethod: Record<string, number>;
    liquidCH4: number;
    liquidN2O: number;
    ch4Wastewater: number;
    n2oWastewater: number;
    stpElectricity: number;
    waterTreatmentPlants: number;
    roPlants: number;
    groundwaterPumping: number;
    landfillCh4: number;
    incinerationCo2: number;
    incinerationN2o: number;
    mswPlantElectricity: number;
  };
}

export function calculateWasteCarbon(
  waste: IStepWaste | IWasteSectionData | undefined | null,
  usage: IStepUsage | undefined | null,
  buildingType: string,
  factors: EmissionFactors,
  estimatedFields: string[],
  gridEfKgCo2PerKwh: number = 0.82
): WasteResults {
  const defaults =
    WASTE_DEFAULTS_BY_BUILDING_TYPE[buildingType] ?? WASTE_DEFAULTS_BY_BUILDING_TYPE['academic'];

  // If waste step was entirely skipped, build a minimal waste object from defaults
  const w: IStepWaste = waste ?? {
    solidWasteIsEstimated: true,
    wasteStreams: [],
    wastewaterTreatmentType: defaults.wastewaterTreatmentType,
    wastewaterIsEstimated: true,
    hasWasteData: false,
  };

  const operatingDaysPerYear = (usage?.operatingDaysPerWeek ?? 6) * 52;

  // ── SOLID WASTE — try Phase 3 first, fall back to Phase 1 ───────
  const wasteSection3 = waste as IWasteSectionData;
  let solidWasteCO2ePerYear = 0;
  let solidWasteResults: ISolidWasteCarbonResults | null = null;
  const solidByMethod: Record<string, number> = {};

  const phase3SolidResult = calculateSolidWastePhase3(
    wasteSection3?.solidWasteGeneration,
    wasteSection3?.landfillSites,
    wasteSection3?.incinerationFacilities,
    wasteSection3?.mswPlants,
    gridEfKgCo2PerKwh,
    estimatedFields
  );

  if (phase3SolidResult) {
    solidWasteCO2ePerYear = phase3SolidResult.totalSolidWaste;
    solidWasteResults = phase3SolidResult;
    estimatedFields.push(`solidWaste.method.${phase3SolidResult.calculationMethod}`);
  } else {
    // Phase 1 fallback — flat EF method
    let solidWasteKgPerDay = w.solidWasteKgPerDay;
    if (!solidWasteKgPerDay || w.solidWasteIsEstimated) {
      const occupants = w.dailyOccupants ?? 100;
      solidWasteKgPerDay = occupants * defaults.solidWasteKgPerDayPerOccupant;
      estimatedFields.push('waste.solidWasteKgPerDay');
    }
    const solidWasteTonnesPerYear = (solidWasteKgPerDay * operatingDaysPerYear) / 1000;
    const streams = w.wasteStreams?.length > 0 ? w.wasteStreams : defaults.wasteStreams;
    for (const stream of streams) {
      const fraction = stream.fractionPercent / 100;
      const massForMethod = solidWasteTonnesPerYear * fraction;
      let efKgCO2ePerKg: number;
      switch (stream.disposalMethod) {
        case SolidWasteDisposalMethod.UNMANAGED_DUMP:
        case SolidWasteDisposalMethod.MANAGED_LANDFILL:
          efKgCO2ePerKg = factors.solidWasteUnmanagedDump;
          break;
        case SolidWasteDisposalMethod.COMPOSTING:
          efKgCO2ePerKg = factors.solidWasteComposting;
          break;
        case SolidWasteDisposalMethod.RECYCLING:
          efKgCO2ePerKg = factors.solidWasteRecycling;
          break;
        case SolidWasteDisposalMethod.OPEN_BURNING:
          efKgCO2ePerKg = factors.solidWasteBurning;
          break;
        default:
          efKgCO2ePerKg = factors.solidWasteUnmanagedDump;
      }
      const co2e = massForMethod * efKgCO2ePerKg;
      solidByMethod[stream.disposalMethod] = parseFloat(co2e.toFixed(3));
      solidWasteCO2ePerYear += co2e;
    }
    estimatedFields.push('solidWaste.method.phase1_simple_ef');
  }

  // ── LIQUID WASTE — Phase 2 IPCC Tier 1 when data available ──────
  let liquidWasteCO2ePerYear: number;
  let wastewaterResults: IWastewaterCarbonResults | null = null;

  const phase2Result = calculateLiquidWastePhase2(
    wasteSection3?.wastewaterGeneration,
    wasteSection3?.wastewaterCharacteristics,
    wasteSection3?.stpEtpPlants,
    gridEfKgCo2PerKwh,
    estimatedFields
  );

  let liquidCH4: number;
  let liquidN2O: number;

  if (phase2Result) {
    liquidWasteCO2ePerYear = phase2Result.totalLiquidWasteTco2ePerYear;
    wastewaterResults = phase2Result;
    liquidCH4 = phase2Result.ch4AsCo2eTco2ePerYear;
    liquidN2O = phase2Result.n2oAsCo2eTco2ePerYear;
    estimatedFields.push(`liquidWaste.method.${phase2Result.calculationMethod}`);
  } else {
    // Fall back to Phase 1 simple EF method
    let wastewaterLitresPerDay = w.wastewaterLitresPerDay;
    if (!wastewaterLitresPerDay || w.wastewaterIsEstimated) {
      const occupants = w.dailyOccupants ?? 100;
      wastewaterLitresPerDay = occupants * defaults.wastewaterLitresPerPersonPerDay;
      estimatedFields.push('waste.wastewaterLitresPerDay');
    }
    const treatmentType = w.wastewaterTreatmentType ?? defaults.wastewaterTreatmentType;
    let efLiquidKgCO2ePerLitre: number;
    switch (treatmentType) {
      case WastewaterTreatmentType.UNMANAGED_SEPTIC:
        efLiquidKgCO2ePerLitre = factors.liquidWasteUnmanaged;
        break;
      case WastewaterTreatmentType.MUNICIPAL_STP:
        efLiquidKgCO2ePerLitre = factors.liquidWasteMunicipalSTP;
        break;
      case WastewaterTreatmentType.CAMPUS_STP:
        efLiquidKgCO2ePerLitre = factors.liquidWasteCampusSTP;
        break;
      default:
        efLiquidKgCO2ePerLitre = factors.liquidWasteUnmanaged;
    }
    const wastewaterLitresPerYear = wastewaterLitresPerDay * operatingDaysPerYear;
    liquidWasteCO2ePerYear = (wastewaterLitresPerYear * efLiquidKgCO2ePerLitre) / 1000;
    liquidCH4 = liquidWasteCO2ePerYear * 0.7;
    liquidN2O = liquidWasteCO2ePerYear * 0.3;
    estimatedFields.push('liquidWaste.method.phase1_simple_ef');
  }

  // ── WATER TREATMENT CARBON ──────────────────────────────────────
  const waterData = wasteSection3?.water;
  const waterResults = calculateWaterCarbon(waterData, gridEfKgCo2PerKwh, estimatedFields);

  const total =
    solidWasteCO2ePerYear + liquidWasteCO2ePerYear + waterResults.totalScope2WaterTco2ePerYear;

  return {
    solidWasteCO2ePerYear: parseFloat(solidWasteCO2ePerYear.toFixed(3)),
    liquidWasteCO2ePerYear: parseFloat(liquidWasteCO2ePerYear.toFixed(3)),
    waterCO2ePerYear: waterResults.totalScope2WaterTco2ePerYear,
    waterResults,
    wastewaterResults,
    solidWasteResults,
    total: parseFloat(total.toFixed(3)),
    breakdown: {
      solidByMethod,
      liquidCH4,
      liquidN2O,
      ch4Wastewater: wastewaterResults?.ch4AsCo2eTco2ePerYear ?? liquidCH4,
      n2oWastewater: wastewaterResults?.n2oAsCo2eTco2ePerYear ?? liquidN2O,
      stpElectricity: wastewaterResults?.stpScope2Tco2ePerYear ?? 0,
      waterTreatmentPlants: waterResults.wtpCarbonTco2ePerYear,
      roPlants: waterResults.roCarbonTco2ePerYear,
      groundwaterPumping: waterResults.groundwaterPumpingTco2ePerYear,
      landfillCh4: solidWasteResults?.landfillCh4Co2eTco2ePerYear ?? 0,
      incinerationCo2: solidWasteResults?.incinerationCo2Tco2ePerYear ?? 0,
      incinerationN2o: solidWasteResults?.incinerationN2oTco2ePerYear ?? 0,
      mswPlantElectricity: solidWasteResults?.mswPlantScope2Tco2ePerYear ?? 0,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW ENGINE (Task 1.3) — calculateWaste
// Implements IPCC FOD (solid waste), BOD-based CH4, population-based N2O,
// and electricity sub-calculations per the provided calculation sheets.
// ══════════════════════════════════════════════════════════════════════════════

export interface WasteResult {
  totalWasteCO2e: number;
  scope1: number;
  scope2: number;
  scope3: number;
  byComponent: {
    landfillCH4: number;
    wasteIncineration: number;
    mswPlantElectricity: number;
    wastewaterCH4: number;
    wastewaterN2O: number;
    stpElectricity: number;
    wtpElectricity: number;
    roElectricity: number;
    chemicalUsage: number;
    municipalWaterScope3: number;
  };
  meta: {
    totalWasteToLandfill: number;
    totalWasteIncinerated: number;
    wastewaterVolumeM3yr: number;
    bodLoadKgYr: number;
    ch4KgYr: number;
    n2oKgYr: number;
    landfillMCFUsed: number;
    wwMCFUsed: number;
    dataPath: string;
  };
}

// FOD single-year simplification: CH4 = MSWR × DOC × DOCf × F × (16/12) × MCF × (1 - e^{-k})
const FOD_FORMULA_FACTOR = SOLID_WASTE_DOC * SOLID_WASTE_DOCf * SOLID_WASTE_F * (16 / 12);
const FOD_DECAY = 1 - Math.exp(-SOLID_WASTE_K); // ≈ 0.06294

function calcLandfillCH4Tonnes(mswr: number, mcf: number): number {
  return mswr * FOD_FORMULA_FACTOR * mcf * FOD_DECAY;
}

export function calculateWaste(data: ISubmissionData, ef: ResolvedEmissionFactors): WasteResult {
  const wasteSection = (data.waste as IWasteSectionData | undefined) ?? undefined;
  const gridEF = ef.gridElectricity ?? GRID_EMISSION_FACTOR_KG_KWH;
  const Bo = ef.wastewaterBo ?? WASTEWATER_Bo;
  const WW_MCF = ef.wastewaterMcf ?? WASTEWATER_MCF;

  // ── Sub-calc A: Solid Waste — Landfill CH4 (IPCC FOD) ────────────────────
  let landfillCH4Tco2e = 0;
  let totalWasteToLandfill = 0;
  let landfillMCFUsed = DEFAULT_LANDFILL_MCF;

  // Path 1: use landfillSites with monthly or annual records
  const landfillSites = wasteSection?.landfillSites ?? [];
  if (landfillSites.length > 0) {
    let weightedMCFSum = 0;
    for (const site of landfillSites) {
      const mcf = LANDFILL_MCF[site.landfillType ?? 'managed_sanitary'] ?? DEFAULT_LANDFILL_MCF;

      let annualTonnes = 0;
      if (site.monthlyRecords.length > 0) {
        const recentYear = Math.max(...site.monthlyRecords.map((r) => r.year));
        annualTonnes = site.monthlyRecords
          .filter((r) => r.year === recentYear)
          .reduce((s, r) => s + (r.wasteTonnes ?? 0), 0);
      } else if (site.yearWiseAnnualTotals?.length) {
        annualTonnes = site.yearWiseAnnualTotals[site.yearWiseAnnualTotals.length - 1]?.totalTonnes ?? 0;
      }

      if (annualTonnes <= 0) continue;
      totalWasteToLandfill += annualTonnes;
      weightedMCFSum += mcf * annualTonnes;

      let ch4 = calcLandfillCH4Tonnes(annualTonnes, mcf);
      if (site.hasBiogasCapture && (site.biogasCaptureEfficiency ?? 0) > 0) {
        ch4 *= 1 - site.biogasCaptureEfficiency! / 100;
      }
      landfillCH4Tco2e += ch4 * GWP_CH4;
    }
    if (totalWasteToLandfill > 0) {
      landfillMCFUsed = weightedMCFSum / totalWasteToLandfill;
    }
  }

  // Path 2: fall back to solidWasteGeneration organic totals
  if (totalWasteToLandfill === 0) {
    const swg = wasteSection?.solidWasteGeneration;
    if (swg) {
      const organicTonnes =
        (swg.domesticWetWasteTonsPerAnnum?.current ?? 0) +
        (swg.gardenGrassCuttingsLeaves?.current ?? 0) +
        (swg.gardenFruitsVegetables?.current ?? 0) +
        (swg.gardenTwigsBranches?.current ?? 0) +
        (swg.gardenMiscGreenWaste?.current ?? 0) +
        (swg.kitchenSolidFoodWaste?.current ?? 0) +
        (swg.hospitalNonBiomedicalWaste?.current ?? 0) +
        (swg.otherAnimalWaste?.current ?? 0) +
        (swg.otherSlaughterWaste?.current ?? 0);

      if (organicTonnes > 0) {
        totalWasteToLandfill = organicTonnes;
        const ch4 = calcLandfillCH4Tonnes(organicTonnes, DEFAULT_LANDFILL_MCF);
        landfillCH4Tco2e = ch4 * GWP_CH4;
      }
    }
  }

  // ── Sub-calc B: Solid Waste — Incineration (Scope 1) ─────────────────────
  // Formula: tonnes × CC × FCF × BOE × (44/12) → kg CO2; ÷1000 → tCO2e
  const INCINERATION_FACTOR = INCINERATION_CC * INCINERATION_FCF * INCINERATION_BOE * (44 / 12);
  let incinerationCO2e = 0;
  let totalWasteIncinerated = 0;

  for (const fac of wasteSection?.incinerationFacilities ?? []) {
    let facTonnes = 0;
    if (fac.monthlyRecords.length > 0) {
      const recentYear = Math.max(...fac.monthlyRecords.map((r) => r.year));
      facTonnes = fac.monthlyRecords
        .filter((r) => r.year === recentYear)
        .reduce((s, r) => s + (r.wasteTonnes ?? 0), 0);
    }
    if (facTonnes > 0) {
      totalWasteIncinerated += facTonnes;
      incinerationCO2e += (facTonnes * INCINERATION_FACTOR * 1000) / 1000; // kg→t
    }
  }

  // ── Sub-calc C: MSW Plant Electricity (Scope 2) ───────────────────────────
  let mswElecCO2e = 0;
  for (const plant of wasteSection?.mswPlants ?? []) {
    const annualTonnes = (plant.actualThroughputTpd ?? plant.plantCapacityTpd ?? 0) * 365;
    const kwh = annualTonnes * (plant.energyConsumptionKwhPerTonne ?? 35);
    mswElecCO2e += (kwh * gridEF) / 1000;
  }

  // ── Sub-calc D: Wastewater — CH4 (Scope 1) ───────────────────────────────
  let wwCH4CO2e = 0;
  let bodLoadKgYr = 0;
  let ch4KgYr = 0;
  let wwVolumeM3yr = 0;
  let wwMCFUsed = DEFAULT_WASTEWATER_MCF;
  let dataPath = 'volume_only_fallback';

  const stpPlants = wasteSection?.stpEtpPlants ?? [];
  const plantsWithBOD = stpPlants.filter((p) => {
    const chars = wasteSection?.wastewaterCharacteristics ?? [];
    const bodRec = chars.find((c) => c.parameter === 'bod');
    return bodRec || (p as any).influentBodMgL || (p as any).bodMgL;
  });

  if (stpPlants.length > 0) {
    // Path 1: BOD data from STP plants or characteristics
    let totalBODKg = 0;
    let totalCH4Kg = 0;
    const chars = wasteSection?.wastewaterCharacteristics ?? [];
    const bodRec = chars.find((c) => c.parameter === 'bod');
    const bodValues = bodRec
      ? Object.values(bodRec.monthlyValues)
          .filter((v) => v !== undefined && v !== '')
          .map((v) => parseFloat(String(v)))
          .filter((n) => !isNaN(n))
      : [];
    const avgBOD =
      bodValues.length > 0
        ? bodValues.reduce((a, b) => a + b, 0) / bodValues.length
        : DEFAULT_BOD_MG_L;

    for (const plant of stpPlants) {
      const inflowMld = plant.actualInflowMld ?? plant.plantCapacityMld;
      const annualM3 = inflowMld * 1000 * 365;
      wwVolumeM3yr += annualM3;

      const bodConc = (plant as any).influentBodMgL ?? (plant as any).bodMgL ?? avgBOD;
      const plantBODKg = bodConc * (annualM3 * 1000) * 1e-6; // mg/L × L × 1e-6 → kg
      totalBODKg += plantBODKg;

      // Derive MCF from treatment type
      const treatMethods = plant.treatmentMethods;
      let mcf = DEFAULT_WASTEWATER_MCF;
      if (treatMethods.isAnaerobic) {
        mcf = WW_MCF['lagoon_anaerobic'] ?? WASTEWATER_MCF['lagoon_anaerobic'];
      } else if (treatMethods.secondary && !treatMethods.isAnaerobic) {
        mcf = WW_MCF['activated_sludge'] ?? WASTEWATER_MCF['activated_sludge'];
      } else if (!treatMethods.primary && !treatMethods.secondary) {
        mcf = WW_MCF['none'] ?? WASTEWATER_MCF['none'];
      }

      const ch4Kg = plantBODKg * Bo * mcf;
      const capturedFrac = treatMethods.hasBiogasCapture
        ? (treatMethods.biogasCaptureEfficiency ?? 80) / 100
        : 0;
      totalCH4Kg += ch4Kg * (1 - capturedFrac);
      wwMCFUsed = mcf;
    }

    bodLoadKgYr = totalBODKg;
    ch4KgYr = totalCH4Kg;
    wwCH4CO2e = (totalCH4Kg * GWP_CH4) / 1000;
    dataPath = plantsWithBOD.length > 0 ? 'bod_data' : 'volume_only_fallback';
  } else {
    // Path 2: Volume only fallback
    const wwGen = wasteSection?.wastewaterGeneration;
    if (wwGen) {
      const annualVolumeM3 =
        (wwGen as any).currentAnnualVolumeM3 ??
        (wwGen.totalCurrentWastewaterKld ? wwGen.totalCurrentWastewaterKld * 365 : 0);
      wwVolumeM3yr = annualVolumeM3;

      const flowLDay = (annualVolumeM3 / 365) * 1000;
      const bod = DEFAULT_BOD_MG_L * flowLDay * 365 * 1e-6;
      bodLoadKgYr = bod;
      ch4KgYr = bod * Bo * DEFAULT_WASTEWATER_MCF;
      wwCH4CO2e = (ch4KgYr * GWP_CH4) / 1000;
    }
  }

  // ── Sub-calc E: Wastewater — N2O (Scope 1) ───────────────────────────────
  let n2oCO2e = 0;
  let n2oKgYr = 0;

  const population =
    (data.overview as any)?.occupantsCount ??
    data.overview?.numberOfOccupantsPerBuilding ??
    data.overview?.averageDailyOccupants ??
    0;

  if (population > 0) {
    const tnKgYr =
      population *
      PROTEIN_FPC_KG_PERSON_YR *
      PROTEIN_DIGESTIBILITY *
      PROTEIN_N_FRACTION *
      PROTEIN_NPRC;

    n2oKgYr =
      WASTEWATER_BFCX * WASTEWATER_Tj * WASTEWATER_N2O_EF_CENTRALIZED * tnKgYr * N2O_N_TO_N2O;
    n2oCO2e = (n2oKgYr * GWP_N2O) / 1000;
  } else if (wwVolumeM3yr > 0) {
    // TKN-based fallback
    const chars = wasteSection?.wastewaterCharacteristics ?? [];
    const tknRec = chars.find(
      (c) => c.parameter === 'total_kjeldahl_nitrogen' || c.parameter === 'ammonical_nitrogen'
    );
    const tknValues = tknRec
      ? Object.values(tknRec.monthlyValues)
          .filter((v) => v !== undefined && v !== '')
          .map((v) => parseFloat(String(v)))
          .filter((n) => !isNaN(n))
      : [];
    const avgTKN =
      tknValues.length > 0
        ? tknValues.reduce((a, b) => a + b, 0) / tknValues.length
        : DEFAULT_TKN_MG_L;

    const totalTKNKgYr = avgTKN * (wwVolumeM3yr * 1000) * 1e-6;
    n2oKgYr =
      WASTEWATER_BFCX * WASTEWATER_Tj * WASTEWATER_N2O_EF_CENTRALIZED * totalTKNKgYr * N2O_N_TO_N2O;
    n2oCO2e = (n2oKgYr * GWP_N2O) / 1000;
  }

  // ── Sub-calc F: STP Electricity (Scope 2) ────────────────────────────────
  let stpElecCO2e = 0;
  for (const plant of stpPlants) {
    const inflowMld = plant.actualInflowMld ?? plant.plantCapacityMld;
    const annualM3 = inflowMld * 1000 * 365;
    const kwh = annualM3 * (plant.energyConsumptionKwhPerM3 ?? STP_ENERGY_KWH_M3_DEFAULT);
    stpElecCO2e += (kwh * gridEF) / 1000;
  }

  // ── Sub-calc G: Water Treatment Electricity (Scope 2) ────────────────────
  let wtpElecCO2e = 0;
  let roElecCO2e = 0;
  const waterData = wasteSection?.water;

  for (const wtp of waterData?.treatmentPlants ?? []) {
    const m3day = (wtp.actualTreatmentMld ?? wtp.plantCapacityMld) * 1000;
    const annualM3 = m3day * 365;
    const kwh = annualM3 * (wtp.energyConsumptionKwhPerM3 ?? WTP_ENERGY_KWH_M3);
    wtpElecCO2e += (kwh * gridEF) / 1000;
  }

  for (const ro of waterData?.roPlants ?? []) {
    const m3day = (ro.treatedWaterOutputMld ?? ro.plantCapacityMld * 0.7) * 1000;
    const annualM3 = m3day * 365;
    const kwh = annualM3 * (ro.energyConsumptionKwhPerM3 ?? RO_ENERGY_KWH_M3);
    roElecCO2e += (kwh * gridEF) / 1000;
  }

  // ── Sub-calc H: Chemical Usage in WTP (Scope 3) ──────────────────────────
  let chemicalCO2e = 0;
  for (const chem of (wasteSection as any)?.chemicalUsage ?? []) {
    let qtyKgYr: number;
    if (chem.quantityKgPerYear) {
      qtyKgYr = chem.quantityKgPerYear;
    } else if (chem.dosePerLitre_mg_L && chem.flowRate_L_day) {
      qtyKgYr = chem.dosePerLitre_mg_L * chem.flowRate_L_day * 365 * 1e-6;
    } else {
      continue;
    }
    chemicalCO2e += (qtyKgYr * (chem.emissionFactorKgCO2PerKg ?? 0)) / 1000;
  }

  // ── Sub-calc I: Municipal Water Scope 3 upstream ─────────────────────────
  let municipalWaterCO2e = 0;
  const municipalSrc = waterData?.supply?.sources?.find((s) => s.sourceType === 'municipal');
  if (municipalSrc?.currentKld) {
    const annualM3 = municipalSrc.currentKld * 365;
    municipalWaterCO2e = (annualM3 * 0.344) / 1000;
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const scope1 = landfillCH4Tco2e + incinerationCO2e + wwCH4CO2e + n2oCO2e;
  const scope2 = mswElecCO2e + stpElecCO2e + wtpElecCO2e + roElecCO2e;
  const scope3 = chemicalCO2e + municipalWaterCO2e;

  return {
    totalWasteCO2e: scope1 + scope2 + scope3,
    scope1,
    scope2,
    scope3,
    byComponent: {
      landfillCH4: parseFloat(landfillCH4Tco2e.toFixed(4)),
      wasteIncineration: parseFloat(incinerationCO2e.toFixed(4)),
      mswPlantElectricity: parseFloat(mswElecCO2e.toFixed(4)),
      wastewaterCH4: parseFloat(wwCH4CO2e.toFixed(4)),
      wastewaterN2O: parseFloat(n2oCO2e.toFixed(4)),
      stpElectricity: parseFloat(stpElecCO2e.toFixed(4)),
      wtpElectricity: parseFloat(wtpElecCO2e.toFixed(4)),
      roElectricity: parseFloat(roElecCO2e.toFixed(4)),
      chemicalUsage: parseFloat(chemicalCO2e.toFixed(4)),
      municipalWaterScope3: parseFloat(municipalWaterCO2e.toFixed(4)),
    },
    meta: {
      totalWasteToLandfill: parseFloat(totalWasteToLandfill.toFixed(2)),
      totalWasteIncinerated: parseFloat(totalWasteIncinerated.toFixed(2)),
      wastewaterVolumeM3yr: parseFloat(wwVolumeM3yr.toFixed(2)),
      bodLoadKgYr: parseFloat(bodLoadKgYr.toFixed(2)),
      ch4KgYr: parseFloat(ch4KgYr.toFixed(2)),
      n2oKgYr: parseFloat(n2oKgYr.toFixed(4)),
      landfillMCFUsed: parseFloat(landfillMCFUsed.toFixed(3)),
      wwMCFUsed: parseFloat(wwMCFUsed.toFixed(3)),
      dataPath,
    },
  };
}
