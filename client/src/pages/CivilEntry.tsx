import { useEffect, useReducer, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Lock,
  Layers,
  Grid,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Minus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Save,
  Send,
  Clock,
  Info,
} from 'lucide-react';
import { BuildingType } from '@shared/types/building.types';
import { EntryMode, RoomInputMode, IOpeningElement } from '@shared/types/submission.types';
import { UserRole } from '@shared/types/user.types';
import { ROOM_TEMPLATES, BUILDING_TEMPLATES } from '@shared/constants/defaults';
import { buildingsApi } from '@/features/buildings/buildingsApi';
import { submissionsApi } from '@/features/submissions/submissionsApi';
import { useAuthStore } from '@/features/auth/authStore';
import { useToast } from '@/hooks/useToast';
import PageWrapper from '@/components/layout/PageWrapper';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Modal from '@/components/common/Modal';
import Badge from '@/components/common/Badge';
import Skeleton from '@/components/common/Skeleton';
import { cn } from '@/utils/cn';
import {
  civilEntryReducer,
  initialState,
  DEFAULT_OPENING_ELEMENTS,
} from '@/features/civil/civilEntryReducer';

// ── Constants ──────────────────────────────────────────────────────────────────

const ROOM_TYPE_CATALOG = [
  { key: 'CLASSROOM', label: 'Classroom', desc: 'Standard lecture room' },
  { key: 'TUTORIAL_ROOM', label: 'Tutorial room', desc: 'Small group teaching' },
  { key: 'FACULTY_OFFICE', label: 'Faculty office', desc: 'Individual faculty space' },
  { key: 'STAFF_OFFICE', label: 'Staff office', desc: 'Administrative staff' },
  { key: 'RESEARCH_LAB', label: 'Research lab', desc: 'Lab for research activities' },
  { key: 'COMPUTER_LAB', label: 'Computer lab', desc: 'Rooms with desktops' },
  { key: 'WASHROOM', label: 'Washroom', desc: 'Toilet / bathroom block' },
  { key: 'CORRIDOR', label: 'Corridor', desc: 'Circulation space' },
  { key: 'HOSTEL_ROOM', label: 'Hostel room', desc: 'Student residential room' },
  { key: 'COMMON_ROOM', label: 'Common room', desc: 'Shared lounge / recreation' },
  { key: 'CONFERENCE_ROOM', label: 'Conference room', desc: 'Meeting / seminar space' },
  { key: 'STORE_ROOM', label: 'Store room', desc: 'Storage / utility space' },
];

const DENSITY_OPTIONS = [
  { value: 'low' as const, label: 'Light', factor: 10 },
  { value: 'medium' as const, label: 'Med', factor: 25 },
  { value: 'high' as const, label: 'Dense', factor: 40 },
];

const BULK_DENSITY_OPTIONS = [
  { value: 'low' as const, label: 'Light', desc: 'Open spaces, lecture halls', factor: 0.01 },
  { value: 'medium' as const, label: 'Medium', desc: 'Offices, labs, classrooms', factor: 0.025 },
  { value: 'high' as const, label: 'Dense', desc: 'Libraries, hostels, storage', factor: 0.04 },
];

const MATERIAL_MIX: Record<
  string,
  { wood: number; steel: number; plastic: number; glass: number }
> = {
  academic: { wood: 55, steel: 30, plastic: 10, glass: 5 },
  hostel: { wood: 45, steel: 35, plastic: 15, glass: 5 },
  lab: { wood: 30, steel: 55, plastic: 10, glass: 5 },
  administrative: { wood: 50, steel: 35, plastic: 10, glass: 5 },
  default: { wood: 50, steel: 30, plastic: 15, glass: 5 },
};

const BUILDING_TYPE_LABELS: Record<string, string> = {
  academic: 'Academic',
  hostel: 'Hostel',
  lab: 'Laboratory',
  administrative: 'Administrative',
  residential: 'Residential',
  commercial: 'Commercial',
  infrastructure: 'Infrastructure',
};

const ELEMENT_LABELS: Record<string, string> = {
  window: 'Window',
  door: 'Door',
  clerestory_window: 'Clerestory Window',
  sunshade_chajja: 'Sunshade / Chajja',
  custom: 'Custom',
};

const SIDEBAR_SECTIONS = [
  { id: 'dimensions', label: 'Structural dimensions' },
  { id: 'structure', label: 'Rooms & structure' },
  { id: 'roof', label: 'Roof construction' },
  { id: 'openings', label: 'Doors, windows & openings' },
  { id: 'construction', label: 'Construction type & practices' },
  { id: 'materials', label: 'Materials & furniture' },
  { id: 'sustainability', label: 'Sustainability practices' },
];

const ALL_SECTION_IDS = SIDEBAR_SECTIONS.map((s) => s.id);

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcFurnitureFromDensity(
  count: number,
  avgSizeSqm: number,
  density: 'low' | 'medium' | 'high',
  buildingType: string
) {
  const factor = DENSITY_OPTIONS.find((d) => d.value === density)?.factor ?? 25;
  const totalKg = count * avgSizeSqm * factor;
  const mix = MATERIAL_MIX[buildingType] ?? MATERIAL_MIX.default;
  return {
    woodenFurnitureKg: Math.round((totalKg * mix.wood) / 100),
    steelFurnitureKg: Math.round((totalKg * mix.steel) / 100),
    plasticKg: Math.round((totalKg * mix.plastic) / 100),
    glassKg: Math.round((totalKg * mix.glass) / 100),
  };
}

function computeValidation(state: ReturnType<typeof civilEntryReducer>) {
  const warnings: string[] = [];
  const ov = state.overviewData;
  const dims = state.dimensionsData;
  const constr = state.constructionData;
  const elements = state.openingsData.elements;

  // W1: orientation total ≠ 100 when any filled
  const hasAnyOrientation = [
    ov.orientationNorthPct,
    ov.orientationEastPct,
    ov.orientationSouthPct,
    ov.orientationWestPct,
  ].some((v) => v != null && v > 0);
  if (hasAnyOrientation) {
    const total =
      (ov.orientationNorthPct ?? 0) +
      (ov.orientationEastPct ?? 0) +
      (ov.orientationSouthPct ?? 0) +
      (ov.orientationWestPct ?? 0);
    if (Math.abs(total - 100) > 1)
      warnings.push(`Orientation values total ${total}% — they should sum to 100%`);
  }

  // W2: sqm and sqft disagree > 15%
  if (ov.totalFloorArea && ov.areaOfOneBuildingSqFt) {
    const expectedSqft = ov.totalFloorArea * 10.764;
    const pct = Math.abs(ov.areaOfOneBuildingSqFt - expectedSqft) / expectedSqft;
    if (pct > 0.15) warnings.push("Your sq m and sq ft areas don't agree — please verify");
  }

  // W3: no construction type
  if (!constr.constructionType)
    warnings.push('Construction type not specified — the engine will use RCC as default');

  // W4: all openings empty
  const anyOpeningCount = elements.some((e) => (e.count ?? 0) > 0);
  if (!anyOpeningCount)
    warnings.push('No door/window data — embodied carbon of openings will be estimated');

  // W5: no land use data
  const hasLandUse =
    ov.landUseOpenPlayAreaAcres ||
    ov.landUseGreenPermeableAcres ||
    ov.landUsePavedAcres ||
    ov.landUseCoveredBuiltUpAcres;
  if (!hasLandUse)
    warnings.push(
      "No land use data — this won't affect carbon calculation but is useful for campus reporting"
    );

  // W6: local practices ON but 0% materials
  if (constr.localConstructionPractices && !constr.localMaterialsPercent) {
    warnings.push('Local construction practices enabled but 0% local materials — please check');
  }

  // Completeness
  let score = 0;
  if (ov.yearOfConstruction && ov.usagesOfBuilding) score += 20;
  if (ov.totalFloorArea || ov.areaOfOneBuildingSqFt) score += 10;
  if (ov.numberOfOccupantsPerBuilding || ov.averageDailyOccupants) score += 10;
  if (hasAnyOrientation) score += 10;
  if (dims.wallThicknessMm || dims.slabThicknessMm) score += 10;
  const hasRooms =
    (state.structureData.rooms?.length ?? 0) > 0 || (state.structureData.totalRooms ?? 0) > 0;
  if (hasRooms) score += 10;
  if (constr.constructionType) score += 10;
  if (anyOpeningCount) score += 10;
  if (warnings.length === 0) score += 10;

  return { warnings, completenessScore: Math.min(100, score) };
}

function formatSaveStatus(lastSavedAt: Date | null, isSaving: boolean, isDirty: boolean): string {
  if (isSaving) return 'Saving…';
  if (!lastSavedAt) return isDirty ? 'Unsaved changes' : 'Not yet saved';
  const secs = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
  if (secs < 30) return 'Just saved';
  if (secs < 60) return `Saved ${secs}s ago`;
  return `Saved ${Math.floor(secs / 60)}m ago`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span className="absolute text-xs font-semibold text-gray-700">{pct}%</span>
    </div>
  );
}

function SectionCard({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {children}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  locked,
}: {
  title: string;
  subtitle?: string;
  locked?: boolean;
}) {
  return (
    <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {locked && (
          <div className="relative group">
            <Lock className="w-3.5 h-3.5 text-gray-400" />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 text-xs bg-gray-900 text-white rounded-lg px-3 py-2 hidden group-hover:block z-10 pointer-events-none">
              Locked after approval. Changes require admin unlock.
            </div>
          </div>
        )}
      </div>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CivilEntry() {
  const { id: buildingId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { showSuccess, showError, showWarning } = useToast();

  const [state, dispatch] = useReducer(civilEntryReducer, initialState);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rooms
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomType, setNewRoomType] = useState('');
  const [newRoomIsCustom, setNewRoomIsCustom] = useState(false);
  const [newRoomCustomLabel, setNewRoomCustomLabel] = useState('');
  const [showCustomRoom, setShowCustomRoom] = useState(false);
  const [customRoomForm, setCustomRoomForm] = useState({
    label: '',
    count: 1,
    avgSizeSqm: 0,
    notes: '',
  });
  const [showTemplates, setShowTemplates] = useState(false);

  // Materials
  const [showCustomMaterial, setShowCustomMaterial] = useState(false);
  const [customMaterialForm, setCustomMaterialForm] = useState({ label: '', value: 0, notes: '' });
  const [showExtendedMaterials, setShowExtendedMaterials] = useState(false);

  // Openings
  const [expandedOpenings, setExpandedOpenings] = useState<Set<string>>(new Set());
  const [expandedRoomOpenings, setExpandedRoomOpenings] = useState<Set<string>>(new Set());

  // ── Fetch building ──────────────────────────────────────────────────────────
  const { data: buildingRes, isLoading: buildingLoading } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => buildingsApi.getById(buildingId!),
    enabled: !!buildingId,
  });

  const building = buildingRes?.data?.data as
    | {
        _id: string;
        name: string;
        type: BuildingType;
        floors: number;
        totalArea?: number;
        yearBuilt?: number;
        assignedMembers: Array<{ _id: string }>;
      }
    | undefined;

  const buildingType = building?.type ?? 'default';

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!building || !user) return;
    const isAssigned = building.assignedMembers.some((m) => m._id === user._id);
    if (!isAssigned && user.role !== UserRole.REVIEWER && user.role !== UserRole.ADMIN) {
      showWarning('You are not assigned to this building');
      navigate(`/buildings/${buildingId}`, { replace: true });
    }
  }, [building, user, buildingId, navigate, showWarning]);

  // ── Load draft ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!buildingId) return;
    async function loadDraft() {
      try {
        const res = await submissionsApi.getOrCreateDraft(buildingId!, 'civil');
        const sub = res?.data?.data;
        if (sub?._id) dispatch({ type: 'SET_SUBMISSION_ID', payload: sub._id });
        const d = (sub?.data ?? {}) as Record<string, unknown>;
        dispatch({
          type: 'HYDRATE',
          payload: {
            overview: (d.overview as never) ?? undefined,
            structure: (d.structure as never) ?? undefined,
            dimensions: (d.dimensions as never) ?? undefined,
            roof: (d.roof as never) ?? undefined,
            construction: (d.construction as never) ?? undefined,
            openings: (d.openings as never) ?? undefined,
            materials: (d.materials as never) ?? undefined,
            entryMode:
              sub?.entryMode === 'room_level' ? EntryMode.ROOM_LEVEL : EntryMode.CUMULATIVE,
          },
        });
        // Pre-fill identity from building if overview is blank
        if (building && !d.overview) {
          dispatch({
            type: 'UPDATE_OVERVIEW',
            payload: {
              buildingName: building.name,
              buildingType: building.type,
              numberOfFloors: building.floors,
              totalFloorArea: building.totalArea,
              yearOfConstruction: building.yearBuilt,
            },
          });
        }
      } catch (err) {
        console.error('Failed to load civil draft:', err);
      }
    }
    loadDraft();
  }, [buildingId, building]);

  // ── Scroll-spy ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) dispatch({ type: 'SET_ACTIVE_SECTION', payload: e.target.id });
        });
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );
    ALL_SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [buildingLoading]);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  const saveRef = useRef<() => Promise<void>>();
  const save = useCallback(async () => {
    if (!state.submissionId) return;
    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      await submissionsApi.updateDraft(
        state.submissionId,
        {
          overview: state.overviewData,
          structure: { ...state.structureData, entryMode: state.entryMode },
          dimensions: state.dimensionsData,
          roof: state.roofData,
          construction: state.constructionData,
          openings: state.openingsData,
          materials: state.materialsData,
        } as Record<string, unknown>,
        state.entryMode === EntryMode.ROOM_LEVEL ? 'room_level' : 'cumulative'
      );
      dispatch({ type: 'SET_LAST_SAVED', payload: new Date() });
    } catch {
      /* silent */
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state]);
  saveRef.current = save;

  useEffect(() => {
    const id = setInterval(() => {
      if (state.isDirty) saveRef.current?.();
    }, 30_000);
    return () => clearInterval(id);
  }, [state.isDirty]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmitClick() {
    if (!state.submissionId) return;
    await saveRef.current?.();
    const result = computeValidation(state);
    dispatch({ type: 'SET_VALIDATION_RESULT', payload: result });
    if (result.completenessScore < 20) {
      showError('Fill in at least basic data first.');
      return;
    }
    setShowValidationModal(true);
  }

  async function handleConfirmSubmit() {
    if (!state.submissionId) return;
    setIsSubmitting(true);
    try {
      await submissionsApi.submit(state.submissionId);
      setShowValidationModal(false);
      showSuccess('Civil section submitted for review.');
      navigate(`/buildings/${buildingId}`);
    } catch {
      showError('Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Room helpers ────────────────────────────────────────────────────────────
  function getRoomCount(type: string) {
    return state.structureData.rooms?.find((r) => r.type === type && !r.isCustomType)?.count ?? 0;
  }
  function setRoomCount(type: string, count: number) {
    const existing = state.structureData.rooms?.find((r) => r.type === type && !r.isCustomType);
    if (count <= 0) {
      if (existing) dispatch({ type: 'REMOVE_ROOM', payload: existing.id });
      return;
    }
    if (existing) {
      dispatch({ type: 'UPDATE_ROOM', payload: { id: existing.id, updates: { count } } });
    } else {
      const tmpl = ROOM_TEMPLATES[type];
      dispatch({
        type: 'ADD_ROOM',
        payload: {
          id: crypto.randomUUID(),
          type,
          isCustomType: false,
          count,
          avgSizeSqm: tmpl?.avgSizeSqm ?? 30,
          avgOccupancy: tmpl?.avgOccupancy ?? 0,
          usageHoursPerDay: tmpl?.usageHoursPerDay ?? 8,
        },
      });
    }
  }
  function getRoomAvgSize(type: string) {
    return (
      state.structureData.rooms?.find((r) => r.type === type && !r.isCustomType)?.avgSizeSqm ??
      ROOM_TEMPLATES[type]?.avgSizeSqm ??
      30
    );
  }
  function setRoomAvgSize(type: string, size: number) {
    const existing = state.structureData.rooms?.find((r) => r.type === type && !r.isCustomType);
    if (existing)
      dispatch({
        type: 'UPDATE_ROOM',
        payload: { id: existing.id, updates: { avgSizeSqm: size } },
      });
  }
  function applyDensityToRoom(roomId: string, density: 'low' | 'medium' | 'high') {
    const room = state.structureData.rooms?.find((r) => r.id === roomId);
    if (!room) return;
    const estimated = room.avgSizeSqm
      ? calcFurnitureFromDensity(room.count ?? 1, room.avgSizeSqm, density, buildingType)
      : null;
    dispatch({
      type: 'UPDATE_ROOM',
      payload: { id: roomId, updates: { furnitureDensity: density, ...(estimated ?? {}) } },
    });
  }

  // ── Opening helpers (building-total mode) ──────────────────────────────────
  function updateOpening(id: string, updates: Partial<IOpeningElement>) {
    const elements = state.openingsData.elements.map((e) =>
      e.id === id ? { ...e, ...updates } : e
    );
    dispatch({ type: 'UPDATE_OPENINGS', payload: { ...state.openingsData, elements } });
  }
  function addCustomOpening() {
    const newEl: IOpeningElement = {
      id: crypto.randomUUID(),
      elementType: 'custom',
      customElementLabel: '',
      dimensionsWxHFt: '',
      frameMaterial: '',
      glassType: '',
      surfaceFinish: '',
      remarks: '',
    };
    dispatch({
      type: 'UPDATE_OPENINGS',
      payload: { ...state.openingsData, elements: [...state.openingsData.elements, newEl] },
    });
    setExpandedOpenings((prev) => new Set([...prev, newEl.id]));
  }
  function removeCustomOpening(id: string) {
    dispatch({
      type: 'UPDATE_OPENINGS',
      payload: {
        ...state.openingsData,
        elements: state.openingsData.elements.filter((e) => e.id !== id),
      },
    });
  }

  // ── Opening helpers (room-by-room mode) ────────────────────────────────────
  function getRoomOpenings(roomId: string): IOpeningElement[] {
    return (
      state.openingsData.roomOpenings?.find((r) => r.roomId === roomId)?.elements ??
      DEFAULT_OPENING_ELEMENTS.map((d) => ({ ...d }))
    );
  }
  function updateRoomOpening(roomId: string, elId: string, updates: Partial<IOpeningElement>) {
    const current = getRoomOpenings(roomId);
    const elements = current.map((e) => (e.id === elId ? { ...e, ...updates } : e));
    dispatch({ type: 'UPDATE_ROOM_OPENINGS', payload: { roomId, elements } });
  }
  function updateRoomOpeningsBulk(
    roomId: string,
    updater: (el: IOpeningElement) => IOpeningElement
  ) {
    const current = getRoomOpenings(roomId);
    dispatch({ type: 'UPDATE_ROOM_OPENINGS', payload: { roomId, elements: current.map(updater) } });
  }
  function toggleRoomCard(roomId: string) {
    setExpandedRoomOpenings((prev) => {
      const next = new Set(prev);
      next.has(roomId) ? next.delete(roomId) : next.add(roomId);
      return next;
    });
  }

  // ── Summaries ───────────────────────────────────────────────────────────────
  const totalRoomsSummary = state.structureData.rooms?.reduce((s, r) => s + (r.count ?? 0), 0) ?? 0;
  const estimatedAreaSummary =
    state.structureData.rooms?.reduce((s, r) => s + (r.count ?? 0) * (r.avgSizeSqm ?? 0), 0) ?? 0;
  const totalFurnitureSummary = state.structureData.rooms?.reduce(
    (acc, r) => ({
      wood: acc.wood + (r.woodenFurnitureKg ?? 0),
      steel: acc.steel + (r.steelFurnitureKg ?? 0),
      plastic: acc.plastic + (r.plasticKg ?? 0),
      glass: acc.glass + (r.glassKg ?? 0),
    }),
    { wood: 0, steel: 0, plastic: 0, glass: 0 }
  ) ?? { wood: 0, steel: 0, plastic: 0, glass: 0 };
  const bulkDensityFactor =
    BULK_DENSITY_OPTIONS.find((d) => d.value === (state.materialsData.furnitureDensity ?? 'medium'))
      ?.factor ?? 0.025;
  const estimatedFurnitureTonnes =
    estimatedAreaSummary > 0 ? (estimatedAreaSummary * bulkDensityFactor).toFixed(1) : null;
  const materialMix = MATERIAL_MIX[buildingType] ?? MATERIAL_MIX.default;
  const isEmpty =
    (state.structureData.rooms?.length ?? 0) === 0 && (state.structureData.totalRooms ?? 0) === 0;
  const saveStatus = formatSaveStatus(state.lastSavedAt, state.isSaving, state.isDirty);
  const { completenessScore } = state.validationResult ?? computeValidation(state);

  if (buildingLoading) {
    return (
      <PageWrapper title="Structural and Construction">
        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8">
          <div className="w-72 shrink-0 space-y-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <div className="flex-1 space-y-6">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title={`Structural and Construction — ${building?.name ?? 'Building'}`}>
      <div className="bg-gray-50 min-h-[calc(100vh-4rem)]">
        <div className="max-w-7xl mx-auto px-4 py-8 lg:flex lg:gap-8">
          {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
          <aside className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-20 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {building?.name ?? '—'}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="info" label="Structural and Construction" />
                  {building?.type && (
                    <Badge
                      variant="building-type"
                      buildingType={building.type}
                      label={BUILDING_TYPE_LABELS[building.type] ?? building.type}
                    />
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Contents
                  </p>
                </div>
                <nav className="p-2 max-h-96 overflow-y-auto">
                  {SIDEBAR_SECTIONS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => scrollToSection(id)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2',
                        state.activeSection === id
                          ? 'bg-blue-50 text-iitbhu font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          'w-3 h-3 shrink-0',
                          state.activeSection === id ? 'text-iitbhu' : 'text-gray-300'
                        )}
                      />
                      {label}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <ProgressRing pct={completenessScore} />
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Completeness</p>
                    <p className="text-sm font-semibold text-gray-700">{completenessScore}% done</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  {state.isSaving ? (
                    <Clock className="w-3 h-3 animate-spin" />
                  ) : state.lastSavedAt ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ) : (
                    <Clock className="w-3 h-3" />
                  )}
                  <span>{saveStatus}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  variant="primary"
                  fullWidth
                  disabled={isSubmitting}
                  onClick={handleSubmitClick}
                  className="gap-2"
                >
                  <Send className="w-4 h-4" /> Submit for review
                </Button>
                <Button
                  variant="ghost"
                  fullWidth
                  disabled={!state.isDirty}
                  isLoading={state.isSaving}
                  onClick={() => saveRef.current?.()}
                  className="gap-2 border border-gray-200"
                >
                  <Save className="w-4 h-4" /> Save as draft
                </Button>
              </div>
            </div>
          </aside>

          {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
          <main className="flex-1 min-w-0 space-y-6 pb-24 lg:pb-8">
            {/* Building overview fields live in OverviewEntry — not rendered here */}

            {/* ═══════════════════════════════════════ DIMENSIONS */}
            <SectionCard id="dimensions">
              <SectionHeader
                title="Structural dimensions"
                subtitle="Physical dimensions of structural elements — used in embodied carbon calculation"
              />
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FieldGroup
                    label="Wall thickness"
                    hint="External load-bearing or infill wall thickness. Typical RC infill: 200–300 mm."
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={2000}
                        value={state.dimensionsData.wallThicknessMm ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_DIMENSIONS',
                            payload: {
                              wallThicknessMm: e.target.value ? Number(e.target.value) : undefined,
                            },
                          })
                        }
                      />
                      <span className="text-xs text-gray-400 shrink-0">mm</span>
                    </div>
                  </FieldGroup>

                  <FieldGroup
                    label="Internal partition thickness"
                    hint="Non-structural internal wall. Typical brick: 115 mm, drywall: 75–100 mm."
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={500}
                        value={state.dimensionsData.internalPartitionMm ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_DIMENSIONS',
                            payload: {
                              internalPartitionMm: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            },
                          })
                        }
                      />
                      <span className="text-xs text-gray-400 shrink-0">mm</span>
                    </div>
                  </FieldGroup>

                  <FieldGroup
                    label="Slab thickness"
                    hint="Floor/roof slab. Typical two-way RC slab: 120–180 mm."
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={500}
                        value={state.dimensionsData.slabThicknessMm ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_DIMENSIONS',
                            payload: {
                              slabThicknessMm: e.target.value ? Number(e.target.value) : undefined,
                            },
                          })
                        }
                      />
                      <span className="text-xs text-gray-400 shrink-0">mm</span>
                    </div>
                  </FieldGroup>

                  <FieldGroup label="Beam size" hint="Width × Depth of primary structural beams">
                    <Input
                      type="text"
                      maxLength={50}
                      placeholder="e.g. 300×600 mm"
                      value={state.dimensionsData.beamSize ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_DIMENSIONS',
                          payload: { beamSize: e.target.value },
                        })
                      }
                    />
                  </FieldGroup>

                  <FieldGroup
                    label="Column size"
                    hint="Cross-sectional dimensions of structural columns"
                  >
                    <Input
                      type="text"
                      maxLength={50}
                      placeholder="e.g. 450×450 mm"
                      value={state.dimensionsData.columnSize ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_DIMENSIONS',
                          payload: { columnSize: e.target.value },
                        })
                      }
                    />
                  </FieldGroup>

                  <FieldGroup
                    label="Number of rooms"
                    hint="Total room count. Auto-syncs with the Rooms section below."
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={state.dimensionsData.numberOfRooms ?? ''}
                      onChange={(e) => {
                        const n = e.target.value ? Number(e.target.value) : undefined;
                        dispatch({ type: 'UPDATE_DIMENSIONS', payload: { numberOfRooms: n } });
                        if (n && !state.structureData.totalRooms)
                          dispatch({ type: 'UPDATE_STRUCTURE', payload: { totalRooms: n } });
                      }}
                    />
                  </FieldGroup>

                  <FieldGroup
                    label="Number of windows"
                    hint="Total window openings across the entire building"
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={state.dimensionsData.numberOfWindows ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_DIMENSIONS',
                          payload: {
                            numberOfWindows: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </FieldGroup>

                  <FieldGroup
                    label="Clear room height"
                    hint="Floor-to-ceiling clear internal height. Typical: 10–14 ft."
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={30}
                        step={0.5}
                        value={state.dimensionsData.clearRoomHeightFt ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_DIMENSIONS',
                            payload: {
                              clearRoomHeightFt: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            },
                          })
                        }
                      />
                      <span className="text-xs text-gray-400 shrink-0">ft</span>
                    </div>
                  </FieldGroup>
                </div>
              </div>
            </SectionCard>

            {/* ════════════════════════════════════════ PART 2B: ROOMS */}
            <SectionCard id="structure">
              <SectionHeader title="Rooms & structure" />
              <div className="p-6 space-y-6">
                {/* Entry mode toggle */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'SET_ENTRY_MODE', payload: EntryMode.CUMULATIVE })
                    }
                    className={cn(
                      'p-4 rounded-xl border-2 text-left transition-all',
                      state.entryMode === EntryMode.CUMULATIVE
                        ? 'border-iitbhu bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Layers className="w-4 h-4 text-iitbhu" />
                      <span className="text-sm font-semibold text-gray-800">Building total</span>
                      {state.entryMode === EntryMode.CUMULATIVE && (
                        <CheckCircle2 className="w-4 h-4 text-iitbhu ml-auto" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Enter combined totals for the whole building
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'SET_ENTRY_MODE', payload: EntryMode.ROOM_LEVEL })
                    }
                    className={cn(
                      'p-4 rounded-xl border-2 text-left transition-all',
                      state.entryMode === EntryMode.ROOM_LEVEL
                        ? 'border-iitbhu bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Grid className="w-4 h-4 text-iitbhu" />
                      <span className="text-sm font-semibold text-gray-800">Room by room</span>
                      {state.entryMode === EntryMode.ROOM_LEVEL && (
                        <CheckCircle2 className="w-4 h-4 text-iitbhu ml-auto" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Specify each room type with detailed area and furniture
                    </p>
                  </button>
                </div>

                {/* Building total mode */}
                {state.entryMode === EntryMode.CUMULATIVE && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <FieldGroup label="Total number of rooms">
                        <Input
                          type="number"
                          min={0}
                          value={state.structureData.totalRooms ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_STRUCTURE',
                              payload: { totalRooms: e.target.value ? Number(e.target.value) : 0 },
                            })
                          }
                        />
                      </FieldGroup>
                      <FieldGroup label="Total usable floor area (sqm)">
                        <Input
                          type="number"
                          min={0}
                          value={state.structureData.totalUsableArea ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_STRUCTURE',
                              payload: {
                                totalUsableArea: e.target.value ? Number(e.target.value) : 0,
                              },
                            })
                          }
                        />
                      </FieldGroup>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-1">
                        Room type breakdown{' '}
                        <span className="font-normal text-gray-400">(optional)</span>
                      </p>
                      <p className="text-xs text-gray-400 mb-4">
                        Helps calculate appliance defaults. Skip if unknown.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ROOM_TYPE_CATALOG.map(({ key, label, desc }) => {
                          const count = getRoomCount(key);
                          return (
                            <div
                              key={key}
                              className={cn(
                                'border rounded-xl p-3 transition-colors',
                                count > 0 ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{label}</p>
                                  <p className="text-xs text-gray-400">{desc}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setRoomCount(key, count - 1)}
                                    disabled={count === 0}
                                    className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 disabled:opacity-40"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-6 text-center text-sm font-semibold text-gray-700">
                                    {count}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setRoomCount(key, count + 1)}
                                    className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              {count > 0 && (
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-blue-100">
                                  <label className="text-xs text-gray-500 whitespace-nowrap">
                                    Avg size (sqm):
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={getRoomAvgSize(key)}
                                    onChange={(e) =>
                                      setRoomAvgSize(key, Number(e.target.value) || 0)
                                    }
                                    className="w-20 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-iitbhu"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {totalRoomsSummary > 0 && (
                        <div className="mt-3 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 flex gap-4">
                          <span>
                            Rooms: <strong className="text-gray-700">{totalRoomsSummary}</strong>
                          </span>
                          {estimatedAreaSummary > 0 && (
                            <span>
                              Est. area:{' '}
                              <strong className="text-gray-700">
                                {estimatedAreaSummary.toFixed(0)} sqm
                              </strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {(state.structureData.rooms?.filter((r) => r.isCustomType) ?? []).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between px-4 py-3 border border-dashed border-gray-300 rounded-xl bg-gray-50"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-700">{r.customTypeLabel}</p>
                          <p className="text-xs text-gray-400">
                            {r.count} room{r.count !== 1 ? 's' : ''}
                            {r.avgSizeSqm ? ` · avg ${r.avgSizeSqm} sqm` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'REMOVE_ROOM', payload: r.id })}
                          className="p-1.5 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {!showCustomRoom ? (
                      <button
                        type="button"
                        onClick={() => setShowCustomRoom(true)}
                        className="flex items-center gap-1.5 text-sm text-iitbhu hover:underline"
                      >
                        <Plus className="w-4 h-4" />
                        Add a custom room type
                      </button>
                    ) : (
                      <div className="border border-dashed border-blue-300 rounded-xl p-4 bg-blue-50 space-y-3">
                        <p className="text-sm font-semibold text-gray-700">Custom room type</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="col-span-2">
                            <Input
                              label="Room type label"
                              placeholder="e.g. 3D printing lab"
                              value={customRoomForm.label}
                              onChange={(e) =>
                                setCustomRoomForm((f) => ({ ...f, label: e.target.value }))
                              }
                            />
                          </div>
                          <Input
                            label="Count"
                            type="number"
                            min={1}
                            value={customRoomForm.count}
                            onChange={(e) =>
                              setCustomRoomForm((f) => ({
                                ...f,
                                count: Number(e.target.value) || 1,
                              }))
                            }
                          />
                          <Input
                            label="Avg size (sqm)"
                            type="number"
                            min={0}
                            value={customRoomForm.avgSizeSqm || ''}
                            onChange={(e) =>
                              setCustomRoomForm((f) => ({
                                ...f,
                                avgSizeSqm: Number(e.target.value) || 0,
                              }))
                            }
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!customRoomForm.label.trim()}
                            onClick={() => {
                              dispatch({
                                type: 'ADD_ROOM',
                                payload: {
                                  id: crypto.randomUUID(),
                                  type: 'CUSTOM',
                                  isCustomType: true,
                                  customTypeLabel: customRoomForm.label.trim(),
                                  count: customRoomForm.count,
                                  avgSizeSqm: customRoomForm.avgSizeSqm || undefined,
                                },
                              });
                              setCustomRoomForm({ label: '', count: 1, avgSizeSqm: 0, notes: '' });
                              setShowCustomRoom(false);
                            }}
                          >
                            Add room type
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowCustomRoom(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Room by room mode */}
                {state.entryMode === EntryMode.ROOM_LEVEL && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">
                        Fill area, usage and furniture per room type below.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowTemplates(!showTemplates)}
                        className="text-sm text-iitbhu hover:underline flex items-center gap-1 shrink-0 ml-3"
                      >
                        Use template{' '}
                        <ChevronRight
                          className={cn(
                            'w-3.5 h-3.5 transition-transform',
                            showTemplates && 'rotate-90'
                          )}
                        />
                      </button>
                    </div>
                    {showTemplates && (
                      <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                        {Object.entries(BUILDING_TEMPLATES).map(([key, tpl]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const existing =
                                state.structureData.rooms
                                  ?.filter((r) => !r.isCustomType)
                                  .map((r) => r.id) ?? [];
                              existing.forEach((id) =>
                                dispatch({ type: 'REMOVE_ROOM', payload: id })
                              );
                              tpl.roomDistribution.forEach(({ type, count }) => {
                                const tmpl = ROOM_TEMPLATES[type];
                                dispatch({
                                  type: 'ADD_ROOM',
                                  payload: {
                                    id: crypto.randomUUID(),
                                    type,
                                    isCustomType: false,
                                    count,
                                    avgSizeSqm: tmpl?.avgSizeSqm,
                                    usageHoursPerDay: tmpl?.usageHoursPerDay,
                                    furnitureDensity: 'medium',
                                  },
                                });
                              });
                              setShowTemplates(false);
                            }}
                            className="p-3 rounded-xl border border-gray-200 bg-white hover:border-iitbhu hover:bg-blue-50 text-left transition-all"
                          >
                            <p className="text-sm font-medium text-gray-800">{tpl.label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {tpl.roomDistribution.reduce((s, r) => s + r.count, 0)} rooms ·{' '}
                              {tpl.roomDistribution.length} types
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                    {(state.structureData.rooms?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Room dimensions & usage
                        </p>
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                                  Room type
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 w-20">
                                  Count
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 w-28">
                                  Avg area (sqm)
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 w-28">
                                  Usage (h/day)
                                </th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 w-24">
                                  Est. area
                                </th>
                                <th className="w-10" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {state.structureData.rooms?.map((room) => {
                                const label = room.isCustomType
                                  ? room.customTypeLabel
                                  : (ROOM_TYPE_CATALOG.find((r) => r.key === room.type)?.label ??
                                    room.type);
                                const estArea = (room.count ?? 0) * (room.avgSizeSqm ?? 0);
                                return (
                                  <tr key={room.id} className="hover:bg-gray-50/50">
                                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                                      {label}
                                    </td>
                                    <td className="px-3 py-3">
                                      <input
                                        type="number"
                                        min={1}
                                        value={room.count}
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_ROOM',
                                            payload: {
                                              id: room.id,
                                              updates: { count: Number(e.target.value) || 1 },
                                            },
                                          })
                                        }
                                        className="w-16 text-center rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-iitbhu"
                                      />
                                    </td>
                                    <td className="px-3 py-3">
                                      <input
                                        type="number"
                                        min={0}
                                        value={room.avgSizeSqm ?? ''}
                                        placeholder="—"
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_ROOM',
                                            payload: {
                                              id: room.id,
                                              updates: {
                                                avgSizeSqm: e.target.value
                                                  ? Number(e.target.value)
                                                  : undefined,
                                              },
                                            },
                                          })
                                        }
                                        className="w-20 text-center rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-iitbhu"
                                      />
                                    </td>
                                    <td className="px-3 py-3">
                                      <input
                                        type="number"
                                        min={0}
                                        max={24}
                                        step={0.5}
                                        value={room.usageHoursPerDay ?? ''}
                                        placeholder="—"
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_ROOM',
                                            payload: {
                                              id: room.id,
                                              updates: {
                                                usageHoursPerDay: e.target.value
                                                  ? Number(e.target.value)
                                                  : undefined,
                                              },
                                            },
                                          })
                                        }
                                        className="w-20 text-center rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-iitbhu"
                                      />
                                    </td>
                                    <td className="px-3 py-3 text-right text-xs text-gray-500 whitespace-nowrap">
                                      {estArea > 0 ? `${estArea.toFixed(0)} sqm` : '—'}
                                    </td>
                                    <td className="px-2 py-3">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          dispatch({ type: 'REMOVE_ROOM', payload: room.id })
                                        }
                                        className="p-1 text-gray-300 hover:text-red-500"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {totalRoomsSummary > 0 && (
                          <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 flex gap-4">
                            <span>
                              Total rooms:{' '}
                              <strong className="text-gray-700">{totalRoomsSummary}</strong>
                            </span>
                            {estimatedAreaSummary > 0 && (
                              <span>
                                Total area:{' '}
                                <strong className="text-gray-700">
                                  {estimatedAreaSummary.toFixed(0)} sqm
                                </strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {!showAddRoom ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddRoom(true)}
                        className="gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add room type
                      </Button>
                    ) : (
                      <div className="border border-dashed border-blue-300 rounded-xl p-4 bg-blue-50 space-y-3">
                        <p className="text-sm font-semibold text-gray-700">Add room type</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <FieldGroup label="Room type">
                            <select
                              value={newRoomIsCustom ? '__custom__' : newRoomType}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__custom__') {
                                  setNewRoomIsCustom(true);
                                  setNewRoomType('CUSTOM');
                                } else {
                                  setNewRoomIsCustom(false);
                                  setNewRoomType(val);
                                }
                              }}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
                            >
                              <option value="">Select room type…</option>
                              {ROOM_TYPE_CATALOG.map((rt) => (
                                <option key={rt.key} value={rt.key}>
                                  {rt.label}
                                </option>
                              ))}
                              <option value="__custom__">Custom…</option>
                            </select>
                          </FieldGroup>
                          {newRoomIsCustom && (
                            <FieldGroup label="Custom label">
                              <Input
                                placeholder="e.g. Isotope facility"
                                value={newRoomCustomLabel}
                                onChange={(e) => setNewRoomCustomLabel(e.target.value)}
                              />
                            </FieldGroup>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={
                              !newRoomType || (newRoomIsCustom && !newRoomCustomLabel.trim())
                            }
                            onClick={() => {
                              const tmpl = ROOM_TEMPLATES[newRoomType];
                              dispatch({
                                type: 'ADD_ROOM',
                                payload: {
                                  id: crypto.randomUUID(),
                                  type: newRoomType,
                                  isCustomType: newRoomIsCustom,
                                  customTypeLabel: newRoomIsCustom
                                    ? newRoomCustomLabel.trim()
                                    : undefined,
                                  count: 1,
                                  avgSizeSqm: tmpl?.avgSizeSqm,
                                  usageHoursPerDay: tmpl?.usageHoursPerDay,
                                  furnitureDensity: 'medium',
                                },
                              });
                              setNewRoomType('');
                              setNewRoomIsCustom(false);
                              setNewRoomCustomLabel('');
                              setShowAddRoom(false);
                            }}
                          >
                            Add row
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setShowAddRoom(false);
                              setNewRoomType('');
                              setNewRoomIsCustom(false);
                              setNewRoomCustomLabel('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ═══════════════════════════════════════ PART 2C: ROOF */}
            <SectionCard id="roof">
              <SectionHeader title="Roof construction" />
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="sm:col-span-2">
                    <FieldGroup label="Materials used in roof">
                      <textarea
                        rows={2}
                        maxLength={300}
                        placeholder="e.g. RCC slab with brick coba and China mosaic, flat RCC with bituminous waterproofing membrane"
                        value={state.roofData.roofMaterials ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_ROOF',
                            payload: { roofMaterials: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu resize-none"
                      />
                    </FieldGroup>
                  </div>
                  <FieldGroup
                    label="Roof thickness"
                    hint="Total roof assembly thickness. Typical: 120–200 mm for RCC slab."
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={1000}
                        value={state.roofData.roofThicknessMm ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_ROOF',
                            payload: {
                              roofThicknessMm: e.target.value ? Number(e.target.value) : undefined,
                            },
                          })
                        }
                      />
                      <span className="text-xs text-gray-400 shrink-0">mm</span>
                    </div>
                  </FieldGroup>
                </div>
              </div>
            </SectionCard>

            {/* ═══════════════════════════════════════ PART 2D: OPENINGS */}
            <SectionCard id="openings">
              <SectionHeader
                title="Doors, windows & openings"
                subtitle={
                  state.entryMode === EntryMode.ROOM_LEVEL
                    ? 'Specify openings per room type — counts are per individual room.'
                    : 'Enter combined totals for the whole building. All fields are optional.'
                }
              />

              {/* Mode indicator */}
              <div className="px-6 pt-4">
                <div
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border',
                    state.entryMode === EntryMode.ROOM_LEVEL
                      ? 'bg-blue-50 text-iitbhu border-blue-100'
                      : 'bg-gray-50 text-gray-600 border-gray-200'
                  )}
                >
                  {state.entryMode === EntryMode.ROOM_LEVEL ? (
                    <>
                      <Grid className="w-3 h-3" />
                      &nbsp;Room by room
                    </>
                  ) : (
                    <>
                      <Layers className="w-3 h-3" />
                      &nbsp;Building total
                    </>
                  )}
                  <span className="text-gray-400 ml-1">— governed by Rooms &amp; structure</span>
                </div>
              </div>

              <div className="p-6 space-y-3">
                {state.entryMode === EntryMode.ROOM_LEVEL ? (
                  /* ── ROOM-BY-ROOM MODE ─────────────────────────────────── */
                  (state.structureData.rooms?.length ?? 0) === 0 ? (
                    <div className="flex items-start gap-3 px-4 py-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">No rooms defined yet</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          Add room types in the{' '}
                          <button
                            type="button"
                            onClick={() => scrollToSection('structure')}
                            className="underline font-medium"
                          >
                            Rooms &amp; structure
                          </button>{' '}
                          section, then return here to enter openings per room type.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Grand total summary chips */}
                      {(() => {
                        const totals: Record<string, number> = {};
                        state.structureData.rooms?.forEach((room) => {
                          getRoomOpenings(room.id).forEach((el) => {
                            if ((el.count ?? 0) > 0) {
                              const k = ELEMENT_LABELS[el.elementType] ?? el.elementType;
                              totals[k] = (totals[k] ?? 0) + el.count! * (room.count ?? 1);
                            }
                          });
                        });
                        const entries = Object.entries(totals);
                        if (entries.length === 0) return null;
                        return (
                          <div className="flex flex-wrap items-center gap-2 pb-1">
                            <span className="text-xs font-medium text-gray-500">
                              Building totals:
                            </span>
                            {entries.map(([label, count]) => (
                              <span
                                key={label}
                                className="text-xs bg-blue-50 text-iitbhu border border-blue-100 px-2 py-0.5 rounded-full"
                              >
                                {count} {label.toLowerCase()}
                                {count !== 1 ? 's' : ''}
                              </span>
                            ))}
                          </div>
                        );
                      })()}

                      {/* One card per room type */}
                      {state.structureData.rooms?.map((room) => {
                        const roomLabel = room.isCustomType
                          ? room.customTypeLabel || room.type
                          : ROOM_TYPE_CATALOG.find((r) => r.key === room.type)?.label || room.type;
                        const roomOpenings = getRoomOpenings(room.id);
                        const isExpanded = expandedRoomOpenings.has(room.id);
                        const hasData = roomOpenings.some((e) => (e.count ?? 0) > 0);

                        return (
                          <div
                            key={room.id}
                            className="border border-gray-200 rounded-xl overflow-hidden"
                          >
                            {/* Row header */}
                            <button
                              type="button"
                              onClick={() => toggleRoomCard(room.id)}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-sm font-semibold text-gray-800">
                                  {roomLabel}
                                </span>
                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">
                                  × {room.count} room{(room.count ?? 1) !== 1 ? 's' : ''}
                                </span>
                                {hasData && (
                                  <span className="text-xs text-gray-400 truncate hidden sm:block">
                                    {roomOpenings
                                      .filter((e) => (e.count ?? 0) > 0)
                                      .map(
                                        (e) =>
                                          `${e.count} ${ELEMENT_LABELS[e.elementType]?.toLowerCase() ?? e.elementType}/room`
                                      )
                                      .join(' · ')}
                                  </span>
                                )}
                              </div>
                              <ChevronDown
                                className={cn(
                                  'w-4 h-4 text-gray-400 shrink-0 transition-transform',
                                  isExpanded && 'rotate-180'
                                )}
                              />
                            </button>

                            {isExpanded && (
                              <div className="border-t border-gray-100 px-4 pb-5 pt-4 space-y-4">
                                {/* Opening type grid */}
                                <div className="overflow-x-auto -mx-1">
                                  <table className="w-full text-sm min-w-[420px]">
                                    <thead>
                                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                                        <th className="text-left font-medium pb-2 pr-4 w-40">
                                          Opening type
                                        </th>
                                        <th className="text-left font-medium pb-2 pr-3">
                                          Count / room
                                        </th>
                                        <th className="text-left font-medium pb-2 pr-3">
                                          Width (ft)
                                        </th>
                                        <th className="text-left font-medium pb-2">Height (ft)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {DEFAULT_OPENING_ELEMENTS.map((def) => {
                                        const el = roomOpenings.find((e) => e.id === def.id) ?? def;
                                        return (
                                          <tr key={def.id}>
                                            <td className="py-2 pr-4 text-gray-700 font-medium">
                                              {ELEMENT_LABELS[def.elementType]}
                                            </td>
                                            <td className="py-2 pr-3">
                                              <Input
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                value={el.count ?? ''}
                                                onChange={(e) =>
                                                  updateRoomOpening(room.id, def.id, {
                                                    count: e.target.value
                                                      ? Number(e.target.value)
                                                      : undefined,
                                                  })
                                                }
                                              />
                                            </td>
                                            <td className="py-2 pr-3">
                                              <Input
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                step={0.1}
                                                value={el.widthFt ?? ''}
                                                onChange={(e) =>
                                                  updateRoomOpening(room.id, def.id, {
                                                    widthFt: e.target.value
                                                      ? Number(e.target.value)
                                                      : undefined,
                                                  })
                                                }
                                              />
                                            </td>
                                            <td className="py-2">
                                              <Input
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                step={0.1}
                                                value={el.heightFt ?? ''}
                                                onChange={(e) =>
                                                  updateRoomOpening(room.id, def.id, {
                                                    heightFt: e.target.value
                                                      ? Number(e.target.value)
                                                      : undefined,
                                                  })
                                                }
                                              />
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Shared material fields for this room type */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-gray-50">
                                  <FieldGroup label="Frame material">
                                    <Input
                                      placeholder="Aluminium, uPVC, Wood…"
                                      value={
                                        roomOpenings.find((e) => e.id === 'standard-window')
                                          ?.frameMaterial ?? ''
                                      }
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateRoomOpeningsBulk(room.id, (el) =>
                                          el.elementType !== 'sunshade_chajja'
                                            ? { ...el, frameMaterial: val }
                                            : el
                                        );
                                      }}
                                    />
                                  </FieldGroup>
                                  <FieldGroup label="Glass type">
                                    <Input
                                      placeholder="Single-pane, Double-pane, Tinted…"
                                      value={
                                        roomOpenings.find((e) => e.id === 'standard-window')
                                          ?.glassType ?? ''
                                      }
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateRoomOpeningsBulk(room.id, (el) =>
                                          el.elementType !== 'door' &&
                                          el.elementType !== 'sunshade_chajja'
                                            ? { ...el, glassType: val }
                                            : el
                                        );
                                      }}
                                    />
                                  </FieldGroup>
                                </div>

                                {/* Total across all rooms of this type */}
                                {(room.count ?? 1) > 1 &&
                                  roomOpenings.some((e) => (e.count ?? 0) > 0) && (
                                    <p className="text-xs text-gray-400">
                                      <span className="font-medium text-gray-500">
                                        Total across all {room.count} {roomLabel.toLowerCase()}{' '}
                                        rooms:{' '}
                                      </span>
                                      {roomOpenings
                                        .filter((e) => (e.count ?? 0) > 0)
                                        .map((e, i) => (
                                          <span key={e.id}>
                                            {i > 0 ? ', ' : ''}
                                            {e.count! * (room.count ?? 1)}{' '}
                                            {ELEMENT_LABELS[e.elementType]?.toLowerCase() ??
                                              e.elementType}
                                            s
                                          </span>
                                        ))}
                                    </p>
                                  )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )
                ) : (
                  /* ── BUILDING-TOTAL MODE ──────────────────────────────── */
                  <>
                    {state.openingsData.elements.map((el) => {
                      const isStandard = DEFAULT_OPENING_ELEMENTS.some((d) => d.id === el.id);
                      const isExpanded = expandedOpenings.has(el.id);
                      const dimStr =
                        el.widthFt && el.heightFt
                          ? `${el.widthFt}×${el.heightFt} ft`
                          : el.dimensionsWxHFt || '—';
                      const typeLabel =
                        el.elementType === 'custom'
                          ? el.customElementLabel || 'Custom'
                          : ELEMENT_LABELS[el.elementType];

                      return (
                        <div
                          key={el.id}
                          className="border border-gray-200 rounded-xl overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedOpenings((prev) => {
                                const next = new Set(prev);
                                isExpanded ? next.delete(el.id) : next.add(el.id);
                                return next;
                              })
                            }
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-sm font-semibold text-gray-800 shrink-0">
                                {typeLabel}
                              </span>
                              {(el.count ?? 0) > 0 && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                                  Count: {el.count}
                                </span>
                              )}
                              {dimStr !== '—' && (
                                <span className="text-xs text-gray-400 shrink-0">{dimStr}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {!isStandard && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeCustomOpening(el.id);
                                  }}
                                  className="p-1 text-gray-300 hover:text-red-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <ChevronDown
                                className={cn(
                                  'w-4 h-4 text-gray-400 transition-transform',
                                  isExpanded && 'rotate-180'
                                )}
                              />
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-4">
                              {el.elementType === 'custom' && (
                                <FieldGroup label="Element type label">
                                  <Input
                                    placeholder="e.g. Skylight, Ventilation louvers"
                                    value={el.customElementLabel ?? ''}
                                    onChange={(e) =>
                                      updateOpening(el.id, { customElementLabel: e.target.value })
                                    }
                                  />
                                </FieldGroup>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <FieldGroup label="Count (how many in this building)">
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    value={el.count ?? ''}
                                    onChange={(e) =>
                                      updateOpening(el.id, {
                                        count: e.target.value ? Number(e.target.value) : undefined,
                                      })
                                    }
                                  />
                                </FieldGroup>
                                <FieldGroup label="Width (ft)">
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    step={0.1}
                                    value={el.widthFt ?? ''}
                                    onChange={(e) => {
                                      const w = e.target.value ? Number(e.target.value) : undefined;
                                      updateOpening(el.id, {
                                        widthFt: w,
                                        dimensionsWxHFt: `${w ?? ''}×${el.heightFt ?? ''}`,
                                      });
                                    }}
                                  />
                                </FieldGroup>
                                <FieldGroup label="Height (ft)">
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    step={0.1}
                                    value={el.heightFt ?? ''}
                                    onChange={(e) => {
                                      const h = e.target.value ? Number(e.target.value) : undefined;
                                      updateOpening(el.id, {
                                        heightFt: h,
                                        dimensionsWxHFt: `${el.widthFt ?? ''}×${h ?? ''}`,
                                      });
                                    }}
                                  />
                                </FieldGroup>
                                {el.elementType !== 'sunshade_chajja' && (
                                  <FieldGroup label="Frame material">
                                    <Input
                                      placeholder="Aluminium, uPVC, Wood, Steel…"
                                      value={el.frameMaterial ?? ''}
                                      onChange={(e) =>
                                        updateOpening(el.id, { frameMaterial: e.target.value })
                                      }
                                    />
                                  </FieldGroup>
                                )}
                                {el.elementType !== 'door' &&
                                  el.elementType !== 'sunshade_chajja' && (
                                    <FieldGroup label="Glass type">
                                      <Input
                                        placeholder="Single-pane, Double-pane, Tinted, N/A"
                                        value={el.glassType ?? ''}
                                        onChange={(e) =>
                                          updateOpening(el.id, { glassType: e.target.value })
                                        }
                                      />
                                    </FieldGroup>
                                  )}
                                <FieldGroup label="Surface finish">
                                  <Input
                                    placeholder="Paint, Polish, Anodised, Powder-coated…"
                                    value={el.surfaceFinish ?? ''}
                                    onChange={(e) =>
                                      updateOpening(el.id, { surfaceFinish: e.target.value })
                                    }
                                  />
                                </FieldGroup>
                                <div className="sm:col-span-3">
                                  <FieldGroup label="Remarks">
                                    <Input
                                      maxLength={200}
                                      placeholder="Any additional notes"
                                      value={el.remarks ?? ''}
                                      onChange={(e) =>
                                        updateOpening(el.id, { remarks: e.target.value })
                                      }
                                    />
                                  </FieldGroup>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={addCustomOpening}
                      className="flex items-center gap-1.5 text-sm text-iitbhu hover:underline mt-2"
                    >
                      <Plus className="w-4 h-4" /> Add custom opening type
                    </button>
                  </>
                )}
              </div>
            </SectionCard>

            {/* ═══════════════════════════════════════ PART 2E: CONSTRUCTION */}
            <SectionCard id="construction">
              <SectionHeader title="Construction type & practices" />
              <div className="p-6 space-y-6">
                <FieldGroup label="Type of construction">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(
                      [
                        [
                          'load_bearing',
                          'Load bearing',
                          'Brick/stone walls carry the structural load',
                        ],
                        [
                          'rcc',
                          'RCC (Reinforced Concrete)',
                          'Columns, beams and slabs form the structural frame',
                        ],
                        ['steel_frame', 'Steel frame', 'Steel columns and beams with infill walls'],
                        ['other', 'Other', 'Traditional, composite or non-standard construction'],
                      ] as const
                    ).map(([val, label, desc]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: 'UPDATE_CONSTRUCTION',
                            payload: { constructionType: val },
                          })
                        }
                        className={cn(
                          'p-4 rounded-xl border-2 text-left transition-all',
                          state.constructionData.constructionType === val
                            ? 'border-iitbhu bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{label}</span>
                          {state.constructionData.constructionType === val && (
                            <CheckCircle2 className="w-4 h-4 text-iitbhu ml-auto shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                      </button>
                    ))}
                  </div>
                  {state.constructionData.constructionType === 'other' && (
                    <div className="mt-3">
                      <Input
                        placeholder="Specify construction type"
                        value={state.constructionData.constructionTypeOther ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_CONSTRUCTION',
                            payload: { constructionTypeOther: e.target.value },
                          })
                        }
                      />
                    </div>
                  )}
                </FieldGroup>

                <div className="flex items-center justify-between py-3 px-4 border border-gray-200 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Local construction practices followed?
                    </p>
                    <p className="text-xs text-gray-400">
                      Were traditional or locally-specific construction methods used?
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'UPDATE_CONSTRUCTION',
                        payload: {
                          localConstructionPractices:
                            !state.constructionData.localConstructionPractices,
                        },
                      })
                    }
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors',
                      state.constructionData.localConstructionPractices
                        ? 'bg-iitbhu'
                        : 'bg-gray-200'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        state.constructionData.localConstructionPractices ? 'left-6' : 'left-1'
                      )}
                    />
                  </button>
                </div>

                {state.constructionData.localConstructionPractices && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Percentage of local materials:{' '}
                      <span className="text-iitbhu font-bold">
                        {state.constructionData.localMaterialsPercent ?? 0}%
                      </span>
                    </label>
                    <p className="text-xs text-gray-400">
                      {state.constructionData.localMaterialsPercent ?? 0}% of materials were sourced
                      locally (within 50 km)
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={state.constructionData.localMaterialsPercent ?? 0}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_CONSTRUCTION',
                          payload: { localMaterialsPercent: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-iitbhu"
                    />
                  </div>
                )}

                <FieldGroup
                  label="Source distance of construction materials"
                  hint="Helps calculate transport emissions. List key materials and approximate distance from site."
                >
                  <textarea
                    rows={2}
                    maxLength={300}
                    placeholder="e.g. Cement from Satna (250 km), bricks from local kiln (15 km), steel from Raipur (450 km)"
                    value={state.constructionData.materialSourceDistance ?? ''}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_CONSTRUCTION',
                        payload: { materialSourceDistance: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu resize-none"
                  />
                </FieldGroup>

                <FieldGroup
                  label="Insulation material"
                  hint="Thermal insulation in walls/roof. Leave blank if none used."
                >
                  <Input
                    placeholder="Expanded polystyrene (EPS), mineral wool, none…"
                    value={state.constructionData.insulationMaterial ?? ''}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_CONSTRUCTION',
                        payload: { insulationMaterial: e.target.value },
                      })
                    }
                  />
                </FieldGroup>
              </div>
            </SectionCard>

            {/* ════════════════════════════════════════ PART 2F: MATERIALS */}
            <SectionCard id="materials">
              <SectionHeader title="Materials & furniture" />
              <div className="p-6 space-y-6">
                {/* Room by room mode: per-room furniture */}
                {state.entryMode === EntryMode.ROOM_LEVEL && (
                  <div className="space-y-5">
                    {(state.structureData.rooms?.length ?? 0) === 0 ? (
                      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
                        <Info className="w-4 h-4 shrink-0" />
                        Add rooms in the section above to enter per-room furniture data.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500">
                          Select a density preset to auto-fill estimated kg values, or enter them
                          manually.
                        </p>
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                                  Room type
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600">
                                  Density → auto-fill
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 w-24">
                                  Wood (kg)
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 w-24">
                                  Steel (kg)
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 w-24">
                                  Plastic (kg)
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 w-24">
                                  Glass (kg)
                                </th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 w-24">
                                  Total (kg)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {state.structureData.rooms?.map((room) => {
                                const label = room.isCustomType
                                  ? room.customTypeLabel
                                  : (ROOM_TYPE_CATALOG.find((r) => r.key === room.type)?.label ??
                                    room.type);
                                const totalKg =
                                  (room.woodenFurnitureKg ?? 0) +
                                  (room.steelFurnitureKg ?? 0) +
                                  (room.plasticKg ?? 0) +
                                  (room.glassKg ?? 0);
                                const canAutoFill = !!(room.avgSizeSqm && room.avgSizeSqm > 0);
                                return (
                                  <tr key={room.id} className="hover:bg-gray-50/50">
                                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                                      <p>{label}</p>
                                      <p className="text-xs text-gray-400 font-normal">
                                        ×{room.count}
                                        {room.avgSizeSqm ? `, ${room.avgSizeSqm} sqm ea` : ''}
                                      </p>
                                    </td>
                                    <td className="px-3 py-3">
                                      <div className="flex flex-col items-center gap-1">
                                        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                                          {DENSITY_OPTIONS.map((d) => (
                                            <button
                                              key={d.value}
                                              type="button"
                                              title={
                                                canAutoFill
                                                  ? `Auto-fill from ${d.label.toLowerCase()} density`
                                                  : 'Enter avg area first'
                                              }
                                              onClick={() => applyDensityToRoom(room.id, d.value)}
                                              className={cn(
                                                'px-2.5 py-1 text-xs font-medium transition-colors',
                                                room.furnitureDensity === d.value
                                                  ? 'bg-iitbhu text-white'
                                                  : 'bg-white text-gray-600 hover:bg-gray-50'
                                              )}
                                            >
                                              {d.label}
                                            </button>
                                          ))}
                                        </div>
                                        {!canAutoFill && (
                                          <span className="text-xs text-amber-500">
                                            Enter area first
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    {(
                                      [
                                        'woodenFurnitureKg',
                                        'steelFurnitureKg',
                                        'plasticKg',
                                        'glassKg',
                                      ] as const
                                    ).map((field) => (
                                      <td key={field} className="px-3 py-3">
                                        <input
                                          type="number"
                                          min={0}
                                          value={room[field] ?? ''}
                                          placeholder="0"
                                          onChange={(e) =>
                                            dispatch({
                                              type: 'UPDATE_ROOM',
                                              payload: {
                                                id: room.id,
                                                updates: {
                                                  [field]: e.target.value
                                                    ? Number(e.target.value)
                                                    : undefined,
                                                },
                                              },
                                            })
                                          }
                                          className="w-20 text-center rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-iitbhu"
                                        />
                                      </td>
                                    ))}
                                    <td className="px-3 py-3 text-right text-xs font-medium text-gray-600 whitespace-nowrap">
                                      {totalKg > 0 ? `${totalKg.toLocaleString()} kg` : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            {totalFurnitureSummary.wood +
                              totalFurnitureSummary.steel +
                              totalFurnitureSummary.plastic +
                              totalFurnitureSummary.glass >
                              0 && (
                              <tfoot>
                                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-xs text-gray-700">
                                  <td className="px-4 py-3">Total</td>
                                  <td />
                                  <td className="px-3 py-3 text-center">
                                    {totalFurnitureSummary.wood.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {totalFurnitureSummary.steel.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {totalFurnitureSummary.plastic.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {totalFurnitureSummary.glass.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-3 text-right">
                                    {(
                                      totalFurnitureSummary.wood +
                                      totalFurnitureSummary.steel +
                                      totalFurnitureSummary.plastic +
                                      totalFurnitureSummary.glass
                                    ).toLocaleString()}{' '}
                                    kg
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Building total mode */}
                {state.entryMode === EntryMode.CUMULATIVE && (
                  <div className="space-y-5">
                    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                      {(
                        [
                          { value: 'bulk', label: 'Quick estimate' },
                          { value: 'detailed', label: 'Detailed entry' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: 'UPDATE_MATERIALS',
                              payload: { estimationMode: opt.value },
                            })
                          }
                          className={cn(
                            'px-5 py-2 text-sm font-medium transition-colors',
                            state.materialsData.estimationMode === opt.value
                              ? 'bg-iitbhu text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {state.materialsData.estimationMode === 'bulk' && (
                      <div className="space-y-5">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-3">
                            Furniture density
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {BULK_DENSITY_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  dispatch({
                                    type: 'UPDATE_MATERIALS',
                                    payload: { furnitureDensity: opt.value },
                                  })
                                }
                                className={cn(
                                  'p-4 rounded-xl border-2 text-left transition-all',
                                  state.materialsData.furnitureDensity === opt.value
                                    ? 'border-iitbhu bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                )}
                              >
                                <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                        {estimatedFurnitureTonnes && (
                          <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                            <p className="text-sm text-green-800">
                              Estimated total:{' '}
                              <span className="font-bold">~{estimatedFurnitureTonnes} tonnes</span>{' '}
                              of furniture
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-3">
                            Material mix{' '}
                            <span className="font-normal text-gray-400">
                              (preset by building type)
                            </span>
                          </p>
                          <div className="space-y-2">
                            {(
                              [
                                { key: 'wood', label: 'Wood', color: 'bg-amber-400' },
                                { key: 'steel', label: 'Steel', color: 'bg-slate-400' },
                                { key: 'plastic', label: 'Plastic', color: 'bg-blue-300' },
                                { key: 'glass', label: 'Glass', color: 'bg-cyan-300' },
                              ] as const
                            ).map(({ key, label, color }) => (
                              <div key={key} className="flex items-center gap-3">
                                <span className="text-xs text-gray-500 w-12 text-right">
                                  {label}
                                </span>
                                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-full transition-all', color)}
                                    style={{ width: `${materialMix[key]}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500 w-8">
                                  {materialMix[key]}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {state.materialsData.estimationMode === 'detailed' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <FieldGroup label="Wooden furniture (kg)" hint="1 desk ≈ 20 kg">
                          <Input
                            type="number"
                            min={0}
                            value={state.materialsData.woodenFurnitureKg ?? ''}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_MATERIALS',
                                payload: {
                                  woodenFurnitureKg: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                },
                              })
                            }
                          />
                        </FieldGroup>
                        <FieldGroup label="Steel furniture (kg)" hint="1 almirah ≈ 40 kg">
                          <Input
                            type="number"
                            min={0}
                            value={state.materialsData.steelFurnitureKg ?? ''}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_MATERIALS',
                                payload: {
                                  steelFurnitureKg: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                },
                              })
                            }
                          />
                        </FieldGroup>
                        <FieldGroup label="Plastic items (kg)">
                          <Input
                            type="number"
                            min={0}
                            value={state.materialsData.plasticKg ?? ''}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_MATERIALS',
                                payload: {
                                  plasticKg: e.target.value ? Number(e.target.value) : undefined,
                                },
                              })
                            }
                          />
                        </FieldGroup>
                        <FieldGroup label="Glass (kg)" hint="Include glass partitions if known">
                          <Input
                            type="number"
                            min={0}
                            value={state.materialsData.glassKg ?? ''}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_MATERIALS',
                                payload: {
                                  glassKg: e.target.value ? Number(e.target.value) : undefined,
                                },
                              })
                            }
                          />
                        </FieldGroup>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Extended Materials Accordion ──────────────────────── */}
                <div className="pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowExtendedMaterials((v) => !v)}
                    className="flex items-center gap-2 w-full text-left"
                  >
                    {showExtendedMaterials ? (
                      <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-gray-700">
                      Extended structural materials
                    </span>
                    <span className="ml-auto text-xs text-gray-400">Annexure 8 — optional</span>
                  </button>

                  {showExtendedMaterials && (
                    <div className="mt-4 space-y-6">
                      {/* Info banner */}
                      <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                        <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                        <span>
                          Enter known quantities to improve accuracy. Fields left blank use a
                          built-in structural bulk estimate instead. Emission factors are sourced
                          from Annexure 8 (MoEFCC).
                        </span>
                      </div>

                      {/* Group 1: Concrete & Masonry */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                          Concrete &amp; Masonry
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FieldGroup
                            label="PCC concrete (m³)"
                            hint="Plain cement concrete — slabs, footings"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.concretePCC_m3 ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    concretePCC_m3: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="RCC concrete (m³)"
                            hint="Reinforced cement concrete — columns, beams"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.concreteRCC_m3 ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    concreteRCC_m3: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Rebar / TMT steel (kg)"
                            hint="Reinforcement bars embedded in concrete"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.rebar_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    rebar_kg: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup label="Brick masonry (kg)" hint="~2.5 kg per standard brick">
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.brickMasonry_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    brickMasonry_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Stone masonry (kg)"
                            hint="Granite, sandstone, or rubble masonry"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.stoneMasonry_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    stoneMasonry_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Kota stone (kg)"
                            hint="Used for flooring in IIT BHU buildings"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.kotaStone_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    kotaStone_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                        </div>
                      </div>

                      {/* Group 2: Metals */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                          Metals
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FieldGroup
                            label="Steel frame (kg)"
                            hint="Structural steel sections (H/I beams)"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.steelFrame_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    steelFrame_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Steel sections (kg)"
                            hint="Angles, channels, hollow sections"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.steelSection_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    steelSection_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Aluminium (kg)"
                            hint="Window frames, cladding, façade panels"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.aluminum_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    aluminum_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                        </div>
                      </div>

                      {/* Group 3: Finishes & Cladding */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                          Finishes &amp; Cladding
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FieldGroup label="Ceramic tiles (kg)" hint="Floor and wall tiles">
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.ceramicTile_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    ceramicTile_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Plaster (kg)"
                            hint="Internal and external wall plaster"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.plaster_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    plaster_kg: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup label="Paint (m²)" hint="Total painted surface area">
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.paint_m2 ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    paint_m2: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Wood framing (kg)"
                            hint="Timber door/window frames, joinery"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.woodFrame_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    woodFrame_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Plywood (kg)"
                            hint="Carbon-storing — reduces embodied total"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.plywood_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    plywood_kg: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup label="uPVC (kg)" hint="uPVC door/window profiles">
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.upvc_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    upvc_kg: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                        </div>
                      </div>

                      {/* Group 4: Insulation & Panels */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                          Insulation &amp; Panels
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FieldGroup
                            label="CGI sheet (kg)"
                            hint="Corrugated galvanised iron — roofing"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.cgiSheet_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    cgiSheet_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Gypsum board (kg)"
                            hint="False ceilings, partition walls"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.gypsum_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    gypsum_kg: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Asbestos sheet (m²)"
                            hint="Legacy roofing — high EF (16.31 kgCO₂e/m²)"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.asbestos_m2 ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    asbestos_m2: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="Particle board (kg)"
                            hint="Carbon-storing — reduces embodied total"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.particleBoard_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    particleBoard_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                          <FieldGroup
                            label="PUF panel (kg)"
                            hint="Polyurethane foam insulation panels"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={state.materialsData.puffPanel_kg ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MATERIALS',
                                  payload: {
                                    puffPanel_kg: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                          </FieldGroup>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom materials */}
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Custom materials</p>
                  {(state.materialsData.customMaterials?.length ?? 0) > 0 && (
                    <div className="space-y-2 mb-3">
                      {state.materialsData.customMaterials?.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl bg-white"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-700">{m.label}</p>
                            <p className="text-xs text-gray-400">
                              {m.value} kg{m.notes ? ` · ${m.notes}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              dispatch({ type: 'REMOVE_CUSTOM_MATERIAL', payload: m.id })
                            }
                            className="p-1.5 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!showCustomMaterial ? (
                    <button
                      type="button"
                      onClick={() => setShowCustomMaterial(true)}
                      className="flex items-center gap-1.5 text-sm text-iitbhu hover:underline"
                    >
                      <Plus className="w-4 h-4" />
                      Add custom material
                    </button>
                  ) : (
                    <div className="border border-dashed border-blue-300 rounded-xl p-4 bg-blue-50 space-y-3">
                      <p className="text-sm font-semibold text-gray-700">Custom material</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <Input
                            label="Material name"
                            placeholder="e.g. Reinforced concrete partition walls"
                            value={customMaterialForm.label}
                            onChange={(e) =>
                              setCustomMaterialForm((f) => ({ ...f, label: e.target.value }))
                            }
                          />
                        </div>
                        <Input
                          label="Quantity (kg)"
                          type="number"
                          min={0}
                          value={customMaterialForm.value || ''}
                          onChange={(e) =>
                            setCustomMaterialForm((f) => ({
                              ...f,
                              value: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <Input
                        label="Notes (optional)"
                        placeholder="Any context about this material"
                        value={customMaterialForm.notes}
                        onChange={(e) =>
                          setCustomMaterialForm((f) => ({ ...f, notes: e.target.value }))
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!customMaterialForm.label.trim()}
                          onClick={() => {
                            dispatch({
                              type: 'ADD_CUSTOM_MATERIAL',
                              payload: {
                                id: crypto.randomUUID(),
                                label: customMaterialForm.label.trim(),
                                value: customMaterialForm.value,
                                unit: 'kg',
                                notes: customMaterialForm.notes || undefined,
                              },
                            });
                            setCustomMaterialForm({ label: '', value: 0, notes: '' });
                            setShowCustomMaterial(false);
                          }}
                        >
                          Add material
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowCustomMaterial(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* ═══════════════════════════════════════ PART 2G: SUSTAINABILITY */}
            <SectionCard id="sustainability">
              <SectionHeader title="Sustainability & material reuse" />
              <div className="p-6 space-y-5">
                <FieldGroup
                  label="Usage of scrap / recycled materials"
                  hint="Describe any recycled or scrap materials incorporated in the building's construction"
                >
                  <textarea
                    rows={2}
                    maxLength={300}
                    placeholder="e.g. recycled steel reinforcement, crushed concrete aggregate, reclaimed timber"
                    value={state.constructionData.scrapMaterialsUsed ?? ''}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_CONSTRUCTION',
                        payload: { scrapMaterialsUsed: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu resize-none"
                  />
                </FieldGroup>
                <FieldGroup
                  label="Reuse policy"
                  hint="Any formal or informal policy for reusing materials during construction or renovation"
                >
                  <textarea
                    rows={2}
                    maxLength={300}
                    placeholder="e.g. salvaged doors and window frames from demolished building, none"
                    value={state.constructionData.reusePolicy ?? ''}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_CONSTRUCTION',
                        payload: { reusePolicy: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu resize-none"
                  />
                </FieldGroup>
              </div>
            </SectionCard>
          </main>
        </div>
      </div>

      {/* ── MOBILE BOTTOM BAR ──────────────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ProgressRing pct={completenessScore} />
          <p className="text-xs text-gray-500 truncate">{saveStatus}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={!state.isDirty}
          isLoading={state.isSaving}
          onClick={() => saveRef.current?.()}
          className="gap-1.5 border border-gray-200 shrink-0"
        >
          <Save className="w-4 h-4" /> Save
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={isSubmitting}
          onClick={handleSubmitClick}
          className="gap-1.5 shrink-0"
        >
          <Send className="w-4 h-4" /> Submit
        </Button>
      </div>

      {/* ── VALIDATION MODAL ───────────────────────────────────────────────── */}
      <Modal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        title="Review before submitting"
        size="md"
      >
        <div className="space-y-4">
          {(state.validationResult?.warnings?.length ?? 0) > 0 ? (
            <>
              <p className="text-sm text-gray-600">
                The following issues were found. You can submit anyway or go back and fix them.
              </p>
              <div className="space-y-2">
                {state.validationResult?.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">{w}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="text-sm text-green-800 font-medium">
                All checks passed. Ready to submit.
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              variant="primary"
              fullWidth
              isLoading={isSubmitting}
              onClick={handleConfirmSubmit}
            >
              Submit anyway
            </Button>
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setShowValidationModal(false)}
              className="border border-gray-200"
            >
              Go back and fix
            </Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
}
