import {
  IRoadSegment,
  IVegetationCategory,
  IWaterBody,
  ICampusCommutation,
  ICampusAirTravel,
  ICampusPurchasedGoods,
} from '@shared/types/submission.types';

// ── Default vegetation categories (always present) ──────────────────────────

export const DEFAULT_VEGETATION_CATEGORIES: IVegetationCategory[] = [
  {
    id: 'veg-native',
    categoryType: 'native_trees',
    definitionScope: 'e.g. Neem, Banyan, Peepal',
  },
  {
    id: 'veg-ornamental',
    categoryType: 'ornamental_trees',
    definitionScope: 'e.g. Gulmohar, Ashoka, Silver Oak',
  },
  {
    id: 'veg-shrubs',
    categoryType: 'shrubs_grassland',
    definitionScope: 'e.g. native grass species — no tree count',
  },
  {
    id: 'veg-agroforestry',
    categoryType: 'agroforestry',
    definitionScope: 'e.g. Mango, Teak',
  },
  {
    id: 'veg-arboriculture',
    categoryType: 'arboriculture',
    definitionScope: 'Street trees, heritage trees, special care specimens',
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

export interface CampusEntryState {
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  totalCampusAreaAcres?: number;
  roadsData: {
    segments: IRoadSegment[];
    hasStreetLighting: boolean;
    streetLightCount?: number;
    streetLightType?: string;
    streetLightWattsEach?: number;
    streetLightHoursPerDay?: number;
    streetLightingRemarks?: string;
  };
  vegetationData: {
    categories: IVegetationCategory[];
    hasHeritageTrees: boolean;
    heritageTreeCount?: number;
    heritageTreeRemarks?: string;
  };
  waterBodiesData: {
    waterBodies: IWaterBody[];
    hasPerennialWaterBody: boolean;
    waterManagementRemarks?: string;
  };
  commutationData: Partial<ICampusCommutation>;
  airTravelData: Partial<ICampusAirTravel>;
  purchasedGoodsData: Partial<ICampusPurchasedGoods>;
  validationResult: { warnings: string[]; completenessScore: number } | null;
}

export const initialCampusEntryState: CampusEntryState = {
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  totalCampusAreaAcres: undefined,
  roadsData: {
    segments: [],
    hasStreetLighting: false,
  },
  vegetationData: {
    categories: DEFAULT_VEGETATION_CATEGORIES,
    hasHeritageTrees: false,
  },
  waterBodiesData: {
    waterBodies: [],
    hasPerennialWaterBody: false,
  },
  commutationData: {},
  airTravelData: {},
  purchasedGoodsData: {},
  validationResult: null,
};

// ── Action types ──────────────────────────────────────────────────────────────

export type CampusEntryAction =
  | { type: 'SET_TOTAL_AREA'; value: number | undefined }
  | { type: 'ADD_ROAD_SEGMENT'; segment: IRoadSegment }
  | { type: 'UPDATE_ROAD_SEGMENT'; id: string; patch: Partial<IRoadSegment> }
  | { type: 'REMOVE_ROAD_SEGMENT'; id: string }
  | { type: 'UPDATE_ROAD_LIGHTING'; patch: Partial<CampusEntryState['roadsData']> }
  | { type: 'UPDATE_VEGETATION_CATEGORY'; id: string; patch: Partial<IVegetationCategory> }
  | { type: 'ADD_VEGETATION_CATEGORY'; category: IVegetationCategory }
  | { type: 'REMOVE_VEGETATION_CATEGORY'; id: string }
  | {
      type: 'UPDATE_VEGETATION_META';
      patch: Partial<Omit<CampusEntryState['vegetationData'], 'categories'>>;
    }
  | { type: 'ADD_WATER_BODY'; waterBody: IWaterBody }
  | { type: 'UPDATE_WATER_BODY'; id: string; patch: Partial<IWaterBody> }
  | { type: 'REMOVE_WATER_BODY'; id: string }
  | {
      type: 'UPDATE_WATER_BODIES_META';
      patch: Partial<Omit<CampusEntryState['waterBodiesData'], 'waterBodies'>>;
    }
  | { type: 'UPDATE_COMMUTATION'; patch: Partial<ICampusCommutation> }
  | { type: 'UPDATE_AIR_TRAVEL'; patch: Partial<ICampusAirTravel> }
  | { type: 'UPDATE_PURCHASED_GOODS'; patch: Partial<ICampusPurchasedGoods> }
  | { type: 'SET_SAVING'; value: boolean }
  | { type: 'SET_LAST_SAVED'; date: Date }
  | { type: 'SET_VALIDATION'; result: { warnings: string[]; completenessScore: number } }
  | { type: 'LOAD_FROM_SERVER'; state: Partial<CampusEntryState> };

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPaved(surfaceType: string): boolean {
  return ['paved_concrete', 'paved_asphalt', 'paved_brick'].includes(surfaceType);
}

// ── Reducer ───────────────────────────────────────────────────────────────────

export function campusEntryReducer(
  state: CampusEntryState,
  action: CampusEntryAction
): CampusEntryState {
  switch (action.type) {
    case 'SET_TOTAL_AREA':
      return { ...state, totalCampusAreaAcres: action.value, isDirty: true };

    case 'ADD_ROAD_SEGMENT':
      return {
        ...state,
        isDirty: true,
        roadsData: {
          ...state.roadsData,
          segments: [...state.roadsData.segments, action.segment],
        },
      };

    case 'UPDATE_ROAD_SEGMENT': {
      const patch = action.patch;
      const updated = state.roadsData.segments.map((s) => {
        if (s.id !== action.id) return s;
        const merged = { ...s, ...patch };
        if (merged.surfaceType) merged.isPaved = isPaved(merged.surfaceType);
        if (merged.lengthM !== undefined && merged.widthM !== undefined) {
          merged.areaM2 = merged.lengthM * merged.widthM;
        }
        if (merged.lengthM !== undefined) {
          merged.lengthKm = merged.lengthM / 1000;
        }
        return merged;
      });
      return { ...state, isDirty: true, roadsData: { ...state.roadsData, segments: updated } };
    }

    case 'REMOVE_ROAD_SEGMENT':
      return {
        ...state,
        isDirty: true,
        roadsData: {
          ...state.roadsData,
          segments: state.roadsData.segments.filter((s) => s.id !== action.id),
        },
      };

    case 'UPDATE_ROAD_LIGHTING':
      return {
        ...state,
        isDirty: true,
        roadsData: { ...state.roadsData, ...action.patch },
      };

    case 'UPDATE_VEGETATION_CATEGORY':
      return {
        ...state,
        isDirty: true,
        vegetationData: {
          ...state.vegetationData,
          categories: state.vegetationData.categories.map((c) =>
            c.id === action.id ? { ...c, ...action.patch } : c
          ),
        },
      };

    case 'ADD_VEGETATION_CATEGORY':
      return {
        ...state,
        isDirty: true,
        vegetationData: {
          ...state.vegetationData,
          categories: [...state.vegetationData.categories, action.category],
        },
      };

    case 'REMOVE_VEGETATION_CATEGORY': {
      // Prevent removing the 5 default categories
      const defaultIds = DEFAULT_VEGETATION_CATEGORIES.map((c) => c.id);
      if (defaultIds.includes(action.id)) return state;
      return {
        ...state,
        isDirty: true,
        vegetationData: {
          ...state.vegetationData,
          categories: state.vegetationData.categories.filter((c) => c.id !== action.id),
        },
      };
    }

    case 'UPDATE_VEGETATION_META':
      return {
        ...state,
        isDirty: true,
        vegetationData: { ...state.vegetationData, ...action.patch },
      };

    case 'ADD_WATER_BODY':
      return {
        ...state,
        isDirty: true,
        waterBodiesData: {
          ...state.waterBodiesData,
          waterBodies: [...state.waterBodiesData.waterBodies, action.waterBody],
        },
      };

    case 'UPDATE_WATER_BODY':
      return {
        ...state,
        isDirty: true,
        waterBodiesData: {
          ...state.waterBodiesData,
          waterBodies: state.waterBodiesData.waterBodies.map((w) =>
            w.id === action.id ? { ...w, ...action.patch } : w
          ),
        },
      };

    case 'REMOVE_WATER_BODY':
      return {
        ...state,
        isDirty: true,
        waterBodiesData: {
          ...state.waterBodiesData,
          waterBodies: state.waterBodiesData.waterBodies.filter((w) => w.id !== action.id),
        },
      };

    case 'UPDATE_WATER_BODIES_META':
      return {
        ...state,
        isDirty: true,
        waterBodiesData: { ...state.waterBodiesData, ...action.patch },
      };

    case 'UPDATE_COMMUTATION':
      return {
        ...state,
        isDirty: true,
        commutationData: { ...state.commutationData, ...action.patch },
      };

    case 'UPDATE_AIR_TRAVEL':
      return {
        ...state,
        isDirty: true,
        airTravelData: { ...state.airTravelData, ...action.patch },
      };

    case 'UPDATE_PURCHASED_GOODS':
      return {
        ...state,
        isDirty: true,
        purchasedGoodsData: { ...state.purchasedGoodsData, ...action.patch },
      };

    case 'SET_SAVING':
      return { ...state, isSaving: action.value };

    case 'SET_LAST_SAVED':
      return { ...state, isSaving: false, isDirty: false, lastSavedAt: action.date };

    case 'SET_VALIDATION':
      return { ...state, validationResult: action.result };

    case 'LOAD_FROM_SERVER':
      return {
        ...state,
        ...action.state,
        isDirty: false,
        isSaving: false,
      };

    default:
      return state;
  }
}
