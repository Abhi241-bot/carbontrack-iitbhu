import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Building2,
  CheckCircle,
  Layers,
  Zap,
  Target,
  BarChart2,
  Download,
  ChevronDown,
  X,
  Leaf,
  MapPin,
  Globe,
  TrendingUp,
  TreePine,
  ArrowRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts';
import PageWrapper from '@/components/layout/PageWrapper';
import Skeleton from '@/components/common/Skeleton';
import { analyticsApi } from '@/features/dashboard/analyticsApi';
import { dashboardApi } from '@/features/dashboard/dashboardApi';
import { BUILDING_TYPE_COLORS, CHART_COLORS } from '@/constants/chartColors';
import ChartCard from '@/components/charts/ChartCard';
import BuildingTypeBar from '@/components/charts/BuildingTypeBar';
import ScopeStackedBar from '@/components/charts/ScopeStackedBar';
import EmbodiedOperationalSplit from '@/components/charts/EmbodiedOperationalSplit';
import IntensityScatter from '@/components/charts/IntensityScatter';
import CarbonTimeline from '@/components/charts/CarbonTimeline';
import SubmissionHeatmap from '@/components/charts/SubmissionHeatmap';
import CoverageProgress from '@/components/charts/CoverageProgress';
import CarbonEquivalency from '@/components/charts/CarbonEquivalency';
import DomainSummaryCards from '@/components/charts/DomainSummaryCards';
import BuildingTypeIntensity from '@/components/charts/BuildingTypeIntensity';
import WasteStreamDonut from '@/components/charts/WasteStreamDonut';
import WastewaterBar from '@/components/charts/WastewaterBar';
import DualLeaderboard from '@/components/charts/DualLeaderboard';
import ApplianceDonut from '@/components/charts/ApplianceDonut';

// ── CSV export ────────────────────────────────────────────────────────────────

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampusSummaryItem {
  slug: string;
  name: string;
  institution: string;
  shortName?: string;
  city: string;
  state: string;
  country: string;
  totalAreaAcres?: number;
  establishedYear?: number;
  overviewStatus: string;
  infrastructureStatus: string;
  buildingCount: number;
  verifiedBuildingCount: number;
  totalEmbodied: number;
  totalOperational: number;
  totalWaste: number;
  totalCarbon: number;
  scope1: number;
  scope2: number;
  scope3: number;
  intensityPerSqm: number;
  vegetationSequestration: number;
  infrastructureCarbon: number;
}

interface BuildingTypeRow {
  type: string;
  buildingCount: number;
  embodiedCarbon: number;
  operationalCarbon: number;
  totalCarbon: number;
  avgPerBuilding: number;
  avgIntensityPerSqm: number;
  scope1: number;
  scope2: number;
  scope3: number;
  solidWasteCO2e?: number;
  liquidWasteCO2e?: number;
  wasteCO2e?: number;
  wasteCarbonPerYear?: number;
  woodKg?: number;
  steelFurnitureKg?: number;
  plasticKg?: number;
  glassKg?: number;
}

interface DomainBreakdown {
  byBuildingType: BuildingTypeRow[];
  byScope: {
    scope1: number;
    scope2: number;
    scope3: number;
    total: number;
    wasteCarbonTotal?: number;
    solarAdoptionCount?: number;
  };
  byApplianceCategory: {
    category: string;
    estimatedKwh: number;
    estimatedCO2: number;
    percentage: number;
  }[];
  embodiedVsOperational: {
    embodiedTotal: number;
    operationalTotal: number;
    embodiedPercent: number;
    operationalPercent: number;
  };
}

interface WasteStream {
  disposalMethod: string;
  avgFractionPercent: number;
}

interface WasteBreakdown {
  solidWasteByType: Array<{
    type: string;
    solidWasteCO2ePerYear: number;
    wasteStreams: WasteStream[];
  }>;
  wastewaterByType: Array<{
    type: string;
    liquidWasteCO2ePerYear: number;
    treatmentDistribution: { unmanaged_septic: number; municipal_stp: number; campus_stp: number };
  }>;
  campusTotals: { totalWasteCO2eYear: number; solidWasteCO2e: number; liquidWasteCO2e: number };
}

interface LeaderboardEntry {
  rank: number;
  buildingId: string;
  name: string;
  type: string;
  totalCarbon: number;
  embodiedCarbon: number;
  operationalCarbon: number;
  intensityPerSqm: number;
  confidenceScore: number;
  submissionStatus: string;
}

interface ScatterPoint {
  id: string;
  name: string;
  type: string;
  totalArea: number;
  totalCarbon: number;
  intensityPerSqm: number;
  operationalCarbon: number;
  embodiedCarbon: number;
  confidenceScore: number;
}

interface TimeSeriesData {
  submissionsByMonth: { month: string; count: number; cumulative: number }[];
  carbonAccumulation: {
    month: string;
    embodied: number;
    operational: number;
    cumulative: number;
  }[];
  buildingCoverage: { month: string; covered: number; total: number; percent: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtT = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 1 });
const fmtK = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString('en-IN', { maximumFractionDigits: 1 });

const STATUS_COLOR: Record<string, string> = {
  verified: '#15803D',
  submitted: '#d97706',
  under_review: '#d97706',
  draft: '#6b7280',
  not_started: '#9ca3af',
  revision_requested: '#dc2626',
};

const STATUS_LABEL: Record<string, string> = {
  verified: 'Verified',
  submitted: 'Under review',
  under_review: 'Under review',
  draft: 'Draft',
  not_started: 'Not started',
  revision_requested: 'Revision needed',
};

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ElementType;
  value: string | number;
  label: string;
  badge?: string;
  isLoading?: boolean;
  color?: string;
}

function KpiCard({ icon: Icon, value, label, badge, isLoading, color }: KpiCardProps) {
  const glowColor = color ?? '#8B1A1A';

  return (
    <div className="relative overflow-hidden bg-[#121212]/70 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] ring-1 ring-inset ring-white/5 rounded-xl p-3 sm:p-4">
      {/* Glow effect */}
      <div 
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[40px] opacity-20 pointer-events-none" 
        style={{ background: glowColor }} 
      />
      
      <Icon
        className="absolute top-3 right-3 h-4 w-4 opacity-40 z-10"
        style={{ color: glowColor }}
      />
      
      <div className="relative z-10">
        {isLoading ? (
          <>
            <Skeleton className="h-7 w-20 mb-1" />
            <Skeleton className="h-3 w-24" />
          </>
        ) : (
          <>
            <div className="flex items-end gap-2 flex-wrap">
              <p className="text-xl sm:text-2xl font-bold text-white" style={{ color }}>
                {value}
              </p>
              {badge && (
                <span className="mb-0.5 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide leading-snug">
              {label}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3">
        <h2 className="text-base sm:text-lg font-bold text-white">{title}</h2>
        {badge && (
          <span
            className="text-[10px] text-white px-2 py-0.5 rounded-full font-medium"
            style={{ background: '#8B1A1A' }}
          >
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

// ── All Building Types ────────────────────────────────────────────────────────

const ALL_TYPES = [
  'academic',
  'hostel',
  'lab',
  'administrative',
  'residential',
  'commercial',
  'infrastructure',
];

// ── Campus Card ───────────────────────────────────────────────────────────────

function CampusCard({
  campus,
  isSelected,
  onSelect,
}: {
  campus: CampusSummaryItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasData = campus.totalCarbon > 0;
  const coveragePct =
    campus.buildingCount > 0
      ? Math.round((campus.verifiedBuildingCount / campus.buildingCount) * 100)
      : 0;

  return (
    <button
      onClick={onSelect}
      className={`text-left w-full rounded-xl border transition-all duration-150 p-4 sm:p-5 ${
        isSelected
          ? 'border-iitbhu bg-iitbhu/20 backdrop-blur-md shadow-md ring-1 ring-iitbhu/30'
          : 'border-white/10 bg-black/40 backdrop-blur-md hover:border-white/20 hover:shadow-sm'
      }`}
    >
      {/* Campus name + status dot */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-bold text-white text-sm leading-tight truncate">
            {campus.shortName ?? campus.name}
          </div>
          <div className="text-xs text-gray-400 truncate mt-0.5">{campus.institution}</div>
        </div>
        <span
          className="flex-shrink-0 h-2 w-2 rounded-full mt-1"
          style={{
            background: STATUS_COLOR[campus.infrastructureStatus] ?? '#9ca3af',
          }}
          title={STATUS_LABEL[campus.infrastructureStatus]}
        />
      </div>

      {/* Location */}
      <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
        <MapPin size={10} className="flex-shrink-0" />
        <span className="truncate">
          {campus.city}, {campus.state}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <span className="text-gray-400">Buildings</span>
          <div className="font-semibold text-gray-100">
            {campus.verifiedBuildingCount}
            <span className="font-normal text-gray-400"> / {campus.buildingCount}</span>
          </div>
        </div>
        <div>
          <span className="text-gray-400">Coverage</span>
          <div className="font-semibold text-gray-100">{coveragePct}%</div>
        </div>
        {hasData && (
          <>
            <div>
              <span className="text-gray-400">Annual CO₂e</span>
              <div className="font-semibold text-gray-100">
                {fmtK(campus.totalOperational)} <span className="font-normal text-gray-400">t</span>
              </div>
            </div>
            <div>
              <span className="text-gray-400">Embodied</span>
              <div className="font-semibold text-gray-100">
                {fmtK(campus.totalEmbodied)} <span className="font-normal text-gray-400">t</span>
              </div>
            </div>
          </>
        )}
        {!hasData && (
          <div className="col-span-2">
            <span className="text-gray-400 italic">No carbon data yet</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${coveragePct}%`, background: '#8B1A1A' }}
        />
      </div>

      {isSelected && (
        <div className="mt-2 text-xs font-medium text-iitbhu flex items-center gap-1">
          <span>Viewing this campus</span>
          <ArrowRight size={10} />
        </div>
      )}
    </button>
  );
}

// ── Campus Grid ───────────────────────────────────────────────────────────────

function CampusGrid({
  campuses,
  selectedSlug,
  onSelect,
  isLoading,
}: {
  campuses: CampusSummaryItem[];
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!campuses.length) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">No campuses registered yet.</div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {/* All campuses card */}
      <button
        onClick={() => onSelect(null)}
        className={`text-left rounded-xl border transition-all duration-150 p-4 sm:p-5 ${
          selectedSlug === null
            ? 'border-iitbhu bg-iitbhu/20 backdrop-blur-md shadow-md ring-1 ring-iitbhu/30'
            : 'border-white/10 bg-black/40 backdrop-blur-md hover:border-white/20 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: '#8B1A1A15' }}
          >
            <Globe size={16} style={{ color: '#8B1A1A' }} />
          </div>
          <div>
            <div className="font-bold text-white text-sm">All Campuses</div>
            <div className="text-xs text-gray-400">Network overview</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <span className="text-gray-400">Campuses</span>
            <div className="font-semibold text-gray-100">{campuses.length}</div>
          </div>
          <div>
            <span className="text-gray-400">Total buildings</span>
            <div className="font-semibold text-gray-100">
              {campuses.reduce((s, c) => s + c.buildingCount, 0)}
            </div>
          </div>
          <div>
            <span className="text-gray-400">Verified</span>
            <div className="font-semibold text-gray-100">
              {campuses.reduce((s, c) => s + c.verifiedBuildingCount, 0)}
            </div>
          </div>
          <div>
            <span className="text-gray-400">Total CO₂e/yr</span>
            <div className="font-semibold text-gray-100">
              {fmtK(campuses.reduce((s, c) => s + c.totalOperational, 0))}{' '}
              <span className="font-normal text-gray-400">t</span>
            </div>
          </div>
        </div>
        {selectedSlug === null && (
          <div className="mt-3 text-xs font-medium text-iitbhu flex items-center gap-1">
            <span>Currently viewing</span>
            <ArrowRight size={10} />
          </div>
        )}
      </button>

      {campuses.map((campus) => (
        <CampusCard
          key={campus.slug}
          campus={campus}
          isSelected={selectedSlug === campus.slug}
          onSelect={() => onSelect(selectedSlug === campus.slug ? null : campus.slug)}
        />
      ))}
    </div>
  );
}

// ── Campus Detail Header ──────────────────────────────────────────────────────

function CampusDetailHeader({
  campus,
  onClear,
}: {
  campus: CampusSummaryItem;
  onClear: () => void;
}) {
  const hasInfra = campus.infrastructureCarbon !== 0 || campus.vegetationSequestration > 0;

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden"
      style={{ borderLeft: '4px solid #8B1A1A' }}
    >
      <div className="p-5 sm:p-6">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-white">{campus.name}</h2>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
                style={{ background: STATUS_COLOR[campus.overviewStatus] ?? '#6b7280' }}
              >
                {STATUS_LABEL[campus.overviewStatus] ?? campus.overviewStatus}
              </span>
            </div>
            <div className="text-sm text-gray-400 mt-0.5">{campus.institution}</div>
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
              <MapPin size={11} />
              <span>
                {campus.city}, {campus.state}, {campus.country}
              </span>
              {campus.establishedYear && (
                <>
                  <span className="mx-1">·</span>
                  <span>Est. {campus.establishedYear}</span>
                </>
              )}
              {campus.totalAreaAcres && (
                <>
                  <span className="mx-1">·</span>
                  <span>{campus.totalAreaAcres} acres</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/campus/${campus.slug}`}
              className="text-xs border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 bg-black/40 backdrop-blur-md text-gray-300 flex items-center gap-1"
            >
              Campus hub <ArrowRight size={12} />
            </Link>
            <button
              onClick={onClear}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 border border-white/10 rounded-lg px-3 py-1.5"
            >
              <X size={12} /> All campuses
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            {
              label: 'Buildings',
              value: `${campus.verifiedBuildingCount} / ${campus.buildingCount}`,
              sub: 'verified',
              color: '#8B1A1A',
            },
            {
              label: 'Annual emissions',
              value: `${fmtT(campus.totalOperational)} t`,
              sub: 'operational CO₂e/yr',
              color: '#3b82f6',
            },
            {
              label: 'Embodied carbon',
              value: `${fmtT(campus.totalEmbodied)} t`,
              sub: 'one-time construction',
              color: '#f59e0b',
            },
            {
              label: 'Waste emissions',
              value: `${fmtT(campus.totalWaste)} t`,
              sub: 'CO₂e/yr',
              color: '#10b981',
            },
          ].map((stat) => (
            <div key={stat.label} className="relative overflow-hidden bg-[#121212]/70 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] ring-1 ring-inset ring-white/5 rounded-lg p-3">
              <div 
                className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full blur-[30px] opacity-20 pointer-events-none" 
                style={{ background: stat.color }} 
              />
              <div className="relative z-10 text-xs text-gray-400 mb-0.5">{stat.label}</div>
              <div className="relative z-10 font-bold text-white" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="relative z-10 text-xs text-gray-400">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Scope breakdown bar */}
        {campus.scope1 + campus.scope2 + campus.scope3 > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
              <span className="font-medium text-gray-200">Scope breakdown</span>
              <span>{fmtT(campus.scope1 + campus.scope2 + campus.scope3)} tCO₂e total</span>
            </div>
            <div className="flex rounded-full overflow-hidden h-3 w-full bg-white/10">
              {[
                { v: campus.scope1, color: '#ef4444', label: 'Scope 1' },
                { v: campus.scope2, color: '#f59e0b', label: 'Scope 2' },
                { v: campus.scope3, color: '#3b82f6', label: 'Scope 3' },
              ].map((s) => {
                const total = campus.scope1 + campus.scope2 + campus.scope3 || 1;
                const w = (s.v / total) * 100;
                return w > 0 ? (
                  <div
                    key={s.label}
                    style={{ width: `${w}%`, background: s.color }}
                    className="h-full"
                    title={`${s.label}: ${fmtT(s.v)} tCO₂e`}
                  />
                ) : null;
              })}
            </div>
            <div className="flex gap-4 mt-1.5">
              {[
                { label: 'Scope 1', v: campus.scope1, color: '#ef4444' },
                { label: 'Scope 2', v: campus.scope2, color: '#f59e0b' },
                { label: 'Scope 3', v: campus.scope3, color: '#3b82f6' },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-1 text-xs text-gray-400">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.label}: {fmtT(s.v)} t
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Infrastructure carbon */}
        {hasInfra && (
          <div className="flex flex-wrap gap-3 pt-3 border-t border-white/5">
            {campus.vegetationSequestration > 0 && (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                <TreePine size={13} />
                <span>
                  Tree sequestration:{' '}
                  <strong>{fmtT(campus.vegetationSequestration)} tCO₂e/yr</strong>
                </span>
              </div>
            )}
            {campus.infrastructureCarbon !== 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-300 bg-white/5 rounded-lg px-3 py-2">
                <TrendingUp size={13} />
                <span>
                  Net infrastructure: <strong>{fmtT(campus.infrastructureCarbon)} tCO₂e/yr</strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cross-Campus Comparison Chart ─────────────────────────────────────────────

function CampusCrossCompare({
  campuses,
  onSelect,
}: {
  campuses: CampusSummaryItem[];
  onSelect: (slug: string) => void;
}) {
  const withData = campuses.filter((c) => c.totalCarbon > 0);
  if (withData.length < 2) return null;

  const chartData = withData.map((c) => ({
    name: c.shortName ?? c.name.split(' ').slice(0, 3).join(' '),
    slug: c.slug,
    operational: parseFloat(c.totalOperational.toFixed(1)),
    embodied: parseFloat(c.totalEmbodied.toFixed(1)),
    waste: parseFloat(c.totalWaste.toFixed(1)),
  }));

  const COLORS = ['#8B1A1A', '#3b82f6', '#10b981'];

  return (
    <section>
      <SectionHeader
        title="Campus-to-campus comparison"
        subtitle="Total annual operational, waste, and embodied carbon across all tracked campuses. Click a bar to drill into that campus."
      />
      <ChartCard
        title="Emissions by campus"
        subtitle="tCO₂e — operational + waste (annual) + embodied (one-time)"
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
            onClick={(d) => {
              if (d?.activePayload?.[0]) {
                onSelect((d.activePayload[0].payload as { slug: string }).slug);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} unit=" t" />
            <Tooltip
              formatter={(v: number, name: string) => [
                `${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })} tCO₂e`,
                name,
              ]}
            />
            <Bar
              dataKey="operational"
              name="Operational"
              stackId="a"
              fill={COLORS[0]}
              radius={[0, 0, 0, 0]}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[0]} />
              ))}
            </Bar>
            <Bar dataKey="waste" name="Waste" stackId="a" fill={COLORS[2]} />
            <Bar
              dataKey="embodied"
              name="Embodied"
              stackId="a"
              fill={COLORS[1]}
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

// ── Scope Overview Panel ──────────────────────────────────────────────────────

interface ScopeTotals {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
}

function CampusEmissionsOverview({
  byScope,
  bySource,
  coveredBuildings,
  isLoading,
}: {
  byScope: ScopeTotals;
  bySource: { operational: number; waste: number; embodied: number };
  coveredBuildings: number;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const totalScope = byScope.scope1 + byScope.scope2 + byScope.scope3 || 1;
  const scopePct = (v: number) => ((v / totalScope) * 100).toFixed(1);
  const annualTotal = bySource.operational + bySource.waste;

  const scopeItems = [
    {
      label: 'Scope 1',
      value: byScope.scope1,
      color: '#ef4444',
      bg: 'bg-red-50',
      text: 'text-red-700',
      desc: 'Direct',
    },
    {
      label: 'Scope 2',
      value: byScope.scope2,
      color: '#f59e0b',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      desc: 'Electricity',
    },
    {
      label: 'Scope 3',
      value: byScope.scope3,
      color: '#3b82f6',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      desc: 'Indirect',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/5 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="text-2xl font-bold text-white">{fmtT(annualTotal)} tCO₂e/yr</div>
            <div className="text-xs text-gray-400 mt-0.5">
              Annual operational + waste · {coveredBuildings} buildings verified
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            {scopeItems.map((s) => (
              <div key={s.label} className={`${s.bg} rounded-lg px-3 py-2 text-center`}>
                <div className={`text-xs font-medium ${s.text}`}>{s.label}</div>
                <div className={`text-sm font-bold ${s.text}`}>{fmtT(s.value)}</div>
                <div className="text-xs text-gray-400">{scopePct(s.value)}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex rounded-full overflow-hidden h-3 w-full bg-white/10">
          {scopeItems.map((s) =>
            s.value > 0 ? (
              <div
                key={s.label}
                style={{ width: `${scopePct(s.value)}%`, background: s.color }}
                className="h-full"
                title={`${s.label}: ${fmtT(s.value)} tCO₂e (${scopePct(s.value)}%)`}
              />
            ) : null
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'Operational (energy)',
            value: bySource.operational,
            unit: 'tCO₂e/yr',
            color: 'text-blue-600',
            desc: 'Electricity, fuel, HVAC',
          },
          {
            label: 'Waste emissions',
            value: bySource.waste,
            unit: 'tCO₂e/yr',
            color: 'text-emerald-600',
            desc: 'Solid waste + wastewater',
          },
          {
            label: 'Embodied carbon',
            value: bySource.embodied,
            unit: 'tCO₂e (one-time)',
            color: 'text-amber-600',
            desc: 'Construction materials',
          },
        ].map((card) => (
          <div key={card.label} className="bg-black/40 backdrop-blur-md rounded-xl border border-white/5 p-4">
            <div className="text-xs font-medium text-gray-400 mb-1">{card.label}</div>
            <div className={`text-xl font-bold ${card.color}`}>{fmtT(card.value)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{card.unit}</div>
            <div className="text-xs text-gray-400 mt-1">{card.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Building type filter bar ──────────────────────────────────────────────────

function StickyFilterBar({
  filteredTypes,
  onChange,
  campusName,
}: {
  filteredTypes: string[];
  onChange: (types: string[]) => void;
  campusName?: string;
}) {
  const allSelected = filteredTypes.length === ALL_TYPES.length;

  function toggle(type: string) {
    if (filteredTypes.includes(type)) {
      if (filteredTypes.length === 1) return;
      onChange(filteredTypes.filter((t) => t !== type));
    } else {
      onChange([...filteredTypes, type]);
    }
  }

  return (
    <div className="sticky top-14 z-30 bg-black/40 backdrop-blur-md border-b border-white/5 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {campusName && (
          <span className="text-xs text-iitbhu font-medium flex-shrink-0 bg-red-50 px-2 py-0.5 rounded">
            {campusName}
          </span>
        )}
        <span className="text-xs text-gray-400 uppercase tracking-wide flex-shrink-0">Filter:</span>
        <button
          onClick={() => onChange(ALL_TYPES)}
          className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
            allSelected
              ? 'text-white border-transparent'
              : 'bg-black/40 backdrop-blur-md text-gray-300 border-white/10 hover:border-white/20'
          }`}
          style={allSelected ? { background: '#8B1A1A', borderColor: '#8B1A1A' } : undefined}
        >
          All types
        </button>
        {ALL_TYPES.map((type) => {
          const active = filteredTypes.includes(type) && !allSelected;
          const color = BUILDING_TYPE_COLORS[type] ?? '#9CA3AF';
          return (
            <button
              key={type}
              onClick={() => toggle(type)}
              className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border font-medium transition-colors capitalize ${
                active
                  ? 'text-white border-transparent'
                  : 'bg-black/40 backdrop-blur-md text-gray-300 border-white/10 hover:border-white/20'
              }`}
              style={active ? { background: color, borderColor: color } : undefined}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              {type}
            </button>
          );
        })}
        {!allSelected && (
          <button
            onClick={() => onChange(ALL_TYPES)}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 ml-2"
          >
            <X size={12} />
            clear
          </button>
        )}
      </div>
    </div>
  );
}

// ── Export dropdown ───────────────────────────────────────────────────────────

function ExportMenu({
  leaderboard,
  domainBreakdown,
  campusSlug,
}: {
  leaderboard: LeaderboardEntry[];
  domainBreakdown: DomainBreakdown | null;
  campusSlug: string | null;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const prefix = campusSlug ?? 'all-campuses';

  function exportSummary() {
    downloadCsv(
      leaderboard.map((b) => ({
        'Building Name': b.name,
        Type: b.type,
        Status: b.submissionStatus,
        'Embodied Carbon (tCO2e)': b.embodiedCarbon,
        'Operational Carbon (tCO2e)': b.operationalCarbon,
        'Total Carbon (tCO2e)': b.totalCarbon,
        'Intensity per sqm': b.intensityPerSqm,
        'Confidence (%)': b.confidenceScore,
      })),
      `${prefix}-carbon-summary-${today}.csv`
    );
    setOpen(false);
  }

  function exportDomain() {
    if (!domainBreakdown) return;
    downloadCsv(
      domainBreakdown.byBuildingType.map((b) => ({
        Type: b.type,
        'Building Count': b.buildingCount,
        'Embodied Carbon (tCO2e)': b.embodiedCarbon,
        'Operational Carbon (tCO2e)': b.operationalCarbon,
        'Total Carbon (tCO2e)': b.totalCarbon,
        'Avg per Building': b.avgPerBuilding,
        'Avg Intensity (tCO2e/sqm)': b.avgIntensityPerSqm,
        'Scope 1': b.scope1,
        'Scope 2': b.scope2,
        'Scope 3': b.scope3,
      })),
      `${prefix}-carbon-domain-${today}.csv`
    );
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 bg-black/40 backdrop-blur-md"
      >
        <Download size={14} />
        Export
        <ChevronDown size={14} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl shadow-lg py-1 z-20 w-56">
          <button
            className="w-full text-left text-sm px-4 py-2 hover:bg-white/5"
            onClick={exportSummary}
          >
            Building summary CSV
          </button>
          <button
            className="w-full text-left text-sm px-4 py-2 hover:bg-white/5"
            onClick={exportDomain}
          >
            Domain breakdown CSV
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCampus = searchParams.get('campus') ?? null;

  const [filteredTypes, setFilteredTypes] = useState<string[]>(ALL_TYPES);
  const [compareSearchQ, setCompareSearchQ] = useState('');
  const [compareSelectedIds, setCompareSelectedIds] = useState<string[]>([]);

  function selectCampus(slug: string | null) {
    if (slug) {
      setSearchParams({ campus: slug });
    } else {
      setSearchParams({});
    }
    setFilteredTypes(ALL_TYPES);
  }

  // ── Data fetches ──────────────────────────────────────────────────────────

  const {
    data: campusSummaryRes,
    isLoading: campusSummaryLoading,
    isError: campusSummaryError,
  } = useQuery({
    queryKey: ['analytics', 'campus-summary'],
    queryFn: analyticsApi.getCampusSummary,
    staleTime: 10 * 60 * 1000,
  });

  const { data: statsRes, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-public-stats', selectedCampus],
    queryFn: () => dashboardApi.getPublicStats(selectedCampus ?? undefined),
    staleTime: 10 * 60 * 1000,
  });

  const {
    data: domainRes,
    isLoading: domainLoading,
    dataUpdatedAt: domainUpdated,
  } = useQuery({
    queryKey: ['analytics', 'domain-breakdown', selectedCampus],
    queryFn: () => analyticsApi.getDomainBreakdown(selectedCampus ?? undefined),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: leaderboardRes, isLoading: lbLoading } = useQuery({
    queryKey: ['analytics', 'leaderboard', selectedCampus],
    queryFn: () => analyticsApi.getLeaderboard(selectedCampus ?? undefined),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: timeSeriesRes, isLoading: tsLoading } = useQuery({
    queryKey: ['analytics', 'time-series', selectedCampus],
    queryFn: () => analyticsApi.getTimeSeries(selectedCampus ?? undefined),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: scatterRes, isLoading: scatterLoading } = useQuery({
    queryKey: ['analytics', 'intensity-scatter', selectedCampus],
    queryFn: () => analyticsApi.getIntensityScatter(selectedCampus ?? undefined),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: wasteRes, isLoading: wasteLoading } = useQuery({
    queryKey: ['analytics', 'waste-breakdown', selectedCampus],
    queryFn: () => analyticsApi.getWasteBreakdown(selectedCampus ?? undefined),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: compareRes, isLoading: compareLoading } = useQuery({
    queryKey: ['analytics', 'compare', compareSelectedIds.join(',')],
    queryFn: () => analyticsApi.getBuildingComparison(compareSelectedIds),
    enabled: compareSelectedIds.length >= 2,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ── Data extraction ───────────────────────────────────────────────────────

  const campuses: CampusSummaryItem[] = campusSummaryRes?.data?.data ?? [];
  const activeCampus = campuses.find((c) => c.slug === selectedCampus) ?? null;

  const stats = statsRes?.data?.data;
  const domainBreakdown: DomainBreakdown | null = domainRes?.data?.data ?? null;
  const leaderboard: LeaderboardEntry[] = leaderboardRes?.data?.data ?? [];
  const timeSeries: TimeSeriesData | null = timeSeriesRes?.data?.data ?? null;
  const scatter: ScatterPoint[] = scatterRes?.data?.data ?? [];
  const wasteBreakdown: WasteBreakdown | null = wasteRes?.data?.data ?? null;
  const compareData = compareRes?.data?.data ?? null;

  // ── Global error state (server down / cold start) ─────────────────────────

  // Error early return moved below hooks to satisfy React Hook rules

  // ── Global empty state ────────────────────────────────────────────────────

  const allEmpty =
    !domainLoading &&
    !lbLoading &&
    (domainBreakdown?.byBuildingType?.every((t) => t.buildingCount === 0) ?? true) &&
    leaderboard.length === 0;

  // Early return moved below hooks to satisfy React Hook rules

  // ── Derived metrics ───────────────────────────────────────────────────────

  const statsNum = stats as Record<string, number> | null;
  const filteredByType = useMemo(
    () => (domainBreakdown?.byBuildingType ?? []).filter((t) => filteredTypes.includes(t.type)),
    [domainBreakdown, filteredTypes]
  );

  const operationalTotal = filteredByType.reduce((s, t) => s + t.operationalCarbon, 0);
  const embodiedTotal = filteredByType.reduce((s, t) => s + t.embodiedCarbon, 0);
  const wasteCO2eYear = wasteBreakdown?.campusTotals.totalWasteCO2eYear ?? 0;

  const totalArea = filteredByType.reduce(
    (s, t) => s + (t.avgIntensityPerSqm > 0 ? t.totalCarbon / t.avgIntensityPerSqm : 0),
    0
  );
  const totalCarbonFiltered = operationalTotal + embodiedTotal;
  const campusIntensity = totalArea > 0 ? totalCarbonFiltered / totalArea : 0;

  const allArea = (domainBreakdown?.byBuildingType ?? []).reduce(
    (s, t) => s + (t.avgIntensityPerSqm > 0 ? t.totalCarbon / t.avgIntensityPerSqm : 0),
    0
  );
  const allTotalCarbon = (domainBreakdown?.byBuildingType ?? []).reduce(
    (s, t) => s + t.totalCarbon,
    0
  );
  const globalAvgIntensity = allArea > 0 ? allTotalCarbon / allArea : 0;

  const intensityByTypeData = useMemo(
    () =>
      filteredByType
        .filter((t) => t.avgIntensityPerSqm > 0)
        .map((t) => {
          const area = t.totalCarbon / t.avgIntensityPerSqm;
          return {
            type: t.type,
            avgIntensityPerSqm: t.avgIntensityPerSqm,
            energyCO2ePerSqm: area > 0 ? t.operationalCarbon / area : 0,
            wasteCO2ePerSqm: area > 0 ? (t.wasteCO2e ?? 0) / area : 0,
          };
        })
        .sort((a, b) => b.avgIntensityPerSqm - a.avgIntensityPerSqm),
    [filteredByType]
  );

  const filteredScatter = useMemo(
    () => scatter.filter((d) => filteredTypes.includes(d.type)),
    [scatter, filteredTypes]
  );

  const filteredWaste = useMemo(
    () => (wasteBreakdown?.solidWasteByType ?? []).filter((t) => filteredTypes.includes(t.type)),
    [wasteBreakdown, filteredTypes]
  );

  const campusWasteStreams = useMemo(() => {
    const totalWeight = filteredWaste.reduce((s, t) => s + t.solidWasteCO2ePerYear, 0);
    if (totalWeight === 0) return [];
    const methodSet = new Set<string>();
    filteredWaste.forEach((t) => t.wasteStreams.forEach((s) => methodSet.add(s.disposalMethod)));
    return Array.from(methodSet)
      .map((method) => {
        const weighted = filteredWaste.reduce((sum, type) => {
          const stream = type.wasteStreams.find((s) => s.disposalMethod === method);
          const fraction = stream?.avgFractionPercent ?? 0;
          return sum + (type.solidWasteCO2ePerYear / totalWeight) * fraction;
        }, 0);
        return { disposalMethod: method, avgFractionPercent: parseFloat(weighted.toFixed(1)) };
      })
      .filter((s) => s.avgFractionPercent > 0);
  }, [filteredWaste]);

  const filteredLeaderboard = useMemo(
    () => leaderboard.filter((b) => filteredTypes.includes(b.type)),
    [leaderboard, filteredTypes]
  );

  const filteredSolidCO2e = filteredWaste.reduce((s, t) => s + t.solidWasteCO2ePerYear, 0);
  const filteredLiquidCO2e = (wasteBreakdown?.wastewaterByType ?? [])
    .filter((t) => filteredTypes.includes(t.type))
    .reduce((s, t) => s + t.liquidWasteCO2ePerYear, 0);
  const filteredWastewaterByType = (wasteBreakdown?.wastewaterByType ?? []).filter((t) =>
    filteredTypes.includes(t.type)
  );
  if (campusSummaryError) {
    return (
      <PageWrapper title="Campus Carbon Network">
        <div className="max-w-7xl mx-auto px-4 py-16 flex flex-col items-center text-center gap-4">
          <h1 className="text-2xl font-bold text-white">Could not load campus data</h1>
          <p className="text-gray-400 max-w-md">
            The server may be starting up. Please wait a moment and try refreshing.
          </p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['analytics'] })}
            className="mt-2 px-6 py-2.5 rounded-lg text-white text-sm font-medium"
            style={{ background: '#8B1A1A' }}
          >
            Retry
          </button>
        </div>
      </PageWrapper>
    );
  }

  if (allEmpty && !campusSummaryLoading && campuses.length === 0) {
    return (
      <PageWrapper title="Campus Carbon Network">
        <div className="max-w-7xl mx-auto px-4 py-16 flex flex-col items-center text-center gap-4">
          <h1 className="text-2xl font-bold text-white">No campuses yet</h1>
          <p className="text-gray-400 max-w-md">
            Add your first campus and buildings to start tracking carbon emissions.
          </p>
          <button
            onClick={() => navigate('/campus')}
            className="mt-2 px-6 py-2.5 rounded-lg text-white text-sm font-medium"
            style={{ background: '#8B1A1A' }}
          >
            Manage campuses
          </button>
        </div>
      </PageWrapper>
    );
  }

  function toggleCompareBuilding(id: string) {
    if (compareSelectedIds.includes(id)) {
      setCompareSelectedIds(compareSelectedIds.filter((s) => s !== id));
    } else if (compareSelectedIds.length < 6) {
      setCompareSelectedIds([...compareSelectedIds, id]);
    }
  }

  const compareFilteredLeaderboard = leaderboard.filter((b) =>
    b.name.toLowerCase().includes(compareSearchQ.toLowerCase())
  );
  const compareSelectedBuildings = leaderboard.filter((b) =>
    compareSelectedIds.includes(b.buildingId)
  );

  const BULLET_METRICS = [
    { key: 'totalCarbon', label: 'Total carbon (tCO₂e)' },
    { key: 'embodiedCarbon', label: 'Embodied (tCO₂e)' },
    { key: 'operationalCarbon', label: 'Operational (tCO₂e)' },
    { key: 'intensityPerSqm', label: 'Intensity / sqm' },
  ];

  function getMaxForMetric(metric: string): number {
    if (!compareData) return 0;
    const all = [
      ...compareData.buildings.map(
        (b: unknown) => ((b as Record<string, unknown>)[metric] as number) ?? 0
      ),
      ((compareData.campusAverages as Record<string, unknown>)[metric] as number) ?? 0,
    ];
    return Math.max(...all, 0.001);
  }

  const solarAdoptionCount = domainBreakdown?.byScope?.solarAdoptionCount ?? 0;
  const coveredBuildings = statsNum?.verifiedBuildings ?? 0;

  const contextLabel = activeCampus
    ? (activeCampus.shortName ?? activeCampus.name)
    : 'All Campuses';

  return (
    <PageWrapper title="Campus Carbon Network">
      {/* ── Sticky filter bar ────────────────────────────────────────────────── */}
      <StickyFilterBar
        filteredTypes={filteredTypes}
        onChange={setFilteredTypes}
        campusName={activeCampus ? contextLabel : undefined}
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-14">
        {/* ── Page header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Campus Carbon Network</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Multi-campus carbon tracking platform · public analytics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu
              leaderboard={leaderboard}
              domainBreakdown={domainBreakdown}
              campusSlug={selectedCampus}
            />
          </div>
        </div>

        {/* ── Campus Navigator ──────────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Campus Navigator"
            subtitle="Select a campus to filter all analytics to that institution, or view network-wide data across all campuses."
          />
          <CampusGrid
            campuses={campuses}
            selectedSlug={selectedCampus}
            onSelect={selectCampus}
            isLoading={campusSummaryLoading}
          />
        </section>

        {/* ── Campus detail header (when a campus is selected) ─────────────────── */}
        {activeCampus && (
          <section>
            <CampusDetailHeader campus={activeCampus} onClear={() => selectCampus(null)} />
          </section>
        )}

        {/* ── Cross-campus comparison (global view only) ────────────────────────── */}
        {!selectedCampus && <CampusCrossCompare campuses={campuses} onSelect={selectCampus} />}

        {/* ── KPI strip ────────────────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title={selectedCampus ? `${contextLabel} — Key Metrics` : 'Network Overview'}
            subtitle={
              selectedCampus
                ? 'Carbon metrics for this campus filtered by selected building types.'
                : 'Aggregated metrics across all campuses and building types.'
            }
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              icon={Building2}
              value={stats?.totalBuildings ?? 0}
              label={selectedCampus ? 'Buildings (campus)' : 'Total buildings'}
              isLoading={statsLoading}
            />
            <KpiCard
              icon={CheckCircle}
              value={stats?.submittedBuildings ?? 0}
              label="Buildings with data"
              badge={stats ? `${stats.coveragePercent}% covered` : undefined}
              isLoading={statsLoading}
              color="#15803D"
            />
            <KpiCard
              icon={Layers}
              value={
                embodiedTotal > 0
                  ? embodiedTotal.toLocaleString('en-IN', { maximumFractionDigits: 1 })
                  : (statsNum?.totalEmbodiedCarbon ?? 0).toLocaleString('en-IN', {
                      maximumFractionDigits: 1,
                    })
              }
              label="Embodied carbon (tCO₂e)"
              isLoading={statsLoading || domainLoading}
              color={CHART_COLORS.embodied}
            />
            <KpiCard
              icon={Zap}
              value={
                operationalTotal > 0
                  ? operationalTotal.toLocaleString('en-IN', { maximumFractionDigits: 1 })
                  : (statsNum?.totalOperationalCarbon ?? 0).toLocaleString('en-IN', {
                      maximumFractionDigits: 1,
                    })
              }
              label="Operational carbon (tCO₂e/yr)"
              isLoading={statsLoading || domainLoading}
              color={CHART_COLORS.operational}
            />
            <KpiCard
              icon={Target}
              value={campusIntensity > 0 ? campusIntensity.toFixed(4) : '—'}
              label="Intensity (tCO₂e/m²)"
              isLoading={statsLoading || domainLoading}
            />
            <KpiCard
              icon={Leaf}
              value={
                activeCampus
                  ? `${fmtT(activeCampus.vegetationSequestration)}`
                  : campuses.reduce((s, c) => s + c.vegetationSequestration, 0) > 0
                    ? fmtT(campuses.reduce((s, c) => s + c.vegetationSequestration, 0))
                    : '—'
              }
              label="Tree sequestration (tCO₂e/yr)"
              isLoading={campusSummaryLoading}
              color="#15803D"
            />
          </div>

          {/* Carbon equivalency */}
          {operationalTotal + embodiedTotal > 0 && (
            <div className="mt-6">
              <CarbonEquivalency totalCarbonTCO2e={operationalTotal + embodiedTotal} />
            </div>
          )}

          {/* Mini timeline */}
          {timeSeries && timeSeries.carbonAccumulation.some((d) => d.cumulative > 0) && (
            <div className="mt-6">
              <ChartCard
                title="Cumulative carbon tracked over time"
                subtitle="Running total as more buildings submit verified data"
                isLoading={tsLoading}
                onRefresh={() =>
                  queryClient.invalidateQueries({
                    queryKey: ['analytics', 'time-series', selectedCampus],
                  })
                }
              >
                <CarbonTimeline data={timeSeries.carbonAccumulation} />
              </ChartCard>
            </div>
          )}
        </section>

        {/* ── Emissions overview ────────────────────────────────────────────────── */}
        {domainBreakdown && domainBreakdown.byScope.total > 0 && (
          <section>
            <SectionHeader
              title="Emissions overview"
              subtitle="Aggregated scope breakdown across all verified buildings. Scope 1 = direct combustion, Scope 2 = purchased electricity, Scope 3 = embodied + waste + activities."
            />
            <CampusEmissionsOverview
              byScope={domainBreakdown.byScope}
              bySource={{
                operational: operationalTotal,
                waste: wasteCO2eYear,
                embodied: embodiedTotal,
              }}
              coveredBuildings={coveredBuildings}
              isLoading={domainLoading}
            />
          </section>
        )}

        {/* ── Domain summary cards ──────────────────────────────────────────────── */}
        {domainBreakdown && wasteBreakdown && (
          <section>
            <SectionHeader
              title="What makes up the footprint?"
              subtitle="Carbon split across three domains — energy consumption, construction materials, and waste generation."
            />
            <DomainSummaryCards
              domainBreakdown={domainBreakdown}
              wasteBreakdown={wasteBreakdown}
              filteredTypes={filteredTypes}
              isLoading={domainLoading || wasteLoading}
            />
          </section>
        )}

        {/* ── Building landscape ────────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Building carbon intensity landscape"
            subtitle="Each bubble is a building. X-axis = floor area. Y-axis = carbon intensity (tCO₂e/m²). Bubble size = total carbon. Buildings above the red line exceed average."
          />
          <ChartCard
            title="Intensity vs floor area"
            isLoading={scatterLoading}
            isEmpty={filteredScatter.length === 0}
            dataUpdatedAt={domainUpdated}
            onRefresh={() =>
              queryClient.invalidateQueries({
                queryKey: ['analytics', 'intensity-scatter', selectedCampus],
              })
            }
          >
            <IntensityScatter data={filteredScatter} campusAvgIntensity={globalAvgIntensity} />
          </ChartCard>
        </section>

        {/* ── Type benchmarking ─────────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="How do building types compare?"
            subtitle="Carbon intensity per m² broken down by building type. Green = energy contribution. Amber = waste contribution. Red dashed line = average."
          />
          <ChartCard
            title="Carbon intensity by building type"
            isLoading={domainLoading}
            isEmpty={intensityByTypeData.length === 0}
            dataUpdatedAt={domainUpdated}
            onRefresh={() =>
              queryClient.invalidateQueries({
                queryKey: ['analytics', 'domain-breakdown', selectedCampus],
              })
            }
          >
            <BuildingTypeIntensity
              data={intensityByTypeData}
              campusAvgIntensity={globalAvgIntensity}
            />
          </ChartCard>
        </section>

        {/* ── Energy: Scope 1 & 2 ───────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Energy — Scope 1 & 2 Emissions"
            subtitle="Direct emissions (diesel generators) and indirect emissions (grid electricity). Appliances reveal where energy is consumed."
            badge="Scope 1 & 2"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Appliance energy breakdown"
              subtitle="CO₂ contribution by appliance category (estimated from inventory)"
              isLoading={domainLoading}
              dataUpdatedAt={domainUpdated}
              onRefresh={() =>
                queryClient.invalidateQueries({
                  queryKey: ['analytics', 'domain-breakdown', selectedCampus],
                })
              }
            >
              {domainBreakdown && <ApplianceDonut data={domainBreakdown.byApplianceCategory} />}
            </ChartCard>

            <ChartCard
              title="Scope 1 vs Scope 2 by building type"
              subtitle="Direct (diesel) vs indirect (electricity) emissions per building category"
              isLoading={domainLoading}
              isEmpty={filteredByType.length === 0}
              dataUpdatedAt={domainUpdated}
              onRefresh={() =>
                queryClient.invalidateQueries({
                  queryKey: ['analytics', 'domain-breakdown', selectedCampus],
                })
              }
            >
              {domainBreakdown && (
                <ScopeStackedBar
                  data={filteredByType.map((d) => ({
                    type: d.type,
                    scope1: d.scope1,
                    scope2: d.scope2,
                    scope3: d.scope3,
                  }))}
                />
              )}
            </ChartCard>
          </div>

          {solarAdoptionCount > 0 && (
            <div className="mt-4 flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl p-4">
              <Zap size={20} className="text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800">
                <span className="font-semibold">
                  {solarAdoptionCount} of {coveredBuildings} buildings
                </span>{' '}
                with verified data have solar panels installed, offsetting grid electricity
                consumption.
              </p>
            </div>
          )}
        </section>

        {/* ── Materials: Embodied Carbon ────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Materials — Embodied Carbon"
            subtitle="One-time emissions locked in from building construction — concrete, steel, glass, and furniture. These cannot be reduced retroactively."
            badge="Scope 3"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Embodied carbon by building type"
              subtitle="Total one-time construction emissions per category"
              isLoading={domainLoading}
              isEmpty={filteredByType.length === 0}
              dataUpdatedAt={domainUpdated}
              onRefresh={() =>
                queryClient.invalidateQueries({
                  queryKey: ['analytics', 'domain-breakdown', selectedCampus],
                })
              }
            >
              {domainBreakdown && <BuildingTypeBar data={filteredByType} />}
            </ChartCard>

            <ChartCard
              title="Embodied vs operational split"
              subtitle="How construction and running emissions compare across building types"
              isLoading={domainLoading}
              isEmpty={filteredByType.length === 0}
              dataUpdatedAt={domainUpdated}
              onRefresh={() =>
                queryClient.invalidateQueries({
                  queryKey: ['analytics', 'domain-breakdown', selectedCampus],
                })
              }
            >
              {domainBreakdown && <EmbodiedOperationalSplit data={filteredByType} />}
            </ChartCard>
          </div>
        </section>

        {/* ── Waste: Scope 3 ────────────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Waste — Scope 3 Emissions"
            subtitle="Solid waste disposal methods and wastewater treatment both generate greenhouse gases. Composting and recycling dramatically reduce this footprint."
            badge="Scope 3"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Solid waste stream breakdown"
              subtitle="How solid waste is disposed (CO₂e-weighted average)"
              isLoading={wasteLoading}
              isEmpty={campusWasteStreams.length === 0}
            >
              <WasteStreamDonut data={campusWasteStreams} />
            </ChartCard>

            <ChartCard
              title="Solid vs liquid waste carbon & treatment"
              subtitle="Relative carbon impact and wastewater treatment distribution"
              isLoading={wasteLoading}
              isEmpty={filteredSolidCO2e === 0 && filteredLiquidCO2e === 0}
            >
              <WastewaterBar
                solidWasteCO2e={filteredSolidCO2e}
                liquidWasteCO2e={filteredLiquidCO2e}
                wastewaterByType={filteredWastewaterByType}
              />
            </ChartCard>
          </div>
        </section>

        {/* ── Building Leaderboard ──────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Who leads, who lags?"
            subtitle="Left: highest total emissions. Right: most carbon-efficient per m². Click any row to visit the building."
          />
          <DualLeaderboard
            data={filteredLeaderboard}
            onBuildingClick={(id) => navigate(`/buildings/${id}`)}
          />
        </section>

        {/* ── Data coverage & timeline ──────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Data coverage & submission activity"
            subtitle="How much of the tracked buildings have verified carbon data."
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2">
              <ChartCard
                title="Coverage progress"
                subtitle="Cumulative buildings with verified carbon data"
                isLoading={tsLoading}
                onRefresh={() =>
                  queryClient.invalidateQueries({
                    queryKey: ['analytics', 'time-series', selectedCampus],
                  })
                }
              >
                {timeSeries && <CoverageProgress data={timeSeries.buildingCoverage} />}
              </ChartCard>
            </div>
            <div className="lg:col-span-3">
              <ChartCard
                title="Submission activity"
                subtitle="Monthly building data submissions"
                isLoading={tsLoading}
                onRefresh={() =>
                  queryClient.invalidateQueries({
                    queryKey: ['analytics', 'time-series', selectedCampus],
                  })
                }
              >
                {timeSeries && <SubmissionHeatmap data={timeSeries.submissionsByMonth} />}
              </ChartCard>
            </div>
          </div>

          {timeSeries && timeSeries.submissionsByMonth.some((d) => d.count > 0) && (
            <div className="mt-6">
              <ChartCard title="Monthly submission count" isLoading={tsLoading}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={timeSeries.submissionsByMonth}
                    margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(v: number) => [`${v} submission${v !== 1 ? 's' : ''}`, 'Count']}
                    />
                    <Bar
                      dataKey="count"
                      name="Submissions"
                      fill={CHART_COLORS.embodied}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}
        </section>

        {/* ── Advanced: Compare Buildings ───────────────────────────────────────── */}
        <section>
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer list-none select-none">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-200">
                <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                Advanced: Compare Buildings
              </div>
            </summary>

            <div className="mt-6 space-y-6">
              <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-xl shadow-sm p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white text-sm">
                      Select up to 6 buildings to compare
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {compareSelectedIds.length} selected
                    </p>
                  </div>
                  {compareSelectedIds.length > 0 && (
                    <button
                      onClick={() => setCompareSelectedIds([])}
                      className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
                    >
                      <X size={12} /> Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Search buildings..."
                  value={compareSearchQ}
                  onChange={(e) => setCompareSearchQ(e.target.value)}
                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
                  {compareFilteredLeaderboard.map((b) => {
                    const selected = compareSelectedIds.includes(b.buildingId);
                    return (
                      <button
                        key={b.buildingId}
                        onClick={() => toggleCompareBuilding(b.buildingId)}
                        className={`w-full text-left flex items-center justify-between gap-3 py-2.5 px-2 rounded-lg text-sm transition-colors ${
                          selected ? 'bg-red-50' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ background: BUILDING_TYPE_COLORS[b.type] ?? '#9CA3AF' }}
                          />
                          <span className="truncate text-gray-100">{b.name}</span>
                          <span className="text-xs text-gray-400 capitalize flex-shrink-0">
                            {b.type}
                          </span>
                        </div>
                        {selected && (
                          <CheckCircle
                            size={14}
                            className="flex-shrink-0"
                            style={{ color: '#8B1A1A' }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {compareSelectedIds.length >= 2 && compareData && (
                <div className="space-y-4">
                  {BULLET_METRICS.map(({ key, label }) => {
                    const max = getMaxForMetric(key);
                    return (
                      <div key={key} className="bg-black/40 backdrop-blur-md border border-white/5 rounded-xl p-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                          {label}
                        </p>
                        <div className="space-y-2.5">
                          {compareData.buildings.map((b: unknown) => {
                            const building = b as Record<string, unknown>;
                            const v = (building[key] as number) ?? 0;
                            const w = max > 0 ? (v / max) * 100 : 0;
                            const isSelected = compareSelectedBuildings.some(
                              (sel) => sel.buildingId === (building.id as string)
                            );
                            return (
                              <div key={building.id as string} className="flex items-center gap-3">
                                <span className="text-xs text-gray-300 truncate w-28 flex-shrink-0">
                                  {building.name as string}
                                </span>
                                <div className="flex-1 bg-white/10 rounded-full h-2">
                                  <div
                                    className="h-2 rounded-full"
                                    style={{
                                      width: `${w}%`,
                                      background: isSelected ? '#8B1A1A' : '#94a3b8',
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-gray-200 font-medium w-16 text-right flex-shrink-0">
                                  {v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            );
                          })}
                          {/* Campus average reference */}
                          <div className="flex items-center gap-3 border-t border-dashed border-white/10 pt-2.5">
                            <span className="text-xs text-gray-400 italic w-28 flex-shrink-0">
                              Campus avg
                            </span>
                            <div className="flex-1 bg-white/10 rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-gray-400"
                                style={{
                                  width: `${
                                    max > 0
                                      ? (((compareData.campusAverages as Record<string, unknown>)[
                                          key
                                        ] as number) /
                                          max) *
                                        100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">
                              {(
                                (compareData.campusAverages as Record<string, unknown>)[
                                  key
                                ] as number
                              )?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) ?? '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {compareSelectedIds.length >= 2 && compareLoading && (
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-32 rounded-xl" />
                  ))}
                </div>
              )}
            </div>
          </details>
        </section>
      </div>
    </PageWrapper>
  );
}
