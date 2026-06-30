import {
  IBuildingOverview,
  ICivilStructure,
  ICivilMaterials,
  ICivilDimensions,
  ICivilRoof,
  ICivilConstruction,
  ICivilOpenings,
  IRoomOpenings,
  IOpeningElement,
  EntryMode,
  RoomInputMode,
  IRoom,
  ICustomField,
} from '@shared/types/submission.types';

// ── Default opening elements (4 standard types always present) ────────────────

export const DEFAULT_OPENING_ELEMENTS: IOpeningElement[] = [
  {
    id: 'standard-window',
    elementType: 'window',
    dimensionsWxHFt: '',
    frameMaterial: '',
    glassType: '',
    surfaceFinish: '',
    remarks: '',
  },
  {
    id: 'standard-door',
    elementType: 'door',
    dimensionsWxHFt: '',
    frameMaterial: '',
    glassType: '',
    surfaceFinish: '',
    remarks: '',
  },
  {
    id: 'standard-clerestory',
    elementType: 'clerestory_window',
    dimensionsWxHFt: '',
    frameMaterial: '',
    glassType: '',
    surfaceFinish: '',
    remarks: '',
  },
  {
    id: 'standard-sunshade',
    elementType: 'sunshade_chajja',
    dimensionsWxHFt: '',
    frameMaterial: '',
    glassType: '',
    surfaceFinish: '',
    remarks: '',
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

export interface CivilEntryState {
  submissionId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  entryMode: EntryMode;

  // Part 1 — Building overview data
  overviewData: Partial<IBuildingOverview>;

  // Part 2 — Civil section sub-sections
  dimensionsData: Partial<ICivilDimensions>;
  roofData: Partial<ICivilRoof>;
  constructionData: Partial<ICivilConstruction>;
  openingsData: ICivilOpenings;
  structureData: Partial<ICivilStructure>;
  materialsData: Partial<ICivilMaterials>;

  // UI
  activeSection: string;
  validationResult: { warnings: string[]; completenessScore: number } | null;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type CivilEntryAction =
  | { type: 'SET_SUBMISSION_ID'; payload: string }
  // legacy alias kept for any external code
  | { type: 'SET_CIVIL_SUBMISSION_ID'; payload: string }
  | {
      type: 'HYDRATE';
      payload: {
        overview?: Partial<IBuildingOverview>;
        structure?: Partial<ICivilStructure>;
        dimensions?: Partial<ICivilDimensions>;
        roof?: Partial<ICivilRoof>;
        construction?: Partial<ICivilConstruction>;
        openings?: ICivilOpenings;
        materials?: Partial<ICivilMaterials>;
        entryMode?: EntryMode;
      };
    }
  | { type: 'UPDATE_OVERVIEW'; payload: Partial<IBuildingOverview> }
  | { type: 'UPDATE_DIMENSIONS'; payload: Partial<ICivilDimensions> }
  | { type: 'UPDATE_ROOF'; payload: Partial<ICivilRoof> }
  | { type: 'UPDATE_CONSTRUCTION'; payload: Partial<ICivilConstruction> }
  | { type: 'UPDATE_OPENINGS'; payload: ICivilOpenings }
  | { type: 'UPDATE_ROOM_OPENINGS'; payload: IRoomOpenings }
  | { type: 'UPDATE_STRUCTURE'; payload: Partial<ICivilStructure> }
  | { type: 'UPDATE_MATERIALS'; payload: Partial<ICivilMaterials> }
  // Legacy aliases — keep to avoid touching other files
  | { type: 'SET_STRUCTURE'; payload: Partial<ICivilStructure> }
  | { type: 'SET_MATERIALS'; payload: Partial<ICivilMaterials> }
  | { type: 'SET_ENTRY_MODE'; payload: EntryMode }
  | { type: 'SET_ACTIVE_SECTION'; payload: string }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_LAST_SAVED'; payload: Date }
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'SET_VALIDATION_RESULT'; payload: CivilEntryState['validationResult'] }
  | { type: 'ADD_ROOM'; payload: IRoom }
  | { type: 'UPDATE_ROOM'; payload: { id: string; updates: Partial<IRoom> } }
  | { type: 'REMOVE_ROOM'; payload: string }
  | { type: 'ADD_CUSTOM_MATERIAL'; payload: ICustomField }
  | { type: 'REMOVE_CUSTOM_MATERIAL'; payload: string };

// ── Initial state ─────────────────────────────────────────────────────────────

export const initialState: CivilEntryState = {
  submissionId: null,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  entryMode: EntryMode.CUMULATIVE,

  overviewData: {
    operatingHoursPerDay: 10,
    operatingDaysPerWeek: 6,
    peakMonths: [],
    acUsageMonths: [],
    occupancyDuringBreaks: 'partial',
  },

  dimensionsData: {},
  roofData: {},
  constructionData: {},
  openingsData: { elements: [...DEFAULT_OPENING_ELEMENTS], roomOpenings: [] },

  structureData: {
    entryMode: EntryMode.CUMULATIVE,
    roomInputMode: RoomInputMode.QUICK,
    rooms: [],
    totalRooms: 0,
    totalUsableArea: 0,
    customRoomTypes: [],
  },
  materialsData: {
    estimationMode: 'bulk',
    furnitureDensity: 'medium',
    customMaterials: [],
  },

  activeSection: 'overview-basic',
  validationResult: null,
};

// ── Reducer ───────────────────────────────────────────────────────────────────

export function civilEntryReducer(
  state: CivilEntryState,
  action: CivilEntryAction
): CivilEntryState {
  switch (action.type) {
    case 'SET_SUBMISSION_ID':
    case 'SET_CIVIL_SUBMISSION_ID':
      return { ...state, submissionId: action.payload };

    case 'HYDRATE': {
      // Merge saved building-total elements with the 4 standard defaults
      const savedElements = action.payload.openings?.elements ?? [];
      const standardIds = DEFAULT_OPENING_ELEMENTS.map((e) => e.id);
      const mergedElements: IOpeningElement[] = DEFAULT_OPENING_ELEMENTS.map((def) => {
        const saved = savedElements.find((e) => e.id === def.id);
        return saved ? { ...def, ...saved } : def;
      });
      const customElements = savedElements.filter((e) => !standardIds.includes(e.id));
      const elements = [...mergedElements, ...customElements];

      // For each saved room opening, ensure it has all 4 standard defaults merged in
      const savedRoomOpenings = action.payload.openings?.roomOpenings ?? [];
      const roomOpenings: IRoomOpenings[] = savedRoomOpenings.map((ro) => ({
        roomId: ro.roomId,
        elements: DEFAULT_OPENING_ELEMENTS.map((def) => {
          const saved = ro.elements.find((e) => e.id === def.id);
          return saved ? { ...def, ...saved } : def;
        }),
      }));

      return {
        ...state,
        overviewData: action.payload.overview ?? state.overviewData,
        structureData: action.payload.structure ?? state.structureData,
        dimensionsData: action.payload.dimensions ?? state.dimensionsData,
        roofData: action.payload.roof ?? state.roofData,
        constructionData: action.payload.construction ?? state.constructionData,
        openingsData: { elements, roomOpenings },
        materialsData: action.payload.materials ?? state.materialsData,
        entryMode: action.payload.entryMode ?? state.entryMode,
        isDirty: false,
      };
    }

    case 'UPDATE_OVERVIEW':
      return {
        ...state,
        overviewData: { ...state.overviewData, ...action.payload },
        isDirty: true,
      };

    case 'UPDATE_DIMENSIONS':
      return {
        ...state,
        dimensionsData: { ...state.dimensionsData, ...action.payload },
        isDirty: true,
      };

    case 'UPDATE_ROOF':
      return { ...state, roofData: { ...state.roofData, ...action.payload }, isDirty: true };

    case 'UPDATE_CONSTRUCTION':
      return {
        ...state,
        constructionData: { ...state.constructionData, ...action.payload },
        isDirty: true,
      };

    case 'UPDATE_OPENINGS':
      return { ...state, openingsData: action.payload, isDirty: true };

    case 'UPDATE_ROOM_OPENINGS': {
      const { roomId, elements } = action.payload;
      const existing = state.openingsData.roomOpenings ?? [];
      const idx = existing.findIndex((r) => r.roomId === roomId);
      const roomOpenings =
        idx >= 0
          ? existing.map((r, i) => (i === idx ? { roomId, elements } : r))
          : [...existing, { roomId, elements }];
      return { ...state, openingsData: { ...state.openingsData, roomOpenings }, isDirty: true };
    }

    case 'UPDATE_STRUCTURE':
    case 'SET_STRUCTURE':
      return {
        ...state,
        structureData: { ...state.structureData, ...action.payload },
        isDirty: true,
      };

    case 'UPDATE_MATERIALS':
    case 'SET_MATERIALS':
      return {
        ...state,
        materialsData: { ...state.materialsData, ...action.payload },
        isDirty: true,
      };

    case 'SET_ENTRY_MODE':
      return {
        ...state,
        entryMode: action.payload,
        structureData: { ...state.structureData, entryMode: action.payload },
        isDirty: true,
      };

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

    case 'ADD_ROOM': {
      const rooms = [...(state.structureData.rooms ?? []), action.payload];
      return { ...state, structureData: { ...state.structureData, rooms }, isDirty: true };
    }

    case 'UPDATE_ROOM': {
      const rooms = (state.structureData.rooms ?? []).map((r) =>
        r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
      );
      return { ...state, structureData: { ...state.structureData, rooms }, isDirty: true };
    }

    case 'REMOVE_ROOM': {
      const rooms = (state.structureData.rooms ?? []).filter((r) => r.id !== action.payload);
      return { ...state, structureData: { ...state.structureData, rooms }, isDirty: true };
    }

    case 'ADD_CUSTOM_MATERIAL': {
      const customMaterials = [...(state.materialsData.customMaterials ?? []), action.payload];
      return {
        ...state,
        materialsData: { ...state.materialsData, customMaterials },
        isDirty: true,
      };
    }

    case 'REMOVE_CUSTOM_MATERIAL': {
      const customMaterials = (state.materialsData.customMaterials ?? []).filter(
        (m) => m.id !== action.payload
      );
      return {
        ...state,
        materialsData: { ...state.materialsData, customMaterials },
        isDirty: true,
      };
    }

    default:
      return state;
  }
}
