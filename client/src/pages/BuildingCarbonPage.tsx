import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Factory,
  Zap,
  Trash2,
  Layers,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import PageWrapper from '@/components/layout/PageWrapper';
import Skeleton from '@/components/common/Skeleton';
import { buildingsApi } from '@/features/buildings/buildingsApi';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SectionResult {
  status: string;
  version: number;
  verifiedAt?: string;
  embodiedCarbon: number;
  embodiedCarbonPerYear: number;
  operationalCarbonPerYear: number;
  wasteCarbonPerYear: number;
  carbonResults?: Record<string, unknown>;
  confidenceScore?: number | null;
}

interface CarbonSummary {
  buildingId: string;
  buildingName: string;
  hasAnyVerified: boolean;
  totalAnnualCO2e: number;
  totalEmbodiedCarbon: number;
  totalEmbodiedCarbonPerYear: number;
  byScope: { scope1: number; scope2: number; scope3: number };
  byComponent: Record<string, number> | null;
  bySource: { embodied: number; embodiedPerYear: number; operational: number; waste: number };
  confidenceScore: number | null;
  efSnapshot?: Record<string, unknown>;
  sections: {
    civil: SectionResult | null;
    electrical: SectionResult | null;
    waste: SectionResult | null;
  };
  lastCalculatedAt?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCOPE_COLORS = { scope1: '#ef4444', scope2: '#f59e0b', scope3: '#3b82f6' };

const SOURCE_CONFIG: Array<{
  key: string;
  label: string;
  scope: 1 | 2 | 3;
}> = [
  { key: 'gridElectricity', label: 'Grid Electricity', scope: 2 },
  { key: 'dieselGenerator', label: 'Diesel Generator', scope: 1 },
  { key: 'lpgCooking', label: 'LPG Cooking', scope: 1 },
  { key: 'vehicleFleet', label: 'Vehicle Fleet', scope: 1 },
  { key: 'refrigerantLeakage', label: 'Refrigerant Leakage', scope: 1 },
  { key: 'transformerLosses', label: 'Transformer Losses', scope: 2 },
  { key: 'evCharging', label: 'EV Charging', scope: 2 },
  { key: 'landfillCH4', label: 'Landfill CH₄', scope: 3 },
  { key: 'wasteIncineration', label: 'Waste Incineration', scope: 1 },
  { key: 'wastewaterCH4', label: 'Wastewater CH₄', scope: 3 },
  { key: 'wastewaterN2O', label: 'Wastewater N₂O', scope: 3 },
  { key: 'stpElectricity', label: 'STP Electricity', scope: 2 },
  { key: 'wtpElectricity', label: 'WTP Electricity', scope: 2 },
  { key: 'roElectricity', label: 'RO Electricity', scope: 2 },
  { key: 'embodiedMaterials', label: 'Building Materials (embodied)', scope: 3 },
];

const EF_TABLE: Array<{ source: string; value: string; ref: string }> = [
  { source: 'Grid Electricity', value: '0.82 kg CO₂/kWh', ref: 'CEA + MoEFCC' },
  { source: 'Diesel', value: '2.65 kg CO₂/L', ref: 'IPCC 2006' },
  { source: 'LPG', value: '3.13 kg CO₂/kg', ref: 'MoEFCC' },
  { source: 'Petrol (vehicles)', value: '2.31 kg CO₂/L', ref: 'IPCC 2006' },
  { source: 'Refrigerant (R-22)', value: '1810 GWP (AR6)', ref: 'IPCC AR6' },
  { source: 'Concrete (RCC)', value: '381 kg CO₂/m³', ref: 'GKSPL/IFC' },
  { source: 'Structural Steel', value: '2.8 tCO₂/tonne', ref: 'EPD' },
  { source: 'Brick', value: '0.24 kg CO₂/kg', ref: 'GKSPL' },
  { source: 'CH₄ (GWP)', value: '27 (AR6)', ref: 'IPCC AR6' },
  { source: 'N₂O (GWP)', value: '265 (AR6)', ref: 'IPCC AR6' },
];

const METHODOLOGY_LINES = [
  'Grid electricity: CEA emission factor (0.82 kgCO₂/kWh) × annual consumption, gross-up for T&D loss',
  'Diesel / LPG: IPCC 2006 default EFs × annual fuel consumption',
  'Landfill CH₄: IPCC First Order Decay (FOD) — k=0.065, DOC=0.11, GWP_CH₄=27 (AR6)',
  'Wastewater CH₄: IPCC Tier 2 — BOD × B₀(0.6) × MCF by treatment type, GWP=27',
  'Wastewater N₂O: IPCC Tier 2 — protein-based TN estimation, GWP_N₂O=265 (AR6)',
  'Incineration: mass × CC(0.6) × FCF(0.25) × BOE(0.95) × 44/12',
  'Embodied carbon: Annexure 8 material EFs (GKSPL, IFC, EPD), amortised over 50 years',
  'Refrigerant leakage: quantity × 10% annual leakage rate × IPCC AR6 GWP per refrigerant type',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

function pct(v: number, total: number) {
  if (!total) return '0%';
  return `${((v / total) * 100).toFixed(1)}%`;
}

// ── Scope card ────────────────────────────────────────────────────────────────

function ScopeCard({
  scope,
  value,
  label,
  color,
  total,
}: {
  scope: 1 | 2 | 3;
  value: number;
  label: string;
  color: string;
  total: number;
}) {
  return (
    <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-xl p-5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
          style={{ background: color }}
        >
          Scope {scope}
        </span>
        <span className="text-xs text-gray-400">{pct(value, total)}</span>
      </div>
      <div className="text-3xl font-bold text-white">{fmt(value)}</div>
      <div className="text-xs text-gray-400">tCO₂e/yr</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2 shadow text-xs">
      <div className="font-medium text-gray-200">{payload[0].name}</div>
      <div className="text-white">{fmt(payload[0].value)} tCO₂e/yr</div>
    </div>
  );
}

// ── Donut center label ────────────────────────────────────────────────────────

function DonutCenter({ total }: { total: number }) {
  return (
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
      <tspan x="50%" dy="-0.4em" fontSize="20" fontWeight="bold" fill="#111827">
        {fmt(total, 1)}
      </tspan>
      <tspan x="50%" dy="1.3em" fontSize="10" fill="#9ca3af">
        tCO₂e/yr
      </tspan>
    </text>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-100">{title}</span>
        {open ? (
          <ChevronUp size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ── Section status card ───────────────────────────────────────────────────────

function SectionStatusCard({
  sectionKey,
  icon: Icon,
  label,
  data,
  buildingId,
  primaryValue,
  primaryLabel,
  scopeLabel,
  accentColor,
}: {
  sectionKey: string;
  icon: React.ElementType;
  label: string;
  data: SectionResult | null;
  buildingId: string;
  primaryValue: number;
  primaryLabel: string;
  scopeLabel: string;
  accentColor: string;
}) {
  if (!data) {
    return (
      <div className="border border-white/5 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon size={15} className="text-gray-300" />
          <span className="text-sm font-medium text-gray-400">{label}</span>
        </div>
        <div className="text-xs text-gray-400 italic">No verified data</div>
      </div>
    );
  }

  const confidence = data.confidenceScore ?? 0;
  const confPct = typeof confidence === 'number' ? Math.round(confidence * 100) : confidence;

  return (
    <div className="border border-white/5 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={15} style={{ color: accentColor }} />
          <span className="text-sm font-semibold text-gray-100">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 size={10} /> Verified
          </span>
          {data.verifiedAt && (
            <span className="text-xs text-gray-400">
              {new Date(data.verifiedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-xl font-bold text-white">{fmt(primaryValue)}</span>
        <span className="text-xs text-gray-400 mb-0.5">tCO₂e/yr</span>
        <span
          className="text-xs px-1.5 py-0.5 rounded font-mono ml-1 mb-0.5"
          style={{
            background:
              scopeLabel === 'S1' ? '#fee2e2' : scopeLabel === 'S2' ? '#fef3c7' : '#dbeafe',
            color: scopeLabel === 'S1' ? '#b91c1c' : scopeLabel === 'S2' ? '#b45309' : '#1d4ed8',
          }}
        >
          {scopeLabel}
        </span>
      </div>
      <div className="text-xs text-gray-400">{primaryLabel}</div>

      {confPct > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Confidence</span>
            <span className="font-medium">{confPct}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${confPct >= 80 ? 'bg-green-500' : confPct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${confPct}%` }}
            />
          </div>
        </div>
      )}

      <Link
        to={`/buildings/${buildingId}/entry/${sectionKey}`}
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
      >
        View data <ExternalLink size={10} />
      </Link>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BuildingCarbonPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: res,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['building-carbon', id],
    queryFn: () => buildingsApi.getCarbonSummary(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const summary = res?.data?.data as CarbonSummary | undefined;

  if (isLoading) {
    return (
      <PageWrapper title="Carbon Summary">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </PageWrapper>
    );
  }

  if (isError || !summary) {
    return (
      <PageWrapper title="Carbon Summary">
        <div className="max-w-5xl mx-auto px-4 py-16 text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400 text-sm">No verified carbon data found for this building.</p>
          <Link
            to={`/buildings/${id}`}
            className="mt-4 inline-block text-sm text-blue-600 hover:underline"
          >
            Back to building
          </Link>
        </div>
      </PageWrapper>
    );
  }

  if (!summary.hasAnyVerified) {
    return (
      <PageWrapper title={`Carbon — ${summary.buildingName}`}>
        <div className="max-w-5xl mx-auto px-4 py-16 text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-200 mb-2">Carbon not yet calculated</h2>
          <p className="text-sm text-gray-400 mb-4">
            At least one section must be verified before carbon results are available.
          </p>
          <Link
            to={`/buildings/${id}`}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <ArrowLeft size={14} /> Back to building
          </Link>
        </div>
      </PageWrapper>
    );
  }

  const { byScope, byComponent } = summary;
  const scopeTotal = byScope.scope1 + byScope.scope2 + byScope.scope3;

  // ── Donut chart data ───────────────────────────────────────────────────────
  const donutData = [
    { name: 'Scope 1 (direct)', value: byScope.scope1, fill: SCOPE_COLORS.scope1 },
    { name: 'Scope 2 (electricity)', value: byScope.scope2, fill: SCOPE_COLORS.scope2 },
    { name: 'Scope 3 (value chain)', value: byScope.scope3, fill: SCOPE_COLORS.scope3 },
  ].filter((d) => d.value > 0.001);

  // ── Horizontal bar chart data ──────────────────────────────────────────────
  const barData = SOURCE_CONFIG.map((s) => ({
    name: s.label,
    value: byComponent?.[s.key] ?? 0,
    fill: SCOPE_COLORS[`scope${s.scope}` as keyof typeof SCOPE_COLORS],
    scope: s.scope,
  }))
    .filter((d) => d.value > 0.001)
    .sort((a, b) => b.value - a.value);

  return (
    <PageWrapper title={`Carbon — ${summary.buildingName}`}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Back link */}
        <Link
          to={`/buildings/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft size={14} /> Back to {summary.buildingName}
        </Link>

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-white">
            {summary.buildingName} — Carbon Footprint
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {summary.lastCalculatedAt && (
              <span className="text-xs text-gray-400">
                Last calculated:{' '}
                {new Date(summary.lastCalculatedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
            {summary.efSnapshot && (
              <span className="text-xs text-gray-400">
                EF snapshot:{' '}
                {summary.efSnapshot._snapshotTimestamp
                  ? new Date(summary.efSnapshot._snapshotTimestamp as string).toLocaleDateString(
                      'en-IN',
                      { month: 'short', year: 'numeric' }
                    )
                  : 'Annexure 8 defaults'}
              </span>
            )}
            {summary.confidenceScore != null && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  summary.confidenceScore >= 80
                    ? 'bg-green-100 text-green-700'
                    : summary.confidenceScore >= 50
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-600'
                }`}
              >
                {summary.confidenceScore}% confidence
              </span>
            )}
          </div>
        </div>

        {/* ── SECTION 1: Scope cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ScopeCard
            scope={1}
            value={byScope.scope1}
            label="Direct emissions (combustion, refrigerants, waste)"
            color={SCOPE_COLORS.scope1}
            total={scopeTotal}
          />
          <ScopeCard
            scope={2}
            value={byScope.scope2}
            label="Indirect — purchased electricity"
            color={SCOPE_COLORS.scope2}
            total={scopeTotal}
          />
          <ScopeCard
            scope={3}
            value={byScope.scope3}
            label="Value chain — embodied materials, wastewater"
            color={SCOPE_COLORS.scope3}
            total={scopeTotal}
          />
        </div>

        {/* Total annual */}
        <div className="bg-gray-900 rounded-xl px-6 py-4 text-center">
          <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">
            Total annual footprint
          </p>
          <p className="text-4xl font-bold text-white">
            {fmt(summary.totalAnnualCO2e)}{' '}
            <span className="text-xl font-normal text-gray-400">tCO₂e/yr</span>
          </p>
        </div>

        {/* ── SECTION 2 & 3: Charts ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Donut: scope breakdown */}
          <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Scope breakdown</h3>
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                    <DonutCenter total={scopeTotal} />
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(v, entry) => {
                      const val = (entry as { payload?: { value: number } }).payload?.value ?? 0;
                      return (
                        <span className="text-xs text-gray-300">
                          {v}: {fmt(val)} ({pct(val, scopeTotal)})
                        </span>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-gray-400 text-center py-8">No data</div>
            )}
          </div>

          {/* Horizontal bar: per-source */}
          <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Source breakdown</h3>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
                >
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 9 }}
                    width={120}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {barData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-gray-400 text-center py-8">
                No component data available
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 4: Section status cards ─────────────────────────────── */}
        <Collapsible title="Section Data & Status" defaultOpen>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <SectionStatusCard
              sectionKey="civil"
              icon={Layers}
              label="Civil (embodied carbon)"
              data={summary.sections.civil}
              buildingId={id!}
              primaryValue={summary.sections.civil?.embodiedCarbonPerYear ?? 0}
              primaryLabel="amortised embodied carbon per year"
              scopeLabel="S3"
              accentColor="#f59e0b"
            />
            <SectionStatusCard
              sectionKey="electrical"
              icon={Zap}
              label="Electrical (operational)"
              data={summary.sections.electrical}
              buildingId={id!}
              primaryValue={summary.sections.electrical?.operationalCarbonPerYear ?? 0}
              primaryLabel="operational carbon per year"
              scopeLabel="S2"
              accentColor="#3b82f6"
            />
            <SectionStatusCard
              sectionKey="waste"
              icon={Trash2}
              label="Waste & wastewater"
              data={summary.sections.waste}
              buildingId={id!}
              primaryValue={summary.sections.waste?.wasteCarbonPerYear ?? 0}
              primaryLabel="waste carbon per year"
              scopeLabel="S3"
              accentColor="#10b981"
            />
          </div>

          {summary.totalEmbodiedCarbon > 0 && (
            <div className="mt-4 flex items-start gap-2 text-xs text-gray-400 bg-white/5 rounded-lg px-3 py-2">
              <Info size={12} className="mt-0.5 flex-shrink-0" />
              One-time embodied carbon (total construction):{' '}
              <span className="font-semibold text-gray-300 ml-0.5">
                {fmt(summary.totalEmbodiedCarbon)} tCO₂e
              </span>{' '}
              — amortised at {fmt(summary.totalEmbodiedCarbonPerYear)} tCO₂e/yr over 50 years
              (included in Scope 3 annual total above)
            </div>
          )}
        </Collapsible>

        {/* ── SECTION 5: EF Disclosure ─────────────────────────────────────── */}
        <Collapsible
          title={
            <span className="flex items-center gap-1.5">
              <Factory size={14} className="text-gray-400" />
              Emission Factors Used in This Calculation
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 text-gray-400 font-medium w-1/2">Source</th>
                  <th className="text-right py-2 text-gray-400 font-medium">EF Value</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody>
                {EF_TABLE.map((row) => (
                  <tr key={row.source} className="border-b border-gray-50">
                    <td className="py-2 text-gray-200">{row.source}</td>
                    <td className="py-2 text-right font-mono text-gray-100">{row.value}</td>
                    <td className="py-2 text-right text-gray-400">{row.ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {summary.efSnapshot && (
              <div className="mt-3 text-xs text-gray-400">
                <span className="font-medium">EF values as of: </span>
                {summary.efSnapshot._snapshotTimestamp
                  ? new Date(summary.efSnapshot._snapshotTimestamp as string).toLocaleDateString(
                      'en-IN',
                      { day: 'numeric', month: 'long', year: 'numeric' }
                    )
                  : 'Annexure 8 defaults (static)'}
                {summary.efSnapshot.gridEF && (
                  <span className="ml-3">
                    Grid EF used:{' '}
                    <span className="font-semibold text-gray-300">
                      {summary.efSnapshot.gridEF as number} kg CO₂/kWh
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </Collapsible>

        {/* ── SECTION 6: Methodology ───────────────────────────────────────── */}
        <Collapsible
          title={
            <span className="flex items-center gap-1.5">
              <Info size={14} className="text-gray-400" />
              Calculation Methodology
            </span>
          }
        >
          <ul className="space-y-2 pt-1">
            {METHODOLOGY_LINES.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <span className="mt-0.5 text-gray-300 flex-shrink-0">•</span>
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-gray-400">
            Scope classification follows GHG Protocol Corporate Standard. All GWPs use IPCC AR6
            100-year values. Annual totals are based on reported data for the most recent verified
            submission of each section.
          </p>
        </Collapsible>
      </div>
    </PageWrapper>
  );
}
