import { ISubmissionData, ICarbonResults } from '@shared/types/submission.types';
import { calculateEmbodiedCarbon } from './embodied';
import { calculateEmbodied } from './embodied';
import { calculateOperationalCarbon } from './operational';
import { calculateOperational } from './operational';
import { calculateWasteCarbon } from './waste';
import { calculateWaste } from './waste';
import { EmissionFactors } from './defaults';
import {
  loadEmissionFactors as _loadFromDB,
  ResolvedEmissionFactors,
  buildEfSnapshot,
} from './efLoader';

export type { EmissionFactors };
export type { ResolvedEmissionFactors } from './efLoader';
export { buildEfSnapshot } from './efLoader';

export { calculateOperational } from './operational';
export type { OperationalResult } from './operational';
export { calculateWaste } from './waste';
export type { WasteResult } from './waste';
export { calculateEmbodied } from './embodied';
export type { EmbodiedResult } from './embodied';

/**
 * Loads active emission factors from the DB, falling back to Annexure 8 hardcoded
 * values on failure. Safe to call from any context.
 */
export { loadEmissionFactors } from './efLoader';

/**
 * Runs the full carbon calculation for a submission.
 *
 * @param data    - Engine input (ISubmissionData shape from adapter)
 * @param factors - Pre-loaded emission factors. If omitted, factors are fetched
 *                  from the DB automatically (convenient for one-off calls; for
 *                  approval snapshotting, pass pre-loaded factors so the same
 *                  snapshot can be stored).
 */
export async function calculateCarbon(
  data: ISubmissionData,
  factors?: EmissionFactors | ResolvedEmissionFactors
): Promise<ICarbonResults & { efSnapshot?: ReturnType<typeof buildEfSnapshot> }> {
  const resolvedFactors = factors ?? (await _loadFromDB());
  const isResolved = '_snapshotTimestamp' in resolvedFactors;

  const estimatedFields: string[] = [];

  // ── Old sub-engines (for legacy breakdown fields) ─────────────────────────
  const embodiedLegacy = calculateEmbodiedCarbon(data, resolvedFactors, estimatedFields);
  const operational = calculateOperationalCarbon(data, resolvedFactors, estimatedFields);
  const waste = calculateWasteCarbon(
    data.waste,
    data.usage,
    data.overview?.buildingType ?? 'academic',
    resolvedFactors,
    estimatedFields,
    resolvedFactors.electricityKgCo2PerKwh
  );

  // ── New sub-engines (correct formulas, byComponent breakdown) ────────────
  const isFullyResolved =
    isResolved && (resolvedFactors as ResolvedEmissionFactors).gridElectricity > 0;
  let newComponents: {
    operational: ReturnType<typeof calculateOperational>;
    waste: ReturnType<typeof calculateWaste>;
    embodied: ReturnType<typeof calculateEmbodied>;
  } | null = null;

  if (isFullyResolved) {
    const rf = resolvedFactors as ResolvedEmissionFactors;
    newComponents = {
      operational: calculateOperational(data, rf),
      waste: calculateWaste(data, rf),
      embodied: calculateEmbodied(data, rf),
    };
  }

  const bd = operational.breakdown as Record<string, unknown>;
  const vehicleDieselTco2e = (bd.vehicleDiesel as number) ?? 0;
  const vehicleKeroseneTco2e = (bd.vehicleKerosene as number) ?? 0;
  const evChargingTco2e = (bd.evCharging as number) ?? 0;
  const transportCarbonPerYear = vehicleDieselTco2e + vehicleKeroseneTco2e;
  const scope3ActivitiesTco2e = operational.scope3;

  const totalLifecycle = embodiedLegacy.total + (operational.total + waste.total) * 50;

  const ds = operational.dataSource as Record<string, unknown>;

  // Build byComponent from new sub-engines if available, else zeros
  const nc = newComponents;
  const byComponent = nc
    ? {
        // Operational
        gridElectricity: nc.operational.byComponent.gridElectricity,
        dieselGenerator: nc.operational.byComponent.dieselGenerator,
        lpgCooking: nc.operational.byComponent.lpgCooking,
        vehicleFleet: nc.operational.byComponent.vehicleFleet,
        refrigerantLeakage: nc.operational.byComponent.refrigerantLeakage,
        transformerLosses: nc.operational.byComponent.transformerLosses,
        evCharging: nc.operational.byComponent.evCharging,
        // Waste
        landfillCH4: nc.waste.byComponent.landfillCH4,
        wasteIncineration: nc.waste.byComponent.wasteIncineration,
        mswPlantElectricity: nc.waste.byComponent.mswPlantElectricity,
        wastewaterCH4: nc.waste.byComponent.wastewaterCH4,
        wastewaterN2O: nc.waste.byComponent.wastewaterN2O,
        stpElectricity: nc.waste.byComponent.stpElectricity,
        wtpElectricity: nc.waste.byComponent.wtpElectricity,
        roElectricity: nc.waste.byComponent.roElectricity,
        chemicalUsage: nc.waste.byComponent.chemicalUsage,
        municipalWaterScope3: nc.waste.byComponent.municipalWaterScope3,
        // Embodied (amortised)
        embodiedMaterials: nc.embodied.embodiedPerYear,
        materialBreakdown: Object.fromEntries(
          Object.entries(nc.embodied.byMaterial).map(([k, v]) => [k, v / 50])
        ),
      }
    : undefined;

  const result: ICarbonResults & { efSnapshot?: ReturnType<typeof buildEfSnapshot> } = {
    embodiedCarbon: parseFloat(embodiedLegacy.total.toFixed(3)),
    embodiedCarbonPerYear: nc
      ? parseFloat(nc.embodied.embodiedPerYear.toFixed(4))
      : parseFloat((embodiedLegacy.total / 50).toFixed(4)),
    operationalCarbonPerYear: parseFloat(operational.total.toFixed(3)),
    wasteCarbonPerYear: parseFloat(waste.total.toFixed(3)),
    transportCarbonPerYear: parseFloat(transportCarbonPerYear.toFixed(3)),
    totalLifecycle: parseFloat(totalLifecycle.toFixed(3)),
    breakdown: {
      byScope: {
        scope1: parseFloat(
          (nc ? nc.operational.scope1 + nc.waste.scope1 : operational.scope1).toFixed(3)
        ),
        scope2: parseFloat(
          (nc
            ? nc.operational.scope2 + nc.waste.scope2
            : operational.scope2 + (waste.waterResults?.totalScope2WaterTco2ePerYear ?? 0)
          ).toFixed(3)
        ),
        scope3: parseFloat(
          (nc
            ? nc.embodied.embodiedPerYear + nc.waste.scope3
            : embodiedLegacy.total +
              waste.solidWasteCO2ePerYear +
              waste.liquidWasteCO2ePerYear +
              scope3ActivitiesTco2e
          ).toFixed(3)
        ),
      },
      byCategory: {
        energy: parseFloat(operational.total.toFixed(3)),
        materials: parseFloat(embodiedLegacy.total.toFixed(3)),
        transport: parseFloat(transportCarbonPerYear.toFixed(3)),
        waste: parseFloat(waste.total.toFixed(3)),
        solidWaste: parseFloat(waste.solidWasteCO2ePerYear.toFixed(3)),
        liquidWaste: parseFloat(waste.liquidWasteCO2ePerYear.toFixed(3)),
        evCharging: parseFloat(evChargingTco2e.toFixed(3)),
        vehicleDiesel: parseFloat(vehicleDieselTco2e.toFixed(3)),
        vehicleKerosene: parseFloat(vehicleKeroseneTco2e.toFixed(3)),
        waterTreatment: parseFloat(
          (waste.waterResults?.totalScope2WaterTco2ePerYear ?? 0).toFixed(3)
        ),
        commute: parseFloat(((bd.commute as number) ?? 0).toFixed(4)),
        airTravel: parseFloat(((bd.air_travel as number) ?? 0).toFixed(4)),
        officeEquipment: parseFloat(((bd.office_equipment as number) ?? 0).toFixed(4)),
      },
      // New granular byComponent (present only when ResolvedEmissionFactors available)
      ...(byComponent && { byComponent }),
      bySource: {
        gridElectricity:
          nc?.operational.byComponent.gridElectricity ?? (bd.electricity as number) ?? 0,
        diesel:
          nc?.operational.byComponent.dieselGenerator ??
          (bd.dgSets
            ? Object.values(bd.dgSets as Record<string, number>).reduce((a, b) => a + b, 0)
            : 0),
        lpg: nc?.operational.byComponent.lpgCooking ?? 0,
        vehicles: nc?.operational.byComponent.vehicleFleet ?? transportCarbonPerYear,
        refrigerants:
          nc?.operational.byComponent.refrigerantLeakage ?? (bd.refrigerants as number) ?? 0,
        solidWaste: nc
          ? nc.waste.byComponent.landfillCH4 + nc.waste.byComponent.wasteIncineration
          : waste.solidWasteCO2ePerYear,
        wastewater: nc
          ? nc.waste.byComponent.wastewaterCH4 + nc.waste.byComponent.wastewaterN2O
          : waste.liquidWasteCO2ePerYear,
        embodied: nc?.embodied.embodiedPerYear ?? embodiedLegacy.total,
      },
    },
    estimatedFields,
    confidenceScore: calculateConfidenceScore(data, estimatedFields),
    meta: nc
      ? {
          ...nc.operational.meta,
          ...nc.waste.meta,
          embodiedFallbacksApplied: nc.embodied.fallbacksApplied,
        }
      : undefined,
    dataSourceInfo: {
      gridEmissionFactorSource:
        nc?.operational.meta.gridEFSource ??
        (ds.gridEmissionFactorSource as string) ??
        'hardcoded_0716',
      gridEmissionFactorValue:
        nc?.operational.meta.gridEFUsed ?? (ds.gridEmissionFactorValue as number) ?? 0.716,
      tdLossApplied: (ds.tdLossApplied as number) ?? 0,
      solarOffsetSource: (ds.solarOffsetSource as string) ?? 'none',
      dgEmissionSource:
        nc?.operational.meta.dgFuelSource ?? (ds.dgDataSource as string) ?? 'estimated',
      transportDataSource: (ds.transportDataSource as 'measured' | 'estimated' | 'none') ?? 'none',
    },
  };

  // Only attach the snapshot when factors came from the DB loader
  if (isResolved) {
    result.efSnapshot = buildEfSnapshot(resolvedFactors as ResolvedEmissionFactors);
  }

  return result;
}

function calculateConfidenceScore(data: ISubmissionData, estimatedFields: string[]): number {
  let score = 100;
  score -= Math.min(estimatedFields.length * 10, 60);
  if (!data.structure?.rooms?.length) score -= 15;
  if (!data.energy?.primarySource) score -= 10;
  if (!data.appliances?.categories) score -= 10;
  if (!data.waste || data.waste.hasWasteData === false) score -= 5;
  return Math.max(score, 0);
}
