import {
  IWasteSectionData,
  ISolidWasteStream,
  ICustomField,
  SolidWasteDisposalMethod,
  WastewaterTreatmentType,
  EntryMode,
  IWaterDemand,
  IWaterSupply,
  IWaterTreatmentPlant,
  IROPlant,
  IWaterQualityRecord,
  IWaterSourceRecord,
  IStorageTank,
  IWastewaterGeneration,
  IWastewaterCharacteristicsRecord,
  IStpEtpPlant,
  ISolidWasteGeneration,
  ILandfillSite,
  ILandfillMonthlyRecord,
  IIncinerationFacility,
  IIncinerationMonthlyRecord,
  IMswPlant,
  ISieveFraction,
  SieveSize,
} from '@shared/types/submission.types';
import {
  DEFAULT_WASTEWATER_CHARACTERISTICS,
  DEFAULT_SIEVE_FRACTIONS,
} from '@shared/constants/defaults';

// ── IS 10500:2012 default quality records ─────────────────────────────────────

export const IS10500_DEFAULT_RECORDS: IWaterQualityRecord[] = [
  {
    id: 'wq-colour',
    parameter: 'colour',
    unit: 'Hazen units',
    monthlyValues: {},
    is10500Limit: '≤15',
  },
  {
    id: 'wq-odour',
    parameter: 'odour',
    unit: '-',
    monthlyValues: {},
    is10500Limit: 'Unobjectionable',
  },
  { id: 'wq-ph', parameter: 'ph', unit: '-', monthlyValues: {}, is10500Limit: '6.5–8.5' },
  { id: 'wq-taste', parameter: 'taste', unit: '-', monthlyValues: {}, is10500Limit: 'Agreeable' },
  {
    id: 'wq-turbidity',
    parameter: 'turbidity_ntu',
    unit: 'NTU',
    monthlyValues: {},
    is10500Limit: '≤5',
  },
  { id: 'wq-tds', parameter: 'tds_mg_l', unit: 'mg/L', monthlyValues: {}, is10500Limit: '≤2000' },
  {
    id: 'wq-tc',
    parameter: 'total_coliform_mpn',
    unit: 'MPN/100ml',
    monthlyValues: {},
    is10500Limit: 'Absent',
  },
  {
    id: 'wq-fc',
    parameter: 'fecal_coliform_mpn',
    unit: 'MPN/100ml',
    monthlyValues: {},
    is10500Limit: 'Absent',
  },
];

// ── Types ──────────────────────────────────────────────────────────────────────

export type SolidWasteMode = 'building_total' | 'zone_by_zone';

export interface WasteZone {
  id: string;
  zoneName: string;
  kgPerDay: number;
  streams: ISolidWasteStream[];
}

export interface WasteEntryState {
  wasteSubmissionId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  version: number;
  previousData: Partial<IWasteSectionData> | null;
  whatChanged: string;

  // SOLID WASTE
  solidWasteMode: SolidWasteMode;
  hasWasteData: boolean;
  solidWasteKgPerDay: number;
  wasteStreams: ISolidWasteStream[]; // standard + custom, building-total mode
  zones: WasteZone[]; // zone-by-zone mode

  // LIQUID WASTE
  wastewaterTreatmentType: WastewaterTreatmentType;
  wastewaterIsEstimated: boolean;
  wastewaterLitresPerDay: number;
  customDischargePoints: ICustomField[];

  validationResult: { warnings: string[]; completenessScore: number } | null;

  // WASTEWATER PHASE 2
  wastewaterGeneration: IWastewaterGeneration;
  wastewaterCharacteristics: IWastewaterCharacteristicsRecord[];
  stpEtpPlants: IStpEtpPlant[];

  // WATER SYSTEMS
  waterDemand: IWaterDemand;
  waterSupply: IWaterSupply;
  treatmentPlants: IWaterTreatmentPlant[];
  roPlants: IROPlant[];
  qualityRecords: IWaterQualityRecord[];
  showWaterSection: boolean;

  // SOLID WASTE PHASE 3
  solidWasteGeneration: ISolidWasteGeneration;
  landfillSites: ILandfillSite[];
  incinerationFacilities: IIncinerationFacility[];
  mswPlants: IMswPlant[];
}

// ── Build default wastewater characteristics records ───────────────────────────

export function makeDefaultWastewaterCharacteristics(): IWastewaterCharacteristicsRecord[] {
  return DEFAULT_WASTEWATER_CHARACTERISTICS.map((d, i) => ({
    id: `ww-${i}`,
    parameter: d.parameter,
    unit: d.unit,
    cpcbLimit: d.cpcbLimit,
    monthlyValues: {},
  }));
}

// ── Initial default streams (5 standard methods, each 0%) ──────────────────────

export function makeDefaultStreams(): ISolidWasteStream[] {
  return [
    {
      id: crypto.randomUUID(),
      disposalMethod: SolidWasteDisposalMethod.UNMANAGED_DUMP,
      isCustomMethod: false,
      fractionPercent: 0,
    },
    {
      id: crypto.randomUUID(),
      disposalMethod: SolidWasteDisposalMethod.OPEN_BURNING,
      isCustomMethod: false,
      fractionPercent: 0,
    },
    {
      id: crypto.randomUUID(),
      disposalMethod: SolidWasteDisposalMethod.MANAGED_LANDFILL,
      isCustomMethod: false,
      fractionPercent: 0,
    },
    {
      id: crypto.randomUUID(),
      disposalMethod: SolidWasteDisposalMethod.COMPOSTING,
      isCustomMethod: false,
      fractionPercent: 0,
    },
    {
      id: crypto.randomUUID(),
      disposalMethod: SolidWasteDisposalMethod.RECYCLING,
      isCustomMethod: false,
      fractionPercent: 0,
    },
  ];
}

export const initialState: WasteEntryState = {
  wasteSubmissionId: null,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  version: 1,
  previousData: null,
  whatChanged: '',

  solidWasteMode: 'building_total',
  hasWasteData: true,
  solidWasteKgPerDay: 0,
  wasteStreams: makeDefaultStreams(),
  zones: [],

  wastewaterTreatmentType: WastewaterTreatmentType.UNMANAGED_SEPTIC,
  wastewaterIsEstimated: true,
  wastewaterLitresPerDay: 0,
  customDischargePoints: [],

  validationResult: null,

  wastewaterGeneration: {},
  wastewaterCharacteristics: makeDefaultWastewaterCharacteristics(),
  stpEtpPlants: [],

  waterDemand: {},
  waterSupply: { sources: [], storageTanks: [] },
  treatmentPlants: [],
  roPlants: [],
  qualityRecords: IS10500_DEFAULT_RECORDS,
  showWaterSection: false,

  solidWasteGeneration: {},
  landfillSites: [],
  incinerationFacilities: [],
  mswPlants: [],
};

// ── Actions ───────────────────────────────────────────────────────────────────

export type WasteEntryAction =
  | { type: 'SET_SUBMISSION_ID'; payload: string }
  | {
      type: 'HYDRATE';
      payload: {
        wasteData?: Partial<IWasteSectionData>;
        previousData?: Partial<IWasteSectionData> | null;
        version?: number;
      };
    }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_LAST_SAVED'; payload: Date }
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'SET_VALIDATION_RESULT'; payload: WasteEntryState['validationResult'] }
  | { type: 'SET_VERSION'; payload: number }
  | { type: 'SET_WHAT_CHANGED'; payload: string }

  // SOLID WASTE
  | { type: 'SET_SOLID_WASTE_MODE'; payload: SolidWasteMode }
  | { type: 'SET_HAS_WASTE_DATA'; payload: boolean }
  | { type: 'SET_SOLID_WASTE_KG_PER_DAY'; payload: number }
  | { type: 'UPDATE_STREAM_FRACTION'; payload: { id: string; fraction: number } }
  | { type: 'ADD_CUSTOM_STREAM'; payload: ISolidWasteStream }
  | { type: 'REMOVE_STREAM'; payload: string }
  | { type: 'AUTO_BALANCE' }

  // ZONES
  | { type: 'ADD_ZONE'; payload: WasteZone }
  | { type: 'UPDATE_ZONE'; payload: { id: string; updates: Partial<WasteZone> } }
  | {
      type: 'UPDATE_ZONE_STREAM_FRACTION';
      payload: { zoneId: string; streamId: string; fraction: number };
    }
  | { type: 'REMOVE_ZONE'; payload: string }

  // LIQUID WASTE
  | { type: 'SET_WASTEWATER_TREATMENT'; payload: WastewaterTreatmentType }
  | { type: 'SET_WASTEWATER_IS_ESTIMATED'; payload: boolean }
  | { type: 'SET_WASTEWATER_LITRES_PER_DAY'; payload: number }
  | { type: 'ADD_CUSTOM_DISCHARGE_POINT'; payload: ICustomField }
  | {
      type: 'UPDATE_CUSTOM_DISCHARGE_POINT';
      payload: { id: string; updates: Partial<ICustomField> };
    }
  | { type: 'REMOVE_CUSTOM_DISCHARGE_POINT'; payload: string }

  // WASTEWATER PHASE 2
  | { type: 'UPDATE_WASTEWATER_GENERATION'; payload: Partial<IWastewaterGeneration> }
  | {
      type: 'UPDATE_WASTEWATER_CHARACTERISTIC';
      payload: { id: string; updates: Partial<IWastewaterCharacteristicsRecord> };
    }
  | { type: 'ADD_WASTEWATER_CHARACTERISTIC'; payload: IWastewaterCharacteristicsRecord }
  | { type: 'REMOVE_WASTEWATER_CHARACTERISTIC'; payload: string }
  | { type: 'ADD_STP_ETP'; payload: IStpEtpPlant }
  | { type: 'UPDATE_STP_ETP'; payload: { id: string; updates: Partial<IStpEtpPlant> } }
  | { type: 'REMOVE_STP_ETP'; payload: string }

  // WATER DEMAND
  | { type: 'UPDATE_WATER_DEMAND'; payload: Partial<IWaterDemand> }

  // WATER SUPPLY
  | { type: 'UPDATE_WATER_SUPPLY'; payload: Partial<IWaterSupply> }
  | { type: 'ADD_WATER_SOURCE'; payload: IWaterSourceRecord }
  | { type: 'UPDATE_WATER_SOURCE'; payload: { id: string; updates: Partial<IWaterSourceRecord> } }
  | { type: 'REMOVE_WATER_SOURCE'; payload: string }
  | { type: 'ADD_STORAGE_TANK'; payload: IStorageTank }
  | { type: 'UPDATE_STORAGE_TANK'; payload: { id: string; updates: Partial<IStorageTank> } }
  | { type: 'REMOVE_STORAGE_TANK'; payload: string }

  // WATER TREATMENT PLANTS
  | { type: 'ADD_WTP'; payload: IWaterTreatmentPlant }
  | { type: 'UPDATE_WTP'; payload: { id: string; updates: Partial<IWaterTreatmentPlant> } }
  | { type: 'REMOVE_WTP'; payload: string }

  // RO PLANTS
  | { type: 'ADD_RO_PLANT'; payload: IROPlant }
  | { type: 'UPDATE_RO_PLANT'; payload: { id: string; updates: Partial<IROPlant> } }
  | { type: 'REMOVE_RO_PLANT'; payload: string }

  // WATER QUALITY
  | {
      type: 'UPDATE_QUALITY_RECORD';
      payload: { id: string; updates: Partial<IWaterQualityRecord> };
    }
  | { type: 'ADD_QUALITY_RECORD'; payload: IWaterQualityRecord }
  | { type: 'REMOVE_QUALITY_RECORD'; payload: string }

  // UI
  | { type: 'TOGGLE_WATER_SECTION' }

  // SOLID WASTE PHASE 3
  | { type: 'UPDATE_SOLID_WASTE_GENERATION'; payload: Partial<ISolidWasteGeneration> }
  | { type: 'ADD_LANDFILL_SITE'; payload: ILandfillSite }
  | { type: 'UPDATE_LANDFILL_SITE'; payload: { id: string; updates: Partial<ILandfillSite> } }
  | { type: 'REMOVE_LANDFILL_SITE'; payload: string }
  | { type: 'ADD_LANDFILL_MONTHLY'; payload: { siteId: string; record: ILandfillMonthlyRecord } }
  | {
      type: 'UPDATE_LANDFILL_MONTHLY';
      payload: {
        siteId: string;
        month: number;
        year: number;
        updates: Partial<ILandfillMonthlyRecord>;
      };
    }
  | {
      type: 'ADD_LANDFILL_ANNUAL';
      payload: { siteId: string; record: { year: number; totalTonnes: number; remarks?: string } };
    }
  | {
      type: 'UPDATE_LANDFILL_ANNUAL';
      payload: {
        siteId: string;
        year: number;
        updates: { totalTonnes?: number; remarks?: string };
      };
    }
  | { type: 'ADD_INCINERATION_FACILITY'; payload: IIncinerationFacility }
  | {
      type: 'UPDATE_INCINERATION_FACILITY';
      payload: { id: string; updates: Partial<IIncinerationFacility> };
    }
  | { type: 'REMOVE_INCINERATION_FACILITY'; payload: string }
  | {
      type: 'ADD_INCINERATION_MONTHLY';
      payload: { facilityId: string; record: IIncinerationMonthlyRecord };
    }
  | {
      type: 'UPDATE_INCINERATION_MONTHLY';
      payload: {
        facilityId: string;
        month: number;
        year: number;
        updates: Partial<IIncinerationMonthlyRecord>;
      };
    }
  | { type: 'ADD_MSW_PLANT'; payload: IMswPlant }
  | { type: 'UPDATE_MSW_PLANT'; payload: { id: string; updates: Partial<IMswPlant> } }
  | { type: 'REMOVE_MSW_PLANT'; payload: string }
  | {
      type: 'UPDATE_SIEVE_FRACTION';
      payload: { plantId: string; sieveSize: SieveSize; updates: Partial<ISieveFraction> };
    };

// ── Reducer ───────────────────────────────────────────────────────────────────

export function wasteEntryReducer(
  state: WasteEntryState,
  action: WasteEntryAction
): WasteEntryState {
  switch (action.type) {
    case 'SET_SUBMISSION_ID':
      return { ...state, wasteSubmissionId: action.payload };

    case 'HYDRATE': {
      const { wasteData, previousData, version } = action.payload;
      if (!wasteData) return state;
      // Merge incoming waste data into state
      const streams =
        wasteData.wasteStreams && wasteData.wasteStreams.length > 0
          ? wasteData.wasteStreams
          : makeDefaultStreams();
      // Re-hydrate zones from zoneLevelSolidWaste
      const zones: WasteZone[] =
        wasteData.zoneLevelSolidWaste?.map((z) => ({
          id: crypto.randomUUID(),
          zoneName: z.zoneName,
          kgPerDay: z.kgPerDay,
          streams: z.streams.length > 0 ? z.streams : makeDefaultStreams(),
        })) ?? [];
      return {
        ...state,
        solidWasteMode:
          wasteData.entryMode === EntryMode.ROOM_LEVEL ? 'zone_by_zone' : 'building_total',
        hasWasteData: wasteData.hasWasteData ?? true,
        solidWasteKgPerDay: wasteData.solidWasteKgPerDay ?? 0,
        wasteStreams: streams,
        zones,
        wastewaterTreatmentType:
          wasteData.wastewaterTreatmentType ?? WastewaterTreatmentType.UNMANAGED_SEPTIC,
        wastewaterIsEstimated: wasteData.wastewaterIsEstimated ?? true,
        wastewaterLitresPerDay: wasteData.wastewaterLitresPerDay ?? 0,
        customDischargePoints: wasteData.customDischargePoints ?? [],
        version: version ?? state.version,
        previousData: previousData ?? null,
        waterDemand: (wasteData as IWasteSectionData).water?.demand ?? state.waterDemand,
        waterSupply: (wasteData as IWasteSectionData).water?.supply ?? state.waterSupply,
        treatmentPlants:
          (wasteData as IWasteSectionData).water?.treatmentPlants ?? state.treatmentPlants,
        roPlants: (wasteData as IWasteSectionData).water?.roPlants ?? state.roPlants,
        qualityRecords: (wasteData as IWasteSectionData).water?.qualityRecords?.length
          ? (wasteData as IWasteSectionData).water!.qualityRecords
          : state.qualityRecords,
        wastewaterGeneration:
          (wasteData as IWasteSectionData).wastewaterGeneration ?? state.wastewaterGeneration,
        wastewaterCharacteristics: (wasteData as IWasteSectionData).wastewaterCharacteristics
          ?.length
          ? (wasteData as IWasteSectionData).wastewaterCharacteristics!
          : state.wastewaterCharacteristics,
        stpEtpPlants: (wasteData as IWasteSectionData).stpEtpPlants ?? state.stpEtpPlants,
        solidWasteGeneration:
          (wasteData as IWasteSectionData).solidWasteGeneration ?? state.solidWasteGeneration,
        landfillSites: (wasteData as IWasteSectionData).landfillSites ?? state.landfillSites,
        incinerationFacilities:
          (wasteData as IWasteSectionData).incinerationFacilities ?? state.incinerationFacilities,
        mswPlants: (() => {
          const plants = (wasteData as IWasteSectionData).mswPlants;
          if (!plants) return state.mswPlants;
          return plants.map((p) => ({
            ...p,
            sieveFractions: p.sieveFractions?.length
              ? p.sieveFractions
              : DEFAULT_SIEVE_FRACTIONS.map((f) => ({ ...f })),
          }));
        })(),
      };
    }

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

    // ── SOLID WASTE ────────────────────────────────────────────────────────────

    case 'SET_SOLID_WASTE_MODE':
      return { ...state, solidWasteMode: action.payload, isDirty: true };

    case 'SET_HAS_WASTE_DATA':
      return { ...state, hasWasteData: action.payload, isDirty: true };

    case 'SET_SOLID_WASTE_KG_PER_DAY':
      return { ...state, solidWasteKgPerDay: action.payload, isDirty: true };

    case 'UPDATE_STREAM_FRACTION': {
      const streams = state.wasteStreams.map((s) =>
        s.id === action.payload.id
          ? { ...s, fractionPercent: Math.max(0, Math.min(100, action.payload.fraction)) }
          : s
      );
      return { ...state, wasteStreams: streams, isDirty: true };
    }

    case 'ADD_CUSTOM_STREAM':
      return {
        ...state,
        wasteStreams: [...state.wasteStreams, action.payload],
        isDirty: true,
      };

    case 'REMOVE_STREAM':
      return {
        ...state,
        wasteStreams: state.wasteStreams.filter((s) => s.id !== action.payload),
        isDirty: true,
      };

    case 'AUTO_BALANCE': {
      const total = state.wasteStreams.reduce((sum, s) => sum + s.fractionPercent, 0);
      if (Math.abs(total - 100) < 0.5) return state; // already balanced
      if (total < 100) {
        // Add remainder to UNMANAGED_DUMP (first non-custom stream)
        const remainder = 100 - total;
        const dumpIdx = state.wasteStreams.findIndex(
          (s) => s.disposalMethod === SolidWasteDisposalMethod.UNMANAGED_DUMP
        );
        if (dumpIdx === -1) return state;
        const streams = state.wasteStreams.map((s, i) =>
          i === dumpIdx ? { ...s, fractionPercent: Math.round(s.fractionPercent + remainder) } : s
        );
        return { ...state, wasteStreams: streams, isDirty: true };
      } else {
        // Over 100: proportionally reduce all non-zero
        const nonZero = state.wasteStreams.filter((s) => s.fractionPercent > 0);
        const totalNonZero = nonZero.reduce((sum, s) => sum + s.fractionPercent, 0);
        if (totalNonZero === 0) return state;
        const streams = state.wasteStreams.map((s) => {
          if (s.fractionPercent === 0) return s;
          return {
            ...s,
            fractionPercent: Math.round((s.fractionPercent / totalNonZero) * 100),
          };
        });
        return { ...state, wasteStreams: streams, isDirty: true };
      }
    }

    // ── ZONES ──────────────────────────────────────────────────────────────────

    case 'ADD_ZONE':
      return { ...state, zones: [...state.zones, action.payload], isDirty: true };

    case 'UPDATE_ZONE': {
      const zones = state.zones.map((z) =>
        z.id === action.payload.id ? { ...z, ...action.payload.updates } : z
      );
      return { ...state, zones, isDirty: true };
    }

    case 'UPDATE_ZONE_STREAM_FRACTION': {
      const zones = state.zones.map((z) => {
        if (z.id !== action.payload.zoneId) return z;
        const streams = z.streams.map((s) =>
          s.id === action.payload.streamId
            ? {
                ...s,
                fractionPercent: Math.max(0, Math.min(100, action.payload.fraction)),
              }
            : s
        );
        return { ...z, streams };
      });
      return { ...state, zones, isDirty: true };
    }

    case 'REMOVE_ZONE':
      return {
        ...state,
        zones: state.zones.filter((z) => z.id !== action.payload),
        isDirty: true,
      };

    // ── LIQUID WASTE ────────────────────────────────────────────────────────────

    case 'SET_WASTEWATER_TREATMENT':
      return { ...state, wastewaterTreatmentType: action.payload, isDirty: true };

    case 'SET_WASTEWATER_IS_ESTIMATED':
      return { ...state, wastewaterIsEstimated: action.payload, isDirty: true };

    case 'SET_WASTEWATER_LITRES_PER_DAY':
      return { ...state, wastewaterLitresPerDay: action.payload, isDirty: true };

    case 'ADD_CUSTOM_DISCHARGE_POINT':
      return {
        ...state,
        customDischargePoints: [...state.customDischargePoints, action.payload],
        isDirty: true,
      };

    case 'UPDATE_CUSTOM_DISCHARGE_POINT': {
      const pts = state.customDischargePoints.map((p) =>
        p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
      );
      return { ...state, customDischargePoints: pts, isDirty: true };
    }

    case 'REMOVE_CUSTOM_DISCHARGE_POINT':
      return {
        ...state,
        customDischargePoints: state.customDischargePoints.filter((p) => p.id !== action.payload),
        isDirty: true,
      };

    // ── WASTEWATER PHASE 2 ─────────────────────────────────────────────────────

    case 'UPDATE_WASTEWATER_GENERATION':
      return {
        ...state,
        wastewaterGeneration: { ...state.wastewaterGeneration, ...action.payload },
        isDirty: true,
      };

    case 'UPDATE_WASTEWATER_CHARACTERISTIC': {
      const wastewaterCharacteristics = state.wastewaterCharacteristics.map((r) =>
        r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
      );
      return { ...state, wastewaterCharacteristics, isDirty: true };
    }

    case 'ADD_WASTEWATER_CHARACTERISTIC':
      return {
        ...state,
        wastewaterCharacteristics: [...state.wastewaterCharacteristics, action.payload],
        isDirty: true,
      };

    case 'REMOVE_WASTEWATER_CHARACTERISTIC':
      return {
        ...state,
        wastewaterCharacteristics: state.wastewaterCharacteristics.filter(
          (r) => r.id !== action.payload
        ),
        isDirty: true,
      };

    case 'ADD_STP_ETP':
      return { ...state, stpEtpPlants: [...state.stpEtpPlants, action.payload], isDirty: true };

    case 'UPDATE_STP_ETP': {
      const stpEtpPlants = state.stpEtpPlants.map((p) =>
        p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
      );
      return { ...state, stpEtpPlants, isDirty: true };
    }

    case 'REMOVE_STP_ETP':
      return {
        ...state,
        stpEtpPlants: state.stpEtpPlants.filter((p) => p.id !== action.payload),
        isDirty: true,
      };

    // ── WATER DEMAND ───────────────────────────────────────────────────────────

    case 'UPDATE_WATER_DEMAND':
      return { ...state, waterDemand: { ...state.waterDemand, ...action.payload }, isDirty: true };

    // ── WATER SUPPLY ───────────────────────────────────────────────────────────

    case 'UPDATE_WATER_SUPPLY':
      return { ...state, waterSupply: { ...state.waterSupply, ...action.payload }, isDirty: true };

    case 'ADD_WATER_SOURCE':
      return {
        ...state,
        waterSupply: {
          ...state.waterSupply,
          sources: [...state.waterSupply.sources, action.payload],
        },
        isDirty: true,
      };

    case 'UPDATE_WATER_SOURCE': {
      const sources = state.waterSupply.sources.map((s) =>
        s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
      );
      return { ...state, waterSupply: { ...state.waterSupply, sources }, isDirty: true };
    }

    case 'REMOVE_WATER_SOURCE': {
      const sources = state.waterSupply.sources.filter((s) => s.id !== action.payload);
      return { ...state, waterSupply: { ...state.waterSupply, sources }, isDirty: true };
    }

    case 'ADD_STORAGE_TANK':
      return {
        ...state,
        waterSupply: {
          ...state.waterSupply,
          storageTanks: [...state.waterSupply.storageTanks, action.payload],
        },
        isDirty: true,
      };

    case 'UPDATE_STORAGE_TANK': {
      const storageTanks = state.waterSupply.storageTanks.map((t) =>
        t.id === action.payload.id ? { ...t, ...action.payload.updates } : t
      );
      return { ...state, waterSupply: { ...state.waterSupply, storageTanks }, isDirty: true };
    }

    case 'REMOVE_STORAGE_TANK': {
      const storageTanks = state.waterSupply.storageTanks.filter((t) => t.id !== action.payload);
      return { ...state, waterSupply: { ...state.waterSupply, storageTanks }, isDirty: true };
    }

    // ── WATER TREATMENT PLANTS ─────────────────────────────────────────────────

    case 'ADD_WTP':
      return {
        ...state,
        treatmentPlants: [...state.treatmentPlants, action.payload],
        isDirty: true,
      };

    case 'UPDATE_WTP': {
      const treatmentPlants = state.treatmentPlants.map((p) =>
        p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
      );
      return { ...state, treatmentPlants, isDirty: true };
    }

    case 'REMOVE_WTP':
      return {
        ...state,
        treatmentPlants: state.treatmentPlants.filter((p) => p.id !== action.payload),
        isDirty: true,
      };

    // ── RO PLANTS ─────────────────────────────────────────────────────────────

    case 'ADD_RO_PLANT':
      return { ...state, roPlants: [...state.roPlants, action.payload], isDirty: true };

    case 'UPDATE_RO_PLANT': {
      const roPlants = state.roPlants.map((p) =>
        p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
      );
      return { ...state, roPlants, isDirty: true };
    }

    case 'REMOVE_RO_PLANT':
      return {
        ...state,
        roPlants: state.roPlants.filter((p) => p.id !== action.payload),
        isDirty: true,
      };

    // ── WATER QUALITY ──────────────────────────────────────────────────────────

    case 'UPDATE_QUALITY_RECORD': {
      const qualityRecords = state.qualityRecords.map((r) =>
        r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
      );
      return { ...state, qualityRecords, isDirty: true };
    }

    case 'ADD_QUALITY_RECORD':
      return { ...state, qualityRecords: [...state.qualityRecords, action.payload], isDirty: true };

    case 'REMOVE_QUALITY_RECORD':
      return {
        ...state,
        qualityRecords: state.qualityRecords.filter((r) => r.id !== action.payload),
        isDirty: true,
      };

    // ── UI ─────────────────────────────────────────────────────────────────────

    case 'TOGGLE_WATER_SECTION':
      return { ...state, showWaterSection: !state.showWaterSection };

    // ── SOLID WASTE PHASE 3 ────────────────────────────────────────────────────

    case 'UPDATE_SOLID_WASTE_GENERATION':
      return {
        ...state,
        solidWasteGeneration: { ...state.solidWasteGeneration, ...action.payload },
        isDirty: true,
      };

    case 'ADD_LANDFILL_SITE':
      return { ...state, landfillSites: [...state.landfillSites, action.payload], isDirty: true };

    case 'UPDATE_LANDFILL_SITE': {
      const landfillSites = state.landfillSites.map((s) =>
        s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
      );
      return { ...state, landfillSites, isDirty: true };
    }

    case 'REMOVE_LANDFILL_SITE':
      return {
        ...state,
        landfillSites: state.landfillSites.filter((s) => s.id !== action.payload),
        isDirty: true,
      };

    case 'ADD_LANDFILL_MONTHLY': {
      const landfillSites = state.landfillSites.map((s) =>
        s.id === action.payload.siteId
          ? { ...s, monthlyRecords: [...s.monthlyRecords, action.payload.record] }
          : s
      );
      return { ...state, landfillSites, isDirty: true };
    }

    case 'UPDATE_LANDFILL_MONTHLY': {
      const landfillSites = state.landfillSites.map((s) => {
        if (s.id !== action.payload.siteId) return s;
        const monthlyRecords = s.monthlyRecords.map((r) =>
          r.month === action.payload.month && r.year === action.payload.year
            ? { ...r, ...action.payload.updates }
            : r
        );
        return { ...s, monthlyRecords };
      });
      return { ...state, landfillSites, isDirty: true };
    }

    case 'ADD_LANDFILL_ANNUAL': {
      const landfillSites = state.landfillSites.map((s) =>
        s.id === action.payload.siteId
          ? {
              ...s,
              yearWiseAnnualTotals: [...(s.yearWiseAnnualTotals ?? []), action.payload.record],
            }
          : s
      );
      return { ...state, landfillSites, isDirty: true };
    }

    case 'UPDATE_LANDFILL_ANNUAL': {
      const landfillSites = state.landfillSites.map((s) => {
        if (s.id !== action.payload.siteId) return s;
        const yearWiseAnnualTotals = (s.yearWiseAnnualTotals ?? []).map((t) =>
          t.year === action.payload.year ? { ...t, ...action.payload.updates } : t
        );
        return { ...s, yearWiseAnnualTotals };
      });
      return { ...state, landfillSites, isDirty: true };
    }

    case 'ADD_INCINERATION_FACILITY':
      return {
        ...state,
        incinerationFacilities: [...state.incinerationFacilities, action.payload],
        isDirty: true,
      };

    case 'UPDATE_INCINERATION_FACILITY': {
      const incinerationFacilities = state.incinerationFacilities.map((f) =>
        f.id === action.payload.id ? { ...f, ...action.payload.updates } : f
      );
      return { ...state, incinerationFacilities, isDirty: true };
    }

    case 'REMOVE_INCINERATION_FACILITY':
      return {
        ...state,
        incinerationFacilities: state.incinerationFacilities.filter((f) => f.id !== action.payload),
        isDirty: true,
      };

    case 'ADD_INCINERATION_MONTHLY': {
      const incinerationFacilities = state.incinerationFacilities.map((f) =>
        f.id === action.payload.facilityId
          ? { ...f, monthlyRecords: [...f.monthlyRecords, action.payload.record] }
          : f
      );
      return { ...state, incinerationFacilities, isDirty: true };
    }

    case 'UPDATE_INCINERATION_MONTHLY': {
      const incinerationFacilities = state.incinerationFacilities.map((f) => {
        if (f.id !== action.payload.facilityId) return f;
        const monthlyRecords = f.monthlyRecords.map((r) =>
          r.month === action.payload.month && r.year === action.payload.year
            ? { ...r, ...action.payload.updates }
            : r
        );
        return { ...f, monthlyRecords };
      });
      return { ...state, incinerationFacilities, isDirty: true };
    }

    case 'ADD_MSW_PLANT':
      return { ...state, mswPlants: [...state.mswPlants, action.payload], isDirty: true };

    case 'UPDATE_MSW_PLANT': {
      const mswPlants = state.mswPlants.map((p) =>
        p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
      );
      return { ...state, mswPlants, isDirty: true };
    }

    case 'REMOVE_MSW_PLANT':
      return {
        ...state,
        mswPlants: state.mswPlants.filter((p) => p.id !== action.payload),
        isDirty: true,
      };

    case 'UPDATE_SIEVE_FRACTION': {
      const mswPlants = state.mswPlants.map((p) => {
        if (p.id !== action.payload.plantId) return p;
        const sieveFractions = p.sieveFractions.map((f) =>
          f.sieveSize === action.payload.sieveSize ? { ...f, ...action.payload.updates } : f
        );
        return { ...p, sieveFractions };
      });
      return { ...state, mswPlants, isDirty: true };
    }

    default:
      return state;
  }
}
