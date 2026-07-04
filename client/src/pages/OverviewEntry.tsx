import { useEffect, useReducer, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Lock,
  Info,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Save,
  Send,
  Clock,
} from 'lucide-react';
import { BuildingType } from '@shared/types/building.types';
import { IBuildingOverview } from '@shared/types/submission.types';
import { UserRole } from '@shared/types/user.types';
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

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const HOURS_PRESETS = [
  { label: '8h (standard)', value: 8 },
  { label: '10h (extended)', value: 10 },
  { label: '18h (early–late)', value: 18 },
  { label: '24h (hostel)', value: 24 },
];

const USAGE_DEFAULTS: Record<string, Partial<IBuildingOverview>> = {
  academic: {
    operatingHoursPerDay: 10,
    operatingDaysPerWeek: 6,
    peakMonths: ['Jan', 'Feb', 'Mar', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
    acUsageMonths: ['Apr', 'May', 'Jun', 'Jul'],
    occupancyDuringBreaks: 'partial',
  },
  hostel: {
    operatingHoursPerDay: 24,
    operatingDaysPerWeek: 7,
    peakMonths: ['Jan', 'Feb', 'Mar', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    acUsageMonths: ['Apr', 'May', 'Jun', 'Jul'],
    occupancyDuringBreaks: 'normal',
  },
  lab: {
    operatingHoursPerDay: 12,
    operatingDaysPerWeek: 6,
    peakMonths: ['Jan', 'Feb', 'Mar', 'Aug', 'Sep', 'Oct', 'Nov'],
    acUsageMonths: ['Apr', 'May', 'Jun', 'Jul'],
    occupancyDuringBreaks: 'partial',
  },
  administrative: {
    operatingHoursPerDay: 8,
    operatingDaysPerWeek: 5,
    peakMonths: ['Jan', 'Feb', 'Mar', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
    acUsageMonths: ['Apr', 'May', 'Jun'],
    occupancyDuringBreaks: 'closed',
  },
  residential: {
    operatingHoursPerDay: 24,
    operatingDaysPerWeek: 7,
    peakMonths: ['Jan', 'Feb', 'Mar', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    acUsageMonths: ['Apr', 'May', 'Jun', 'Jul'],
    occupancyDuringBreaks: 'normal',
  },
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

const SECTION_IDS = ['overview', 'usage', 'environment', 'landuse'] as const;
type SectionId = (typeof SECTION_IDS)[number];

const SECTION_LABELS: Record<SectionId, string> = {
  overview: 'Building overview',
  usage: 'Usage & operation',
  environment: 'Environmental design',
  landuse: 'Land use',
};

// ── State ─────────────────────────────────────────────────────────────────────

interface OverviewState {
  submissionId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  data: Partial<IBuildingOverview>;
  activeSection: SectionId;
  validationResult: { warnings: string[]; completenessScore: number } | null;
}

type OverviewAction =
  | { type: 'SET_SUBMISSION_ID'; payload: string }
  | { type: 'HYDRATE'; payload: Partial<IBuildingOverview> }
  | { type: 'SET_DATA'; payload: Partial<IBuildingOverview> }
  | { type: 'SET_ACTIVE_SECTION'; payload: SectionId }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_LAST_SAVED'; payload: Date }
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'SET_VALIDATION_RESULT'; payload: OverviewState['validationResult'] };

const initialState: OverviewState = {
  submissionId: null,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  data: {},
  activeSection: 'overview',
  validationResult: null,
};

function overviewReducer(state: OverviewState, action: OverviewAction): OverviewState {
  switch (action.type) {
    case 'SET_SUBMISSION_ID':
      return { ...state, submissionId: action.payload };
    case 'HYDRATE':
      return { ...state, data: { ...state.data, ...action.payload }, isDirty: false };
    case 'SET_DATA':
      return { ...state, data: { ...state.data, ...action.payload }, isDirty: true };
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
    default:
      return state;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
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
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span className="absolute text-xs font-semibold text-gray-200">{pct}%</span>
    </div>
  );
}

function MonthChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (months: string[]) => void;
}) {
  const toggle = (m: string) =>
    onChange(selected.includes(m) ? selected.filter((x) => x !== m) : [...selected, m]);
  return (
    <div className="flex flex-wrap gap-2">
      {MONTHS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => toggle(m)}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
            selected.includes(m)
              ? 'bg-iitbhu text-white'
              : 'bg-white/10 text-gray-300 hover:bg-gray-200'
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function SectionCard({ id, children }: { id: SectionId; children: React.ReactNode }) {
  return (
    <div id={id} className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-sm">
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
    <div className="px-6 py-5 border-b border-white/5 bg-white/5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {locked && (
          <div className="relative group">
            <Lock className="w-3.5 h-3.5 text-gray-400" />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 text-xs bg-gray-900 text-white rounded-lg px-3 py-2 hidden group-hover:block z-10 pointer-events-none">
              This information is permanent and will be locked after approval. Changes require admin
              unlock.
            </div>
          </div>
        )}
      </div>
      {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
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
      <label className="block text-sm font-medium text-gray-200">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function calcCompleteness(data: Partial<IBuildingOverview>): number {
  let score = 0;
  if ((data.numberOfFloors ?? 0) > 0) score += 25;
  if (data.totalFloorArea) score += 25;
  if (data.operatingHoursPerDay && data.operatingDaysPerWeek) score += 25;
  if ((data.peakMonths?.length ?? 0) > 0) score += 25;
  return score;
}

function formatSaveStatus(lastSavedAt: Date | null, isSaving: boolean, isDirty: boolean): string {
  if (isSaving) return 'Saving…';
  if (!lastSavedAt) return isDirty ? 'Unsaved changes' : 'Not yet saved';
  const secs = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
  if (secs < 30) return 'Just saved';
  if (secs < 60) return `Saved ${secs}s ago`;
  return `Saved ${Math.floor(secs / 60)}m ago`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OverviewEntry() {
  const { id: buildingId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { showSuccess, showError, showWarning } = useToast();

  const [state, dispatch] = useReducer(overviewReducer, initialState);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [areaUnknown, setAreaUnknown] = useState(false);

  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    overview: null,
    usage: null,
    environment: null,
    landuse: null,
  });

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

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!building || !user) return;
    const isAssigned = building.assignedMembers.some((m) => m._id === user._id);
    const isPrivileged = user.role === UserRole.REVIEWER || user.role === UserRole.ADMIN;
    if (!isAssigned && !isPrivileged) {
      showWarning('You are not assigned to this building');
      navigate(`/buildings/${buildingId}`, { replace: true });
    }
  }, [building, user, buildingId, navigate, showWarning]);

  // ── Load draft on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!buildingId) return;
    async function loadDraft() {
      try {
        const res = await submissionsApi.getOrCreateDraft(buildingId!, 'overview');
        const sub = res?.data?.data;
        if (sub?._id) dispatch({ type: 'SET_SUBMISSION_ID', payload: sub._id });
        const draftData = sub?.data ?? {};
        if (Object.keys(draftData).length > 0) {
          dispatch({ type: 'HYDRATE', payload: draftData as Partial<IBuildingOverview> });
        }
      } catch (err) {
        console.error('Failed to load overview draft:', err);
      }
    }
    loadDraft();
  }, [buildingId]);

  // ── Apply building seed defaults ────────────────────────────────────────────
  useEffect(() => {
    if (!building) return;
    const typeDefaults = USAGE_DEFAULTS[building.type] ?? {};
    dispatch({
      type: 'SET_DATA',
      payload: {
        buildingName: building.name,
        buildingType: building.type,
        numberOfFloors: building.floors,
        ...(building.totalArea ? { totalFloorArea: building.totalArea } : {}),
        ...(building.yearBuilt ? { yearOfConstruction: building.yearBuilt } : {}),
        ...(!state.data.operatingHoursPerDay ? typeDefaults : {}),
      },
    });
    dispatch({ type: 'SET_DIRTY', payload: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building]);

  // ── Scroll-spy ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            dispatch({ type: 'SET_ACTIVE_SECTION', payload: entry.target.id as SectionId });
          }
        });
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        sectionRefs.current[id] = el;
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, [buildingLoading]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const saveRef = useRef<() => Promise<void>>();

  const save = useCallback(async () => {
    if (!state.submissionId) return;
    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      await submissionsApi.updateDraft(state.submissionId, state.data as Record<string, unknown>);
      dispatch({ type: 'SET_LAST_SAVED', payload: new Date() });
    } catch {
      // silent fail for auto-save
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
    setIsValidating(true);
    try {
      const res = await submissionsApi.validate(state.submissionId);
      const result = res?.data?.data as { warnings: string[]; completenessScore: number };
      dispatch({ type: 'SET_VALIDATION_RESULT', payload: result });
      if (result.completenessScore < 20) {
        showError('Please fill in at least basic building information before submitting.');
        return;
      }
      setShowValidationModal(true);
    } catch {
      showError('Validation failed. Please try again.');
    } finally {
      setIsValidating(false);
    }
  }

  async function handleConfirmSubmit() {
    if (!state.submissionId) return;
    setIsSubmitting(true);
    try {
      await submissionsApi.submit(state.submissionId);
      setShowValidationModal(false);
      showSuccess('Building overview submitted for review.');
      navigate(`/buildings/${buildingId}`);
    } catch {
      showError('Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function scrollToSection(id: SectionId) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const completeness = calcCompleteness(state.data);
  const saveStatus = formatSaveStatus(state.lastSavedAt, state.isSaving, state.isDirty);
  const isEmpty = !state.data.numberOfFloors && !state.data.operatingHoursPerDay;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (buildingLoading) {
    return (
      <PageWrapper title="Building Overview">
        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8">
          <div className="w-72 shrink-0 space-y-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <div className="flex-1 space-y-6">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <PageWrapper title={`Overview — ${building?.name ?? 'Building'}`}>
      <div className="bg-white/5 min-h-[calc(100vh-4rem)]">
        <div className="max-w-7xl mx-auto px-4 py-8 lg:flex lg:gap-8">
          {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
          <aside className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-20 space-y-4">
              {/* Identity card */}
              <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-sm">
                <p className="text-sm font-semibold text-white truncate">
                  {building?.name ?? '—'}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="info" label="Building overview" />
                  {building?.type && (
                    <Badge
                      variant="building-type"
                      buildingType={building.type}
                      label={BUILDING_TYPE_LABELS[building.type] ?? building.type}
                    />
                  )}
                </div>
              </div>

              {/* Table of contents */}
              <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Contents
                  </p>
                </div>
                <nav className="p-2">
                  {SECTION_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => scrollToSection(id)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                        state.activeSection === id
                          ? 'bg-blue-50 text-iitbhu font-medium'
                          : 'text-gray-300 hover:bg-white/5'
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          'w-3 h-3 transition-transform',
                          state.activeSection === id ? 'text-iitbhu' : 'text-gray-300'
                        )}
                      />
                      {SECTION_LABELS[id]}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Progress */}
              <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <ProgressRing pct={completeness} />
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Completeness</p>
                    <p className="text-sm font-semibold text-gray-200">{completeness}% done</p>
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

              {/* Actions */}
              <div className="space-y-2">
                <div className="group relative">
                  <Button
                    variant="primary"
                    fullWidth
                    disabled={isEmpty || isValidating}
                    isLoading={isValidating}
                    onClick={handleSubmitClick}
                    className="gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Submit for review
                  </Button>
                  {isEmpty && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 text-xs bg-gray-900 text-white rounded-lg px-3 py-2 hidden group-hover:block z-10 pointer-events-none text-center">
                      Fill at least basic information to submit
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  fullWidth
                  disabled={!state.isDirty}
                  isLoading={state.isSaving}
                  onClick={() => saveRef.current?.()}
                  className="gap-2 border border-white/10"
                >
                  <Save className="w-4 h-4" />
                  Save as draft
                </Button>
              </div>
            </div>
          </aside>

          {/* ── MAIN CONTENT ────────────────────────────────────────────── */}
          <main className="flex-1 min-w-0 space-y-6 pb-24 lg:pb-8">
            {/* ════════════════════════════════════════════════════════════ */}
            {/* SECTION 1: BUILDING OVERVIEW                                */}
            {/* ════════════════════════════════════════════════════════════ */}
            <SectionCard id="overview">
              <SectionHeader
                title="Building overview"
                subtitle="Static building information — locked after admin approval."
                locked
              />
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FieldGroup label="Building name">
                    <div className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-sm bg-white/5 text-gray-400">
                      {state.data.buildingName ?? '—'}
                    </div>
                  </FieldGroup>

                  <FieldGroup label="Building type">
                    <div className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-sm bg-white/5 text-gray-400">
                      {BUILDING_TYPE_LABELS[state.data.buildingType ?? ''] ??
                        state.data.buildingType ??
                        '—'}
                    </div>
                  </FieldGroup>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FieldGroup
                    label={
                      areaUnknown ? 'Total floor area (sqm) — estimated' : 'Total floor area (sqm)'
                    }
                    hint="Check architectural drawings or the estate office"
                  >
                    {!areaUnknown ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          placeholder="e.g. 2400"
                          value={state.data.totalFloorArea ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'SET_DATA',
                              payload: {
                                totalFloorArea: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setAreaUnknown(true)}
                          className="shrink-0 text-xs text-iitbhu hover:underline whitespace-nowrap"
                        >
                          Don't know
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-xs text-amber-700 flex-1">
                          Will be estimated from room counts
                        </span>
                        <button
                          type="button"
                          onClick={() => setAreaUnknown(false)}
                          className="text-xs text-iitbhu hover:underline"
                        >
                          Enter value
                        </button>
                      </div>
                    )}
                  </FieldGroup>

                  <FieldGroup label="Number of floors *">
                    <Input
                      type="number"
                      min={1}
                      value={state.data.numberOfFloors ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: { numberOfFloors: Number(e.target.value) || 1 },
                        })
                      }
                    />
                  </FieldGroup>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FieldGroup label="Year of construction">
                    <Input
                      type="number"
                      min={1900}
                      max={2025}
                      placeholder="e.g. 1985"
                      value={state.data.yearOfConstruction ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: {
                            yearOfConstruction: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </FieldGroup>
                </div>

                <FieldGroup label="Primary purpose">
                  <div className="relative">
                    <textarea
                      rows={3}
                      maxLength={200}
                      placeholder="Describe the main activities in this building…"
                      value={state.data.primaryPurpose ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: { primaryPurpose: e.target.value || undefined },
                        })
                      }
                      className="w-full rounded-lg border border-white/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu focus:border-transparent resize-none"
                    />
                    <span className="absolute bottom-2 right-3 text-xs text-gray-400">
                      {(state.data.primaryPurpose ?? '').length}/200
                    </span>
                  </div>
                </FieldGroup>
              </div>
            </SectionCard>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* SECTION 2: USAGE & OPERATION                                */}
            {/* ════════════════════════════════════════════════════════════ */}
            <SectionCard id="usage">
              <SectionHeader
                title="Usage & operation patterns"
                subtitle="This helps us accurately calculate energy and waste carbon based on how the building is actually used throughout the year."
              />
              <div className="p-6 space-y-6">
                {/* Operating hours slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-200">
                      Operating hours per day
                    </label>
                    <span className="text-lg font-semibold text-iitbhu">
                      {state.data.operatingHoursPerDay ?? 10}h/day
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={0.5}
                    value={state.data.operatingHoursPerDay ?? 10}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_DATA',
                        payload: { operatingHoursPerDay: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-iitbhu"
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {HOURS_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() =>
                          dispatch({ type: 'SET_DATA', payload: { operatingHoursPerDay: p.value } })
                        }
                        className={cn(
                          'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                          state.data.operatingHoursPerDay === p.value
                            ? 'bg-iitbhu border-iitbhu text-white'
                            : 'border-white/10 text-gray-300 hover:border-iitbhu hover:text-iitbhu'
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Operating days */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Operating days per week
                  </label>
                  <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                    {[5, 6, 7].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          dispatch({ type: 'SET_DATA', payload: { operatingDaysPerWeek: d } })
                        }
                        className={cn(
                          'px-5 py-2 text-sm font-medium transition-colors',
                          state.data.operatingDaysPerWeek === d
                            ? 'bg-iitbhu text-white'
                            : 'bg-black/40 backdrop-blur-md text-gray-300 hover:bg-white/5'
                        )}
                      >
                        {d} days
                      </button>
                    ))}
                  </div>
                </div>

                {/* Peak months */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Which months is this building most active?
                  </label>
                  <MonthChips
                    selected={state.data.peakMonths ?? []}
                    onChange={(months) =>
                      dispatch({ type: 'SET_DATA', payload: { peakMonths: months } })
                    }
                  />
                </div>

                {/* AC / cooling months */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Which months does the building use heating or cooling equipment?
                  </label>
                  <MonthChips
                    selected={state.data.acUsageMonths ?? []}
                    onChange={(months) =>
                      dispatch({ type: 'SET_DATA', payload: { acUsageMonths: months } })
                    }
                  />
                </div>

                {/* Average occupants */}
                <FieldGroup
                  label="Average daily occupants"
                  hint="Includes students, staff and visitors. Used to estimate waste generation."
                >
                  <div className="w-full sm:w-48">
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g. 500"
                      value={state.data.averageDailyOccupants ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: {
                            averageDailyOccupants: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </FieldGroup>

                {/* Occupancy during breaks */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-3">
                    Occupancy during semester breaks
                  </label>
                  {building?.type === BuildingType.HOSTEL ? (
                    <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                      <Info className="w-4 h-4 shrink-0" />
                      Hostels operate year-round — occupancy during breaks is locked to Normal.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(
                        [
                          {
                            value: 'closed',
                            label: 'Fully closed',
                            desc: 'Building is empty during breaks',
                          },
                          {
                            value: 'partial',
                            label: 'Partial (20%)',
                            desc: 'Skeleton staff and security only',
                          },
                          { value: 'normal', label: 'Normal', desc: 'Building operates as usual' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: 'SET_DATA',
                              payload: { occupancyDuringBreaks: opt.value },
                            })
                          }
                          className={cn(
                            'p-4 rounded-xl border-2 text-left transition-all',
                            state.data.occupancyDuringBreaks === opt.value
                              ? 'border-iitbhu bg-blue-50'
                              : 'border-white/10 hover:border-white/20'
                          )}
                        >
                          <p className="text-sm font-semibold text-gray-100">{opt.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* SECTION 3: ENVIRONMENTAL DESIGN                             */}
            {/* ════════════════════════════════════════════════════════════ */}
            <SectionCard id="environment">
              <SectionHeader
                title="Environmental design"
                subtitle="Ventilation strategy, building permanence, orientation, and area in research format."
              />
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Ventilation type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-3">
                      Ventilation type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { value: 'natural', label: 'Natural', desc: 'Windows & vents only' },
                          { value: 'mechanical', label: 'Mechanical', desc: 'Fans, AHUs, ducting' },
                          { value: 'mixed', label: 'Mixed', desc: 'Both natural & mechanical' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'SET_DATA', payload: { ventilationType: opt.value } })
                          }
                          className={cn(
                            'p-3 rounded-xl border-2 text-left transition-all',
                            state.data.ventilationType === opt.value
                              ? 'border-iitbhu bg-blue-50'
                              : 'border-white/10 hover:border-white/20'
                          )}
                        >
                          <p className="text-sm font-semibold text-gray-100">{opt.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Building nature */}
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-3">
                      Building nature
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          {
                            value: 'permanent',
                            label: 'Permanent',
                            desc: 'Constructed to last >25 years',
                          },
                          {
                            value: 'temporary',
                            label: 'Temporary',
                            desc: 'Prefab, portable, or short-term',
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'SET_DATA', payload: { buildingNature: opt.value } })
                          }
                          className={cn(
                            'p-3 rounded-xl border-2 text-left transition-all',
                            state.data.buildingNature === opt.value
                              ? 'border-iitbhu bg-blue-50'
                              : 'border-white/10 hover:border-white/20'
                          )}
                        >
                          <p className="text-sm font-semibold text-gray-100">{opt.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Area in sq ft */}
                <FieldGroup
                  label="Floor area (sq ft)"
                  hint="Research / measurement format — leave blank if you already entered sq m above."
                >
                  <div className="w-full sm:w-48">
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g. 25833"
                      value={state.data.areaOfOneBuildingSqFt ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: {
                            areaOfOneBuildingSqFt: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </FieldGroup>

                {/* Orientation */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Building orientation (% of facade facing each direction)
                  </label>
                  <p className="text-xs text-gray-400 mb-3">
                    Approximate percentages — the four values should add up to 100%.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(
                      [
                        { field: 'orientationNorthPct', label: 'North (%)' },
                        { field: 'orientationEastPct', label: 'East (%)' },
                        { field: 'orientationSouthPct', label: 'South (%)' },
                        { field: 'orientationWestPct', label: 'West (%)' },
                      ] as const
                    ).map(({ field, label }) => (
                      <FieldGroup key={field} label={label}>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="0–100"
                          value={state.data[field] ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'SET_DATA',
                              payload: {
                                [field]: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                        />
                      </FieldGroup>
                    ))}
                  </div>
                  {/* Live sum warning */}
                  {(() => {
                    const sum =
                      (state.data.orientationNorthPct ?? 0) +
                      (state.data.orientationEastPct ?? 0) +
                      (state.data.orientationSouthPct ?? 0) +
                      (state.data.orientationWestPct ?? 0);
                    if (sum > 0 && sum !== 100) {
                      return (
                        <p className="text-xs text-amber-600 mt-2">
                          Current total: {sum}% — should be 100%.
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </SectionCard>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* SECTION 4: LAND USE                                         */}
            {/* ════════════════════════════════════════════════════════════ */}
            <SectionCard id="landuse">
              <SectionHeader
                title="Land use"
                subtitle="Campus area breakdown around this building — used to estimate permeable/impermeable surface ratios."
              />
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FieldGroup label="Open play area" hint="Sports fields, playgrounds (acres)">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="e.g. 1.5"
                      value={state.data.landUseOpenPlayAreaAcres ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: {
                            landUseOpenPlayAreaAcres: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          },
                        })
                      }
                    />
                  </FieldGroup>

                  <FieldGroup label="Green / permeable" hint="Lawns, gardens, open soil (acres)">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="e.g. 2.0"
                      value={state.data.landUseGreenPermeableAcres ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: {
                            landUseGreenPermeableAcres: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          },
                        })
                      }
                    />
                  </FieldGroup>

                  <FieldGroup label="Paved" hint="Roads, footpaths, parking (acres)">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="e.g. 0.8"
                      value={state.data.landUsePavedAcres ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: {
                            landUsePavedAcres: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </FieldGroup>

                  <FieldGroup
                    label="Covered / built-up"
                    hint="Building footprint + roofed structures (acres)"
                  >
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="e.g. 0.4"
                      value={state.data.landUseCoveredBuiltUpAcres ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: {
                            landUseCoveredBuiltUpAcres: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          },
                        })
                      }
                    />
                  </FieldGroup>
                </div>

                {/* Custom land-use categories */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-200">
                      Additional categories
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'SET_DATA',
                          payload: {
                            landUseCustomCategories: [
                              ...(state.data.landUseCustomCategories ?? []),
                              { categoryName: '', areaAcres: 0 },
                            ],
                          },
                        })
                      }
                      className="text-xs text-iitbhu hover:underline"
                    >
                      + Add category
                    </button>
                  </div>
                  {(state.data.landUseCustomCategories ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400">
                      No additional categories — add one if your land use doesn't fit the standard
                      groups above.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {(state.data.landUseCustomCategories ?? []).map((cat, idx) => (
                        <div key={idx} className="flex items-end gap-3">
                          <FieldGroup label={idx === 0 ? 'Category name' : ''}>
                            <input
                              type="text"
                              placeholder="e.g. Water body"
                              value={cat.categoryName}
                              onChange={(e) => {
                                const updated = [...(state.data.landUseCustomCategories ?? [])];
                                updated[idx] = { ...updated[idx], categoryName: e.target.value };
                                dispatch({
                                  type: 'SET_DATA',
                                  payload: { landUseCustomCategories: updated },
                                });
                              }}
                              className="w-full rounded-lg border border-white/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu focus:border-transparent"
                            />
                          </FieldGroup>
                          <FieldGroup label={idx === 0 ? 'Area (acres)' : ''}>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              placeholder="0.0"
                              value={cat.areaAcres || ''}
                              onChange={(e) => {
                                const updated = [...(state.data.landUseCustomCategories ?? [])];
                                updated[idx] = {
                                  ...updated[idx],
                                  areaAcres: Number(e.target.value) || 0,
                                };
                                dispatch({
                                  type: 'SET_DATA',
                                  payload: { landUseCustomCategories: updated },
                                });
                              }}
                            />
                          </FieldGroup>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (state.data.landUseCustomCategories ?? []).filter(
                                (_, i) => i !== idx
                              );
                              dispatch({
                                type: 'SET_DATA',
                                payload: { landUseCustomCategories: updated },
                              });
                            }}
                            className="mb-0.5 text-sm text-red-400 hover:text-red-600 shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </main>
        </div>
      </div>

      {/* ── MOBILE BOTTOM BAR ──────────────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-black/40 backdrop-blur-md border-t border-white/10 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ProgressRing pct={completeness} />
          <div className="min-w-0">
            <p className="text-xs text-gray-400 truncate">{saveStatus}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={!state.isDirty}
          isLoading={state.isSaving}
          onClick={() => saveRef.current?.()}
          className="gap-1.5 border border-white/10 shrink-0"
        >
          <Save className="w-4 h-4" />
          Save
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={isEmpty || isValidating}
          isLoading={isValidating}
          onClick={handleSubmitClick}
          className="gap-1.5 shrink-0"
        >
          <Send className="w-4 h-4" />
          Submit
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
              <p className="text-sm text-gray-300">
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
              className="border border-white/10"
            >
              Go back and fix
            </Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
}
