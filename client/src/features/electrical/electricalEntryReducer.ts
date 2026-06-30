import {
  IElectricalSectionData,
  IAppliance,
  ICustomField,
  ITransformer,
  ISwitchgearPanel,
  ICapacitorBank,
  IDGSet,
  IElectricalProjectionsMatrix,
  IProjectionHorizons,
  IElectricalOperationalData,
  IUtilityBillRecord,
  IDGGenerationRecord,
  ILoadProfileStats,
  ISubLoadProfileStats,
  EntryMode,
  ApplianceCategory,
  EnergySource,
  // Phase 3 types
  IPlantGenerationMonthly,
  IPlantGenerationUploadMeta,
  ISolarResourceMonthly,
  IWindResourceMonthly,
  IPVSitingRecord,
  IBatteryStorageRecord,
  IRenewableAssessmentRecord,
  IDataUploadMeta,
  AssessedEnergySource,
  // Phase 4 types
  ILightingSurveyRecord,
  IMotorPumpRecord,
  // Phase 5 types
  ITariffSchedule,
  ICmdVsActualRecord,
  IPowerFactorTrendRecord,
  // Phase 6-9 types
  IGridEmissionFactor,
  IPumpingExtension,
  IScadaSystem,
  ISmartMeterPlan,
  IEvCharger,
  IVehicleFuelRecord,
  VehicleType,
  IRefrigerantRecord,
  IFireExtinguisherRecord,
  IScope3Activities,
  ICommuteRecord,
  IAirTravelRecord,
  IOfficeEquipmentRecord,
} from '@shared/types/submission.types';
import { APPLIANCE_DEFAULTS } from '@shared/constants/defaults';

// ── State ─────────────────────────────────────────────────────────────────────
export interface ElectricalEntryState {
  electricalSubmissionId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  version: number;

  // Section 1: Electrical infrastructure
  transformers: ITransformer[];
  switchgear: ISwitchgearPanel[];
  capacitorBanks: ICapacitorBank[];

  // Section 2: DG Sets
  dgSets: IDGSet[];

  // Section 3: Energy
  energyData: IElectricalSectionData['energy'];

  // Section 4: Appliances
  appliancesData: IElectricalSectionData['appliances'];

  // Section 5: Projections
  projectionsData: IElectricalProjectionsMatrix;

  // Section 6: Operational data (Phase 2)
  operationalData: IElectricalOperationalData;

  // Section 7: Renewable energy systems (Phase 3)
  plantGenerationMonthly: IPlantGenerationMonthly[];
  plantGenerationUploadMeta?: IPlantGenerationUploadMeta;
  solarResourceMonthly: ISolarResourceMonthly[];
  solarResourceUploadMeta?: IDataUploadMeta;
  windResourceMonthly: IWindResourceMonthly[];
  windResourceUploadMeta?: IDataUploadMeta;
  pvSiting: IPVSitingRecord[];
  batteryStorage: IBatteryStorageRecord[];
  renewableAssessment: IRenewableAssessmentRecord[];

  // Phase 4
  lightingSurvey: ILightingSurveyRecord[];
  showLightingAudit: boolean;
  motorsPumps: IMotorPumpRecord[];

  // Phase 5
  tariffSchedules: ITariffSchedule[];
  cmdVsActual: ICmdVsActualRecord[];
  pfTrend: IPowerFactorTrendRecord[];

  // Phase 6: Grid emission factors
  gridEmissionFactors: IGridEmissionFactor[];

  // Phase 7: Pumping extensions & SCADA
  pumpingExtensions: IPumpingExtension[];
  scadaSystems: IScadaSystem[];

  // Phase 8: Smart meter plan
  smartMeterPlan: ISmartMeterPlan[];

  // Phase 9: EV chargers & vehicle fleet
  evChargers: IEvCharger[];
  vehicleFuelRecords: IVehicleFuelRecord[];

  // Phase 10: Refrigerants & fire extinguishers
  refrigerantRecords: IRefrigerantRecord[];
  fireExtinguisherRecords: IFireExtinguisherRecord[];

  // Phase 11: Scope 3 activities
  scope3Activities: IScope3Activities;

  // UI state
  activeSection: string;
  expandedCards: string[]; // which transformer/DG/switchgear card IDs are open
  validationResult: { warnings: string[]; completenessScore: number } | null;

  // Re-entry workflow
  previousData: Partial<IElectricalSectionData> | null;
  whatChanged: string;
}

// ── Actions ───────────────────────────────────────────────────────────────────
export type ElectricalEntryAction =
  | { type: 'SET_ELECTRICAL_SUBMISSION_ID'; payload: string }
  | { type: 'HYDRATE'; payload: Partial<IElectricalSectionData> & { version?: number } }
  // Infrastructure
  | { type: 'ADD_TRANSFORMER'; payload: ITransformer }
  | { type: 'UPDATE_TRANSFORMER'; payload: { id: string; updates: Partial<ITransformer> } }
  | { type: 'REMOVE_TRANSFORMER'; payload: string }
  | { type: 'ADD_SWITCHGEAR'; payload: ISwitchgearPanel }
  | { type: 'UPDATE_SWITCHGEAR'; payload: { id: string; updates: Partial<ISwitchgearPanel> } }
  | { type: 'REMOVE_SWITCHGEAR'; payload: string }
  | { type: 'ADD_CAPACITOR_BANK'; payload: ICapacitorBank }
  | { type: 'UPDATE_CAPACITOR_BANK'; payload: { id: string; updates: Partial<ICapacitorBank> } }
  | { type: 'REMOVE_CAPACITOR_BANK'; payload: string }
  // DG Sets
  | { type: 'ADD_DG_SET'; payload: IDGSet }
  | { type: 'UPDATE_DG_SET'; payload: { id: string; updates: Partial<IDGSet> } }
  | { type: 'REMOVE_DG_SET'; payload: string }
  // Energy / appliances
  | { type: 'UPDATE_ENERGY'; payload: Partial<IElectricalSectionData['energy']> }
  | { type: 'ADD_APPLIANCE'; payload: IAppliance }
  | { type: 'UPDATE_APPLIANCE'; payload: { id: string; updates: Partial<IAppliance> } }
  | { type: 'REMOVE_APPLIANCE'; payload: string }
  | { type: 'ADD_CUSTOM_ENERGY_SOURCE'; payload: ICustomField }
  | { type: 'REMOVE_CUSTOM_ENERGY_SOURCE'; payload: string }
  // Projections
  | {
      type: 'UPDATE_PROJECTION';
      payload: {
        question: keyof IElectricalProjectionsMatrix;
        horizon: keyof IProjectionHorizons;
        value: { data?: string | number; remark?: string };
      };
    }
  | { type: 'UPDATE_PROJECTION_TEXT'; payload: { value: string } } // for q23OtherDetails
  // Operational (Phase 2)
  | { type: 'ADD_UTILITY_BILL'; payload: IUtilityBillRecord }
  | { type: 'UPDATE_UTILITY_BILL'; payload: { id: string; updates: Partial<IUtilityBillRecord> } }
  | { type: 'REMOVE_UTILITY_BILL'; payload: string }
  | { type: 'SET_LOAD_PROFILE_STATS'; payload: ILoadProfileStats }
  | { type: 'SET_SUB_LOAD_STATS'; payload: ISubLoadProfileStats }
  | { type: 'ADD_DG_GENERATION_RECORD'; payload: IDGGenerationRecord }
  | {
      type: 'UPDATE_DG_GENERATION_RECORD';
      payload: { id: string; updates: Partial<IDGGenerationRecord> };
    }
  | { type: 'REMOVE_DG_GENERATION_RECORD'; payload: string }
  | { type: 'IMPORT_DG_GENERATION_RECORDS'; payload: IDGGenerationRecord[] }
  | { type: 'UPDATE_LOAD_PROFILE_NOTE'; payload: string }
  | { type: 'UPDATE_SUBLOAD_PROFILE_NOTE'; payload: string }
  // Phase 3 — Renewable energy systems (bulk, kept for future admin use)
  | {
      type: 'SET_PLANT_GENERATION';
      payload: { monthly: IPlantGenerationMonthly[]; meta: IPlantGenerationUploadMeta };
    }
  | { type: 'CLEAR_PLANT_GENERATION' }
  | {
      type: 'SET_SOLAR_RESOURCE';
      payload: { monthly: ISolarResourceMonthly[]; meta: IDataUploadMeta };
    }
  | { type: 'CLEAR_SOLAR_RESOURCE' }
  | {
      type: 'SET_WIND_RESOURCE';
      payload: { monthly: IWindResourceMonthly[]; meta: IDataUploadMeta };
    }
  | { type: 'CLEAR_WIND_RESOURCE' }
  // Phase 3 — individual record management (manual entry)
  | { type: 'ADD_PLANT_GENERATION_RECORD'; payload: IPlantGenerationMonthly }
  | {
      type: 'REMOVE_PLANT_GENERATION_RECORD';
      payload: { plantId: string; monthIndex: number; year: number };
    }
  | { type: 'ADD_SOLAR_RESOURCE_MONTH'; payload: ISolarResourceMonthly }
  | { type: 'REMOVE_SOLAR_RESOURCE_MONTH'; payload: { monthIndex: number; year: number } }
  | { type: 'ADD_WIND_RESOURCE_MONTH'; payload: IWindResourceMonthly }
  | { type: 'REMOVE_WIND_RESOURCE_MONTH'; payload: { monthIndex: number; year: number } }
  | { type: 'ADD_PV_SITING'; payload: IPVSitingRecord }
  | { type: 'UPDATE_PV_SITING'; payload: { id: string; updates: Partial<IPVSitingRecord> } }
  | { type: 'REMOVE_PV_SITING'; payload: string }
  | { type: 'ADD_BATTERY_STORAGE'; payload: IBatteryStorageRecord }
  | {
      type: 'UPDATE_BATTERY_STORAGE';
      payload: { id: string; updates: Partial<IBatteryStorageRecord> };
    }
  | { type: 'REMOVE_BATTERY_STORAGE'; payload: string }
  | { type: 'ADD_RENEWABLE_ASSESSMENT'; payload: IRenewableAssessmentRecord }
  | {
      type: 'UPDATE_RENEWABLE_ASSESSMENT';
      payload: { id: string; updates: Partial<IRenewableAssessmentRecord> };
    }
  | { type: 'REMOVE_RENEWABLE_ASSESSMENT'; payload: string }
  | { type: 'PREPOPULATE_ASSESSMENT_TECHNOLOGIES'; payload: AssessedEnergySource[] }
  // Phase 4 — Lighting survey
  | { type: 'TOGGLE_LIGHTING_AUDIT' }
  | { type: 'ADD_LIGHTING_SURVEY'; payload: ILightingSurveyRecord }
  | {
      type: 'UPDATE_LIGHTING_SURVEY';
      payload: { id: string; updates: Partial<ILightingSurveyRecord> };
    }
  | { type: 'REMOVE_LIGHTING_SURVEY'; payload: string }
  // Phase 4 — Motors & pumps
  | { type: 'ADD_MOTOR_PUMP'; payload: IMotorPumpRecord }
  | { type: 'UPDATE_MOTOR_PUMP'; payload: { id: string; updates: Partial<IMotorPumpRecord> } }
  | { type: 'REMOVE_MOTOR_PUMP'; payload: string }
  // Phase 5 — Tariff schedules
  | { type: 'ADD_TARIFF_SCHEDULE'; payload: ITariffSchedule }
  | { type: 'UPDATE_TARIFF_SCHEDULE'; payload: { id: string; updates: Partial<ITariffSchedule> } }
  | { type: 'REMOVE_TARIFF_SCHEDULE'; payload: string }
  // Phase 5 — CMD vs Actual
  | { type: 'ADD_CMD_RECORD'; payload: ICmdVsActualRecord }
  | { type: 'UPDATE_CMD_RECORD'; payload: { id: string; updates: Partial<ICmdVsActualRecord> } }
  | { type: 'REMOVE_CMD_RECORD'; payload: string }
  | { type: 'BULK_ADD_CMD_MONTHS'; payload: ICmdVsActualRecord[] }
  // Phase 5 — PF Trend
  | { type: 'ADD_PF_RECORD'; payload: IPowerFactorTrendRecord }
  | { type: 'UPDATE_PF_RECORD'; payload: { id: string; updates: Partial<IPowerFactorTrendRecord> } }
  | { type: 'REMOVE_PF_RECORD'; payload: string }
  | { type: 'BULK_ADD_PF_MONTHS'; payload: IPowerFactorTrendRecord[] }
  // Phase 6: Grid emission factors
  | { type: 'ADD_GRID_EF'; payload: IGridEmissionFactor }
  | { type: 'UPDATE_GRID_EF'; payload: { id: string; updates: Partial<IGridEmissionFactor> } }
  | { type: 'REMOVE_GRID_EF'; payload: string }
  // Phase 7: Pumping extensions
  | { type: 'UPDATE_PUMPING_EXTENSION'; payload: { pumpId: string } & Partial<IPumpingExtension> }
  // Phase 7: SCADA systems
  | { type: 'ADD_SCADA'; payload: IScadaSystem }
  | { type: 'UPDATE_SCADA'; payload: { id: string; updates: Partial<IScadaSystem> } }
  | { type: 'REMOVE_SCADA'; payload: string }
  // Phase 8: Smart meter plan
  | { type: 'ADD_SMART_METER'; payload: ISmartMeterPlan }
  | { type: 'UPDATE_SMART_METER'; payload: { id: string; updates: Partial<ISmartMeterPlan> } }
  | { type: 'REMOVE_SMART_METER'; payload: string }
  // Phase 9: EV chargers
  | { type: 'ADD_EV_CHARGER'; payload: IEvCharger }
  | { type: 'UPDATE_EV_CHARGER'; payload: { id: string; updates: Partial<IEvCharger> } }
  | { type: 'REMOVE_EV_CHARGER'; payload: string }
  // Phase 9: Vehicle fuel records
  | { type: 'PREPOPULATE_VEHICLE_TYPES'; payload: IVehicleFuelRecord[] }
  | { type: 'ADD_VEHICLE_RECORD'; payload: IVehicleFuelRecord }
  | { type: 'UPDATE_VEHICLE_RECORD'; payload: { id: string; updates: Partial<IVehicleFuelRecord> } }
  | { type: 'REMOVE_VEHICLE_RECORD'; payload: string }
  // Phase 11: Scope 3 commute
  | { type: 'ADD_COMMUTE_RECORD'; payload: ICommuteRecord }
  | { type: 'UPDATE_COMMUTE_RECORD'; payload: { id: string; updates: Partial<ICommuteRecord> } }
  | { type: 'REMOVE_COMMUTE_RECORD'; payload: string }
  // Phase 11: Air travel
  | { type: 'ADD_AIR_TRAVEL_RECORD'; payload: IAirTravelRecord }
  | {
      type: 'UPDATE_AIR_TRAVEL_RECORD';
      payload: { id: string; updates: Partial<IAirTravelRecord> };
    }
  | { type: 'REMOVE_AIR_TRAVEL_RECORD'; payload: string }
  // Phase 11: Office equipment
  | { type: 'ADD_OFFICE_EQ_RECORD'; payload: IOfficeEquipmentRecord }
  | {
      type: 'UPDATE_OFFICE_EQ_RECORD';
      payload: { id: string; updates: Partial<IOfficeEquipmentRecord> };
    }
  | { type: 'REMOVE_OFFICE_EQ_RECORD'; payload: string }
  // Phase 10: Refrigerants
  | { type: 'ADD_REFRIGERANT_RECORD'; payload: IRefrigerantRecord }
  | {
      type: 'UPDATE_REFRIGERANT_RECORD';
      payload: { id: string; updates: Partial<IRefrigerantRecord> };
    }
  | { type: 'REMOVE_REFRIGERANT_RECORD'; payload: string }
  // Phase 10: Fire extinguishers
  | { type: 'ADD_FIRE_EXT_RECORD'; payload: IFireExtinguisherRecord }
  | {
      type: 'UPDATE_FIRE_EXT_RECORD';
      payload: { id: string; updates: Partial<IFireExtinguisherRecord> };
    }
  | { type: 'REMOVE_FIRE_EXT_RECORD'; payload: string }
  // UI
  | { type: 'TOGGLE_CARD_EXPAND'; payload: string }
  | { type: 'SET_ACTIVE_SECTION'; payload: string }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_LAST_SAVED'; payload: Date }
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'SET_VALIDATION_RESULT'; payload: ElectricalEntryState['validationResult'] }
  | { type: 'SET_VERSION'; payload: number }
  | { type: 'SET_WHAT_CHANGED'; payload: string }
  | { type: 'INIT_APPLIANCE_COUNTS'; payload: Record<string, number> };

// ── Default appliances ────────────────────────────────────────────────────────
const DEFAULT_APPLIANCE_DEFS: Array<{
  type: string;
  category: ApplianceCategory;
  hoursPerDay: number;
}> = [
  // TEMPERATURE_CONTROL
  { type: 'CEILING_FAN', category: ApplianceCategory.TEMPERATURE_CONTROL, hoursPerDay: 12 },
  { type: 'SPLIT_AC_1TON', category: ApplianceCategory.TEMPERATURE_CONTROL, hoursPerDay: 8 },
  { type: 'SPLIT_AC_1_5TON', category: ApplianceCategory.TEMPERATURE_CONTROL, hoursPerDay: 8 },
  { type: 'SPLIT_AC_2TON', category: ApplianceCategory.TEMPERATURE_CONTROL, hoursPerDay: 8 },
  { type: 'EVAPORATIVE_COOLER', category: ApplianceCategory.TEMPERATURE_CONTROL, hoursPerDay: 10 },
  { type: 'ROOM_HEATER', category: ApplianceCategory.TEMPERATURE_CONTROL, hoursPerDay: 4 },
  { type: 'HEAT_PUMP_1TON', category: ApplianceCategory.TEMPERATURE_CONTROL, hoursPerDay: 6 },
  { type: 'EXHAUST_FAN', category: ApplianceCategory.TEMPERATURE_CONTROL, hoursPerDay: 8 },
  // LIGHTING
  { type: 'LED_BULB', category: ApplianceCategory.LIGHTING, hoursPerDay: 10 },
  { type: 'TUBE_LIGHT', category: ApplianceCategory.LIGHTING, hoursPerDay: 10 },
  { type: 'CFL', category: ApplianceCategory.LIGHTING, hoursPerDay: 10 },
  // COMPUTING
  { type: 'DESKTOP_PC', category: ApplianceCategory.COMPUTING, hoursPerDay: 8 },
  { type: 'LAPTOP', category: ApplianceCategory.COMPUTING, hoursPerDay: 8 },
  { type: 'SERVER', category: ApplianceCategory.COMPUTING, hoursPerDay: 24 },
  { type: 'PROJECTOR', category: ApplianceCategory.COMPUTING, hoursPerDay: 6 },
  // LAB_EQUIPMENT
  { type: 'CENTRIFUGE', category: ApplianceCategory.LAB_EQUIPMENT, hoursPerDay: 6 },
  { type: 'AUTOCLAVE', category: ApplianceCategory.LAB_EQUIPMENT, hoursPerDay: 4 },
  { type: 'FUME_HOOD', category: ApplianceCategory.LAB_EQUIPMENT, hoursPerDay: 8 },
  { type: 'PCR_MACHINE', category: ApplianceCategory.LAB_EQUIPMENT, hoursPerDay: 4 },
  // MISC
  { type: 'WATER_COOLER', category: ApplianceCategory.MISC, hoursPerDay: 8 },
  { type: 'ELEVATOR', category: ApplianceCategory.MISC, hoursPerDay: 12 },
  { type: 'PRINTER', category: ApplianceCategory.MISC, hoursPerDay: 4 },
];

export function makeDefaultAppliances(): IAppliance[] {
  return DEFAULT_APPLIANCE_DEFS.map(({ type, category, hoursPerDay }) => ({
    id: `default-${type.toLowerCase().replace(/_/g, '-')}`,
    type,
    isCustom: false,
    category,
    count: 0,
    wattsEach: APPLIANCE_DEFAULTS[type]?.watts ?? 0,
    hoursPerDay,
    isDefault: true,
  }));
}

// ── Initial state ─────────────────────────────────────────────────────────────
export const initialState: ElectricalEntryState = {
  electricalSubmissionId: null,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  version: 1,

  transformers: [],
  switchgear: [],
  capacitorBanks: [],
  dgSets: [],

  energyData: {
    entryMode: EntryMode.CUMULATIVE,
    primarySource: EnergySource.GRID,
    isEstimated: false,
    customEnergySources: [],
  },

  appliancesData: {
    entryMode: EntryMode.CUMULATIVE,
    appliances: makeDefaultAppliances(),
    customApplianceCount: 0,
  },

  projectionsData: {},

  operationalData: {
    utilityBills: [],
    hasLoadProfileData: false,
    hasSubLoadData: false,
    dgGenerationRecords: [],
  },

  // Phase 3
  plantGenerationMonthly: [],
  solarResourceMonthly: [],
  windResourceMonthly: [],
  pvSiting: [],
  batteryStorage: [],
  renewableAssessment: [],

  // Phase 4
  lightingSurvey: [],
  showLightingAudit: false,
  motorsPumps: [],

  // Phase 5
  tariffSchedules: [],
  cmdVsActual: [],
  pfTrend: [],

  // Phase 6
  gridEmissionFactors: [],

  // Phase 7
  pumpingExtensions: [],
  scadaSystems: [],

  // Phase 8
  smartMeterPlan: [],

  // Phase 9
  evChargers: [],
  vehicleFuelRecords: [],

  // Phase 10
  refrigerantRecords: [],
  fireExtinguisherRecords: [],

  // Phase 11
  scope3Activities: { commuteRecords: [], airTravelRecords: [], officeEquipmentRecords: [] },

  activeSection: 'infrastructure',
  expandedCards: [],
  validationResult: null,
  previousData: null,
  whatChanged: '',
};

// ── Reducer ───────────────────────────────────────────────────────────────────
export function electricalEntryReducer(
  state: ElectricalEntryState,
  action: ElectricalEntryAction
): ElectricalEntryState {
  switch (action.type) {
    case 'SET_ELECTRICAL_SUBMISSION_ID':
      return { ...state, electricalSubmissionId: action.payload };

    case 'HYDRATE': {
      const payload = action.payload;
      const incomingVersion = payload.version ?? state.version;

      // Merge appliances: restore saved counts onto defaults; append custom ones
      let appliances = state.appliancesData.appliances;
      if (payload.appliances?.appliances?.length) {
        const savedMap = new Map(payload.appliances.appliances.map((a) => [a.id, a]));
        const defaults = makeDefaultAppliances().map((d) =>
          savedMap.has(d.id) ? { ...d, ...savedMap.get(d.id) } : d
        );
        const customSaved = payload.appliances.appliances.filter((a) => a.isCustom);
        appliances = [...defaults, ...customSaved];
      }

      const previousData =
        incomingVersion > 1 && state.previousData === null ? { ...payload } : state.previousData;

      return {
        ...state,
        transformers: payload.transformers ?? state.transformers,
        switchgear: payload.switchgear ?? state.switchgear,
        capacitorBanks: payload.capacitorBanks ?? state.capacitorBanks,
        dgSets: payload.dgSets ?? state.dgSets,
        energyData: payload.energy ? { ...state.energyData, ...payload.energy } : state.energyData,
        appliancesData: {
          ...state.appliancesData,
          ...(payload.appliances ?? {}),
          appliances,
          customApplianceCount: appliances.filter((a) => a.isCustom).length,
        },
        projectionsData: payload.projections ?? state.projectionsData,
        operationalData: payload.operational ?? state.operationalData,
        // Phase 3 restore
        plantGenerationMonthly:
          (payload as Partial<IElectricalSectionData>).plantGenerationMonthly ??
          state.plantGenerationMonthly,
        plantGenerationUploadMeta:
          (payload as Partial<IElectricalSectionData>).plantGenerationUploadMeta ??
          state.plantGenerationUploadMeta,
        solarResourceMonthly:
          (payload as Partial<IElectricalSectionData>).solarResourceMonthly ??
          state.solarResourceMonthly,
        solarResourceUploadMeta:
          (payload as Partial<IElectricalSectionData>).solarResourceUploadMeta ??
          state.solarResourceUploadMeta,
        windResourceMonthly:
          (payload as Partial<IElectricalSectionData>).windResourceMonthly ??
          state.windResourceMonthly,
        windResourceUploadMeta:
          (payload as Partial<IElectricalSectionData>).windResourceUploadMeta ??
          state.windResourceUploadMeta,
        pvSiting: (payload as Partial<IElectricalSectionData>).pvSiting ?? state.pvSiting,
        batteryStorage:
          (payload as Partial<IElectricalSectionData>).batteryStorage ?? state.batteryStorage,
        renewableAssessment:
          (payload as Partial<IElectricalSectionData>).renewableAssessment ??
          state.renewableAssessment,
        // Phase 4 restore
        lightingSurvey:
          (payload as Partial<IElectricalSectionData>).lightingSurvey ?? state.lightingSurvey,
        motorsPumps: (payload as Partial<IElectricalSectionData>).motorsPumps ?? state.motorsPumps,
        // Phase 5 restore
        tariffSchedules:
          (payload as Partial<IElectricalSectionData>).tariffSchedules ?? state.tariffSchedules,
        cmdVsActual: (payload as Partial<IElectricalSectionData>).cmdVsActual ?? state.cmdVsActual,
        pfTrend: (payload as Partial<IElectricalSectionData>).pfTrend ?? state.pfTrend,
        // Phase 6 restore
        gridEmissionFactors:
          (payload as Partial<IElectricalSectionData>).gridEmissionFactors ??
          state.gridEmissionFactors,
        // Phase 7 restore
        pumpingExtensions:
          (payload as Partial<IElectricalSectionData>).pumpingExtensions ?? state.pumpingExtensions,
        scadaSystems:
          (payload as Partial<IElectricalSectionData>).scadaSystems ?? state.scadaSystems,
        // Phase 8 restore
        smartMeterPlan:
          (payload as Partial<IElectricalSectionData>).smartMeterPlan ?? state.smartMeterPlan,
        // Phase 9 restore
        evChargers: (payload as Partial<IElectricalSectionData>).evChargers ?? state.evChargers,
        vehicleFuelRecords:
          (payload as Partial<IElectricalSectionData>).vehicleFuelRecords ??
          state.vehicleFuelRecords,
        // Phase 10 restore
        refrigerantRecords:
          (payload as Partial<IElectricalSectionData>).refrigerantRecords ??
          state.refrigerantRecords,
        fireExtinguisherRecords:
          (payload as Partial<IElectricalSectionData>).fireExtinguisherRecords ??
          state.fireExtinguisherRecords,
        // Phase 11 restore
        scope3Activities:
          (payload as Partial<IElectricalSectionData>).scope3Activities ?? state.scope3Activities,
        version: incomingVersion,
        previousData,
        isDirty: false,
      };
    }

    // ── Infrastructure ──────────────────────────────────────────────────────
    case 'ADD_TRANSFORMER':
      return {
        ...state,
        transformers: [...state.transformers, action.payload],
        isDirty: true,
      };
    case 'UPDATE_TRANSFORMER':
      return {
        ...state,
        transformers: state.transformers.map((t) =>
          t.id === action.payload.id ? { ...t, ...action.payload.updates } : t
        ),
        isDirty: true,
      };
    case 'REMOVE_TRANSFORMER':
      return {
        ...state,
        transformers: state.transformers.filter((t) => t.id !== action.payload),
        isDirty: true,
      };

    case 'ADD_SWITCHGEAR':
      return { ...state, switchgear: [...state.switchgear, action.payload], isDirty: true };
    case 'UPDATE_SWITCHGEAR':
      return {
        ...state,
        switchgear: state.switchgear.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
        isDirty: true,
      };
    case 'REMOVE_SWITCHGEAR':
      return {
        ...state,
        switchgear: state.switchgear.filter((s) => s.id !== action.payload),
        isDirty: true,
      };

    case 'ADD_CAPACITOR_BANK':
      return { ...state, capacitorBanks: [...state.capacitorBanks, action.payload], isDirty: true };
    case 'UPDATE_CAPACITOR_BANK':
      return {
        ...state,
        capacitorBanks: state.capacitorBanks.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload.updates } : c
        ),
        isDirty: true,
      };
    case 'REMOVE_CAPACITOR_BANK':
      return {
        ...state,
        capacitorBanks: state.capacitorBanks.filter((c) => c.id !== action.payload),
        isDirty: true,
      };

    // ── DG Sets ─────────────────────────────────────────────────────────────
    case 'ADD_DG_SET':
      return { ...state, dgSets: [...state.dgSets, action.payload], isDirty: true };
    case 'UPDATE_DG_SET':
      return {
        ...state,
        dgSets: state.dgSets.map((d) =>
          d.id === action.payload.id ? { ...d, ...action.payload.updates } : d
        ),
        isDirty: true,
      };
    case 'REMOVE_DG_SET':
      return {
        ...state,
        dgSets: state.dgSets.filter((d) => d.id !== action.payload),
        isDirty: true,
      };

    // ── Energy ──────────────────────────────────────────────────────────────
    case 'UPDATE_ENERGY':
      return {
        ...state,
        energyData: { ...state.energyData, ...action.payload },
        isDirty: true,
      };

    case 'ADD_CUSTOM_ENERGY_SOURCE': {
      const customEnergySources = [...(state.energyData.customEnergySources ?? []), action.payload];
      return {
        ...state,
        energyData: { ...state.energyData, customEnergySources },
        isDirty: true,
      };
    }
    case 'REMOVE_CUSTOM_ENERGY_SOURCE': {
      const customEnergySources = (state.energyData.customEnergySources ?? []).filter(
        (s) => s.id !== action.payload
      );
      return {
        ...state,
        energyData: { ...state.energyData, customEnergySources },
        isDirty: true,
      };
    }

    // ── Appliances ──────────────────────────────────────────────────────────
    case 'ADD_APPLIANCE': {
      const appliances = [...(state.appliancesData.appliances ?? []), action.payload];
      return {
        ...state,
        appliancesData: {
          ...state.appliancesData,
          appliances,
          customApplianceCount: appliances.filter((a) => a.isCustom).length,
        },
        isDirty: true,
      };
    }
    case 'UPDATE_APPLIANCE': {
      const appliances = (state.appliancesData.appliances ?? []).map((a) =>
        a.id === action.payload.id ? { ...a, ...action.payload.updates } : a
      );
      return {
        ...state,
        appliancesData: { ...state.appliancesData, appliances },
        isDirty: true,
      };
    }
    case 'REMOVE_APPLIANCE': {
      const appliances = (state.appliancesData.appliances ?? []).filter(
        (a) => a.id !== action.payload
      );
      return {
        ...state,
        appliancesData: {
          ...state.appliancesData,
          appliances,
          customApplianceCount: appliances.filter((a) => a.isCustom).length,
        },
        isDirty: true,
      };
    }
    case 'INIT_APPLIANCE_COUNTS': {
      const counts = action.payload;
      const appliances = (state.appliancesData.appliances ?? []).map((a) =>
        a.isDefault && counts[a.type] !== undefined ? { ...a, count: counts[a.type] } : a
      );
      return { ...state, appliancesData: { ...state.appliancesData, appliances }, isDirty: true };
    }

    // ── Projections ─────────────────────────────────────────────────────────
    case 'UPDATE_PROJECTION': {
      const { question, horizon, value } = action.payload;
      const existing = (state.projectionsData[question] as IProjectionHorizons | undefined) ?? {};
      const existingHorizon = existing[horizon] ?? {};
      return {
        ...state,
        projectionsData: {
          ...state.projectionsData,
          [question]: {
            ...existing,
            [horizon]: { ...existingHorizon, ...value },
          },
        },
        isDirty: true,
      };
    }
    case 'UPDATE_PROJECTION_TEXT':
      return {
        ...state,
        projectionsData: { ...state.projectionsData, q23OtherDetails: action.payload.value },
        isDirty: true,
      };

    // ── Operational (Phase 2) ───────────────────────────────────────────────
    case 'ADD_UTILITY_BILL':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          utilityBills: [...state.operationalData.utilityBills, action.payload],
        },
        isDirty: true,
      };
    case 'UPDATE_UTILITY_BILL':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          utilityBills: state.operationalData.utilityBills.map((b) =>
            b.id === action.payload.id ? { ...b, ...action.payload.updates } : b
          ),
        },
        isDirty: true,
      };
    case 'REMOVE_UTILITY_BILL':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          utilityBills: state.operationalData.utilityBills.filter((b) => b.id !== action.payload),
        },
        isDirty: true,
      };

    case 'SET_LOAD_PROFILE_STATS':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          loadProfileStats: action.payload,
          hasLoadProfileData: true,
        },
        isDirty: true,
      };
    case 'UPDATE_LOAD_PROFILE_NOTE':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          loadProfileStats: {
            ...(state.operationalData.loadProfileStats ?? {}),
            dataQualityNote: action.payload,
          },
        },
        isDirty: true,
      };

    case 'SET_SUB_LOAD_STATS':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          subLoadProfileStats: action.payload,
          hasSubLoadData: true,
        },
        isDirty: true,
      };
    case 'UPDATE_SUBLOAD_PROFILE_NOTE':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          subLoadProfileStats: {
            ...(state.operationalData.subLoadProfileStats ?? { subLoads: [] }),
            dataQualityNote: action.payload,
          },
        },
        isDirty: true,
      };

    case 'ADD_DG_GENERATION_RECORD':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          dgGenerationRecords: [...state.operationalData.dgGenerationRecords, action.payload],
        },
        isDirty: true,
      };
    case 'UPDATE_DG_GENERATION_RECORD':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          dgGenerationRecords: state.operationalData.dgGenerationRecords.map((r) =>
            r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
          ),
        },
        isDirty: true,
      };
    case 'REMOVE_DG_GENERATION_RECORD':
      return {
        ...state,
        operationalData: {
          ...state.operationalData,
          dgGenerationRecords: state.operationalData.dgGenerationRecords.filter(
            (r) => r.id !== action.payload
          ),
        },
        isDirty: true,
      };
    case 'IMPORT_DG_GENERATION_RECORDS': {
      // Merge: replace records for same DG ID + month, keep others
      const incoming = action.payload;
      const incomingKeys = new Set(incoming.map((r) => `${r.dgId}||${r.month}`));
      const merged = [
        ...state.operationalData.dgGenerationRecords.filter(
          (r) => !incomingKeys.has(`${r.dgId}||${r.month}`)
        ),
        ...incoming,
      ];
      return {
        ...state,
        operationalData: { ...state.operationalData, dgGenerationRecords: merged },
        isDirty: true,
      };
    }

    // ── Phase 3: Renewable energy systems ──────────────────────────────────
    case 'SET_PLANT_GENERATION':
      return {
        ...state,
        plantGenerationMonthly: action.payload.monthly,
        plantGenerationUploadMeta: action.payload.meta,
        isDirty: true,
      };
    case 'CLEAR_PLANT_GENERATION':
      return {
        ...state,
        plantGenerationMonthly: [],
        plantGenerationUploadMeta: undefined,
        isDirty: true,
      };

    case 'SET_SOLAR_RESOURCE':
      return {
        ...state,
        solarResourceMonthly: action.payload.monthly,
        solarResourceUploadMeta: action.payload.meta,
        isDirty: true,
      };
    case 'CLEAR_SOLAR_RESOURCE':
      return {
        ...state,
        solarResourceMonthly: [],
        solarResourceUploadMeta: undefined,
        isDirty: true,
      };

    case 'SET_WIND_RESOURCE':
      return {
        ...state,
        windResourceMonthly: action.payload.monthly,
        windResourceUploadMeta: action.payload.meta,
        isDirty: true,
      };
    case 'CLEAR_WIND_RESOURCE':
      return {
        ...state,
        windResourceMonthly: [],
        windResourceUploadMeta: undefined,
        isDirty: true,
      };

    // Individual record management (manual entry)
    case 'ADD_PLANT_GENERATION_RECORD': {
      const rec = action.payload;
      // Replace if same plant + month already exists, else append
      const filtered = state.plantGenerationMonthly.filter(
        (r) =>
          !(r.plantId === rec.plantId && r.monthIndex === rec.monthIndex && r.year === rec.year)
      );
      const sorted = [...filtered, rec].sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex
      );
      return { ...state, plantGenerationMonthly: sorted, isDirty: true };
    }
    case 'REMOVE_PLANT_GENERATION_RECORD': {
      const { plantId, monthIndex, year } = action.payload;
      return {
        ...state,
        plantGenerationMonthly: state.plantGenerationMonthly.filter(
          (r) => !(r.plantId === plantId && r.monthIndex === monthIndex && r.year === year)
        ),
        isDirty: true,
      };
    }

    case 'ADD_SOLAR_RESOURCE_MONTH': {
      const rec = action.payload;
      const filtered = state.solarResourceMonthly.filter(
        (r) => !(r.monthIndex === rec.monthIndex && r.year === rec.year)
      );
      const sorted = [...filtered, rec].sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex
      );
      return { ...state, solarResourceMonthly: sorted, isDirty: true };
    }
    case 'REMOVE_SOLAR_RESOURCE_MONTH': {
      const { monthIndex, year } = action.payload;
      return {
        ...state,
        solarResourceMonthly: state.solarResourceMonthly.filter(
          (r) => !(r.monthIndex === monthIndex && r.year === year)
        ),
        isDirty: true,
      };
    }

    case 'ADD_WIND_RESOURCE_MONTH': {
      const rec = action.payload;
      const filtered = state.windResourceMonthly.filter(
        (r) => !(r.monthIndex === rec.monthIndex && r.year === rec.year)
      );
      const sorted = [...filtered, rec].sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex
      );
      return { ...state, windResourceMonthly: sorted, isDirty: true };
    }
    case 'REMOVE_WIND_RESOURCE_MONTH': {
      const { monthIndex, year } = action.payload;
      return {
        ...state,
        windResourceMonthly: state.windResourceMonthly.filter(
          (r) => !(r.monthIndex === monthIndex && r.year === year)
        ),
        isDirty: true,
      };
    }

    case 'ADD_PV_SITING':
      return { ...state, pvSiting: [...state.pvSiting, action.payload], isDirty: true };
    case 'UPDATE_PV_SITING':
      return {
        ...state,
        pvSiting: state.pvSiting.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };
    case 'REMOVE_PV_SITING':
      return {
        ...state,
        pvSiting: state.pvSiting.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    case 'ADD_BATTERY_STORAGE':
      return { ...state, batteryStorage: [...state.batteryStorage, action.payload], isDirty: true };
    case 'UPDATE_BATTERY_STORAGE':
      return {
        ...state,
        batteryStorage: state.batteryStorage.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };
    case 'REMOVE_BATTERY_STORAGE':
      return {
        ...state,
        batteryStorage: state.batteryStorage.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    case 'ADD_RENEWABLE_ASSESSMENT':
      return {
        ...state,
        renewableAssessment: [...state.renewableAssessment, action.payload],
        isDirty: true,
      };
    case 'UPDATE_RENEWABLE_ASSESSMENT':
      return {
        ...state,
        renewableAssessment: state.renewableAssessment.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };
    case 'REMOVE_RENEWABLE_ASSESSMENT':
      return {
        ...state,
        renewableAssessment: state.renewableAssessment.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    case 'PREPOPULATE_ASSESSMENT_TECHNOLOGIES': {
      const existing = new Set(state.renewableAssessment.map((r) => r.energySource));
      const toAdd = action.payload
        .filter((tech) => !existing.has(tech))
        .map(
          (tech) =>
            ({
              id: Math.random().toString(36).slice(2, 10),
              energySource: tech,
            }) as IRenewableAssessmentRecord
        );
      return {
        ...state,
        renewableAssessment: [...state.renewableAssessment, ...toAdd],
        isDirty: true,
      };
    }

    // ── Phase 4: Lighting survey ────────────────────────────────────────────
    case 'TOGGLE_LIGHTING_AUDIT':
      return { ...state, showLightingAudit: !state.showLightingAudit };

    case 'ADD_LIGHTING_SURVEY':
      return { ...state, lightingSurvey: [...state.lightingSurvey, action.payload], isDirty: true };

    case 'UPDATE_LIGHTING_SURVEY':
      return {
        ...state,
        lightingSurvey: state.lightingSurvey.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_LIGHTING_SURVEY':
      return {
        ...state,
        lightingSurvey: state.lightingSurvey.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── Phase 4: Motors & pumps ─────────────────────────────────────────────
    case 'ADD_MOTOR_PUMP':
      return { ...state, motorsPumps: [...state.motorsPumps, action.payload], isDirty: true };

    case 'UPDATE_MOTOR_PUMP':
      return {
        ...state,
        motorsPumps: state.motorsPumps.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_MOTOR_PUMP':
      return {
        ...state,
        motorsPumps: state.motorsPumps.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── Phase 5: Tariff schedules ───────────────────────────────────────────
    case 'ADD_TARIFF_SCHEDULE':
      return {
        ...state,
        tariffSchedules: [...state.tariffSchedules, action.payload],
        isDirty: true,
      };

    case 'UPDATE_TARIFF_SCHEDULE':
      return {
        ...state,
        tariffSchedules: state.tariffSchedules.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_TARIFF_SCHEDULE':
      return {
        ...state,
        tariffSchedules: state.tariffSchedules.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── Phase 5: CMD vs Actual ──────────────────────────────────────────────
    case 'ADD_CMD_RECORD':
      return { ...state, cmdVsActual: [...state.cmdVsActual, action.payload], isDirty: true };

    case 'UPDATE_CMD_RECORD':
      return {
        ...state,
        cmdVsActual: state.cmdVsActual.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_CMD_RECORD':
      return {
        ...state,
        cmdVsActual: state.cmdVsActual.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    case 'BULK_ADD_CMD_MONTHS': {
      // Merge: replace records for same month, keep others
      const incoming = action.payload;
      const incomingKeys = new Set(incoming.map((r) => `${r.consumerNumber}||${r.month}`));
      const merged = [
        ...state.cmdVsActual.filter((r) => !incomingKeys.has(`${r.consumerNumber}||${r.month}`)),
        ...incoming,
      ];
      return { ...state, cmdVsActual: merged, isDirty: true };
    }

    // ── Phase 5: PF Trend ───────────────────────────────────────────────────
    case 'ADD_PF_RECORD':
      return { ...state, pfTrend: [...state.pfTrend, action.payload], isDirty: true };

    case 'UPDATE_PF_RECORD':
      return {
        ...state,
        pfTrend: state.pfTrend.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_PF_RECORD':
      return {
        ...state,
        pfTrend: state.pfTrend.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    case 'BULK_ADD_PF_MONTHS': {
      const incoming = action.payload;
      const incomingKeys = new Set(incoming.map((r) => `${r.consumerNumber}||${r.month}`));
      const merged = [
        ...state.pfTrend.filter((r) => !incomingKeys.has(`${r.consumerNumber}||${r.month}`)),
        ...incoming,
      ];
      return { ...state, pfTrend: merged, isDirty: true };
    }

    // ── Phase 6: Grid emission factors ────────────────────────────────────
    case 'ADD_GRID_EF':
      return {
        ...state,
        gridEmissionFactors: [...state.gridEmissionFactors, action.payload],
        isDirty: true,
      };

    case 'UPDATE_GRID_EF':
      return {
        ...state,
        gridEmissionFactors: state.gridEmissionFactors.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_GRID_EF':
      return {
        ...state,
        gridEmissionFactors: state.gridEmissionFactors.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── Phase 7: Pumping extensions ────────────────────────────────────────
    case 'UPDATE_PUMPING_EXTENSION': {
      const { pumpId, ...updates } = action.payload;
      const existing = state.pumpingExtensions.find((p) => p.pumpId === pumpId);
      if (existing) {
        return {
          ...state,
          pumpingExtensions: state.pumpingExtensions.map((p) =>
            p.pumpId === pumpId ? { ...p, ...updates } : p
          ),
          isDirty: true,
        };
      }
      return {
        ...state,
        pumpingExtensions: [...state.pumpingExtensions, { pumpId, ...updates }],
        isDirty: true,
      };
    }

    // ── Phase 7: SCADA systems ─────────────────────────────────────────────
    case 'ADD_SCADA':
      return { ...state, scadaSystems: [...state.scadaSystems, action.payload], isDirty: true };

    case 'UPDATE_SCADA':
      return {
        ...state,
        scadaSystems: state.scadaSystems.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_SCADA':
      return {
        ...state,
        scadaSystems: state.scadaSystems.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── Phase 8: Smart meter plan ──────────────────────────────────────────
    case 'ADD_SMART_METER':
      return { ...state, smartMeterPlan: [...state.smartMeterPlan, action.payload], isDirty: true };

    case 'UPDATE_SMART_METER':
      return {
        ...state,
        smartMeterPlan: state.smartMeterPlan.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_SMART_METER':
      return {
        ...state,
        smartMeterPlan: state.smartMeterPlan.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── Phase 9: EV chargers ───────────────────────────────────────────────
    case 'ADD_EV_CHARGER':
      return { ...state, evChargers: [...state.evChargers, action.payload], isDirty: true };

    case 'UPDATE_EV_CHARGER':
      return {
        ...state,
        evChargers: state.evChargers.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_EV_CHARGER':
      return {
        ...state,
        evChargers: state.evChargers.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── Phase 9: Vehicle fuel records ──────────────────────────────────────
    case 'PREPOPULATE_VEHICLE_TYPES':
      return {
        ...state,
        vehicleFuelRecords: action.payload,
        isDirty: true,
      };

    case 'ADD_VEHICLE_RECORD':
      return {
        ...state,
        vehicleFuelRecords: [...state.vehicleFuelRecords, action.payload],
        isDirty: true,
      };

    case 'UPDATE_VEHICLE_RECORD':
      return {
        ...state,
        vehicleFuelRecords: state.vehicleFuelRecords.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };

    case 'REMOVE_VEHICLE_RECORD':
      return {
        ...state,
        vehicleFuelRecords: state.vehicleFuelRecords.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── Phase 11: Scope 3 — Commute ────────────────────────────────────────
    case 'ADD_COMMUTE_RECORD':
      return {
        ...state,
        scope3Activities: {
          ...state.scope3Activities,
          commuteRecords: [...(state.scope3Activities.commuteRecords ?? []), action.payload],
        },
        isDirty: true,
      };
    case 'UPDATE_COMMUTE_RECORD':
      return {
        ...state,
        scope3Activities: {
          ...state.scope3Activities,
          commuteRecords: (state.scope3Activities.commuteRecords ?? []).map((r) =>
            r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
          ),
        },
        isDirty: true,
      };
    case 'REMOVE_COMMUTE_RECORD':
      return {
        ...state,
        scope3Activities: {
          ...state.scope3Activities,
          commuteRecords: (state.scope3Activities.commuteRecords ?? []).filter(
            (r) => r.id !== action.payload
          ),
        },
        isDirty: true,
      };

    // ── Phase 11: Scope 3 — Air Travel ─────────────────────────────────────
    case 'ADD_AIR_TRAVEL_RECORD':
      return {
        ...state,
        scope3Activities: {
          ...state.scope3Activities,
          airTravelRecords: [...(state.scope3Activities.airTravelRecords ?? []), action.payload],
        },
        isDirty: true,
      };
    case 'UPDATE_AIR_TRAVEL_RECORD':
      return {
        ...state,
        scope3Activities: {
          ...state.scope3Activities,
          airTravelRecords: (state.scope3Activities.airTravelRecords ?? []).map((r) =>
            r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
          ),
        },
        isDirty: true,
      };
    case 'REMOVE_AIR_TRAVEL_RECORD':
      return {
        ...state,
        scope3Activities: {
          ...state.scope3Activities,
          airTravelRecords: (state.scope3Activities.airTravelRecords ?? []).filter(
            (r) => r.id !== action.payload
          ),
        },
        isDirty: true,
      };

    // ── Phase 11: Scope 3 — Office Equipment ───────────────────────────────
    case 'ADD_OFFICE_EQ_RECORD':
      return {
        ...state,
        scope3Activities: {
          ...state.scope3Activities,
          officeEquipmentRecords: [
            ...(state.scope3Activities.officeEquipmentRecords ?? []),
            action.payload,
          ],
        },
        isDirty: true,
      };
    case 'UPDATE_OFFICE_EQ_RECORD':
      return {
        ...state,
        scope3Activities: {
          ...state.scope3Activities,
          officeEquipmentRecords: (state.scope3Activities.officeEquipmentRecords ?? []).map((r) =>
            r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
          ),
        },
        isDirty: true,
      };
    case 'REMOVE_OFFICE_EQ_RECORD':
      return {
        ...state,
        scope3Activities: {
          ...state.scope3Activities,
          officeEquipmentRecords: (state.scope3Activities.officeEquipmentRecords ?? []).filter(
            (r) => r.id !== action.payload
          ),
        },
        isDirty: true,
      };

    // ── Phase 10: Refrigerants ──────────────────────────────────────────────
    case 'ADD_REFRIGERANT_RECORD':
      return {
        ...state,
        refrigerantRecords: [...state.refrigerantRecords, action.payload],
        isDirty: true,
      };
    case 'UPDATE_REFRIGERANT_RECORD':
      return {
        ...state,
        refrigerantRecords: state.refrigerantRecords.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };
    case 'REMOVE_REFRIGERANT_RECORD':
      return {
        ...state,
        refrigerantRecords: state.refrigerantRecords.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── Phase 10: Fire extinguishers ────────────────────────────────────────
    case 'ADD_FIRE_EXT_RECORD':
      return {
        ...state,
        fireExtinguisherRecords: [...state.fireExtinguisherRecords, action.payload],
        isDirty: true,
      };
    case 'UPDATE_FIRE_EXT_RECORD':
      return {
        ...state,
        fireExtinguisherRecords: state.fireExtinguisherRecords.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        isDirty: true,
      };
    case 'REMOVE_FIRE_EXT_RECORD':
      return {
        ...state,
        fireExtinguisherRecords: state.fireExtinguisherRecords.filter(
          (r) => r.id !== action.payload
        ),
        isDirty: true,
      };

    // ── UI ──────────────────────────────────────────────────────────────────
    case 'TOGGLE_CARD_EXPAND': {
      const id = action.payload;
      const isOpen = state.expandedCards.includes(id);
      return {
        ...state,
        expandedCards: isOpen
          ? state.expandedCards.filter((c) => c !== id)
          : [...state.expandedCards, id],
      };
    }
    case 'SET_ACTIVE_SECTION':
      return { ...state, activeSection: action.payload };
    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };
    case 'SET_LAST_SAVED':
      return { ...state, lastSavedAt: action.payload, isDirty: false };
    case 'SET_DIRTY':
      return { ...state, isDirty: action.payload };
    case 'SET_VALIDATION_RESULT':
      return { ...state, validationResult: action.payload };
    case 'SET_VERSION':
      return { ...state, version: action.payload };
    case 'SET_WHAT_CHANGED':
      return { ...state, whatChanged: action.payload, isDirty: true };

    default:
      return state;
  }
}
