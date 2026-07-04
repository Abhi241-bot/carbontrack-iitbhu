import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, BarChart2, RefreshCw, ClipboardList, AlertTriangle } from 'lucide-react';
import { CivilRenderer } from './renderers/CivilRenderer';
import { ElectricalRenderer } from './renderers/ElectricalRenderer';
import { WasteRenderer } from './renderers/WasteRenderer';
import { buildingsApi } from '@/features/buildings/buildingsApi';
import apiClient from '@/lib/axios';
import { useAuthStore } from '@/features/auth/authStore';
import { useToast } from '@/hooks/useToast';

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionKey = 'overview' | 'civil' | 'electrical' | 'waste';

interface SectionMeta {
  status: string;
  version: number;
  submissionId: string | null;
  submittedBy?: { name?: string; email?: string } | null;
  verifiedAt?: string;
  updatedAt?: string;
  reviewNotes?: string | null;
}

// ── Sub-section nav per main section ─────────────────────────────────────────

const SECTION_NAV: Record<SectionKey, Array<{ id: string; label: string }>> = {
  overview: [{ id: 'overview', label: 'Building overview' }],
  civil: [{ id: 'civil', label: 'Full civil data' }],
  electrical: [
    { id: 'phase1', label: 'Phase 1 — Assets' },
    { id: 'phase2', label: 'Phase 2 — Consumption' },
    { id: 'phase3', label: 'Phase 3 — Renewable' },
    { id: 'phase4', label: 'Phase 4 — Equipment audit' },
    { id: 'phase5', label: 'Phase 5 — Billing analytics' },
    { id: 'phase6', label: 'Phase 6 — Grid EF' },
    { id: 'phase7_8', label: 'Phase 7-8 — SCADA & metering' },
    { id: 'phase9', label: 'Phase 9 — EV & vehicles' },
    { id: 'phase10', label: 'Phase 10 — Refrigerants & fire' },
    { id: 'phase11', label: 'Phase 11 — Scope 3 activities' },
  ],
  waste: [
    { id: 'solid_generation', label: 'Solid waste generation' },
    { id: 'landfill', label: 'Landfill records' },
    { id: 'incineration', label: 'Incineration records' },
    { id: 'msw_plant', label: 'MSW plant (sieve analysis)' },
    { id: 'ww_generation', label: 'Wastewater generation' },
    { id: 'ww_characteristics', label: 'Wastewater characteristics' },
    { id: 'stp_plants', label: 'STP / ETP plants' },
    { id: 'water_demand', label: 'Water demand' },
    { id: 'water_supply', label: 'Water supply & storage' },
    { id: 'wtp', label: 'Water treatment plants' },
    { id: 'ro_plants', label: 'RO plants' },
    { id: 'water_quality', label: 'Water quality' },
  ],
};

const SECTION_LABELS: Record<SectionKey, string> = {
  overview: 'Overview',
  civil: 'Civil',
  electrical: 'Electrical',
  waste: 'Waste',
};

const ALL_SECTIONS: SectionKey[] = ['overview', 'civil', 'electrical', 'waste'];

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    not_started: 'bg-white/10 text-gray-400',
    draft: 'bg-blue-100 text-blue-600',
    submitted: 'bg-amber-100 text-amber-700',
    under_review: 'bg-purple-100 text-purple-700',
    verified: 'bg-green-100 text-green-700',
    revision_requested: 'bg-red-100 text-red-600',
  };
  const labels: Record<string, string> = {
    not_started: 'Not started',
    draft: 'Draft',
    submitted: 'Submitted',
    under_review: 'Under review',
    verified: 'Verified',
    revision_requested: 'Revision requested',
  };
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg[status] ?? cfg.not_started}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ── Section-level empty / pending states ──────────────────────────────────────

function SectionPendingState({ status, section }: { status: string; section: SectionKey }) {
  const label = SECTION_LABELS[section];
  if (status === 'not_started') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <ClipboardList size={36} className="text-gray-200" />
        <p className="text-sm font-medium text-gray-400">Data entry not started</p>
        <p className="text-xs text-gray-400 max-w-xs">
          No data has been submitted for the {label} section of this building yet.
        </p>
      </div>
    );
  }
  if (status === 'draft') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <ClipboardList size={36} className="text-blue-200" />
        <p className="text-sm font-medium text-blue-600">Data entry in progress</p>
        <p className="text-xs text-gray-400 max-w-xs">
          A draft is being filled out for the {label} section but has not been submitted for review
          yet.
        </p>
      </div>
    );
  }
  return null;
}

// ── Raw fetch helper (credentials + bearer) ───────────────────────────────────

const ADMIN_API = `${import.meta.env.VITE_API_URL}/api`;

function adminFetch(path: string, opts: RequestInit = {}) {
  const token = useAuthStore.getState().accessToken;
  return fetch(`${ADMIN_API}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
}

// ── Shared helpers for carbon display ─────────────────────────────────────────

function fmt(v: number | null | undefined): string {
  const n = v ?? 0;
  if (Math.abs(n) >= 1) return n.toFixed(2);
  if (Math.abs(n) > 0) return n.toFixed(3);
  return '0';
}

function pct(v: number, total: number): string {
  if (total <= 0) return '—';
  return ((v / total) * 100).toFixed(1) + '%';
}

function ScopePill({ scope }: { scope: 1 | 2 | 3 }) {
  const cfg: Record<number, string> = {
    1: 'bg-red-50 text-red-700 border border-red-200',
    2: 'bg-amber-50 text-amber-700 border border-amber-200',
    3: 'bg-blue-50 text-blue-700 border border-blue-200',
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${cfg[scope]}`}
    >
      Scope {scope}
    </span>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const cfg =
    score >= 71
      ? { cls: 'bg-green-100 text-green-700', label: 'High confidence' }
      : score >= 41
        ? { cls: 'bg-amber-100 text-amber-700', label: 'Medium confidence' }
        : { cls: 'bg-red-100 text-red-700', label: 'Low confidence' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {cfg.label} ({score}%)
    </span>
  );
}

// ── Carbon breakdown table (Task 3.2) ─────────────────────────────────────────

const BREAKDOWN_ROW_CONFIG: Array<{
  key: string;
  label: string;
  scope: 1 | 2 | 3;
  group: string;
}> = [
  { key: 'gridElectricity', label: 'Grid Electricity', scope: 2, group: 'OPERATIONAL' },
  { key: 'dieselGenerator', label: 'Diesel Generator', scope: 1, group: 'OPERATIONAL' },
  { key: 'lpgCooking', label: 'LPG Cooking Fuel', scope: 1, group: 'OPERATIONAL' },
  { key: 'vehicleFleet', label: 'Vehicle Fleet', scope: 1, group: 'OPERATIONAL' },
  { key: 'refrigerantLeakage', label: 'Refrigerant Leakage', scope: 1, group: 'OPERATIONAL' },
  { key: 'transformerLosses', label: 'Transformer Losses', scope: 2, group: 'OPERATIONAL' },
  { key: 'evCharging', label: 'EV Charging', scope: 2, group: 'OPERATIONAL' },
  { key: 'landfillCH4', label: 'Landfill CH₄', scope: 1, group: 'SOLID WASTE' },
  { key: 'wasteIncineration', label: 'Waste Incineration', scope: 1, group: 'SOLID WASTE' },
  { key: 'mswPlantElectricity', label: 'MSW Plant Electricity', scope: 2, group: 'SOLID WASTE' },
  { key: 'wastewaterCH4', label: 'Wastewater CH₄', scope: 1, group: 'WASTEWATER' },
  { key: 'wastewaterN2O', label: 'Wastewater N₂O', scope: 1, group: 'WASTEWATER' },
  { key: 'stpElectricity', label: 'STP Electricity', scope: 2, group: 'WASTEWATER' },
  { key: 'wtpElectricity', label: 'WTP Electricity', scope: 2, group: 'WASTEWATER' },
  { key: 'roElectricity', label: 'RO Electricity', scope: 2, group: 'WASTEWATER' },
  { key: 'chemicalUsage', label: 'Chemical Usage', scope: 3, group: 'WASTEWATER' },
  { key: 'municipalWaterScope3', label: 'Municipal Water', scope: 3, group: 'WASTEWATER' },
  {
    key: 'embodiedMaterials',
    label: 'Building Materials (embodied)',
    scope: 3,
    group: 'EMBODIED CARBON',
  },
];

const BREAKDOWN_GROUPS = ['OPERATIONAL', 'SOLID WASTE', 'WASTEWATER', 'EMBODIED CARBON'];

function CarbonBreakdownTable({ cr }: { cr: any }) {
  const [matExpanded, setMatExpanded] = useState(false);

  const breakdown = cr.breakdown ?? {};
  const byScope = breakdown.byScope ?? {};
  const byComponent = breakdown.byComponent as Record<string, any> | undefined;

  const scope1 = (byScope.scope1 ?? 0) as number;
  const scope2 = (byScope.scope2 ?? 0) as number;
  const scope3 = (byScope.scope3 ?? 0) as number;
  const grandTotal = scope1 + scope2 + scope3;

  const hasGranular =
    byComponent && BREAKDOWN_ROW_CONFIG.some((r) => ((byComponent[r.key] as number) ?? 0) > 0);

  const materialBreakdown = byComponent?.materialBreakdown as Record<string, number> | undefined;
  const matEntries = materialBreakdown
    ? Object.entries(materialBreakdown)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div className="space-y-4">
      {/* Metadata */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-gray-400">
        {cr.calculatedAt && (
          <span>
            Calculated:{' '}
            <strong className="text-gray-200">
              {new Date(cr.calculatedAt).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </strong>
          </span>
        )}
        {cr.efSnapshot?._snapshotTimestamp && (
          <span>
            EF as of:{' '}
            <strong className="text-gray-200">
              {new Date(cr.efSnapshot._snapshotTimestamp).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </strong>
          </span>
        )}
        {cr.confidenceScore != null && <ConfidenceBadge score={cr.confidenceScore} />}
      </div>

      {/* Grand total callout */}
      <div className="flex items-center gap-3 bg-gray-900 text-white rounded-xl px-4 py-3">
        <BarChart2 size={18} className="text-gray-400 flex-shrink-0" />
        <div className="flex-1">
          <span className="text-xl font-bold">{fmt(grandTotal)}</span>
          <span className="text-gray-300 text-sm ml-1.5">tCO₂e/yr</span>
        </div>
        <span className="text-xs text-gray-400">Annual Footprint</span>
      </div>

      {/* Per-component breakdown */}
      {hasGranular ? (
        <div className="rounded-xl border border-white/5 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-2 bg-white/5 border-b border-white/5 px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            <span className="flex-1">Emission Source</span>
            <div className="w-[76px] text-center">Scope</div>
            <span className="w-20 text-right">tCO₂e/yr</span>
            <span className="w-14 text-right">Share</span>
          </div>

          {BREAKDOWN_GROUPS.map((group) => {
            const rows = BREAKDOWN_ROW_CONFIG.filter(
              (r) => r.group === group && ((byComponent?.[r.key] as number) ?? 0) > 0
            );
            if (!rows.length) return null;
            return (
              <div key={group}>
                <div className="px-3 py-1.5 bg-white/5/60 border-b border-gray-50">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {group}
                  </span>
                </div>
                {rows.map((row) => {
                  const v = (byComponent?.[row.key] as number) ?? 0;
                  const isEmbodied = row.key === 'embodiedMaterials';
                  return (
                    <div key={row.key}>
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 hover:bg-white/5/40">
                        <span className="flex-1 text-xs text-gray-200 flex items-center gap-1">
                          {isEmbodied && matEntries.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setMatExpanded((p) => !p)}
                              className="text-gray-400 hover:text-gray-300 text-[10px] mr-0.5"
                            >
                              {matExpanded ? '▼' : '▶'}
                            </button>
                          )}
                          {row.label}
                        </span>
                        <div className="w-[76px] flex justify-center">
                          <ScopePill scope={row.scope} />
                        </div>
                        <span className="w-20 text-right text-xs font-semibold text-white">
                          {fmt(v)}
                        </span>
                        <span className="w-14 text-right text-xs text-gray-400">
                          {pct(v, grandTotal)}
                        </span>
                      </div>
                      {isEmbodied && matExpanded && matEntries.length > 0 && (
                        <div className="bg-blue-50/20">
                          {matEntries.map(([mat, val]) => (
                            <div
                              key={mat}
                              className="flex items-center gap-2 pl-10 pr-3 py-1.5 border-b border-gray-50"
                            >
                              <span className="flex-1 text-[11px] text-gray-400">
                                ↳{' '}
                                {mat
                                  .replace(/([A-Z])/g, ' $1')
                                  .replace(/^./, (c) => c.toUpperCase())
                                  .trim()}
                              </span>
                              <span className="text-[11px] font-medium text-gray-300 text-right">
                                {fmt(val)} tCO₂e
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Scope + grand totals */}
          <div className="border-t border-white/10 bg-white/5/30">
            {(
              [
                { label: '══ SCOPE 1 TOTAL', val: scope1, cls: 'text-red-700' },
                { label: '══ SCOPE 2 TOTAL', val: scope2, cls: 'text-amber-700' },
                { label: '══ SCOPE 3 TOTAL', val: scope3, cls: 'text-blue-700' },
              ] as const
            )
              .filter((r) => r.val > 0)
              .map(({ label, val, cls }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 px-3 py-2 border-b border-white/5"
                >
                  <span className={`flex-1 text-xs font-bold ${cls}`}>{label}</span>
                  <div className="w-[76px]" />
                  <span className={`w-20 text-right text-xs font-bold ${cls}`}>{fmt(val)}</span>
                  <span className="w-14 text-right text-xs text-gray-400 font-medium">
                    {pct(val, grandTotal)}
                  </span>
                </div>
              ))}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="flex-1 text-xs font-bold text-white">══ GRAND TOTAL</span>
              <div className="w-[76px]" />
              <span className="w-20 text-right text-sm font-bold text-white">
                {fmt(grandTotal)}
              </span>
              <span className="w-14 text-right text-xs font-bold text-gray-200">100%</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-white/5">
            By scope (detailed breakdown not available)
          </div>
          {(
            [
              {
                label: 'Scope 1 — Direct combustion & refrigerants',
                val: scope1,
                cls: 'text-red-600',
              },
              {
                label: 'Scope 2 — Purchased electricity & heat',
                val: scope2,
                cls: 'text-amber-600',
              },
              {
                label: 'Scope 3 — Embodied, commute & waste',
                val: scope3,
                cls: 'text-blue-600',
              },
            ] as const
          )
            .filter((r) => r.val > 0)
            .map(({ label, val, cls }) => (
              <div
                key={label}
                className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0"
              >
                <span className="text-xs text-gray-300">{label}</span>
                <span className={`text-sm font-semibold ${cls}`}>{fmt(val)} tCO₂e/yr</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Carbon impact sub-view ────────────────────────────────────────────────────

function CarbonImpactView({
  cr,
  activeStatus,
  onRecalculate,
  recalcLoading,
  recalcError,
}: {
  cr: any;
  activeStatus: string;
  onRecalculate: () => void;
  recalcLoading: boolean;
  recalcError: string | null;
}) {
  if (!cr) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <BarChart2 size={28} className="text-gray-200" />
          <p className="text-sm font-medium text-gray-300">Carbon results not yet calculated</p>
          <p className="text-xs text-gray-400 max-w-xs">
            Approve this submission to trigger calculation.
          </p>
          {activeStatus === 'verified' && (
            <button
              type="button"
              onClick={onRecalculate}
              disabled={recalcLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={recalcLoading ? 'animate-spin' : ''} />
              {recalcLoading ? 'Calculating…' : 'Recalculate now'}
            </button>
          )}
        </div>
        {recalcError && (
          <p className="text-xs text-red-600 text-center bg-red-50 px-3 py-2 rounded-lg">
            {recalcError}
          </p>
        )}
      </div>
    );
  }

  const snapshotTs = cr.efSnapshot?._snapshotTimestamp as string | undefined;

  return (
    <div className="space-y-5">
      <CarbonBreakdownTable cr={cr} />

      {activeStatus === 'verified' && (
        <div className="border border-amber-100 bg-amber-50/40 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-semibold mb-0.5">Recalculate with latest emission factors</p>
              <p className="text-amber-700">
                This will replace existing carbon results and update the EF snapshot.
              </p>
              {snapshotTs && (
                <p className="text-amber-600 mt-0.5">
                  Current EF snapshot:{' '}
                  {new Date(snapshotTs).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onRecalculate}
            disabled={recalcLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={11} className={recalcLoading ? 'animate-spin' : ''} />
            {recalcLoading ? 'Recalculating…' : 'Recalculate with latest EFs'}
          </button>
          {recalcError && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{recalcError}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface DataReviewPanelProps {
  buildingId: string;
  buildingName: string;
  initialSection?: string;
  onClose: () => void;
  onReviewComplete: () => void;
}

export const DataReviewPanel = ({
  buildingId,
  buildingName,
  initialSection,
  onClose,
  onReviewComplete,
}: DataReviewPanelProps) => {
  // ── Section summary (statuses + submissionIds for all 4 sections) ───────────
  const [sectionSummary, setSectionSummary] = useState<Record<SectionKey, SectionMeta> | null>(
    null
  );
  const [summaryLoading, setSummaryLoading] = useState(true);

  // ── Per-section submission cache ─────────────────────────────────────────────
  const [submissions, setSubmissions] = useState<Partial<Record<SectionKey, any>>>({});
  const [loadingSection, setLoadingSection] = useState<SectionKey | null>(null);

  // ── Active section + sub-section ─────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<SectionKey>(
    (initialSection as SectionKey) ?? 'overview'
  );
  const [activeSubSection, setActiveSubSection] = useState<string>(
    SECTION_NAV[(initialSection as SectionKey) ?? 'overview']?.[0]?.id ?? 'overview'
  );

  // ── View toggle + review state ────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<'data' | 'carbon'>('data');
  const [notes, setNotes] = useState('');
  const [revisionTags, setRevisionTags] = useState<string[]>([]);
  const [reviewMode, setReviewMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [actionLoading, setActionLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);

  const { showSuccess, showError } = useToast();

  // ── Load section summary on mount ────────────────────────────────────────────
  useEffect(() => {
    setSummaryLoading(true);
    buildingsApi
      .getSectionSummary(buildingId)
      .then((r) => {
        const summary = r.data?.data as Record<SectionKey, SectionMeta>;
        setSectionSummary(summary);
        // If initialSection is provided and valid, use it; otherwise fall back to first non-not_started
        const valid = ALL_SECTIONS.includes(initialSection as SectionKey)
          ? (initialSection as SectionKey)
          : (ALL_SECTIONS.find((s) => summary?.[s]?.status !== 'not_started') ?? 'overview');
        setActiveSection(valid);
        setActiveSubSection(SECTION_NAV[valid]?.[0]?.id ?? valid);
      })
      .catch(() => setSectionSummary(null))
      .finally(() => setSummaryLoading(false));
  }, [buildingId, initialSection]);

  // ── Fetch submission for the active section when it changes ──────────────────
  useEffect(() => {
    if (!sectionSummary) return;
    const meta = sectionSummary[activeSection];
    if (!meta?.submissionId) return;
    if (submissions[activeSection]) return; // already cached

    const section = activeSection; // capture for closure
    setLoadingSection(section);
    apiClient
      .get(`/admin/submissions/${meta.submissionId}`)
      .then((r) => {
        const submission = r.data?.data?.submission;
        setSubmissions((prev) => ({ ...prev, [section]: submission ?? null }));
      })
      .catch(() => {
        setSubmissions((prev) => ({ ...prev, [section]: null }));
      })
      .finally(() => setLoadingSection(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, sectionSummary]);

  // ── Reset review + view state when section changes ───────────────────────────
  useEffect(() => {
    setNotes('');
    setRevisionTags([]);
    setReviewMode('idle');
    setActiveView('data');
    setActiveSubSection(SECTION_NAV[activeSection]?.[0]?.id ?? activeSection);
  }, [activeSection]);

  // ── Section switch handler ────────────────────────────────────────────────────
  const switchSection = useCallback((s: SectionKey) => {
    setActiveSection(s);
  }, []);

  // ── Recalculate carbon (raw fetch per spec) ──────────────────────────────────
  const handleRecalculate = async () => {
    const submissionId = sectionSummary?.[activeSection]?.submissionId;
    if (!submissionId) return;

    const snapshotTs = (activeCR?.efSnapshot as any)?._snapshotTimestamp;
    const msg = snapshotTs
      ? `Recalculate with latest emission factors?\n\nThis will replace existing carbon results.\nCurrent EF snapshot: ${new Date(snapshotTs).toLocaleString('en-IN')}`
      : 'Recalculate with latest emission factors?\n\nThis will replace existing carbon results.';
    if (!window.confirm(msg)) return;

    setRecalcLoading(true);
    setRecalcError(null);
    try {
      const res = await adminFetch(`/admin/submissions/${submissionId}/recalculate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const r = await adminFetch(`/admin/submissions/${submissionId}`);
      if (!r.ok) throw new Error(`Fetch error ${r.status}`);
      const json = await r.json();
      setSubmissions((prev) => ({ ...prev, [activeSection]: json?.data?.submission ?? null }));
      showSuccess('Carbon results recalculated with latest emission factors');
    } catch {
      setRecalcError('Recalculation failed. Please try again.');
      showError('Recalculation failed');
    } finally {
      setRecalcLoading(false);
    }
  };

  // ── Approve ──────────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    const submissionId = sectionSummary?.[activeSection]?.submissionId;
    if (!submissionId) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/admin/submissions/${submissionId}/approve`, { notes });
      onReviewComplete();
      onClose();
    } finally {
      setActionLoading(false);
    }
  };

  // ── Request revision ─────────────────────────────────────────────────────────
  const handleRequestRevision = async () => {
    if (!notes.trim()) return;
    const submissionId = sectionSummary?.[activeSection]?.submissionId;
    if (!submissionId) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/admin/submissions/${submissionId}/request-revision`, {
        notes,
        flaggedFields: revisionTags,
      });
      onReviewComplete();
      onClose();
    } finally {
      setActionLoading(false);
    }
  };

  // ── Derived values for active section ────────────────────────────────────────
  const activeMeta = sectionSummary?.[activeSection];
  // undefined = not fetched yet, null = fetch failed, object = loaded
  const activeSubmission = submissions[activeSection];
  const activeStatus = activeMeta?.status ?? 'not_started';
  const activeCR = activeSubmission?.carbonResults;
  const navItems = SECTION_NAV[activeSection];
  const isSubmitted = activeStatus === 'submitted';
  // "loading" covers both: actively fetching, and not-yet-triggered (has submissionId but not fetched)
  const needsFetch =
    !!activeMeta?.submissionId &&
    activeStatus !== 'not_started' &&
    activeStatus !== 'draft' &&
    activeSubmission === undefined;
  const isLoadingData = loadingSection === activeSection || needsFetch;

  // ── Data view content ────────────────────────────────────────────────────────
  function renderDataContent() {
    // Section not started or still a draft with no submission fetched yet
    if (activeStatus === 'not_started' || activeStatus === 'draft') {
      return <SectionPendingState status={activeStatus} section={activeSection} />;
    }

    if (isLoadingData) {
      return (
        <div className="flex items-center justify-center h-40 text-sm text-gray-400">
          Loading {SECTION_LABELS[activeSection]} data…
        </div>
      );
    }

    // null means the fetch ran but failed
    if (activeSubmission === null || activeSubmission === undefined) {
      return (
        <div className="flex items-center justify-center h-40 text-sm text-gray-400">
          Could not load submission data.
        </div>
      );
    }

    const sectionData = activeSubmission.data;

    if (!sectionData || Object.keys(sectionData).length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
          <p className="text-sm text-gray-400">No field data recorded in this submission.</p>
          <p className="text-xs text-gray-300">
            The submission exists but the data payload is empty.
          </p>
        </div>
      );
    }

    if (activeSection === 'overview') {
      const overviewData =
        sectionData?.overview !== undefined ? sectionData : { overview: sectionData };
      return <CivilRenderer data={overviewData} mode="overview" carbonResults={activeCR} />;
    }
    if (activeSection === 'civil') {
      return <CivilRenderer data={sectionData} carbonResults={activeCR} />;
    }
    if (activeSection === 'electrical') {
      const electricalData = sectionData?.electrical ?? sectionData;
      return (
        <ElectricalRenderer
          data={electricalData}
          activePhase={activeSubSection}
          carbonResults={activeCR}
        />
      );
    }
    if (activeSection === 'waste') {
      return (
        <WasteRenderer
          data={sectionData}
          activeSubSection={activeSubSection}
          carbonResults={activeCR}
        />
      );
    }
    return null;
  }

  const showSubNav =
    activeView === 'data' &&
    (activeSection === 'electrical' || activeSection === 'waste') &&
    activeStatus !== 'not_started' &&
    activeStatus !== 'draft';

  const showReviewActions = isSubmitted;
  const showCarbonToggle =
    !!activeMeta?.submissionId && activeStatus !== 'not_started' && activeStatus !== 'draft';

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-4xl bg-black/40 backdrop-blur-md shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200">
        {/* ── HEADER ──────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-white/5 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">{buildingName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Full data review — all sections</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {showCarbonToggle && (
              <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setActiveView('data')}
                  className={`px-3 py-1.5 font-medium transition-colors ${activeView === 'data' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  Data
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('carbon')}
                  className={`px-3 py-1.5 font-medium flex items-center gap-1 transition-colors ${activeView === 'carbon' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <BarChart2 size={11} /> Carbon
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-300 transition-colors p-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── SECTION TABS ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-b border-white/5 bg-black/40 backdrop-blur-md px-5">
          {summaryLoading ? (
            <div className="flex gap-2 py-3">
              {ALL_SECTIONS.map((s) => (
                <div key={s} className="h-8 w-24 bg-white/10 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex gap-1 pt-2">
              {ALL_SECTIONS.map((s) => {
                const meta = sectionSummary?.[s];
                const status = meta?.status ?? 'not_started';
                const isActive = activeSection === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => switchSection(s)}
                    className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px rounded-t-md ${
                      isActive
                        ? 'border-blue-500 text-blue-700 bg-blue-50/50'
                        : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    {SECTION_LABELS[s]}
                    <StatusBadge status={status} />
                    {meta?.version && meta.version > 1 && (
                      <span className="text-xs text-gray-400">v{meta.version}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── SECTION META BAR ──────────────────────────────────────────────────── */}
        {!summaryLoading && activeMeta && (
          <div className="flex-shrink-0 px-5 py-2 bg-white/5/60 border-b border-white/5 flex items-center gap-4 text-xs text-gray-400 flex-wrap">
            {activeMeta.submittedBy?.name && (
              <span>
                Submitted by{' '}
                <strong className="text-gray-200">{activeMeta.submittedBy.name}</strong>
              </span>
            )}
            {activeMeta.updatedAt && (
              <span>
                Last updated{' '}
                <strong className="text-gray-200">
                  {new Date(activeMeta.updatedAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </strong>
              </span>
            )}
            {activeSubmission?.completionScore != null && (
              <span>
                Completeness{' '}
                <strong className="text-gray-200">{activeSubmission.completionScore}%</strong>
              </span>
            )}
            {(activeSubmission?.estimatedFields?.length ?? 0) > 0 && (
              <span className="text-amber-600 font-medium">
                {activeSubmission.estimatedFields.length} estimated field(s)
              </span>
            )}
            {activeMeta.reviewNotes && (
              <span className="text-red-600">Last review note: {activeMeta.reviewNotes}</span>
            )}
          </div>
        )}

        {/* ── BODY: left sub-nav + data area ────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sub-section nav */}
          {showSubNav && (
            <div className="w-52 flex-shrink-0 border-r border-white/5 overflow-y-auto bg-white/5/40 py-3">
              {navItems.map((nav) => (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => setActiveSubSection(nav.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                    activeSubSection === nav.id
                      ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-500'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <ChevronRight
                    size={12}
                    className={activeSubSection === nav.id ? 'text-blue-500' : 'text-gray-300'}
                  />
                  {nav.label}
                </button>
              ))}
            </div>
          )}

          {/* Data / carbon content area */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeView === 'carbon' ? (
              <CarbonImpactView
                cr={activeCR}
                activeStatus={activeStatus}
                onRecalculate={handleRecalculate}
                recalcLoading={recalcLoading}
                recalcError={recalcError}
              />
            ) : (
              renderDataContent()
            )}
          </div>
        </div>

        {/* ── CARBON SUMMARY FOOTER (only when data is present) ──────────────────── */}
        {activeCR && activeView === 'data' && (
          <div className="flex-shrink-0 border-t border-white/5 px-5 py-3 bg-white/5/50">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              Calculated carbon impact
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {(activeCR.breakdown?.byScope?.scope1 ?? 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Scope 1</span>
                  <span className="text-sm font-semibold text-red-600">
                    {activeCR.breakdown.byScope.scope1.toFixed(1)} tCO₂e/yr
                  </span>
                </div>
              )}
              {(activeCR.breakdown?.byScope?.scope2 ?? 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Scope 2</span>
                  <span className="text-sm font-semibold text-blue-600">
                    {activeCR.breakdown.byScope.scope2.toFixed(1)} tCO₂e/yr
                  </span>
                </div>
              )}
              {(activeCR.operationalCarbonPerYear ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-gray-400">Total</span>
                  <span className="text-sm font-bold text-white">
                    {activeCR.operationalCarbonPerYear.toFixed(1)} tCO₂e/yr
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REVIEW ACTIONS (only for submitted sections) ───────────────────────── */}
        {showReviewActions && (
          <div className="flex-shrink-0 border-t border-white/5 p-5">
            <div className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mb-3 border border-amber-100">
              Reviewing <strong>{SECTION_LABELS[activeSection]}</strong> section — submitted and
              awaiting decision
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                reviewMode === 'reject'
                  ? 'Required: explain what needs to be corrected…'
                  : 'Optional: add review notes for the record…'
              }
              rows={2}
              className={`w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 mb-3 transition-colors ${
                reviewMode === 'reject'
                  ? 'border-red-200 focus:ring-red-200 bg-red-50'
                  : 'border-white/10 focus:ring-blue-200'
              }`}
            />
            {reviewMode === 'reject' && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {[
                  'Missing key fields',
                  'Values out of range',
                  'Inconsistent data',
                  'Need measurement not estimate',
                  'Unit mismatch',
                  'Document needed',
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setRevisionTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )
                    }
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      revisionTags.includes(tag)
                        ? 'bg-red-100 border-red-300 text-red-700'
                        : 'bg-black/40 backdrop-blur-md border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              {reviewMode === 'idle' && (
                <>
                  <button
                    type="button"
                    onClick={() => setReviewMode('reject')}
                    className="flex-1 py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Request revision
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewMode('approve')}
                    className="flex-1 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Approve
                  </button>
                </>
              )}
              {reviewMode === 'approve' && (
                <>
                  <button
                    type="button"
                    onClick={() => setReviewMode('idle')}
                    className="px-4 py-2.5 text-sm text-gray-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {actionLoading ? 'Approving…' : 'Confirm approval'}
                  </button>
                </>
              )}
              {reviewMode === 'reject' && (
                <>
                  <button
                    type="button"
                    onClick={() => setReviewMode('idle')}
                    className="px-4 py-2.5 text-sm text-gray-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestRevision}
                    disabled={actionLoading || !notes.trim()}
                    className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {actionLoading ? 'Sending…' : 'Send revision request'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── VERIFIED / REVISION REQUESTED INFO BAR ─────────────────────────────── */}
        {(activeStatus === 'verified' || activeStatus === 'revision_requested') && (
          <div
            className={`flex-shrink-0 border-t px-5 py-3 text-sm flex items-center gap-2 ${
              activeStatus === 'verified'
                ? 'border-green-100 bg-green-50 text-green-700'
                : 'border-red-100 bg-red-50 text-red-700'
            }`}
          >
            {activeStatus === 'verified' ? (
              <>
                <span className="text-green-600 font-medium">✓ Approved</span>
                {activeMeta?.verifiedAt && (
                  <span className="text-xs text-green-600">
                    on{' '}
                    {new Date(activeMeta.verifiedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="font-medium">Revision requested</span>
                {activeMeta?.reviewNotes && (
                  <span className="text-xs">— {activeMeta.reviewNotes}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
