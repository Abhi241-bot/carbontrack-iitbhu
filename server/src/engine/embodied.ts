import { ISubmissionData } from '@shared/types/submission.types';
import { EmissionFactors } from './defaults';
import { ResolvedEmissionFactors } from './efLoader';

// ── New per-material EF table (Task 1.4) ──────────────────────────────────────
// Units: per_m3 = kgCO2/m³, per_kg = kgCO2/kg, per_m2 = kgCO2/m²
const MATERIAL_EF_TABLE: Record<string, { ef: number; unit: 'per_m3' | 'per_kg' | 'per_m2' }> = {
  concretePCC_m3: { ef: 329.611, unit: 'per_m3' },
  concreteRCC_m3: { ef: 381, unit: 'per_m3' },
  concreteVolumeCubicM: { ef: 176, unit: 'per_m3' }, // legacy, 0.176 tCO2e/m³
  rebar_kg: { ef: 2.6, unit: 'per_kg' },
  steelFrame_kg: { ef: 3.5, unit: 'per_kg' },
  steelSection_kg: { ef: 2.5, unit: 'per_kg' },
  steelWeightKg: { ef: 1.46, unit: 'per_kg' }, // legacy 1.46 tCO2e/tonne
  brickMasonry_kg: { ef: 0.31, unit: 'per_kg' },
  stoneMasonry_kg: { ef: 0.073, unit: 'per_kg' },
  kotaStone_kg: { ef: 0.056, unit: 'per_kg' },
  ceramicTile_kg: { ef: 0.68, unit: 'per_kg' },
  plaster_kg: { ef: 0.14, unit: 'per_kg' },
  woodFrame_kg: { ef: 2.4, unit: 'per_kg' },
  plywood_kg: { ef: -0.31, unit: 'per_kg' },
  particleBoard_kg: { ef: -1.3, unit: 'per_kg' },
  timberVolumeCubicM: { ef: 420, unit: 'per_m3' }, // legacy, 0.42 tCO2e/m³
  glassAreaSqM: { ef: 21.1, unit: 'per_m2' },
  paint_m2: { ef: 0.73, unit: 'per_m2' },
  aluminum_kg: { ef: 26, unit: 'per_kg' },
  upvc_kg: { ef: 3.9, unit: 'per_kg' },
  cgiSheet_kg: { ef: 3, unit: 'per_kg' },
  gypsum_kg: { ef: 0.26, unit: 'per_kg' },
  asbestos_m2: { ef: 16.31, unit: 'per_m2' },
  puffPanel_kg: { ef: 8.1, unit: 'per_kg' },
};

// Typical Indian RC-frame construction material intensities (kg per sqm GFA)
// Used only when the submission provides no concrete/steel/glass data at all.
const STRUCTURAL = {
  concreteKgPerSqm: 400, // reinforced concrete slab + frame
  steelKgPerSqm: 40, // rebar
  glassKgPerSqm: 8, // windows
};

const FALLBACK_AREA_SQM = 2500; // used when totalFloorArea is not provided

// ── Resolved materials accessor ───────────────────────────────────────────────
// Falls back to Annexure 8 values when factors are plain EmissionFactors (no .materials)

function getMaterials(factors: EmissionFactors | ResolvedEmissionFactors) {
  if ('materials' in factors && factors.materials) return factors.materials;
  // Plain EmissionFactors — return Annexure 8 defaults
  return {
    concretePCC: 329.611, // kgCO₂e/m³
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
  };
}

export function calculateEmbodiedCarbon(
  data: ISubmissionData,
  factors: EmissionFactors | ResolvedEmissionFactors,
  estimatedFields: string[]
): { total: number; breakdown: Record<string, number> } {
  const mat = data.materials;
  const ef = getMaterials(factors);

  let total = 0;
  const breakdown: Record<string, number> = {};

  function add(key: string, tco2e: number) {
    breakdown[key] = parseFloat(tco2e.toFixed(4));
    total += tco2e;
  }

  // ── CONCRETE ─────────────────────────────────────────────────────────────
  const hasPCC = (mat?.concretePCC_m3 ?? 0) > 0;
  const hasRCC = (mat?.concreteRCC_m3 ?? 0) > 0;
  const hasLegacyConcrete = (mat as any)?.concreteVolumeCubicM > 0;

  if (hasPCC) {
    add('concretePCC', (mat!.concretePCC_m3! * ef.concretePCC) / 1000);
  }
  if (hasRCC) {
    add('concreteRCC', (mat!.concreteRCC_m3! * ef.concreteRCC) / 1000);
  }
  if (!hasPCC && !hasRCC && hasLegacyConcrete) {
    // Legacy: flat factor 0.176 tCO2e/m³ (≈ concrete 0.159 kgCO2e/kg × 1100 kg/m³)
    add('concrete_legacy', (mat as any).concreteVolumeCubicM * 0.176);
  }

  // ── MASONRY ───────────────────────────────────────────────────────────────
  const hasBrickKg = (mat?.brickMasonry_kg ?? 0) > 0;
  const hasLegacyBrick = (mat as any)?.brickCount > 0;

  if (hasBrickKg) {
    add('brick', (mat!.brickMasonry_kg! * ef.brick) / 1000);
  } else if (hasLegacyBrick) {
    // Legacy: ~0.24 tCO2e per 1000 bricks (≈ 0.31 kgCO2e/kg × 2.5 kg/brick)
    add('brick_legacy', ((mat as any).brickCount / 1000) * 0.24);
  }

  if ((mat?.stoneMasonry_kg ?? 0) > 0) {
    add('stoneMasonry', (mat!.stoneMasonry_kg! * ef.stoneMasonry) / 1000);
  }
  if ((mat?.kotaStone_kg ?? 0) > 0) {
    add('kotaStone', (mat!.kotaStone_kg! * ef.kotaStone) / 1000);
  }

  // ── STEEL ─────────────────────────────────────────────────────────────────
  const hasNewSteel =
    (mat?.steelFrame_kg ?? 0) > 0 || (mat?.steelSection_kg ?? 0) > 0 || (mat?.rebar_kg ?? 0) > 0;
  const hasLegacySteel = (mat as any)?.steelWeightKg > 0;

  if ((mat?.steelFrame_kg ?? 0) > 0) {
    add('steelFrame', (mat!.steelFrame_kg! * ef.steelFrame) / 1000);
  }
  if ((mat?.steelSection_kg ?? 0) > 0) {
    add('steelSection', (mat!.steelSection_kg! * ef.steelSection) / 1000);
  }
  if ((mat?.rebar_kg ?? 0) > 0) {
    add('rebar', (mat!.rebar_kg! * ef.rebar) / 1000);
  }
  if (!hasNewSteel && hasLegacySteel) {
    // Legacy: 1.46 tCO2e/tonne steel
    add('steel_legacy', ((mat as any).steelWeightKg / 1000) * 1.46);
  }

  // ── GLASS ─────────────────────────────────────────────────────────────────
  if ((mat as any)?.glassAreaSqM > 0) {
    // glassAreaSqM × ef.glass (kgCO2e/m²) → tCO2e
    add('glass', ((mat as any).glassAreaSqM * ef.glass) / 1000);
  } else if ((mat?.glassKg ?? 0) > 0) {
    // Furniture glass from detailed mode — use legacy factor (kgCO2e/kg)
    add('glass_furniture', (mat!.glassKg! * factors.glassKgCo2PerKg) / 1000);
  }

  // ── WOOD ──────────────────────────────────────────────────────────────────
  if ((mat?.woodFrame_kg ?? 0) > 0) {
    add('woodFrame', (mat!.woodFrame_kg! * ef.woodFrame) / 1000);
  }
  if ((mat?.plywood_kg ?? 0) > 0) {
    // plywood EF is negative (carbon-storing) — correct to reduce total
    add('plywood', (mat!.plywood_kg! * ef.plywood) / 1000);
  }
  const hasLegacyTimber = (mat as any)?.timberVolumeCubicM > 0;
  if (hasLegacyTimber && (mat?.woodFrame_kg ?? 0) === 0) {
    // Legacy: 0.42 tCO2e/m³ timber
    add('timber_legacy', (mat as any).timberVolumeCubicM * 0.42);
  }

  // ── LOOP-BASED REMAINING ANNEXURE 8 MATERIALS ────────────────────────────
  type MatKey = keyof typeof ef;
  const NEW_MATERIAL_MAP: Array<[string, MatKey, 'kg' | 'm2']> = [
    ['aluminum_kg', 'aluminum', 'kg'],
    ['upvc_kg', 'upvc', 'kg'],
    ['cgiSheet_kg', 'cgiSheet', 'kg'],
    ['gypsum_kg', 'gypsum', 'kg'],
    ['asbestos_m2', 'asbestos', 'm2'],
    ['particleBoard_kg', 'particleBoard', 'kg'],
    ['puffPanel_kg', 'puffPanel', 'kg'],
    ['ceramicTile_kg', 'ceramicTile', 'kg'],
    ['plaster_kg', 'plaster', 'kg'],
    ['paint_m2', 'paint', 'm2'],
  ];

  for (const [field, efKey, _unit] of NEW_MATERIAL_MAP) {
    const qty = (mat as unknown as Record<string, unknown>)?.[field] as number | undefined;
    if ((qty ?? 0) > 0) {
      const efVal = ef[efKey] as number;
      add(field.replace('_', ''), (qty! * efVal) / 1000);
    }
  }

  // ── FURNITURE & FINISHES (from detailed mode inputs) ─────────────────────
  if (mat?.estimationMode === 'detailed') {
    const woodKg = mat.woodenFurnitureKg ?? 0;
    const steelKg = mat.steelFurnitureKg ?? 0;
    const plasticKg = mat.plasticKg ?? 0;

    const furnitureCo2 =
      (woodKg * factors.woodKgCo2PerKg +
        steelKg * factors.steelKgCo2PerKg +
        plasticKg * factors.plasticKgCo2PerKg) /
      1000;

    if (furnitureCo2 > 0) add('furniture_detailed', furnitureCo2);
  } else if (mat?.estimationMode === 'bulk') {
    // ── STRUCTURAL BULK FALLBACK ──────────────────────────────────────────
    // Only apply if no concrete/steel data was already provided above
    const hasAnyStructural =
      hasPCC ||
      hasRCC ||
      hasLegacyConcrete ||
      hasNewSteel ||
      hasLegacySteel ||
      (mat as any)?.glassAreaSqM > 0;

    if (!hasAnyStructural) {
      const area = (data.overview as any)?.totalFloorArea;
      const effectiveArea = area ?? FALLBACK_AREA_SQM;
      if (!area) estimatedFields.push('overview.totalFloorArea');

      const structuralCo2 =
        (effectiveArea * STRUCTURAL.concreteKgPerSqm * factors.concreteKgCo2PerKg +
          effectiveArea * STRUCTURAL.steelKgPerSqm * factors.steelKgCo2PerKg +
          effectiveArea * STRUCTURAL.glassKgPerSqm * factors.glassKgCo2PerKg) /
        1000;

      add('structural_bulk', structuralCo2);
      estimatedFields.push('materials.structuralBulkEstimate');
    }

    // Bulk furniture estimate
    const area = (data.overview as any)?.totalFloorArea;
    const effectiveArea = area ?? FALLBACK_AREA_SQM;
    const densityKgPerSqm: Record<string, number> = { low: 5, medium: 15, high: 30 };
    const density = densityKgPerSqm[mat?.furnitureDensity ?? 'medium'];
    const totalKg = density * effectiveArea;

    if (!mat?.furnitureDensity) estimatedFields.push('materials.furnitureDensity');

    const furnitureCo2 =
      (totalKg * 0.55 * factors.woodKgCo2PerKg +
        totalKg * 0.35 * factors.steelKgCo2PerKg +
        totalKg * 0.1 * factors.plasticKgCo2PerKg) /
      1000;

    if (furnitureCo2 > 0) add('furniture_bulk', furnitureCo2);
  } else {
    // No materials data at all — full bulk fallback
    const area = (data.overview as any)?.totalFloorArea;
    const effectiveArea = area ?? FALLBACK_AREA_SQM;
    if (!area) estimatedFields.push('overview.totalFloorArea');

    const structuralCo2 =
      (effectiveArea * STRUCTURAL.concreteKgPerSqm * factors.concreteKgCo2PerKg +
        effectiveArea * STRUCTURAL.steelKgPerSqm * factors.steelKgCo2PerKg +
        effectiveArea * STRUCTURAL.glassKgPerSqm * factors.glassKgCo2PerKg) /
      1000;

    add('structural_bulk', structuralCo2);
    estimatedFields.push('materials.noDataFallback');
  }

  return { total: parseFloat(total.toFixed(4)), breakdown };
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW ENGINE (Task 1.4) — calculateEmbodied
// Uses MATERIAL_EF_TABLE with priority rules for concrete/steel/wood.
// Returns embodiedPerYear = totalEmbodiedCarbon / 50 (50-year amortisation).
// ══════════════════════════════════════════════════════════════════════════════

export interface EmbodiedResult {
  totalEmbodiedCarbon: number; // tCO2e (total lifetime)
  embodiedPerYear: number; // tCO2e/yr (÷50)
  byMaterial: Record<string, number>; // individual material tCO2e
  areaUsed: number; // sqm used for area-based fallback (0 if not needed)
  fallbacksApplied: string[]; // list of materials estimated from fallback
}

export function calculateEmbodied(
  data: ISubmissionData,
  ef: ResolvedEmissionFactors
): EmbodiedResult {
  const mat = data.civil?.materials ?? data.materials ?? (data as any).materials;
  const byMaterial: Record<string, number> = {};
  const fallbacksApplied: string[] = [];
  let totalKgCO2 = 0;
  let areaUsed = 0;

  function addKg(key: string, kgCO2: number) {
    if (kgCO2 !== 0) {
      byMaterial[key] = parseFloat((kgCO2 / 1000).toFixed(4)); // store as tCO2e
      totalKgCO2 += kgCO2;
    }
  }

  if (!mat) {
    // No materials data — bulk structural fallback
    const area = (data.overview as any)?.totalFloorArea ?? FALLBACK_AREA_SQM;
    areaUsed = area;
    fallbacksApplied.push('materials.noDataFallback');
    addKg('concrete_bulk', area * STRUCTURAL.concreteKgPerSqm * ef.concreteKgCo2PerKg);
    addKg('steel_bulk', area * STRUCTURAL.steelKgPerSqm * ef.steelKgCo2PerKg);
    addKg('glass_bulk', area * STRUCTURAL.glassKgPerSqm * ef.glassKgCo2PerKg);
    const total = totalKgCO2 / 1000;
    return {
      totalEmbodiedCarbon: parseFloat(total.toFixed(4)),
      embodiedPerYear: parseFloat((total / 50).toFixed(4)),
      byMaterial,
      areaUsed,
      fallbacksApplied,
    };
  }

  const matAny = mat as any;

  // ── Concrete (priority: PCC/RCC > legacy concreteVolumeCubicM) ───────────
  const hasPCC = (mat.concretePCC_m3 ?? 0) > 0;
  const hasRCC = (mat.concreteRCC_m3 ?? 0) > 0;
  if (hasPCC) addKg('concretePCC', mat.concretePCC_m3! * MATERIAL_EF_TABLE['concretePCC_m3'].ef);
  if (hasRCC) addKg('concreteRCC', mat.concreteRCC_m3! * MATERIAL_EF_TABLE['concreteRCC_m3'].ef);
  if (!hasPCC && !hasRCC && matAny.concreteVolumeCubicM > 0) {
    addKg(
      'concrete_legacy',
      matAny.concreteVolumeCubicM * MATERIAL_EF_TABLE['concreteVolumeCubicM'].ef
    );
  }

  // ── Steel (priority: rebar/frame/section > legacy steelWeightKg) ─────────
  const hasRebar = (mat.rebar_kg ?? 0) > 0;
  const hasSteelFrame = (mat.steelFrame_kg ?? 0) > 0;
  const hasSteelSection = (mat.steelSection_kg ?? 0) > 0;
  if (hasRebar) addKg('rebar', mat.rebar_kg! * MATERIAL_EF_TABLE['rebar_kg'].ef);
  if (hasSteelFrame)
    addKg('steelFrame', mat.steelFrame_kg! * MATERIAL_EF_TABLE['steelFrame_kg'].ef);
  if (hasSteelSection)
    addKg('steelSection', mat.steelSection_kg! * MATERIAL_EF_TABLE['steelSection_kg'].ef);
  if (!hasRebar && !hasSteelFrame && !hasSteelSection && matAny.steelWeightKg > 0) {
    addKg('steel_legacy', matAny.steelWeightKg * MATERIAL_EF_TABLE['steelWeightKg'].ef);
  }

  // ── Masonry ───────────────────────────────────────────────────────────────
  if ((mat.brickMasonry_kg ?? 0) > 0)
    addKg('brickMasonry', mat.brickMasonry_kg! * MATERIAL_EF_TABLE['brickMasonry_kg'].ef);
  else if (matAny.brickCount > 0) addKg('brick_legacy', (matAny.brickCount / 1000) * 0.24 * 1000); // 0.24 tCO2/1000 bricks
  if ((mat.stoneMasonry_kg ?? 0) > 0)
    addKg('stoneMasonry', mat.stoneMasonry_kg! * MATERIAL_EF_TABLE['stoneMasonry_kg'].ef);
  if ((mat.kotaStone_kg ?? 0) > 0)
    addKg('kotaStone', mat.kotaStone_kg! * MATERIAL_EF_TABLE['kotaStone_kg'].ef);
  if ((mat.ceramicTile_kg ?? 0) > 0)
    addKg('ceramicTile', mat.ceramicTile_kg! * MATERIAL_EF_TABLE['ceramicTile_kg'].ef);
  if ((mat.plaster_kg ?? 0) > 0)
    addKg('plaster', mat.plaster_kg! * MATERIAL_EF_TABLE['plaster_kg'].ef);

  // ── Wood (priority: frame/plywood > legacy timberVolumeCubicM) ───────────
  const hasWoodFrame = (mat.woodFrame_kg ?? 0) > 0;
  const hasPlywood = (mat.plywood_kg ?? 0) > 0;
  if (hasWoodFrame) addKg('woodFrame', mat.woodFrame_kg! * MATERIAL_EF_TABLE['woodFrame_kg'].ef);
  if (hasPlywood) addKg('plywood', mat.plywood_kg! * MATERIAL_EF_TABLE['plywood_kg'].ef);
  if (!hasWoodFrame && !hasPlywood && matAny.timberVolumeCubicM > 0) {
    addKg('timber_legacy', matAny.timberVolumeCubicM * MATERIAL_EF_TABLE['timberVolumeCubicM'].ef);
  }
  if ((mat.particleBoard_kg ?? 0) > 0)
    addKg('particleBoard', mat.particleBoard_kg! * MATERIAL_EF_TABLE['particleBoard_kg'].ef);
  if ((mat.puffPanel_kg ?? 0) > 0)
    addKg('puffPanel', mat.puffPanel_kg! * MATERIAL_EF_TABLE['puffPanel_kg'].ef);

  // ── Glass ─────────────────────────────────────────────────────────────────
  if (matAny.glassAreaSqM > 0)
    addKg('glass', matAny.glassAreaSqM * MATERIAL_EF_TABLE['glassAreaSqM'].ef);
  else if ((mat.glassKg ?? 0) > 0) addKg('glass_furniture', mat.glassKg! * ef.glassKgCo2PerKg);

  // ── Finishes / Cladding ───────────────────────────────────────────────────
  if ((mat.paint_m2 ?? 0) > 0) addKg('paint', mat.paint_m2! * MATERIAL_EF_TABLE['paint_m2'].ef);
  if ((mat.aluminum_kg ?? 0) > 0)
    addKg('aluminum', mat.aluminum_kg! * MATERIAL_EF_TABLE['aluminum_kg'].ef);
  if ((mat.upvc_kg ?? 0) > 0) addKg('upvc', mat.upvc_kg! * MATERIAL_EF_TABLE['upvc_kg'].ef);
  if ((mat.cgiSheet_kg ?? 0) > 0)
    addKg('cgiSheet', mat.cgiSheet_kg! * MATERIAL_EF_TABLE['cgiSheet_kg'].ef);
  if ((mat.gypsum_kg ?? 0) > 0) addKg('gypsum', mat.gypsum_kg! * MATERIAL_EF_TABLE['gypsum_kg'].ef);
  if (matAny.asbestos_m2 > 0)
    addKg('asbestos', matAny.asbestos_m2 * MATERIAL_EF_TABLE['asbestos_m2'].ef);

  // ── Furniture (detailed / bulk mode) ─────────────────────────────────────
  if (mat.estimationMode === 'detailed') {
    const woodKg = mat.woodenFurnitureKg ?? 0;
    const steelKg = mat.steelFurnitureKg ?? 0;
    const plasticKg = mat.plasticKg ?? 0;
    if (woodKg + steelKg + plasticKg > 0) {
      addKg(
        'furniture_detailed',
        woodKg * ef.woodKgCo2PerKg + steelKg * ef.steelKgCo2PerKg + plasticKg * ef.plasticKgCo2PerKg
      );
    }
  }

  // ── If still zero after all above (no structural data), apply bulk fallback ─
  if (totalKgCO2 === 0) {
    const area = (data.overview as any)?.totalFloorArea ?? FALLBACK_AREA_SQM;
    areaUsed = area;
    fallbacksApplied.push('materials.structuralBulkFallback');
    addKg('concrete_bulk', area * STRUCTURAL.concreteKgPerSqm * ef.concreteKgCo2PerKg);
    addKg('steel_bulk', area * STRUCTURAL.steelKgPerSqm * ef.steelKgCo2PerKg);
    addKg('glass_bulk', area * STRUCTURAL.glassKgPerSqm * ef.glassKgCo2PerKg);
  }

  const totalTco2e = totalKgCO2 / 1000;
  return {
    totalEmbodiedCarbon: parseFloat(totalTco2e.toFixed(4)),
    embodiedPerYear: parseFloat((totalTco2e / 50).toFixed(4)),
    byMaterial,
    areaUsed,
    fallbacksApplied,
  };
}
