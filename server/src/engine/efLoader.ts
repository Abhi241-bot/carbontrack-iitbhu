import { EmissionFactor, IEmissionFactorDocument } from '../models/EmissionFactor.model';
import { EmissionFactors, HARDCODED_DEFAULTS } from './defaults';

// ── Extended interface ────────────────────────────────────────────────────────

export interface ResolvedEmissionFactors extends EmissionFactors {
  // Scope 2
  gridElectricity: number; // kg CO₂e/kWh

  // Scope 1 — Fuels
  diesel: number; // kg CO₂e/litre
  petrol: number; // kg CO₂e/litre
  lpg: number; // kg CO₂e/kg

  // Scope 1 — Refrigerants
  refrigerants: {
    r22: number;
    r407c: number;
    r134a: number;
    r410a: number;
    r404a: number;
    r32: number;
  };
  fireExtinguisher: number; // kg CO₂e/kg

  // Scope 3
  employeeCommute: number; // kg CO₂e/km
  airTravelDomestic: number; // kg CO₂e/km
  officeEquipment: number; // kg CO₂e/2022 USD

  // Embodied carbon — Annexure 8 materials
  materials: {
    concretePCC: number; // kg CO₂e/m³
    concreteRCC: number; // kg CO₂e/m³
    rebar: number; // kg CO₂e/kg
    brick: number; // kg CO₂e/kg
    ceramicTile: number; // kg CO₂e/kg
    kotaStone: number; // kg CO₂e/kg
    plaster: number; // kg CO₂e/kg
    paint: number; // kg CO₂e/m²
    woodFrame: number; // kg CO₂e/kg
    plywood: number; // kg CO₂e/kg
    glass: number; // kg CO₂e/m²
    steelFrame: number; // kg CO₂e/kg
    steelSection: number; // kg CO₂e/kg
    aluminum: number; // kg CO₂e/kg
    upvc: number; // kg CO₂e/kg
    cgiSheet: number; // kg CO₂e/kg
    gypsum: number; // kg CO₂e/kg
    asbestos: number; // kg CO₂e/m²
    particleBoard: number; // kg CO₂e/kg
    puffPanel: number; // kg CO₂e/kg
    stoneMasonry: number; // kg CO₂e/kg
  };

  // Wastewater engine parameters
  wastewaterBo: number; // kg CH4/kg BOD (IPCC Table 6.2)
  wastewaterMcf: Record<string, number>; // MCF by treatment type

  // Snapshot metadata populated by loadEmissionFactors()
  _snapshotTimestamp: Date;
  _factorIds: Record<string, string>; // category → MongoDB ObjectId string
}

// ── Annexure 8 fallback values (used when DB has no record for a category) ───

const ANNEXURE8_DEFAULTS: Omit<
  ResolvedEmissionFactors,
  keyof EmissionFactors | '_snapshotTimestamp' | '_factorIds'
> = {
  gridElectricity: 0.82,
  diesel: 2.65,
  petrol: 2.31,
  lpg: 3.13,
  refrigerants: {
    r22: 1960,
    r407c: 1908,
    r134a: 1530,
    r410a: 2256,
    r404a: 4728,
    r32: 771,
  },
  fireExtinguisher: 1.0,
  employeeCommute: 0.15,
  airTravelDomestic: 0.2,
  officeEquipment: 0.246,
  materials: {
    concretePCC: 329.611,
    concreteRCC: 381,
    rebar: 2.6,
    brick: 0.31,
    ceramicTile: 0.68,
    kotaStone: 0.056,
    plaster: 0.14,
    paint: 0.73,
    woodFrame: 2.4,
    plywood: -0.31,
    glass: 21.1,
    steelFrame: 3.5,
    steelSection: 2.5,
    aluminum: 26,
    upvc: 3.9,
    cgiSheet: 3,
    gypsum: 0.26,
    asbestos: 16.31,
    particleBoard: -1.3,
    puffPanel: 8.1,
    stoneMasonry: 0.073,
  },
  wastewaterBo: 0.6,
  wastewaterMcf: {
    activated_sludge: 0.3,
    trickling_filter: 0.3,
    lagoon_aerobic: 0.2,
    lagoon_anaerobic: 0.8,
    lagoon_facultative: 0.5,
    septic: 0.5,
    centralized_stp: 0.3,
    none: 1.0,
  },
};

// ── Main loader ───────────────────────────────────────────────────────────────

/**
 * Loads all active emission factors from MongoDB and builds a ResolvedEmissionFactors
 * object. For each category the isDefault:true document is preferred; if absent, the
 * first active document is used. Falls back to hardcoded Annexure 8 values for any
 * category absent from the DB.
 *
 * Never throws — DB failures return the hardcoded fallback.
 */
export async function loadEmissionFactors(): Promise<ResolvedEmissionFactors> {
  let docs: IEmissionFactorDocument[] = [];

  try {
    docs = (await EmissionFactor.find({
      isActive: true,
    }).lean()) as unknown as IEmissionFactorDocument[];
  } catch {
    // DB unavailable — return safe Annexure 8 + HARDCODED_DEFAULTS
    return buildFallback();
  }

  // Build a lookup: category → default doc (or first active)
  const byCategory = new Map<string, IEmissionFactorDocument>();
  const factorIds: Record<string, string> = {};

  for (const doc of docs) {
    const existing = byCategory.get(doc.category);
    if (!existing || doc.isDefault) {
      byCategory.set(doc.category, doc);
    }
  }

  for (const [cat, doc] of byCategory.entries()) {
    factorIds[cat] = String(doc._id);
  }

  const get = (category: string, fallback: number): number =>
    byCategory.get(category)?.value ?? fallback;

  // Legacy liquid_waste: multiple records per category keyed by name keyword
  const liquidDocs = docs.filter((d) => d.category === 'liquid_waste');
  const getLiquid = (keyword: string, fallback: number): number =>
    liquidDocs.find((d) => d.isDefault && d.name.toLowerCase().includes(keyword))?.value ??
    liquidDocs.find((d) => d.name.toLowerCase().includes(keyword))?.value ??
    fallback;

  // ── Legacy EmissionFactors fields ────────────────────────────────────────
  // 'electricity' is the legacy category; 'grid_electricity' is the new one.
  // Prefer new over old for electricityKgCo2PerKwh.
  const legacyElec =
    byCategory.get('grid_electricity')?.value ??
    byCategory.get('electricity')?.value ??
    HARDCODED_DEFAULTS.electricityKgCo2PerKwh;

  const legacyGlass = byCategory.get('glass')?.value ?? HARDCODED_DEFAULTS.glassKgCo2PerKg;

  const legacyWood = byCategory.get('wood')?.value ?? HARDCODED_DEFAULTS.woodKgCo2PerKg;

  const base: EmissionFactors = {
    electricityKgCo2PerKwh: legacyElec,
    dieselKgCo2PerLitre: get('diesel', HARDCODED_DEFAULTS.dieselKgCo2PerLitre),
    steelKgCo2PerKg: get('steel', HARDCODED_DEFAULTS.steelKgCo2PerKg),
    concreteKgCo2PerKg: get('concrete', HARDCODED_DEFAULTS.concreteKgCo2PerKg),
    woodKgCo2PerKg: legacyWood,
    glassKgCo2PerKg: legacyGlass,
    plasticKgCo2PerKg: get('plastic', HARDCODED_DEFAULTS.plasticKgCo2PerKg),
    solidWasteUnmanagedDump: get('solid_waste', HARDCODED_DEFAULTS.solidWasteUnmanagedDump),
    solidWasteComposting: get('solid_waste_composting', HARDCODED_DEFAULTS.solidWasteComposting),
    solidWasteRecycling: get('solid_waste_recycling', HARDCODED_DEFAULTS.solidWasteRecycling),
    solidWasteBurning: get('solid_waste_burning', HARDCODED_DEFAULTS.solidWasteBurning),
    liquidWasteUnmanaged: getLiquid('unmanaged', HARDCODED_DEFAULTS.liquidWasteUnmanaged),
    liquidWasteMunicipalSTP: getLiquid('municipal', HARDCODED_DEFAULTS.liquidWasteMunicipalSTP),
    liquidWasteCampusSTP: getLiquid('campus', HARDCODED_DEFAULTS.liquidWasteCampusSTP),
  };

  // ── Annexure 8 extended fields ────────────────────────────────────────────
  const resolved: ResolvedEmissionFactors = {
    ...base,

    gridElectricity: get('grid_electricity', ANNEXURE8_DEFAULTS.gridElectricity),
    diesel: get('diesel', ANNEXURE8_DEFAULTS.diesel),
    petrol: get('petrol', ANNEXURE8_DEFAULTS.petrol),
    lpg: get('lpg', ANNEXURE8_DEFAULTS.lpg),

    refrigerants: {
      r22: get('refrigerant_r22', ANNEXURE8_DEFAULTS.refrigerants.r22),
      r407c: get('refrigerant_r407c', ANNEXURE8_DEFAULTS.refrigerants.r407c),
      r134a: get('refrigerant_r134a', ANNEXURE8_DEFAULTS.refrigerants.r134a),
      r410a: get('refrigerant_r410a', ANNEXURE8_DEFAULTS.refrigerants.r410a),
      r404a: get('refrigerant_r404a', ANNEXURE8_DEFAULTS.refrigerants.r404a),
      r32: get('refrigerant_r32', ANNEXURE8_DEFAULTS.refrigerants.r32),
    },

    fireExtinguisher: get('fire_extinguisher', ANNEXURE8_DEFAULTS.fireExtinguisher),
    employeeCommute: get('employee_commute', ANNEXURE8_DEFAULTS.employeeCommute),
    airTravelDomestic: get('air_travel_domestic', ANNEXURE8_DEFAULTS.airTravelDomestic),
    officeEquipment: get('office_equipment', ANNEXURE8_DEFAULTS.officeEquipment),

    materials: {
      concretePCC: get('concrete_pcc', ANNEXURE8_DEFAULTS.materials.concretePCC),
      concreteRCC: get('concrete_rcc', ANNEXURE8_DEFAULTS.materials.concreteRCC),
      rebar: get('rebar', ANNEXURE8_DEFAULTS.materials.rebar),
      brick: get('brick', ANNEXURE8_DEFAULTS.materials.brick),
      ceramicTile: get('ceramic_tile', ANNEXURE8_DEFAULTS.materials.ceramicTile),
      kotaStone: get('kota_stone', ANNEXURE8_DEFAULTS.materials.kotaStone),
      plaster: get('plaster', ANNEXURE8_DEFAULTS.materials.plaster),
      paint: get('paint', ANNEXURE8_DEFAULTS.materials.paint),
      woodFrame: get('wood', ANNEXURE8_DEFAULTS.materials.woodFrame),
      plywood: get('wood_plywood', ANNEXURE8_DEFAULTS.materials.plywood),
      glass: get('glass', ANNEXURE8_DEFAULTS.materials.glass),
      steelFrame: get('steel_frame', ANNEXURE8_DEFAULTS.materials.steelFrame),
      steelSection: get('steel_section', ANNEXURE8_DEFAULTS.materials.steelSection),
      aluminum: get('aluminum', ANNEXURE8_DEFAULTS.materials.aluminum),
      upvc: get('upvc', ANNEXURE8_DEFAULTS.materials.upvc),
      cgiSheet: get('cgi_sheet', ANNEXURE8_DEFAULTS.materials.cgiSheet),
      gypsum: get('gypsum', ANNEXURE8_DEFAULTS.materials.gypsum),
      asbestos: get('asbestos', ANNEXURE8_DEFAULTS.materials.asbestos),
      particleBoard: get('particle_board', ANNEXURE8_DEFAULTS.materials.particleBoard),
      puffPanel: get('puff_panel', ANNEXURE8_DEFAULTS.materials.puffPanel),
      stoneMasonry: get('stone_masonry', ANNEXURE8_DEFAULTS.materials.stoneMasonry),
    },

    wastewaterBo: get('wastewater_bo', ANNEXURE8_DEFAULTS.wastewaterBo),
    wastewaterMcf: ANNEXURE8_DEFAULTS.wastewaterMcf,

    _snapshotTimestamp: new Date(),
    _factorIds: factorIds,
  };

  return resolved;
}

// ── Pure fallback (no DB) ─────────────────────────────────────────────────────

function buildFallback(): ResolvedEmissionFactors {
  return {
    ...HARDCODED_DEFAULTS,
    ...ANNEXURE8_DEFAULTS,
    _snapshotTimestamp: new Date(),
    _factorIds: {},
  };
}

// ── Snapshot summary for human-readable storage ───────────────────────────────

export function buildEfSnapshot(ef: ResolvedEmissionFactors) {
  return {
    _snapshotTimestamp: ef._snapshotTimestamp,
    _factorIds: ef._factorIds,
    gridEF: ef.gridElectricity,
    dieselEF: ef.diesel,
    lpgEF: ef.lpg,
  };
}
