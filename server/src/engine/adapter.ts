import {
  IBuildingOverview,
  ICivilSectionData,
  IElectricalSectionData,
  IWasteSectionData,
  ISubmissionData,
  IElectricalAppliances,
  IAppliance,
  IStepAppliances,
  IDGSet,
  WastewaterTreatmentType,
  EntryMode,
  EnergySource,
  RoomInputMode,
} from '@shared/types/submission.types';

/**
 * Maps the new section-based data to the legacy ISubmissionData shape that
 * the existing engine functions (calculateEmbodiedCarbon, calculateOperationalCarbon,
 * calculateWasteCarbon) expect.
 *
 * This adapter lives here until Phase 5 rewrites the engine internals to consume
 * the section types directly.
 */
export function buildEngineInput(
  overviewData: IBuildingOverview,
  civilData?: ICivilSectionData,
  electricalData?: IElectricalSectionData | null,
  wasteData?: IWasteSectionData
): ISubmissionData {
  // ── BACKWARD COMPAT: old submissions may have dieselLitersPerMonth instead of dgSets
  // Synthesise a legacy DG set so the engine still computes diesel emissions.
  const dgSets = buildDgSets(electricalData);

  return {
    overview: overviewData,

    // Pass the full electrical section through so operational.ts can access
    // transformers and dgSets directly.
    electrical: electricalData ? { ...electricalData, dgSets } : null,

    // ── Legacy flat fields consumed by the current engine ─────────────────
    structure: civilData?.structure ?? {
      entryMode: EntryMode.CUMULATIVE,
      roomInputMode: RoomInputMode.QUICK,
      rooms: [],
    },

    energy: electricalData?.energy
      ? {
          entryMode: electricalData.energy.entryMode,
          primarySource: electricalData.energy.primarySource,
          monthlyConsumptionKwh: electricalData.energy.monthlyConsumptionKwh,
          isEstimated: electricalData.energy.isEstimated,
          solarCapacityKw: electricalData.energy.solarCapacityKw,
          customEnergySources: electricalData.energy.customEnergySources ?? [],
        }
      : {
          entryMode: EntryMode.CUMULATIVE,
          primarySource: EnergySource.GRID,
          isEstimated: true,
          customEnergySources: [],
        },

    appliances: electricalData?.appliances
      ? adaptAppliances(electricalData.appliances)
      : ({
          categories: {
            lighting: [],
            temperature_control: [],
            computing: [],
            labEquipment: [],
            misc: [],
            custom: [],
          },
        } as IStepAppliances),

    materials: civilData?.materials ?? {
      estimationMode: 'bulk',
      customMaterials: [],
    },

    // Usage pattern now lives in overview — expose it under the legacy key too
    usage: {
      operatingHoursPerDay: overviewData.operatingHoursPerDay ?? 10,
      operatingDaysPerWeek: overviewData.operatingDaysPerWeek ?? 6,
      peakMonths: overviewData.peakMonths ?? [],
      acUsageMonths: overviewData.acUsageMonths ?? [],
      occupancyDuringBreaks: overviewData.occupancyDuringBreaks ?? 'partial',
    },

    // Waste — bridge the new section data to the legacy IStepWaste shape.
    waste: (wasteData
      ? { ...wasteData, dailyOccupants: overviewData.averageDailyOccupants }
      : {
          entryMode: EntryMode.CUMULATIVE,
          solidWasteIsEstimated: true,
          wasteStreams: [],
          wastewaterTreatmentType: WastewaterTreatmentType.UNMANAGED_SEPTIC,
          wastewaterIsEstimated: true,
          customDischargePoints: [],
          hasWasteData: false,
          dailyOccupants: overviewData.averageDailyOccupants,
        }) as unknown as IWasteSectionData,
  };
}

/**
 * Builds the DG sets array for the engine, handling both new and old data shapes.
 * Old submissions stored diesel consumption in energy.dieselLitersPerMonth.
 * New submissions use the dgSets array directly.
 */
function buildDgSets(electrical?: IElectricalSectionData | null): IDGSet[] {
  if (!electrical) return [];

  const existing = electrical.dgSets ?? [];

  // Backward compat: if old format has dieselLitersPerMonth but no dgSets
  if (existing.length === 0 && electrical.energy?.dieselLitersPerMonth) {
    const syntheticDG: IDGSet = {
      id: 'legacy-diesel',
      dgId: 'Legacy diesel',
      capacityKva: 0,
      fuelType: 'diesel',
      monthlyFuelConsumptionL: electrical.energy.dieselLitersPerMonth,
    };
    return [syntheticDG];
  }

  return existing;
}

/**
 * Groups a flat appliances array (new model) into the category-keyed map
 * that the engine's operational.ts expects.
 */
function adaptAppliances(
  elec: IElectricalSectionData['appliances'] | IElectricalAppliances
): IStepAppliances {
  const appliancesArr: IAppliance[] = 'appliances' in elec ? elec.appliances : [];

  const categories: IStepAppliances['categories'] = {
    lighting: [],
    temperature_control: [],
    computing: [],
    labEquipment: [],
    misc: [],
    custom: [],
  };

  for (const a of appliancesArr) {
    // 'lab_equipment' (enum value) → 'labEquipment' (legacy key)
    if (a.category === 'lab_equipment') {
      categories.labEquipment.push(a);
    } else if (a.category === 'temperature_control') {
      categories.temperature_control.push(a);
    } else if (a.category === 'lighting') {
      categories.lighting.push(a);
    } else if (a.category === 'computing') {
      categories.computing.push(a);
    } else if (a.category === 'custom') {
      categories.custom.push(a);
    } else {
      categories.misc.push(a);
    }
  }

  return { categories };
}
