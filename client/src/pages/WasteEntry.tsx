import { useEffect, useReducer, useRef, useCallback, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Trash2,
  Droplets,
  Plus,
  X,
  Save,
  Send,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  ChevronRight,
  Flame,
  Waves,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import {
  SolidWasteDisposalMethod,
  WastewaterTreatmentType,
  ISolidWasteStream,
  ICustomField,
  EntryMode,
  IWasteSectionData,
  IWaterTreatmentPlant,
  IROPlant,
  IWaterSourceRecord,
  IStorageTank,
  IWaterQualityRecord,
  WaterSourceType,
  ROTechnologyType,
  IStpEtpPlant,
  WastewaterSourceType,
  ILandfillSite,
  IIncinerationFacility,
  IMswPlant,
  ISieveFraction,
  IncineratorType,
  SieveSize,
} from '@shared/types/submission.types';
import {
  RO_ENERGY_KWH_M3,
  WTP_ENERGY_KWH_M3,
  WASTE_DEFAULTS_BY_BUILDING_TYPE,
  WASTEWATER_PARAMETER_LABELS,
  WASTEWATER_PARAMETER_UNITS,
  CPCB_DISCHARGE_STANDARDS,
  IPCC_WASTEWATER,
  STP_ENERGY_KWH_M3,
  SOLID_WASTE_DOC,
  LANDFILL_MCF,
  INCINERATION_EF,
  SIEVE_SIZE_LABELS,
  SIEVE_WASTE_TYPE_HINTS,
  DEFAULT_SIEVE_FRACTIONS,
} from '@shared/constants/defaults';
import { UserRole } from '@shared/types/user.types';
import { buildingsApi } from '@/features/buildings/buildingsApi';
import { submissionsApi } from '@/features/submissions/submissionsApi';
import { useAuthStore } from '@/features/auth/authStore';
import { useToast } from '@/hooks/useToast';
import PageWrapper from '@/components/layout/PageWrapper';
import Button from '@/components/common/Button';
import Skeleton from '@/components/common/Skeleton';
import { cn } from '@/utils/cn';
import {
  wasteEntryReducer,
  initialState,
  makeDefaultStreams,
  WasteZone,
} from '@/features/waste/wasteEntryReducer';

// ── Emission factors (kgCO₂e per kg solid / per litre liquid) ─────────────────
const SOLID_EF: Record<string, number> = {
  [SolidWasteDisposalMethod.UNMANAGED_DUMP]: 0.52,
  [SolidWasteDisposalMethod.OPEN_BURNING]: 0.98,
  [SolidWasteDisposalMethod.MANAGED_LANDFILL]: 0.52,
  [SolidWasteDisposalMethod.COMPOSTING]: 0.1,
  [SolidWasteDisposalMethod.RECYCLING]: 0.021,
};
const LIQUID_EF: Record<WastewaterTreatmentType, number> = {
  [WastewaterTreatmentType.UNMANAGED_SEPTIC]: 0.068,
  [WastewaterTreatmentType.MUNICIPAL_STP]: 0.012,
  [WastewaterTreatmentType.CAMPUS_STP]: 0.008,
};

// ── Method metadata ──────────────────────────────────────────────────────────
const METHOD_META: Record<
  SolidWasteDisposalMethod,
  { label: string; desc: string; impact: string; color: string; border: string; textColor: string }
> = {
  [SolidWasteDisposalMethod.UNMANAGED_DUMP]: {
    label: 'Unmanaged dump / open landfill',
    desc: 'Waste left in open dump or unlined landfill',
    impact: 'Highest impact',
    color: 'bg-red-50',
    border: 'border-l-red-500',
    textColor: 'text-red-700',
  },
  [SolidWasteDisposalMethod.OPEN_BURNING]: {
    label: 'Open burning',
    desc: 'Waste burned in open air or burn pits',
    impact: 'Avoid — highest carbon',
    color: 'bg-rose-50',
    border: 'border-l-rose-700',
    textColor: 'text-rose-800',
  },
  [SolidWasteDisposalMethod.MANAGED_LANDFILL]: {
    label: 'Managed landfill',
    desc: 'Lined landfill with leachate management',
    impact: 'Medium impact',
    color: 'bg-amber-50',
    border: 'border-l-amber-500',
    textColor: 'text-amber-700',
  },
  [SolidWasteDisposalMethod.COMPOSTING]: {
    label: 'Composting',
    desc: 'Organic material composted aerobically',
    impact: 'Low impact',
    color: 'bg-green-50',
    border: 'border-l-green-500',
    textColor: 'text-green-700',
  },
  [SolidWasteDisposalMethod.RECYCLING]: {
    label: 'Recycling',
    desc: 'Paper, plastic, metal, glass recycled',
    impact: 'Lowest impact',
    color: 'bg-blue-50',
    border: 'border-l-blue-500',
    textColor: 'text-blue-700',
  },
};

const WASTEWATER_OPTIONS: Array<{
  value: WastewaterTreatmentType;
  label: string;
  desc: string;
  color: string;
  textColor: string;
  efLabel: string;
}> = [
  {
    value: WastewaterTreatmentType.UNMANAGED_SEPTIC,
    label: 'A — Unmanaged / septic tank',
    desc: 'Septic tank, cesspit, or no treatment',
    color: 'border-red-200 bg-red-50',
    textColor: 'text-red-700',
    efLabel: 'High emissions',
  },
  {
    value: WastewaterTreatmentType.MUNICIPAL_STP,
    label: 'B — Municipal STP / external network',
    desc: 'Connected to municipal sewage treatment plant or city sewer network',
    color: 'border-amber-200 bg-amber-50',
    textColor: 'text-amber-700',
    efLabel: 'Medium emissions',
  },
  {
    value: WastewaterTreatmentType.CAMPUS_STP,
    label: 'C — Campus STP (on-site treatment)',
    desc: 'On-site sewage treatment plant serving the campus',
    color: 'border-green-200 bg-green-50',
    textColor: 'text-green-700',
    efLabel: 'Lower emissions',
  },
];

const SECTION_IDS = [
  'sw-generation',
  'sw-landfill',
  'sw-incineration',
  'sw-mswplant',
  'solid-waste',
  'ww-generation',
  'ww-characteristics',
  'stp-etp',
  'liquid-waste',
  'water-systems',
] as const;
type SectionId = (typeof SECTION_IDS)[number];
const SECTION_LABELS: Record<SectionId, string> = {
  'sw-generation': 'Solid waste generation',
  'sw-landfill': 'Landfill deposition records',
  'sw-incineration': 'Incineration records',
  'sw-mswplant': 'Waste management plant',
  'solid-waste': 'Quick entry (fallback)',
  'ww-generation': 'Wastewater generation',
  'ww-characteristics': 'Wastewater characteristics',
  'stp-etp': 'STP & ETP plants',
  'liquid-waste': 'Quick entry (fallback)',
  'water-systems': 'Water systems',
};

const WW_SOURCE_LABELS: Record<WastewaterSourceType, string> = {
  domestic_sewage: 'Domestic sewage',
  hospital_effluent: 'Hospital effluent',
  kitchen_wastewater: 'Kitchen wastewater',
  vehicle_wash: 'Vehicle wash',
  industrial_effluent: 'Industrial effluent',
  mixed_sewage_effluent: 'Mixed sewage & effluent',
  other: 'Other',
};

// ── Water source scope badges ────────────────────────────────────────────────
const SOURCE_SCOPE: Record<WaterSourceType, { label: string; color: string }> = {
  municipal: { label: 'Scope 3', color: 'bg-white/10 text-gray-300' },
  groundwater_borewell: { label: 'Scope 2 (pumping)', color: 'bg-amber-100 text-amber-700' },
  recycled_reclaimed: { label: 'Low impact', color: 'bg-green-100 text-green-700' },
  surface_water: { label: 'Campus managed', color: 'bg-blue-100 text-blue-700' },
  rainwater_harvested: { label: 'Zero carbon', color: 'bg-emerald-100 text-emerald-700' },
  other: { label: 'Unknown', color: 'bg-white/10 text-gray-400' },
};

const SOURCE_LABELS: Record<WaterSourceType, string> = {
  municipal: 'Municipal supply (utility)',
  groundwater_borewell: 'Groundwater (borewell / tubewell)',
  recycled_reclaimed: 'Recycled / reclaimed water',
  surface_water: 'Surface water (tank, pond, river)',
  rainwater_harvested: 'Harvested rainwater',
  other: 'Other source',
};

const RO_TECH_LABELS: Record<ROTechnologyType, string> = {
  standard_ro: 'Standard RO',
  nanofiltration: 'Nanofiltration (NF)',
  ultrafiltration: 'Ultrafiltration (UF)',
  brackish_water_ro: 'Brackish water RO (BWRO)',
  seawater_ro: 'Seawater RO (SWRO)',
  other: 'Other membrane technology',
};

const QUALITY_PARAM_LABELS: Record<string, string> = {
  colour: 'Colour',
  odour: 'Odour',
  ph: 'pH value',
  taste: 'Taste',
  turbidity_ntu: 'Turbidity',
  tds_mg_l: 'Total Dissolved Solids',
  total_coliform_mpn: 'Total Coliform',
  fecal_coliform_mpn: 'Fecal Coliform',
  custom: 'Custom parameter',
};

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcSolidCO2(
  kgPerDay: number,
  fraction: number,
  method: string,
  operatingDays: number
): number {
  const ef = SOLID_EF[method] ?? SOLID_EF[SolidWasteDisposalMethod.UNMANAGED_DUMP];
  return (kgPerDay * (fraction / 100) * operatingDays * ef) / 1000;
}

function calcLiquidCO2(
  litresPerDay: number,
  treatment: WastewaterTreatmentType,
  operatingDays: number
): number {
  const ef = LIQUID_EF[treatment] ?? LIQUID_EF[WastewaterTreatmentType.UNMANAGED_SEPTIC];
  return (litresPerDay * operatingDays * ef) / 1000;
}

function formatSaveStatus(lastSavedAt: Date | null, isSaving: boolean, isDirty: boolean): string {
  if (isSaving) return 'Saving…';
  if (!lastSavedAt) return isDirty ? 'Unsaved changes' : 'Not yet saved';
  const secs = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
  if (secs < 30) return 'Just saved';
  if (secs < 60) return `Saved ${secs}s ago`;
  return `Saved ${Math.floor(secs / 60)}m ago`;
}

function ProgressRing({ pct, color = '#d97706' }: { pct: number; color?: string }) {
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
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span className="absolute text-xs font-semibold text-gray-200">{pct}%</span>
    </div>
  );
}

// ── DisposalMethodRow ─────────────────────────────────────────────────────────

interface DisposalMethodRowProps {
  stream: ISolidWasteStream;
  kgPerDay: number;
  operatingDays: number;
  onFractionChange: (id: string, fraction: number) => void;
  onRemove?: (id: string) => void;
  isChanged?: boolean;
}

function DisposalMethodRow({
  stream,
  kgPerDay,
  operatingDays,
  onFractionChange,
  onRemove,
  isChanged,
}: DisposalMethodRowProps) {
  const isCustom = stream.isCustomMethod;
  const meta = !isCustom ? METHOD_META[stream.disposalMethod as SolidWasteDisposalMethod] : null;

  const label = isCustom ? (stream.customMethodLabel ?? stream.disposalMethod) : meta!.label;
  const ef = SOLID_EF[stream.disposalMethod] ?? SOLID_EF[SolidWasteDisposalMethod.UNMANAGED_DUMP];
  const co2Preview = calcSolidCO2(
    kgPerDay,
    stream.fractionPercent,
    stream.disposalMethod,
    operatingDays
  );

  return (
    <div
      className={cn(
        'border-l-4 px-4 py-3 rounded-r-lg transition-colors',
        meta?.color ?? 'bg-purple-50',
        meta?.border ?? 'border-l-purple-400',
        isChanged && 'ring-1 ring-amber-300'
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Name + impact badge */}
        <div className="flex-1 min-w-[140px]">
          <p className="text-sm font-medium text-gray-100">{label}</p>
          {meta && (
            <p className={cn('text-xs mt-0.5', meta.textColor)}>
              {meta.impact} · {meta.desc}
            </p>
          )}
          {isCustom && (
            <p className="text-xs text-purple-600 mt-0.5">EF: {ef.toFixed(3)} kgCO₂e/kg</p>
          )}
        </div>

        {/* Slider */}
        <div className="flex items-center gap-2 min-w-[160px] flex-1">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={stream.fractionPercent}
            onChange={(e) => onFractionChange(stream.id, parseInt(e.target.value))}
            className="flex-1 h-2 accent-rose-600"
          />
        </div>

        {/* tCO₂e preview */}
        <div className="text-right min-w-[80px]">
          {kgPerDay > 0 && co2Preview > 0 && (
            <span className="text-xs text-gray-400 font-mono">
              {co2Preview.toFixed(2)} tCO₂e/yr
            </span>
          )}
        </div>

        {/* Percentage input */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={0}
            max={100}
            value={stream.fractionPercent}
            onChange={(e) => onFractionChange(stream.id, parseInt(e.target.value) || 0)}
            className="w-14 text-center text-sm border border-white/10 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          />
          <span className="text-sm text-gray-400">%</span>
        </div>

        {/* Remove button (custom only) */}
        {onRemove && isCustom && (
          <button
            type="button"
            onClick={() => onRemove(stream.id)}
            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── CustomWasteStreamForm ─────────────────────────────────────────────────────

function CustomWasteStreamForm({
  onAdd,
  onCancel,
}: {
  onAdd: (s: ISolidWasteStream) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    label: '',
    ef: '',
    fraction: '0',
    notes: '',
  });

  function handleAdd() {
    if (!form.label.trim()) return;
    const ef = parseFloat(form.ef) || SOLID_EF[SolidWasteDisposalMethod.UNMANAGED_DUMP];
    onAdd({
      id: crypto.randomUUID(),
      disposalMethod: `custom_${ef}`,
      isCustomMethod: true,
      customMethodLabel: form.label.trim(),
      fractionPercent: Math.max(0, Math.min(100, parseInt(form.fraction) || 0)),
    });
  }

  return (
    <div className="p-4 bg-purple-50 border border-dashed border-purple-300 rounded-xl space-y-3">
      <p className="text-sm font-medium text-purple-800">Add custom disposal method</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-400 mb-1 block">Method name *</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Hazardous waste pickup, E-waste collection"
            className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20 bg-black/40 backdrop-blur-md"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">
            Emission factor (kgCO₂e/kg) <span className="text-gray-400">— optional</span>
          </label>
          <input
            type="number"
            min={0}
            step="0.001"
            value={form.ef}
            onChange={(e) => setForm((f) => ({ ...f, ef: e.target.value }))}
            placeholder={`default ${SOLID_EF[SolidWasteDisposalMethod.UNMANAGED_DUMP]}`}
            className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20 bg-black/40 backdrop-blur-md"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Initial fraction (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={form.fraction}
            onChange={(e) => setForm((f) => ({ ...f, fraction: e.target.value }))}
            className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20 bg-black/40 backdrop-blur-md"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-400 mb-1 block">Notes (optional)</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Any additional context"
            className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20 bg-black/40 backdrop-blur-md"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleAdd} disabled={!form.label.trim()}>
          Add method
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── CustomDischargePointForm ──────────────────────────────────────────────────

function CustomDischargePointForm({
  onAdd,
  onCancel,
}: {
  onAdd: (p: ICustomField) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    label: '',
    value: '',
    treatment: WastewaterTreatmentType.UNMANAGED_SEPTIC,
    notes: '',
  });

  function handleAdd() {
    if (!form.label.trim()) return;
    onAdd({
      id: crypto.randomUUID(),
      label: form.label.trim(),
      value: parseFloat(form.value) || 0,
      unit: 'L/day',
      notes: `treatment:${form.treatment}${form.notes ? ` | ${form.notes}` : ''}`,
    });
  }

  return (
    <div className="p-4 bg-blue-50 border border-dashed border-blue-300 rounded-xl space-y-3">
      <p className="text-sm font-medium text-blue-800">Add custom liquid discharge point</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-400 mb-1 block">Description *</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Lab chemical drain, Cooling tower blowdown"
            className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-black/40 backdrop-blur-md"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Volume (litres/day)</label>
          <input
            type="number"
            min={0}
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            placeholder="e.g. 500"
            className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-black/40 backdrop-blur-md"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Treatment</label>
          <select
            value={form.treatment}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                treatment: e.target.value as WastewaterTreatmentType,
              }))
            }
            className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-black/40 backdrop-blur-md"
          >
            {WASTEWATER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-400 mb-1 block">Notes (optional)</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Any additional context"
            className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-black/40 backdrop-blur-md"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleAdd} disabled={!form.label.trim()}>
          Add point
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── ZoneCard ──────────────────────────────────────────────────────────────────

interface ZoneCardProps {
  zone: WasteZone;
  kgTotalPerDay: number;
  operatingDays: number;
  onUpdateKg: (id: string, kg: number) => void;
  onUpdateName: (id: string, name: string) => void;
  onStreamFraction: (zoneId: string, streamId: string, fraction: number) => void;
  onRemove: (id: string) => void;
}

function ZoneCard({
  zone,
  operatingDays,
  onUpdateKg,
  onUpdateName,
  onStreamFraction,
  onRemove,
}: ZoneCardProps) {
  const total = zone.streams.reduce((s, x) => s + x.fractionPercent, 0);
  const zoneCO2 = zone.streams.reduce(
    (sum, s) =>
      sum + calcSolidCO2(zone.kgPerDay, s.fractionPercent, s.disposalMethod, operatingDays),
    0
  );

  return (
    <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
      <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between gap-3">
        <input
          type="text"
          value={zone.zoneName}
          onChange={(e) => onUpdateName(zone.id, e.target.value)}
          className="flex-1 text-sm font-medium border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-100 placeholder-gray-400"
          placeholder="Zone name (e.g. Lab wing)"
        />
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            min={0}
            value={zone.kgPerDay || ''}
            onChange={(e) => onUpdateKg(zone.id, parseFloat(e.target.value) || 0)}
            className="w-20 text-sm text-center border border-white/10 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            placeholder="0"
          />
          <span className="text-xs text-gray-400">kg/day</span>
          {zoneCO2 > 0 && (
            <span className="text-xs font-mono text-gray-400">{zoneCO2.toFixed(2)} t/yr</span>
          )}
          <button
            type="button"
            onClick={() => onRemove(zone.id)}
            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div
          className={cn(
            'text-xs font-medium mb-2',
            Math.abs(total - 100) < 1 ? 'text-green-600' : 'text-red-500'
          )}
        >
          Total: {total}% {Math.abs(total - 100) < 1 ? '✓' : '(must be 100)'}
        </div>
        {zone.streams.map((s) => (
          <DisposalMethodRow
            key={s.id}
            stream={s}
            kgPerDay={zone.kgPerDay}
            operatingDays={operatingDays}
            onFractionChange={(streamId, fraction) => onStreamFraction(zone.id, streamId, fraction)}
          />
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

interface BuildingData {
  _id: string;
  name: string;
  shortName?: string;
  type: string;
  assignedMembers: Array<{ _id: string }>;
  wasteStatus: string;
  wasteVersion: number;
  floors?: number;
}

export default function WasteEntry() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { showSuccess, showError, showWarning } = useToast();

  const [state, dispatch] = useReducer(wasteEntryReducer, initialState);
  const [activeSection, setActiveSection] = useState<SectionId>('solid-waste');
  const [showCustomStream, setShowCustomStream] = useState(false);
  const [showCustomDischarge, setShowCustomDischarge] = useState(false);
  // Per-site/facility UI state (keyed by ID — avoids useState inside .map())
  const [landfillEntryModes, setLandfillEntryModes] = useState<
    Record<string, 'annual' | 'monthly'>
  >({});
  const [landfillSelectedYears, setLandfillSelectedYears] = useState<Record<string, number>>({});
  const [incinerationSelectedYears, setIncinerationSelectedYears] = useState<
    Record<string, number>
  >({});
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch building ─────────────────────────────────────────────────────────
  const { data: buildingRes, isLoading: isBuildingLoading } = useQuery({
    queryKey: ['building', id],
    queryFn: () => buildingsApi.getById(id!),
    enabled: !!id,
  });

  const building = buildingRes?.data?.data as BuildingData | undefined;

  // ── Guard: must be assigned ────────────────────────────────────────────────
  useEffect(() => {
    if (!building || !user) return;
    const isAssigned = building.assignedMembers.some((m) => m._id === user._id);
    const isPrivileged = user.role === UserRole.REVIEWER || user.role === UserRole.ADMIN;
    if (!isAssigned && !isPrivileged) {
      showWarning('You are not assigned to this building');
      navigate(`/buildings/${id}`, { replace: true });
    }
  }, [building, user, id, navigate, showWarning]);

  // ── Fetch or create waste draft ────────────────────────────────────────────
  const { data: draftRes } = useQuery({
    queryKey: ['waste-draft', id],
    queryFn: () => submissionsApi.getOrCreateDraft(id!, 'waste'),
    enabled: !!id,
  });

  useEffect(() => {
    const draft = draftRes?.data?.data;
    if (!draft) return;
    dispatch({ type: 'SET_SUBMISSION_ID', payload: draft._id });
    dispatch({ type: 'SET_VERSION', payload: draft.version ?? 1 });
    const wasteData = draft.data as Partial<IWasteSectionData> | undefined;
    if (wasteData) {
      dispatch({ type: 'HYDRATE', payload: { wasteData, version: draft.version } });
    }
  }, [draftRes]);

  // ── Operating days (from defaults) ────────────────────────────────────────
  const operatingDays = 6 * 52; // default 312 days/year

  // ── Waste defaults by building type ───────────────────────────────────────
  const buildingType = (building?.type ?? 'academic').toLowerCase();
  const wasteDefaults = useMemo(
    () =>
      WASTE_DEFAULTS_BY_BUILDING_TYPE[buildingType] ?? WASTE_DEFAULTS_BY_BUILDING_TYPE['academic'],
    [buildingType]
  );

  // ── Quick estimate chips ───────────────────────────────────────────────────
  const occupantEstimate = 100; // fallback
  const estimatedKgPerDay = useMemo(
    () => occupantEstimate * wasteDefaults.solidWasteKgPerDayPerOccupant,
    [wasteDefaults]
  );
  const estimatedLitresPerDay = useMemo(
    () => occupantEstimate * wasteDefaults.wastewaterLitresPerPersonPerDay,
    [wasteDefaults]
  );

  // ── Live CO₂ totals ────────────────────────────────────────────────────────
  const { solidCO2, liquidCO2, totalCO2, hasOpenBurning } = useMemo(() => {
    const kgPerDay = state.solidWasteKgPerDay;
    let solid = 0;
    let hasBurning = false;

    if (state.solidWasteMode === 'building_total') {
      for (const s of state.wasteStreams) {
        solid += calcSolidCO2(kgPerDay, s.fractionPercent, s.disposalMethod, operatingDays);
        if (s.disposalMethod === SolidWasteDisposalMethod.OPEN_BURNING && s.fractionPercent > 0)
          hasBurning = true;
      }
    } else {
      for (const z of state.zones) {
        for (const s of z.streams) {
          solid += calcSolidCO2(z.kgPerDay, s.fractionPercent, s.disposalMethod, operatingDays);
          if (s.disposalMethod === SolidWasteDisposalMethod.OPEN_BURNING && s.fractionPercent > 0)
            hasBurning = true;
        }
      }
    }

    const litresPerDay = state.wastewaterIsEstimated
      ? estimatedLitresPerDay
      : state.wastewaterLitresPerDay;
    const liquid = calcLiquidCO2(litresPerDay, state.wastewaterTreatmentType, operatingDays);

    // Add custom discharge points
    let customLiquid = 0;
    for (const p of state.customDischargePoints) {
      // notes field stores "treatment:xxx"
      const match = p.notes?.match(/treatment:(\S+)/);
      const treatment =
        (match?.[1] as WastewaterTreatmentType) ?? WastewaterTreatmentType.UNMANAGED_SEPTIC;
      customLiquid += calcLiquidCO2(p.value, treatment, operatingDays);
    }

    return {
      solidCO2: solid,
      liquidCO2: liquid + customLiquid,
      totalCO2: solid + liquid + customLiquid,
      hasOpenBurning: hasBurning,
    };
  }, [
    state.solidWasteMode,
    state.wasteStreams,
    state.zones,
    state.solidWasteKgPerDay,
    state.wastewaterTreatmentType,
    state.wastewaterIsEstimated,
    state.wastewaterLitresPerDay,
    state.customDischargePoints,
    estimatedLitresPerDay,
    operatingDays,
  ]);

  // ── Stream sum validation ──────────────────────────────────────────────────
  const streamTotal = state.wasteStreams.reduce((sum, s) => sum + s.fractionPercent, 0);
  const streamSumOk = Math.abs(streamTotal - 100) < 1;

  // ── Changed field detection (re-entry workflow) ───────────────────────────
  const isReEntry = state.version > 1 && !!state.previousData;

  function isFieldChanged(fieldPath: string): boolean {
    if (!isReEntry || !state.previousData) return false;
    const prev = state.previousData as Record<string, unknown>;
    switch (fieldPath) {
      case 'solidWasteKgPerDay':
        return state.solidWasteKgPerDay !== (prev.solidWasteKgPerDay ?? 0);
      case 'wastewaterTreatmentType':
        return state.wastewaterTreatmentType !== prev.wastewaterTreatmentType;
      case 'wastewaterLitresPerDay':
        return state.wastewaterLitresPerDay !== (prev.wastewaterLitresPerDay ?? 0);
      default:
        return false;
    }
  }

  // ── Completeness score ─────────────────────────────────────────────────────
  const completeness = useMemo(() => {
    let score = 0;
    if (state.hasWasteData && state.solidWasteKgPerDay > 0) score += 30;
    else if (!state.hasWasteData) score += 20;
    if (streamSumOk && state.wasteStreams.some((s) => s.fractionPercent > 0)) score += 40;
    if (state.wastewaterTreatmentType) score += 30;
    return Math.min(100, score);
  }, [state, streamSumOk]);

  // ── Water demand totals ───────────────────────────────────────────────────
  const waterDemandTotals = useMemo(() => {
    const d = state.waterDemand;
    const fields = [
      d.residentialTotalDemandKld?.current,
      d.officeTotalDemandKld?.current,
      d.hospitalDemandKld?.current,
      d.constructionMaintenanceDemandKld?.current,
      d.kitchenCanteenDemandKld?.current,
      d.laundryDemandKld?.current,
      d.vehicleWashingDemandKld?.current,
      d.commercialDemandKld?.current,
      d.gardeningHorticultureDemandKld?.current,
      d.specialUsesDemandKld?.current,
    ].filter((v): v is number => typeof v === 'number' && v > 0);
    const fields5yr = [
      d.residentialTotalDemandKld?.inFiveYears,
      d.officeTotalDemandKld?.inFiveYears,
      d.hospitalDemandKld?.inFiveYears,
      d.kitchenCanteenDemandKld?.inFiveYears,
      d.gardeningHorticultureDemandKld?.inFiveYears,
    ].filter((v): v is number => typeof v === 'number' && v > 0);
    const totalCurrent = fields.reduce((a, b) => a + b, 0);
    const total5yr = fields5yr.reduce((a, b) => a + b, 0);
    return { totalCurrent, total5yr, hasDemandData: fields.length > 0 };
  }, [state.waterDemand]);

  // ── WTP carbon preview ────────────────────────────────────────────────────
  const wtpCarbonPreview = useMemo(() => {
    const gridEf = 0.716;
    let annualKwh = 0;
    for (const wtp of state.treatmentPlants) {
      const m3day = (wtp.actualTreatmentMld ?? wtp.plantCapacityMld) * 1000;
      if (wtp.energyConsumptionKwhPerM3) {
        annualKwh += wtp.energyConsumptionKwhPerM3 * m3day * 365;
      } else {
        const m = wtp.treatmentMethods;
        let ef =
          (m?.preliminary ? WTP_ENERGY_KWH_M3.preliminary : 0) +
          (m?.primary ? WTP_ENERGY_KWH_M3.primary : 0) +
          (m?.secondary ? WTP_ENERGY_KWH_M3.secondary : 0) +
          (m?.tertiary ? WTP_ENERGY_KWH_M3.tertiary : 0);
        if (ef === 0) ef = WTP_ENERGY_KWH_M3.secondary;
        annualKwh += ef * m3day * 365;
      }
    }
    return { annualKwh, tco2e: (annualKwh * gridEf) / 1000 };
  }, [state.treatmentPlants]);

  // ── RO carbon preview ─────────────────────────────────────────────────────
  const roCarbonPreview = useMemo(() => {
    const gridEf = 0.716;
    let annualKwh = 0;
    for (const ro of state.roPlants) {
      const productM3Day = (ro.treatedWaterOutputMld ?? ro.plantCapacityMld * 0.7) * 1000;
      const ef =
        ro.energyConsumptionKwhPerM3 ??
        RO_ENERGY_KWH_M3[ro.roTechnologyType ?? 'standard_ro'] ??
        0.65;
      annualKwh += ef * productM3Day * 365;
    }
    return { annualKwh, tco2e: (annualKwh * gridEf) / 1000 };
  }, [state.roPlants]);

  // ── Groundwater pumping preview ───────────────────────────────────────────
  const gwPumpingPreview = useMemo(() => {
    const gw = state.waterSupply.sources.find((s) => s.sourceType === 'groundwater_borewell');
    if (!gw?.currentKld) return { annualKwh: 0, tco2e: 0 };
    const energyKwhPerM3 = 50 / (367 * 0.65);
    const annualKwh = energyKwhPerM3 * gw.currentKld * 365;
    return { annualKwh, tco2e: (annualKwh * 0.716) / 1000 };
  }, [state.waterSupply.sources]);

  // ── Wastewater Phase 2 computed values ───────────────────────────────────
  const wastewaterTotals = useMemo(() => {
    const wg = state.wastewaterGeneration;
    const total =
      (wg.totalSewageKld?.current ?? 0) +
      (wg.hospitalEffluentKld?.current ?? 0) +
      (wg.kitchenWastewaterKld?.current ?? 0) +
      (wg.vehicleWashWastewaterKld?.current ?? 0);
    const greyReduction = wg.greywaterReuseFeasible ? (wg.greywaterReuseCapacityKld ?? 0) : 0;
    return { totalKld: total, netKld: Math.max(total - greyReduction, 0), greyReduction };
  }, [state.wastewaterGeneration]);

  const avgBOD = useMemo(() => {
    const bodRec = state.wastewaterCharacteristics.find((r) => r.parameter === 'bod');
    if (!bodRec) return null;
    const vals = Object.values(bodRec.monthlyValues ?? {})
      .filter((v) => v !== undefined && v !== '')
      .map((v) => parseFloat(String(v)))
      .filter((n) => !isNaN(n));
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [state.wastewaterCharacteristics]);

  const avgTKN = useMemo(() => {
    const tknRec = state.wastewaterCharacteristics.find(
      (r) => r.parameter === 'total_kjeldahl_nitrogen' || r.parameter === 'ammonical_nitrogen'
    );
    if (!tknRec) return null;
    const vals = Object.values(tknRec.monthlyValues ?? {})
      .filter((v) => v !== undefined && v !== '')
      .map((v) => parseFloat(String(v)))
      .filter((n) => !isNaN(n));
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [state.wastewaterCharacteristics]);

  const wastewaterCarbonPreview = useMemo(() => {
    if (wastewaterTotals.netKld <= 0) return null;
    const bod = avgBOD ?? 250;
    const tkn = avgTKN ?? 40;
    const mcf =
      state.stpEtpPlants.length > 0
        ? Math.min(
            ...state.stpEtpPlants.map((stp) => {
              const m = stp.treatmentMethods;
              if (m.secondary && !m.isAnaerobic) return 0.1;
              if (m.primary && !m.secondary) return 0.6;
              if (m.isAnaerobic) return 0.8;
              return 0.9;
            })
          )
        : 0.9;
    const tow = (wastewaterTotals.netKld * 365 * bod) / 1000;
    const ch4Co2e = (tow * IPCC_WASTEWATER.Bo * mcf * IPCC_WASTEWATER.GWP_CH4) / 1000;
    const nEff = (wastewaterTotals.netKld * 365 * tkn) / 1000;
    const n2oCo2e = (nEff * IPCC_WASTEWATER.EF_N2O * IPCC_WASTEWATER.GWP_N2O) / 1000;
    return { ch4Co2e, n2oCo2e, total: ch4Co2e + n2oCo2e, mcfUsed: mcf, bodUsed: bod, tknUsed: tkn };
  }, [wastewaterTotals, avgBOD, avgTKN, state.stpEtpPlants]);

  const wastewaterCompliance = useMemo(() => {
    const violations: string[] = [];
    for (const rec of state.wastewaterCharacteristics) {
      const std = CPCB_DISCHARGE_STANDARDS[rec.parameter];
      if (!std) continue;
      for (const [month, val] of Object.entries(rec.monthlyValues ?? {})) {
        if (val === undefined || val === '') continue;
        const n = parseFloat(String(val));
        if (isNaN(n)) continue;
        const limitStr = std.limit.replace('≤', '').replace('≥', '').split('–')[0];
        const limitNum = parseFloat(limitStr);
        if (!isNaN(limitNum) && n > limitNum) {
          violations.push(
            `${WASTEWATER_PARAMETER_LABELS[rec.parameter] ?? rec.parameter} ${n} ${rec.unit ?? ''} in ${month}`
          );
        }
      }
    }
    return { violations, compliant: violations.length === 0 };
  }, [state.wastewaterCharacteristics]);

  // ── Storage summary ───────────────────────────────────────────────────────
  const storageSummary = useMemo(() => {
    const overhead = state.waterSupply.storageTanks.filter((t) => t.tankCategory === 'overhead');
    const underground = state.waterSupply.storageTanks.filter(
      (t) => t.tankCategory === 'underground'
    );
    const ohCap = overhead.reduce((s, t) => s + t.capacityKl * t.quantity, 0);
    const ugCap = underground.reduce((s, t) => s + t.capacityKl * t.quantity, 0);
    const totalCap = ohCap + ugCap;
    const storageRatio =
      waterDemandTotals.totalCurrent > 0 ? totalCap / waterDemandTotals.totalCurrent : 0;
    return { ohCap, ugCap, totalCap, storageRatio };
  }, [state.waterSupply.storageTanks, waterDemandTotals.totalCurrent]);

  // ── Quality compliance ────────────────────────────────────────────────────
  const qualityCompliance = useMemo(() => {
    const violations: string[] = [];
    for (const rec of state.qualityRecords) {
      for (const [month, val] of Object.entries(rec.monthlyValues ?? {})) {
        if (val === undefined || val === '') continue;
        if (rec.parameter === 'ph') {
          const n = parseFloat(String(val));
          if (!isNaN(n) && (n < 6.5 || n > 8.5)) violations.push(`pH ${val} in ${month}`);
        }
        if (rec.parameter === 'turbidity_ntu' && parseFloat(String(val)) > 5) {
          violations.push(`Turbidity ${val} NTU in ${month}`);
        }
        if (rec.parameter === 'tds_mg_l' && parseFloat(String(val)) > 2000) {
          violations.push(`TDS ${val} mg/L in ${month}`);
        }
        if (rec.parameter === 'total_coliform_mpn' || rec.parameter === 'fecal_coliform_mpn') {
          const s = String(val).toLowerCase();
          if (!s.includes('absent') && s !== '0') {
            violations.push(`${QUALITY_PARAM_LABELS[rec.parameter]} detected in ${month}`);
          }
        }
      }
    }
    return { violations, isCompliant: violations.length === 0 };
  }, [state.qualityRecords]);

  // ── Validation warnings (water-specific) ─────────────────────────────────
  const waterWarnings = useMemo(() => {
    const warns: string[] = [];
    // Total supply vs demand
    const totalSupplyKld = state.waterSupply.sources.reduce(
      (s, src) => s + (src.currentKld ?? 0),
      0
    );
    if (
      waterDemandTotals.totalCurrent > 0 &&
      totalSupplyKld > 0 &&
      totalSupplyKld < waterDemandTotals.totalCurrent * 0.8
    ) {
      warns.push(
        `Total supply (${totalSupplyKld.toFixed(0)} KLD) appears insufficient for demand (${waterDemandTotals.totalCurrent.toFixed(0)} KLD). Check for missing supply sources.`
      );
    }
    if (waterDemandTotals.totalCurrent > 0 && totalSupplyKld === 0) {
      warns.push(
        `Water demand of ${waterDemandTotals.totalCurrent.toFixed(0)} KLD entered but no supply sources defined.`
      );
    }
    // WTP stages
    for (const wtp of state.treatmentPlants) {
      const m = wtp.treatmentMethods;
      if (
        !m?.preliminary &&
        !m?.primary &&
        !m?.secondary &&
        !m?.tertiary &&
        !wtp.energyConsumptionKwhPerM3
      ) {
        warns.push(
          `WTP (S.No. ${wtp.serialNo ?? wtp.id}): no treatment stages — using secondary as default.`
        );
      }
    }
    // RO recovery
    for (const ro of state.roPlants) {
      if (ro.inletFlowRateMld && ro.treatedWaterOutputMld) {
        const recovery = (ro.treatedWaterOutputMld / ro.inletFlowRateMld) * 100;
        if (recovery < 60) {
          warns.push(
            `RO Plant (S.No. ${ro.serialNo ?? ro.id}): recovery ${recovery.toFixed(0)}% < 60% — check inlet vs output.`
          );
        }
      }
    }
    warns.push(...qualityCompliance.violations.map((v) => `IS 10500 exceedance: ${v}`));
    return warns;
  }, [
    state.treatmentPlants,
    state.roPlants,
    state.waterSupply.sources,
    waterDemandTotals,
    qualityCompliance.violations,
  ]);

  // ── Phase 3 derived computations ──────────────────────────────────────────
  const swGenTotals = useMemo(() => {
    const g = state.solidWasteGeneration;
    const organicTons =
      (g.domesticWetWasteTonsPerAnnum?.current ?? 0) +
      (g.gardenGrassCuttingsLeaves?.current ?? 0) +
      (g.gardenFruitsVegetables?.current ?? 0) +
      (g.gardenTwigsBranches?.current ?? 0) +
      (g.gardenMiscGreenWaste?.current ?? 0) +
      (g.kitchenSolidFoodWaste?.current ?? 0) +
      (g.hospitalNonBiomedicalWaste?.current ?? 0) +
      (g.otherAnimalWaste?.current ?? 0) +
      (g.otherSlaughterWaste?.current ?? 0);
    const inertTons =
      (g.domesticDryWasteTonsPerAnnum?.current ?? 0) +
      (g.domesticEWasteTonsPerAnnum?.current ?? 0) +
      (g.constructionGeneratedWaste?.current ?? 0) +
      (g.scrapVehicle?.current ?? 0) +
      (g.scrapEWaste?.current ?? 0) +
      (g.scrapMachinery?.current ?? 0);
    return { organicTons, inertTons, totalTons: organicTons + inertTons };
  }, [state.solidWasteGeneration]);

  const landfillAnnualTotals = useMemo(
    () =>
      state.landfillSites.map((site) => {
        let annual = 0;
        if (site.monthlyRecords.length > 0) {
          const recentYear = Math.max(...site.monthlyRecords.map((r) => r.year));
          annual = site.monthlyRecords
            .filter((r) => r.year === recentYear)
            .reduce((s, r) => s + (r.wasteTonnes ?? 0), 0);
        } else if (site.yearWiseAnnualTotals?.length) {
          annual = site.yearWiseAnnualTotals.at(-1)?.totalTonnes ?? 0;
        }
        const mcf = LANDFILL_MCF[site.landfillType ?? 'managed_sanitary'] ?? 1.0;
        const doc = 0.15;
        const ch4Co2e = annual * doc * 0.5 * 0.5 * (16 / 12) * mcf * 0.9 * 28;
        return { siteId: site.id, siteName: site.siteLocationName, annual, mcf, ch4Co2e };
      }),
    [state.landfillSites]
  );

  const incinerationAnnualTotals = useMemo(
    () =>
      state.incinerationFacilities.map((f) => {
        const recentYear =
          f.monthlyRecords.length > 0
            ? Math.max(...f.monthlyRecords.map((r) => r.year))
            : new Date().getFullYear();
        const annual = f.monthlyRecords
          .filter((r) => r.year === recentYear)
          .reduce((s, r) => s + (r.wasteTonnes ?? 0), 0);
        const ef =
          f.emissionFactorTco2PerTonne ??
          INCINERATION_EF[f.incineratorType ?? 'msw_incinerator'] ??
          0.91;
        return { facilityId: f.id, name: f.facilityNameLocation, annual, ef, co2e: annual * ef };
      }),
    [state.incinerationFacilities]
  );

  const sieveTotals = useMemo(
    () =>
      state.mswPlants.map((plant) => ({
        plantId: plant.id,
        totalPercent: (plant.sieveFractions ?? []).reduce(
          (s, f) => s + (f.percentOfTotalWaste ?? 0),
          0
        ),
      })),
    [state.mswPlants]
  );

  const solidWasteCarbonPreview = useMemo(() => {
    const landfillCh4 = landfillAnnualTotals.reduce((s, l) => s + l.ch4Co2e, 0);
    const incineration = incinerationAnnualTotals.reduce((s, i) => s + i.co2e, 0);
    return { landfillCh4, incineration, total: landfillCh4 + incineration };
  }, [landfillAnnualTotals, incinerationAnnualTotals]);

  // ── Auto-save ──────────────────────────────────────────────────────────────
  const buildPayload = useCallback((): Partial<IWasteSectionData> => {
    return {
      entryMode:
        state.solidWasteMode === 'zone_by_zone' ? EntryMode.ROOM_LEVEL : EntryMode.CUMULATIVE,
      hasWasteData: state.hasWasteData,
      solidWasteKgPerDay: state.solidWasteKgPerDay,
      solidWasteIsEstimated: !state.hasWasteData,
      wasteStreams: state.wasteStreams,
      zoneLevelSolidWaste: state.zones.map((z) => ({
        zoneName: z.zoneName,
        kgPerDay: z.kgPerDay,
        streams: z.streams,
      })),
      wastewaterTreatmentType: state.wastewaterTreatmentType,
      wastewaterIsEstimated: state.wastewaterIsEstimated,
      wastewaterLitresPerDay: state.wastewaterLitresPerDay,
      customDischargePoints: state.customDischargePoints,
      water: {
        demand: state.waterDemand,
        supply: {
          sources: state.waterSupply.sources,
          storageTanks: state.waterSupply.storageTanks,
          supplyHoursPerDay: state.waterSupply.supplyHoursPerDay,
          supplyHoursPerDayInFiveYears: state.waterSupply.supplyHoursPerDayInFiveYears,
          supplyHoursPerDayInTenYears: state.waterSupply.supplyHoursPerDayInTenYears,
        },
        treatmentPlants: state.treatmentPlants,
        roPlants: state.roPlants,
        qualityRecords: state.qualityRecords,
      },
      wastewaterGeneration: state.wastewaterGeneration,
      wastewaterCharacteristics: state.wastewaterCharacteristics,
      stpEtpPlants: state.stpEtpPlants,
      solidWasteGeneration: state.solidWasteGeneration,
      landfillSites: state.landfillSites,
      incinerationFacilities: state.incinerationFacilities,
      mswPlants: state.mswPlants,
    };
  }, [state]);

  const doSave = useCallback(async () => {
    if (!state.wasteSubmissionId || !state.isDirty) return;
    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      await submissionsApi.updateDraft(
        state.wasteSubmissionId,
        buildPayload() as Record<string, unknown>
      );
      dispatch({ type: 'SET_LAST_SAVED', payload: new Date() });
    } catch {
      // silent auto-save failure
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state.wasteSubmissionId, state.isDirty, buildPayload]);

  useEffect(() => {
    if (!state.isDirty) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(doSave, 2500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [state.isDirty, doSave]);

  // ── Manual save ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!state.wasteSubmissionId) return;
    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      await submissionsApi.updateDraft(
        state.wasteSubmissionId,
        buildPayload() as Record<string, unknown>
      );
      dispatch({ type: 'SET_LAST_SAVED', payload: new Date() });
      showSuccess('Waste data saved');
    } catch {
      showError('Failed to save waste data');
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!state.wasteSubmissionId) return;
    if (!streamSumOk && state.solidWasteMode === 'building_total' && state.hasWasteData) {
      showError('Waste stream fractions must add up to 100% before submitting');
      return;
    }
    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      await submissionsApi.updateDraft(
        state.wasteSubmissionId,
        buildPayload() as Record<string, unknown>
      );
      await submissionsApi.submit(state.wasteSubmissionId);
      showSuccess('Waste section submitted for review');
      navigate(`/buildings/${id}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to submit';
      showError(msg);
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }

  // ── Scroll to section ─────────────────────────────────────────────────────
  function scrollTo(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(sectionId as SectionId);
  }

  // ── IntersectionObserver to update active section ─────────────────────────
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTION_IDS.forEach((sid) => {
      const el = document.getElementById(sid);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(sid);
        },
        { threshold: 0.3 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isBuildingLoading) {
    return (
      <PageWrapper title="Waste & Sanitation Data">
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </PageWrapper>
    );
  }

  const showLiveSummary =
    state.solidWasteKgPerDay > 0 || state.wasteStreams.some((s) => s.fractionPercent > 0);

  return (
    <PageWrapper title="Waste & Sanitation Data">
      <div className="bg-white/5 min-h-[calc(100vh-4rem)]">
        <div className="max-w-7xl mx-auto px-4 py-8 lg:flex lg:gap-8 items-start">
          {/* ── Sidebar ────────────────────────────────────────────────────── */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-20 space-y-4">
              {/* Building info */}
              <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {building?.name ?? 'Loading…'}
                    </p>
                    {building?.shortName && (
                      <p className="text-xs text-gray-400">{building.shortName}</p>
                    )}
                  </div>
                  <span className="shrink-0 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-xs font-medium">
                    Waste &amp; sanitation
                  </span>
                </div>

                {isReEntry && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <p className="text-xs font-medium text-amber-700">
                      Version {state.version} — updating from Version {state.version - 1}
                    </p>
                  </div>
                )}
              </div>

              {/* Contents nav */}
              <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Contents
                </p>
                <nav className="space-y-1">
                  {SECTION_IDS.map((sid) => (
                    <button
                      key={sid}
                      onClick={() => scrollTo(sid)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                        activeSection === sid
                          ? 'bg-rose-50 text-rose-700 font-medium'
                          : 'text-gray-300 hover:bg-white/5'
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          'w-3.5 h-3.5 transition-transform',
                          activeSection === sid ? 'rotate-90 text-rose-600' : 'text-gray-400'
                        )}
                      />
                      {SECTION_LABELS[sid]}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Save status + actions */}
              <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Clock className="w-3.5 h-3.5" />
                  {formatSaveStatus(state.lastSavedAt, state.isSaving, state.isDirty)}
                </div>

                {/* Completeness ring */}
                <div className="flex items-center gap-3">
                  <ProgressRing pct={completeness} color="#e11d48" />
                  <div>
                    <p className="text-sm font-medium text-gray-200">{completeness}% complete</p>
                    <p className="text-xs text-gray-400">
                      {completeness >= 100 ? 'Ready to submit' : 'Fill in more data'}
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  isLoading={state.isSaving}
                  onClick={handleSave}
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  Save draft
                </Button>

                <Button
                  size="sm"
                  className="w-full !bg-rose-600 hover:!bg-rose-700"
                  isLoading={state.isSaving}
                  disabled={completeness < 30}
                  onClick={handleSubmit}
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  Submit for review
                </Button>
              </div>

              {/* Stream sum indicator */}
              {state.solidWasteMode === 'building_total' && state.hasWasteData && (
                <div
                  className={cn(
                    'rounded-xl p-3 text-xs font-medium border',
                    streamSumOk
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-red-50 text-red-600 border-red-200'
                  )}
                >
                  Disposal breakdown: {streamTotal}% {streamSumOk ? '✓ Valid' : '(must be 100%)'}
                </div>
              )}

              {/* Wastewater Phase 2 carbon preview */}
              {wastewaterCarbonPreview && (
                <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-3 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1 font-medium">
                    Wastewater (IPCC Tier 1):
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300">CH₄ (Scope 1):</span>
                    <span className="text-red-600 font-mono">
                      +{wastewaterCarbonPreview.ch4Co2e.toFixed(1)} tCO₂e/yr
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300">N₂O (Scope 1):</span>
                    <span className="text-red-600 font-mono">
                      +{wastewaterCarbonPreview.n2oCo2e.toFixed(1)} tCO₂e/yr
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    BOD {wastewaterCarbonPreview.bodUsed} mg/L · MCF{' '}
                    {wastewaterCarbonPreview.mcfUsed}
                  </div>
                </div>
              )}

              {/* Water carbon live estimates */}
              {(wtpCarbonPreview.tco2e > 0 || roCarbonPreview.tco2e > 0) && (
                <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-3 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1 font-medium">
                    Water treatment (Scope 2):
                  </div>
                  {wtpCarbonPreview.tco2e > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">WTP:</span>
                      <span className="text-blue-600 font-mono">
                        +{wtpCarbonPreview.tco2e.toFixed(1)} tCO₂e/yr
                      </span>
                    </div>
                  )}
                  {roCarbonPreview.tco2e > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">RO plants:</span>
                      <span className="text-blue-600 font-mono">
                        +{roCarbonPreview.tco2e.toFixed(1)} tCO₂e/yr
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Solid waste Phase 3 carbon preview */}
              {solidWasteCarbonPreview.total > 0 ? (
                <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-3 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1 font-medium">
                    Solid waste (IPCC FOD):
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">Landfill CH₄ (Scope 1):</span>
                    <span className="text-red-600 font-mono">
                      +{solidWasteCarbonPreview.landfillCh4.toFixed(1)} tCO₂e/yr
                    </span>
                  </div>
                  {solidWasteCarbonPreview.incineration > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">Incineration (Scope 1):</span>
                      <span className="text-red-600 font-mono">
                        +{solidWasteCarbonPreview.incineration.toFixed(1)} tCO₂e/yr
                      </span>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-0.5">IPCC FOD · MCF weighted</div>
                </div>
              ) : null}

              {/* Open burning warning */}
              {hasOpenBurning && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <Flame className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-medium">
                    Open burning detected — high emission impact
                  </p>
                </div>
              )}

              <button
                onClick={() => navigate(`/buildings/${id}`)}
                className="w-full text-xs text-gray-400 hover:text-gray-300 hover:underline text-left"
              >
                ← Back to building
              </button>
            </div>
          </aside>
          {/* ── Main content ───────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Re-entry banner */}
            {isReEntry && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-800">
                      Updating Version {state.version - 1} → Version {state.version}
                    </p>
                    <p className="text-sm text-amber-700 mt-0.5">
                      Previous data has been loaded as your starting point. Only change what has
                      actually changed — other values carry forward automatically.
                    </p>
                    {(() => {
                      const prevSubmittedAt = (state.previousData as Record<string, unknown>)
                        ?.submittedAt;
                      if (!prevSubmittedAt) return null;
                      return (
                        <p className="text-xs text-amber-600 mt-1">
                          Previous version submitted on{' '}
                          {new Date(prevSubmittedAt as string).toLocaleDateString()}
                        </p>
                      );
                    })()}
                  </div>
                </div>
                {/* What changed? */}
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-amber-700 mb-1">
                    What changed?{' '}
                    <span className="font-normal text-amber-600">(optional — helps reviewers)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={state.whatChanged}
                    onChange={(e) =>
                      dispatch({ type: 'SET_WHAT_CHANGED', payload: e.target.value })
                    }
                    placeholder="Briefly describe what changed since the last submission…"
                    className="w-full text-sm border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400/30 bg-black/40 backdrop-blur-md resize-none"
                  />
                </div>
              </div>
            )}

            {/* ══ 4.1 SOLID WASTE GENERATION ════════════════════════════ */}
            <div
              id="sw-generation"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-sm"
            >
              <div className="px-6 py-5 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                  <h2 className="text-base font-semibold text-white">
                    Solid waste generation by category
                  </h2>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Record annual waste quantities by type. Category-specific DOC values enable
                  accurate IPCC First Order Decay CH₄ calculation — more precise than a single daily
                  waste figure.
                </p>
              </div>
              <div className="p-6 space-y-5">
                {/* IPCC method preview */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                  <p className="font-medium text-amber-800 mb-1">
                    IPCC 2006 First Order Decay model:
                  </p>
                  <p className="text-amber-700 font-mono text-xs mb-2">
                    CH₄ = W × DOC × 0.5 × 0.5 × (16/12) × MCF × 0.9
                  </p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-amber-700">
                    <span>Wet food waste: DOC 0.15</span>
                    <span>Garden waste: DOC 0.20–0.30</span>
                    <span>Construction: DOC 0.03</span>
                    <span>Scrap/e-waste: DOC 0.00</span>
                  </div>
                </div>

                {/* Helper: 3-column horizon layout */}
                <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide pb-1 border-b border-white/5">
                  <span>Category</span>
                  <span className="text-center">Current (t/yr)</span>
                  <span className="text-center">In 5 Years</span>
                  <span className="text-center">In 10 Years</span>
                </div>

                {/* GROUP 1 — Domestic waste */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                    Domestic waste
                  </p>
                  {[
                    {
                      key: 'domesticWetWasteTonsPerAnnum',
                      label: 'Total wet waste collected',
                      doc: '0.15',
                      highlight: true,
                    },
                    {
                      key: 'domesticDryWasteTonsPerAnnum',
                      label: 'Dry waste (recyclables)',
                      doc: '0.05',
                    },
                    { key: 'domesticEWasteTonsPerAnnum', label: 'E-waste', doc: '0.00' },
                    {
                      key: 'domesticBulkyWasteTonsPerAnnum',
                      label: 'Bulky waste (furniture, etc.)',
                      doc: '0.05',
                    },
                  ].map(({ key, label, doc, highlight }) => (
                    <div
                      key={key}
                      className={`grid grid-cols-4 gap-2 items-center rounded-lg p-2 ${highlight ? 'border-l-4 border-l-blue-400 bg-blue-50/40' : 'bg-white/5'}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-200 truncate">{label}</p>
                        <span className="text-xs text-amber-600 font-mono">DOC: {doc}</span>
                      </div>
                      {(['current', 'inFiveYears', 'inTenYears'] as const).map((horizon) => (
                        <input
                          key={horizon}
                          type="number"
                          min={0}
                          step={0.1}
                          placeholder="—"
                          value={
                            (state.solidWasteGeneration as Record<string, Record<string, number>>)[
                              key
                            ]?.[horizon] ?? ''
                          }
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_SOLID_WASTE_GENERATION',
                              payload: {
                                [key]: {
                                  ...(
                                    state.solidWasteGeneration as Record<
                                      string,
                                      Record<string, number>
                                    >
                                  )[key],
                                  [horizon]:
                                    e.target.value === '' ? undefined : parseFloat(e.target.value),
                                },
                              },
                            })
                          }
                          className="w-full text-sm border border-white/10 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* GROUP 2 — Garden/horticulture */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                    Garden and horticulture waste
                  </p>
                  {[
                    {
                      key: 'gardenGrassCuttingsLeaves',
                      label: 'Grass cuttings & leaves',
                      doc: '0.20',
                    },
                    {
                      key: 'gardenFruitsVegetables',
                      label: 'Fruits & vegetables waste',
                      doc: '0.15',
                    },
                    { key: 'gardenTwigsBranches', label: 'Twigs and branches', doc: '0.30' },
                    {
                      key: 'gardenMiscGreenWaste',
                      label: 'Miscellaneous green waste',
                      doc: '0.20',
                    },
                  ].map(({ key, label, doc }) => (
                    <div
                      key={key}
                      className="grid grid-cols-4 gap-2 items-center bg-white/5 rounded-lg p-2"
                    >
                      <div>
                        <p className="text-sm text-gray-200">{label}</p>
                        <span className="text-xs text-amber-600 font-mono">DOC: {doc}</span>
                      </div>
                      {(['current', 'inFiveYears', 'inTenYears'] as const).map((horizon) => (
                        <input
                          key={horizon}
                          type="number"
                          min={0}
                          step={0.1}
                          placeholder="—"
                          value={
                            (state.solidWasteGeneration as Record<string, Record<string, number>>)[
                              key
                            ]?.[horizon] ?? ''
                          }
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_SOLID_WASTE_GENERATION',
                              payload: {
                                [key]: {
                                  ...(
                                    state.solidWasteGeneration as Record<
                                      string,
                                      Record<string, number>
                                    >
                                  )[key],
                                  [horizon]:
                                    e.target.value === '' ? undefined : parseFloat(e.target.value),
                                },
                              },
                            })
                          }
                          className="w-full text-sm border border-white/10 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* GROUP 3 — Hospital/biomedical */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                    Hospital and biomedical waste
                  </p>
                  {[
                    {
                      key: 'hospitalNonBiomedicalWaste',
                      label: 'Non-biomedical solid waste',
                      doc: '0.15',
                    },
                    {
                      key: 'hospitalBiomedicalWaste',
                      label: 'Biomedical waste',
                      doc: '0.15',
                      note: 'Must be incinerated per BMW Rules 2016 — record in Incineration section',
                    },
                  ].map(({ key, label, doc, note }) => (
                    <div key={key} className="space-y-1">
                      <div className="grid grid-cols-4 gap-2 items-center bg-white/5 rounded-lg p-2">
                        <div>
                          <p className="text-sm text-gray-200">{label}</p>
                          <span className="text-xs text-amber-600 font-mono">DOC: {doc}</span>
                        </div>
                        {(['current', 'inFiveYears', 'inTenYears'] as const).map((horizon) => (
                          <input
                            key={horizon}
                            type="number"
                            min={0}
                            step={0.1}
                            placeholder="—"
                            value={
                              (
                                state.solidWasteGeneration as Record<string, Record<string, number>>
                              )[key]?.[horizon] ?? ''
                            }
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_SOLID_WASTE_GENERATION',
                                payload: {
                                  [key]: {
                                    ...(
                                      state.solidWasteGeneration as Record<
                                        string,
                                        Record<string, number>
                                      >
                                    )[key],
                                    [horizon]:
                                      e.target.value === ''
                                        ? undefined
                                        : parseFloat(e.target.value),
                                  },
                                },
                              })
                            }
                            className="w-full text-sm border border-white/10 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                          />
                        ))}
                      </div>
                      {note && <p className="text-xs text-amber-700 pl-2">⚠ {note}</p>}
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <p className="text-xs font-medium text-gray-300 mb-1">Collection system</p>
                      <div className="flex gap-2">
                        {(['manual', 'mechanical'] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() =>
                              dispatch({
                                type: 'UPDATE_SOLID_WASTE_GENERATION',
                                payload: { hospitalCollectionSystem: v },
                              })
                            }
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                              state.solidWasteGeneration.hospitalCollectionSystem === v
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'border-white/10 text-gray-300 hover:bg-white/5'
                            )}
                          >
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-300 mb-1">Segregation system</p>
                      <div className="flex gap-2">
                        {([true, false] as const).map((v) => (
                          <button
                            key={String(v)}
                            onClick={() =>
                              dispatch({
                                type: 'UPDATE_SOLID_WASTE_GENERATION',
                                payload: { hospitalSegregationSystem: v },
                              })
                            }
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                              state.solidWasteGeneration.hospitalSegregationSystem === v
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'border-white/10 text-gray-300 hover:bg-white/5'
                            )}
                          >
                            {v ? 'Yes' : 'No'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* GROUP 4 — Kitchen/food */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                    Kitchen and food waste
                  </p>
                  <div className="grid grid-cols-4 gap-2 items-center bg-white/5 rounded-lg p-2">
                    <div>
                      <p className="text-sm text-gray-200">Liquid kitchen waste</p>
                      <span className="text-xs text-gray-400">Unit: KLD</span>
                    </div>
                    {(['current', 'inFiveYears', 'inTenYears'] as const).map((h) => (
                      <input
                        key={h}
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="—"
                        value={
                          (
                            state.solidWasteGeneration.kitchenLiquidWasteKld as
                              | Record<string, number>
                              | undefined
                          )?.[h] ?? ''
                        }
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_SOLID_WASTE_GENERATION',
                            payload: {
                              kitchenLiquidWasteKld: {
                                ...state.solidWasteGeneration.kitchenLiquidWasteKld,
                                [h]: e.target.value === '' ? undefined : parseFloat(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-full text-sm border border-white/10 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2 items-center border-l-4 border-l-blue-400 bg-blue-50/40 rounded-lg p-2">
                    <div>
                      <p className="text-sm text-gray-200">Solid food waste</p>
                      <span className="text-xs text-amber-600 font-mono">DOC: 0.15</span>
                    </div>
                    {(['current', 'inFiveYears', 'inTenYears'] as const).map((h) => (
                      <input
                        key={h}
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="—"
                        value={
                          (
                            state.solidWasteGeneration.kitchenSolidFoodWaste as
                              | Record<string, number>
                              | undefined
                          )?.[h] ?? ''
                        }
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_SOLID_WASTE_GENERATION',
                            payload: {
                              kitchenSolidFoodWaste: {
                                ...state.solidWasteGeneration.kitchenSolidFoodWaste,
                                [h]: e.target.value === '' ? undefined : parseFloat(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-full text-sm border border-white/10 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                      />
                    ))}
                  </div>
                </div>

                {/* GROUP 5 — Construction */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                    Construction & demolition waste
                  </p>
                  {[
                    { key: 'constructionGeneratedWaste', label: 'Generated waste', doc: '0.03' },
                    { key: 'constructionRecyclableContent', label: 'Recyclable content', doc: '—' },
                  ].map(({ key, label, doc }) => (
                    <div
                      key={key}
                      className="grid grid-cols-4 gap-2 items-center bg-white/5 rounded-lg p-2"
                    >
                      <div>
                        <p className="text-sm text-gray-200">{label}</p>
                        <span className="text-xs text-amber-600 font-mono">DOC: {doc}</span>
                      </div>
                      {(['current', 'inFiveYears', 'inTenYears'] as const).map((h) => (
                        <input
                          key={h}
                          type="number"
                          min={0}
                          step={0.1}
                          placeholder="—"
                          value={
                            (state.solidWasteGeneration as Record<string, Record<string, number>>)[
                              key
                            ]?.[h] ?? ''
                          }
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_SOLID_WASTE_GENERATION',
                              payload: {
                                [key]: {
                                  ...(
                                    state.solidWasteGeneration as Record<
                                      string,
                                      Record<string, number>
                                    >
                                  )[key],
                                  [h]:
                                    e.target.value === '' ? undefined : parseFloat(e.target.value),
                                },
                              },
                            })
                          }
                          className="w-full text-sm border border-white/10 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* GROUP 6 — Other organic */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                    Other organic waste
                  </p>
                  {[
                    { key: 'otherSlaughterWaste', label: 'Slaughter waste', doc: '0.15' },
                    { key: 'otherAnimalWaste', label: 'Animal waste', doc: '0.15' },
                    { key: 'otherCompostWaste', label: 'Compost waste output', doc: '0.20' },
                  ].map(({ key, label, doc }) => (
                    <div
                      key={key}
                      className="grid grid-cols-4 gap-2 items-center bg-white/5 rounded-lg p-2"
                    >
                      <div>
                        <p className="text-sm text-gray-200">{label}</p>
                        <span className="text-xs text-amber-600 font-mono">DOC: {doc}</span>
                      </div>
                      {(['current', 'inFiveYears', 'inTenYears'] as const).map((h) => (
                        <input
                          key={h}
                          type="number"
                          min={0}
                          step={0.1}
                          placeholder="—"
                          value={
                            (state.solidWasteGeneration as Record<string, Record<string, number>>)[
                              key
                            ]?.[h] ?? ''
                          }
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_SOLID_WASTE_GENERATION',
                              payload: {
                                [key]: {
                                  ...(
                                    state.solidWasteGeneration as Record<
                                      string,
                                      Record<string, number>
                                    >
                                  )[key],
                                  [h]:
                                    e.target.value === '' ? undefined : parseFloat(e.target.value),
                                },
                              },
                            })
                          }
                          className="w-full text-sm border border-white/10 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* GROUP 7 — Scrap yard */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                    Scrap yard waste
                  </p>
                  {[
                    { key: 'scrapVehicle', label: 'Vehicle scrap', doc: '0.00' },
                    { key: 'scrapEWaste', label: 'E-waste (scrap)', doc: '0.00' },
                    { key: 'scrapMachinery', label: 'Machinery scrap', doc: '0.00' },
                  ].map(({ key, label, doc }) => (
                    <div
                      key={key}
                      className="grid grid-cols-4 gap-2 items-center bg-white/5 rounded-lg p-2"
                    >
                      <div>
                        <p className="text-sm text-gray-200">{label}</p>
                        <span className="text-xs text-gray-400 font-mono">DOC: {doc} (inert)</span>
                      </div>
                      {(['current', 'inFiveYears', 'inTenYears'] as const).map((h) => (
                        <input
                          key={h}
                          type="number"
                          min={0}
                          step={0.1}
                          placeholder="—"
                          value={
                            (state.solidWasteGeneration as Record<string, Record<string, number>>)[
                              key
                            ]?.[h] ?? ''
                          }
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_SOLID_WASTE_GENERATION',
                              payload: {
                                [key]: {
                                  ...(
                                    state.solidWasteGeneration as Record<
                                      string,
                                      Record<string, number>
                                    >
                                  )[key],
                                  [h]:
                                    e.target.value === '' ? undefined : parseFloat(e.target.value),
                                },
                              },
                            })
                          }
                          className="w-full text-sm border border-white/10 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Running totals */}
                {swGenTotals.totalTons > 0 && (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-sm font-semibold text-gray-200 mb-2">
                      Generation totals (current year)
                    </p>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-gray-400 text-xs">Total waste</p>
                        <p className="font-semibold text-white">
                          {swGenTotals.totalTons.toFixed(1)} t/yr
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Organic (high CH₄)</p>
                        <p className="font-semibold text-red-600">
                          {swGenTotals.organicTons.toFixed(1)} t/yr
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Inert/recyclable</p>
                        <p className="font-semibold text-green-600">
                          {swGenTotals.inertTons.toFixed(1)} t/yr
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══ 4.2 LANDFILL DEPOSITION RECORDS ═══════════════════════ */}
            <div
              id="sw-landfill"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-sm"
            >
              <div className="px-6 py-5 border-b border-white/5 bg-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-orange-600" />
                    <h2 className="text-base font-semibold text-white">
                      Waste sent to landfill
                    </h2>
                  </div>
                  <button
                    onClick={() => {
                      const newSite: ILandfillSite = {
                        id: crypto.randomUUID(),
                        siteLocationName: '',
                        landfillType: 'managed_sanitary',
                        monthlyRecords: [],
                      };
                      dispatch({ type: 'ADD_LANDFILL_SITE', payload: newSite });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add landfill site
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Monthly landfill quantities are the most accurate input for the IPCC FOD model.
                </p>
              </div>
              <div className="p-6 space-y-4">
                {/* MCF reference */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-200">
                    MCF values by landfill type
                  </summary>
                  <div className="mt-2 p-3 bg-white/5 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Managed sanitary landfill</span>
                      <span className="font-mono font-semibold">MCF = 1.0</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Semi-controlled</span>
                      <span className="font-mono font-semibold">MCF = 0.5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Uncontrolled open dump</span>
                      <span className="font-mono font-semibold">MCF = 0.4</span>
                    </div>
                    <p className="text-gray-400 mt-1">
                      Lower MCF = better managed = less methane per tonne
                    </p>
                  </div>
                </details>

                {state.landfillSites.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No landfill sites added yet. Click "Add landfill site" above.
                  </p>
                )}

                {state.landfillSites.map((site, siteIdx) => {
                  const siteTotal = landfillAnnualTotals.find((l) => l.siteId === site.id);
                  const currentYear = new Date().getFullYear();
                  const entryMode = landfillEntryModes[site.id] ?? 'annual';
                  const setEntryMode = (m: 'annual' | 'monthly') =>
                    setLandfillEntryModes((prev) => ({ ...prev, [site.id]: m }));
                  const selectedYear = landfillSelectedYears[site.id] ?? currentYear;
                  const setSelectedYear = (y: number) =>
                    setLandfillSelectedYears((prev) => ({ ...prev, [site.id]: y }));

                  return (
                    <div
                      key={site.id}
                      className="border border-white/10 rounded-xl overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-medium text-gray-400">
                            Site {siteIdx + 1}
                          </span>
                          <span className="font-medium text-gray-100 truncate">
                            {site.siteLocationName || 'Unnamed site'}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                            {site.landfillType?.replace(/_/g, ' ') ?? 'Managed'}
                          </span>
                          {siteTotal && siteTotal.annual > 0 && (
                            <span className="text-xs text-gray-400">
                              {siteTotal.annual.toFixed(0)} t/yr · {siteTotal.ch4Co2e.toFixed(1)}{' '}
                              tCO₂e/yr
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            dispatch({ type: 'REMOVE_LANDFILL_SITE', payload: site.id })
                          }
                          className="text-gray-400 hover:text-red-500 transition-colors ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-4 space-y-4">
                        {/* Site details */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Site / location name *
                            </label>
                            <input
                              type="text"
                              value={site.siteLocationName}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_LANDFILL_SITE',
                                  payload: {
                                    id: site.id,
                                    updates: { siteLocationName: e.target.value },
                                  },
                                })
                              }
                              placeholder="Municipal landfill, Campus composting site…"
                              className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Start year
                            </label>
                            <input
                              type="number"
                              min={1950}
                              max={currentYear + 1}
                              value={site.startYear ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_LANDFILL_SITE',
                                  payload: {
                                    id: site.id,
                                    updates: {
                                      startYear: e.target.value
                                        ? parseInt(e.target.value)
                                        : undefined,
                                    },
                                  },
                                })
                              }
                              className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Management type
                            </label>
                            <select
                              value={site.landfillType ?? 'managed_sanitary'}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_LANDFILL_SITE',
                                  payload: {
                                    id: site.id,
                                    updates: {
                                      landfillType: e.target.value as ILandfillSite['landfillType'],
                                    },
                                  },
                                })
                              }
                              className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                            >
                              <option value="managed_sanitary">Managed sanitary (MCF = 1.0)</option>
                              <option value="semi_controlled">Semi-controlled (MCF = 0.5)</option>
                              <option value="uncontrolled_open_dump">
                                Uncontrolled open dump (MCF = 0.4)
                              </option>
                            </select>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="text-xs font-medium text-gray-300">
                              Biogas capture?
                            </label>
                            <button
                              onClick={() =>
                                dispatch({
                                  type: 'UPDATE_LANDFILL_SITE',
                                  payload: {
                                    id: site.id,
                                    updates: { hasBiogasCapture: !site.hasBiogasCapture },
                                  },
                                })
                              }
                              className={cn(
                                'px-3 py-1 rounded-lg text-sm border',
                                site.hasBiogasCapture
                                  ? 'bg-green-600 text-white border-green-600'
                                  : 'border-white/10 text-gray-400'
                              )}
                            >
                              {site.hasBiogasCapture ? 'Yes' : 'No'}
                            </button>
                          </div>
                          {site.hasBiogasCapture && (
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Capture efficiency (%)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={site.biogasCaptureEfficiency ?? 80}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_LANDFILL_SITE',
                                    payload: {
                                      id: site.id,
                                      updates: {
                                        biogasCaptureEfficiency: parseFloat(e.target.value),
                                      },
                                    },
                                  })
                                }
                                className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400/30"
                              />
                            </div>
                          )}
                        </div>

                        {/* Entry mode toggle */}
                        <div className="flex items-center gap-1 p-1 bg-white/10 rounded-xl w-fit">
                          {(['annual', 'monthly'] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setEntryMode(m)}
                              className={cn(
                                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                                entryMode === m
                                  ? 'bg-black/40 backdrop-blur-md shadow-sm text-white'
                                  : 'text-gray-400 hover:text-gray-200'
                              )}
                            >
                              {m === 'annual' ? 'Annual totals' : 'Monthly breakdown'}
                            </button>
                          ))}
                        </div>

                        {entryMode === 'annual' && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide pb-1 border-b border-white/5">
                              <span>Year</span>
                              <span className="text-center">Total tonnes</span>
                              <span>Remarks</span>
                            </div>
                            {(site.yearWiseAnnualTotals?.length
                              ? site.yearWiseAnnualTotals
                              : [
                                  { year: currentYear, totalTonnes: 0 },
                                  { year: currentYear - 1, totalTonnes: 0 },
                                  { year: currentYear - 2, totalTonnes: 0 },
                                ]
                            ).map((row) => (
                              <div key={row.year} className="grid grid-cols-3 gap-2 items-center">
                                <span className="text-sm text-gray-300">{row.year}</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  placeholder="0"
                                  value={row.totalTonnes || ''}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const existing = site.yearWiseAnnualTotals?.find(
                                      (t) => t.year === row.year
                                    );
                                    if (existing) {
                                      dispatch({
                                        type: 'UPDATE_LANDFILL_ANNUAL',
                                        payload: {
                                          siteId: site.id,
                                          year: row.year,
                                          updates: { totalTonnes: val },
                                        },
                                      });
                                    } else {
                                      dispatch({
                                        type: 'ADD_LANDFILL_ANNUAL',
                                        payload: {
                                          siteId: site.id,
                                          record: { year: row.year, totalTonnes: val },
                                        },
                                      });
                                    }
                                  }}
                                  className="text-sm border border-white/10 rounded-lg px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                                />
                                <input
                                  type="text"
                                  placeholder="Optional note"
                                  value={
                                    site.yearWiseAnnualTotals?.find((t) => t.year === row.year)
                                      ?.remarks ?? ''
                                  }
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_LANDFILL_ANNUAL',
                                      payload: {
                                        siteId: site.id,
                                        year: row.year,
                                        updates: { remarks: e.target.value },
                                      },
                                    })
                                  }
                                  className="text-sm border border-white/10 rounded-lg px-3 py-1.5 focus:outline-none"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {entryMode === 'monthly' && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-medium text-gray-300">Year:</label>
                              <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                className="text-sm border border-white/10 rounded-lg px-2 py-1 focus:outline-none"
                              >
                                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                                  <option key={y} value={y}>
                                    {y}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-6 gap-2">
                              {[
                                'Jan',
                                'Feb',
                                'Mar',
                                'Apr',
                                'May',
                                'Jun',
                                'Jul',
                                'Aug',
                                'Sep',
                                'Oct',
                                'Nov',
                                'Dec',
                              ].map((mon, idx) => {
                                const monthNum = (idx + 1) as ILandfillMonthlyRecord['month'];
                                const rec = site.monthlyRecords.find(
                                  (r) => r.month === monthNum && r.year === selectedYear
                                );
                                return (
                                  <div key={mon} className="text-center">
                                    <label className="text-xs text-gray-400 block mb-1">
                                      {mon}
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.1}
                                      placeholder="—"
                                      value={rec?.wasteTonnes ?? ''}
                                      onChange={(e) => {
                                        const val =
                                          e.target.value === ''
                                            ? undefined
                                            : parseFloat(e.target.value);
                                        if (rec) {
                                          dispatch({
                                            type: 'UPDATE_LANDFILL_MONTHLY',
                                            payload: {
                                              siteId: site.id,
                                              month: monthNum,
                                              year: selectedYear,
                                              updates: { wasteTonnes: val },
                                            },
                                          });
                                        } else {
                                          dispatch({
                                            type: 'ADD_LANDFILL_MONTHLY',
                                            payload: {
                                              siteId: site.id,
                                              record: {
                                                month: monthNum,
                                                year: selectedYear,
                                                wasteTonnes: val,
                                              },
                                            },
                                          });
                                        }
                                      }}
                                      className="w-full text-xs border border-white/10 rounded px-1 py-1 text-center focus:outline-none focus:ring-1 focus:ring-orange-400"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            {siteTotal && siteTotal.annual > 0 && (
                              <p className="text-xs text-gray-400">
                                Running annual total ({selectedYear}):{' '}
                                <span className="font-semibold text-gray-200">
                                  {siteTotal.annual.toFixed(1)} tonnes
                                </span>
                              </p>
                            )}
                          </div>
                        )}

                        {/* Per-site carbon estimate */}
                        {siteTotal && siteTotal.annual > 0 && (
                          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm">
                            <p className="font-medium text-orange-800 mb-1">
                              Landfill CH₄ from this site:
                            </p>
                            <div className="grid grid-cols-2 gap-1 text-xs text-orange-700">
                              <span>Annual waste deposited:</span>
                              <span className="font-mono">{siteTotal.annual.toFixed(1)} t/yr</span>
                              <span>MCF used:</span>
                              <span className="font-mono">{siteTotal.mcf}</span>
                              <span>CH₄ equivalent (Scope 1):</span>
                              <span className="font-mono font-semibold">
                                {siteTotal.ch4Co2e.toFixed(2)} tCO₂e/yr
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Landfill summary */}
                {state.landfillSites.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-semibold text-orange-800">
                        {state.landfillSites.length} site(s) · Total:
                      </p>
                      <p className="font-semibold text-orange-700">
                        {landfillAnnualTotals.reduce((s, l) => s + l.annual, 0).toFixed(0)} t/yr
                      </p>
                    </div>
                    <div className="flex justify-between text-sm text-orange-700">
                      <span>Annual landfill CH₄ (Scope 1):</span>
                      <span className="font-semibold">
                        {solidWasteCarbonPreview.landfillCh4.toFixed(2)} tCO₂e/yr
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══ 4.3 INCINERATION RECORDS ══════════════════════════════ */}
            <div
              id="sw-incineration"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-sm"
            >
              <div className="px-6 py-5 border-b border-white/5 bg-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-red-600" />
                    <h2 className="text-base font-semibold text-white">
                      Waste sent for incineration
                    </h2>
                  </div>
                  <button
                    onClick={() => {
                      const f: IIncinerationFacility = {
                        id: crypto.randomUUID(),
                        facilityNameLocation: '',
                        incineratorType: 'msw_incinerator',
                        monthlyRecords: [],
                      };
                      dispatch({ type: 'ADD_INCINERATION_FACILITY', payload: f });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add facility
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Incineration produces direct CO₂ and N₂O emissions. Emission factors are based on
                  waste type and incinerator type (IPCC 2006).
                </p>
              </div>
              <div className="p-6 space-y-4">
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-200">
                    Incineration emission factors
                  </summary>
                  <div className="mt-2 p-3 bg-white/5 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>MSW incinerator</span>
                      <span className="font-mono">0.91 tCO₂/tonne</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Biomedical waste incinerator</span>
                      <span className="font-mono">0.80 tCO₂/tonne</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Waste-to-energy plant</span>
                      <span className="font-mono">0.84 tCO₂/tonne</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Industrial incinerator</span>
                      <span className="font-mono">0.95 tCO₂/tonne</span>
                    </div>
                  </div>
                </details>

                {state.incinerationFacilities.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No incineration facilities added yet.
                  </p>
                )}

                {state.incinerationFacilities.map((facility, idx) => {
                  const facTotal = incinerationAnnualTotals.find(
                    (f) => f.facilityId === facility.id
                  );
                  const currentYear = new Date().getFullYear();
                  const selYear = incinerationSelectedYears[facility.id] ?? currentYear;
                  const setSelYear = (y: number) =>
                    setIncinerationSelectedYears((prev) => ({ ...prev, [facility.id]: y }));
                  const defaultEf =
                    INCINERATION_EF[facility.incineratorType ?? 'msw_incinerator'] ?? 0.91;

                  return (
                    <div
                      key={facility.id}
                      className="border border-white/10 rounded-xl overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-medium text-gray-400">
                            Facility {idx + 1}
                          </span>
                          <span className="font-medium text-gray-100 truncate">
                            {facility.facilityNameLocation || 'Unnamed facility'}
                          </span>
                          {facTotal && facTotal.annual > 0 && (
                            <span className="text-xs text-gray-400">
                              {facTotal.annual.toFixed(0)} t/yr · {facTotal.co2e.toFixed(1)}{' '}
                              tCO₂e/yr
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            dispatch({ type: 'REMOVE_INCINERATION_FACILITY', payload: facility.id })
                          }
                          className="text-gray-400 hover:text-red-500 ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Facility name / location *
                            </label>
                            <input
                              type="text"
                              value={facility.facilityNameLocation}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_INCINERATION_FACILITY',
                                  payload: {
                                    id: facility.id,
                                    updates: { facilityNameLocation: e.target.value },
                                  },
                                })
                              }
                              placeholder="UVNSST Hospital incinerator, Municipal WtE plant…"
                              className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Incinerator type
                            </label>
                            <select
                              value={facility.incineratorType ?? 'msw_incinerator'}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_INCINERATION_FACILITY',
                                  payload: {
                                    id: facility.id,
                                    updates: { incineratorType: e.target.value as IncineratorType },
                                  },
                                })
                              }
                              className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400/30"
                            >
                              <option value="msw_incinerator">MSW incinerator</option>
                              <option value="biomedical_incinerator">
                                Biomedical waste incinerator
                              </option>
                              <option value="industrial_incinerator">Industrial incinerator</option>
                              <option value="waste_to_energy">Waste-to-energy plant</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Capacity (TPD)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={facility.capacityTpd ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_INCINERATION_FACILITY',
                                  payload: {
                                    id: facility.id,
                                    updates: {
                                      capacityTpd: parseFloat(e.target.value) || undefined,
                                    },
                                  },
                                })
                              }
                              className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Emission factor (tCO₂/tonne) — optional
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={facility.emissionFactorTco2PerTonne ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_INCINERATION_FACILITY',
                                  payload: {
                                    id: facility.id,
                                    updates: {
                                      emissionFactorTco2PerTonne: e.target.value
                                        ? parseFloat(e.target.value)
                                        : undefined,
                                    },
                                  },
                                })
                              }
                              placeholder={`Default: ${defaultEf}`}
                              className="w-full text-sm border border-green-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400/30"
                            />
                            <p className="text-xs text-gray-400 mt-0.5">
                              Default for {facility.incineratorType?.replace(/_/g, ' ')}:{' '}
                              {defaultEf} tCO₂/tonne
                            </p>
                          </div>
                        </div>

                        {/* Monthly data */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <label className="text-xs font-medium text-gray-300">
                              Monthly data — Year:
                            </label>
                            <select
                              value={selYear}
                              onChange={(e) => setSelYear(parseInt(e.target.value))}
                              className="text-sm border border-white/10 rounded-lg px-2 py-1 focus:outline-none"
                            >
                              {[currentYear, currentYear - 1].map((y) => (
                                <option key={y} value={y}>
                                  {y}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-6 gap-2">
                            {[
                              'Jan',
                              'Feb',
                              'Mar',
                              'Apr',
                              'May',
                              'Jun',
                              'Jul',
                              'Aug',
                              'Sep',
                              'Oct',
                              'Nov',
                              'Dec',
                            ].map((mon, i) => {
                              const monthNum = (i + 1) as IIncinerationMonthlyRecord['month'];
                              const rec = facility.monthlyRecords.find(
                                (r) => r.month === monthNum && r.year === selYear
                              );
                              return (
                                <div key={mon} className="text-center">
                                  <label className="text-xs text-gray-400 block mb-1">{mon}</label>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="—"
                                    value={rec?.wasteTonnes ?? ''}
                                    onChange={(e) => {
                                      const val =
                                        e.target.value === ''
                                          ? undefined
                                          : parseFloat(e.target.value);
                                      if (rec) {
                                        dispatch({
                                          type: 'UPDATE_INCINERATION_MONTHLY',
                                          payload: {
                                            facilityId: facility.id,
                                            month: monthNum,
                                            year: selYear,
                                            updates: { wasteTonnes: val },
                                          },
                                        });
                                      } else {
                                        dispatch({
                                          type: 'ADD_INCINERATION_MONTHLY',
                                          payload: {
                                            facilityId: facility.id,
                                            record: {
                                              month: monthNum,
                                              year: selYear,
                                              wasteTonnes: val,
                                            },
                                          },
                                        });
                                      }
                                    }}
                                    className="w-full text-xs border border-white/10 rounded px-1 py-1 text-center focus:outline-none focus:ring-1 focus:ring-red-400"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Per-facility carbon */}
                        {facTotal && facTotal.annual > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs">
                            <div className="flex justify-between text-red-700">
                              <span>Annual incinerated:</span>
                              <span className="font-mono">{facTotal.annual.toFixed(1)} t</span>
                            </div>
                            <div className="flex justify-between text-red-700">
                              <span>CO₂ + N₂O (Scope 1):</span>
                              <span className="font-mono font-semibold">
                                {(facTotal.co2e * 1.044).toFixed(2)} tCO₂e/yr
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Incineration summary */}
                {state.incinerationFacilities.length > 0 &&
                  solidWasteCarbonPreview.incineration > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-1">
                        <p className="font-semibold text-red-800">
                          {state.incinerationFacilities.length} facility(ies)
                        </p>
                        <p className="font-semibold text-red-700">
                          {incinerationAnnualTotals.reduce((s, f) => s + f.annual, 0).toFixed(0)}{' '}
                          t/yr
                        </p>
                      </div>
                      <div className="flex justify-between text-sm text-red-700">
                        <span>Combined Scope 1 (CO₂ + N₂O):</span>
                        <span className="font-semibold">
                          {solidWasteCarbonPreview.incineration.toFixed(2)} tCO₂e/yr
                        </span>
                      </div>
                    </div>
                  )}
              </div>
            </div>

            {/* ══ 4.4 SOLID WASTE MANAGEMENT PLANT ══════════════════════ */}
            <div
              id="sw-mswplant"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-sm"
            >
              <div className="px-6 py-5 border-b border-white/5 bg-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-green-600" />
                    <h2 className="text-base font-semibold text-white">
                      Solid waste management plant (sieve analysis)
                    </h2>
                  </div>
                  <button
                    onClick={() => {
                      const plant: IMswPlant = {
                        id: crypto.randomUUID(),
                        sieveFractions: DEFAULT_SIEVE_FRACTIONS.map(
                          (f) => ({ ...f }) as ISieveFraction
                        ),
                      };
                      dispatch({ type: 'ADD_MSW_PLANT', payload: plant });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add MSW plant
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Particle size distribution determines the processing route for each waste
                  fraction. Composting and RDF production avoid landfill CH₄ emissions.
                </p>
              </div>
              <div className="p-6 space-y-4">
                {state.mswPlants.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No MSW plants added yet.</p>
                )}

                {state.mswPlants.map((plant, plantIdx) => {
                  const sieveInfo = sieveTotals.find((s) => s.plantId === plant.id);
                  const totalPct = sieveInfo?.totalPercent ?? 0;
                  const pctOk = Math.abs(totalPct - 100) < 1;

                  return (
                    <div
                      key={plant.id}
                      className="border border-white/10 rounded-xl overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-gray-400">
                            Plant {plantIdx + 1}
                          </span>
                          <span className="font-medium text-gray-100">
                            {plant.plantName || 'Unnamed plant'}
                          </span>
                          {plant.plantCapacityTpd && (
                            <span className="text-xs text-gray-400">
                              {plant.plantCapacityTpd} TPD
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => dispatch({ type: 'REMOVE_MSW_PLANT', payload: plant.id })}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-4 space-y-4">
                        {/* Plant overview */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Plant name
                            </label>
                            <input
                              type="text"
                              value={plant.plantName ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MSW_PLANT',
                                  payload: { id: plant.id, updates: { plantName: e.target.value } },
                                })
                              }
                              placeholder="Campus MSW sorting plant"
                              className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Design capacity (TPD)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={plant.plantCapacityTpd ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MSW_PLANT',
                                  payload: {
                                    id: plant.id,
                                    updates: {
                                      plantCapacityTpd: parseFloat(e.target.value) || undefined,
                                    },
                                  },
                                })
                              }
                              className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Energy (kWh/tonne){' '}
                              <span className="font-normal text-gray-400">default 35</span>
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={plant.energyConsumptionKwhPerTonne ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_MSW_PLANT',
                                  payload: {
                                    id: plant.id,
                                    updates: {
                                      energyConsumptionKwhPerTonne:
                                        parseFloat(e.target.value) || undefined,
                                    },
                                  },
                                })
                              }
                              placeholder="35"
                              className="w-full text-sm border border-green-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400/30"
                            />
                          </div>
                        </div>

                        {/* Sieve analysis table */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-gray-200">
                              Sieve fractions (8 particle-size fractions)
                            </p>
                            <span
                              className={cn(
                                'text-xs font-medium px-2 py-0.5 rounded-full',
                                pctOk
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              )}
                            >
                              Total: {totalPct.toFixed(1)}% {pctOk ? '✓' : '≠ 100%'}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/5 text-gray-400">
                                  <th className="text-left py-2 pr-2 w-20">Sieve size</th>
                                  <th className="text-left py-2 pr-2">Waste type</th>
                                  <th className="text-left py-2 pr-2">Use/Destination</th>
                                  <th className="text-left py-2 pr-2">End product</th>
                                  <th className="text-center py-2 w-16">% total</th>
                                  <th className="text-center py-2 w-16">% remaining</th>
                                </tr>
                              </thead>
                              <tbody>
                                {plant.sieveFractions.map((frac) => (
                                  <tr
                                    key={frac.sieveSize}
                                    className="border-b border-gray-50 hover:bg-white/5"
                                  >
                                    <td className="py-1.5 pr-2 font-mono text-gray-300 whitespace-nowrap">
                                      {SIEVE_SIZE_LABELS[frac.sieveSize as SieveSize]}
                                    </td>
                                    <td className="py-1.5 pr-2">
                                      <input
                                        type="text"
                                        value={frac.typeOfWasteSegregated ?? ''}
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_SIEVE_FRACTION',
                                            payload: {
                                              plantId: plant.id,
                                              sieveSize: frac.sieveSize as SieveSize,
                                              updates: { typeOfWasteSegregated: e.target.value },
                                            },
                                          })
                                        }
                                        placeholder={
                                          SIEVE_WASTE_TYPE_HINTS[frac.sieveSize as SieveSize]
                                        }
                                        className="w-full border border-white/10 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-green-400 min-w-[120px]"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2">
                                      <input
                                        type="text"
                                        value={frac.typicalUseDestination ?? ''}
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_SIEVE_FRACTION',
                                            payload: {
                                              plantId: plant.id,
                                              sieveSize: frac.sieveSize as SieveSize,
                                              updates: { typicalUseDestination: e.target.value },
                                            },
                                          })
                                        }
                                        placeholder="Composting yard, RDF plant…"
                                        className="w-full border border-white/10 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-green-400 min-w-[100px]"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2">
                                      <select
                                        value={frac.endProduct ?? ''}
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_SIEVE_FRACTION',
                                            payload: {
                                              plantId: plant.id,
                                              sieveSize: frac.sieveSize as SieveSize,
                                              updates: { endProduct: e.target.value },
                                            },
                                          })
                                        }
                                        className="w-full border border-white/10 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-green-400 min-w-[100px]"
                                      >
                                        <option value="">Select…</option>
                                        <option value="Compost">Compost</option>
                                        <option value="RDF">RDF (Refuse Derived Fuel)</option>
                                        <option value="Inert landfill">Inert landfill</option>
                                        <option value="Recycled material">Recycled material</option>
                                        <option value="Other">Other</option>
                                      </select>
                                    </td>
                                    <td className="py-1.5 pr-2">
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.1}
                                        value={frac.percentOfTotalWaste ?? ''}
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_SIEVE_FRACTION',
                                            payload: {
                                              plantId: plant.id,
                                              sieveSize: frac.sieveSize as SieveSize,
                                              updates: {
                                                percentOfTotalWaste: e.target.value
                                                  ? parseFloat(e.target.value)
                                                  : undefined,
                                              },
                                            },
                                          })
                                        }
                                        className="w-full border border-white/10 rounded px-1 py-1 text-center focus:outline-none focus:ring-1 focus:ring-green-400"
                                      />
                                    </td>
                                    <td className="py-1.5">
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.1}
                                        value={frac.percentRemainingWaste ?? ''}
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_SIEVE_FRACTION',
                                            payload: {
                                              plantId: plant.id,
                                              sieveSize: frac.sieveSize as SieveSize,
                                              updates: {
                                                percentRemainingWaste: e.target.value
                                                  ? parseFloat(e.target.value)
                                                  : undefined,
                                              },
                                            },
                                          })
                                        }
                                        className="w-full border border-white/10 rounded px-1 py-1 text-center focus:outline-none focus:ring-1 focus:ring-green-400"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {!pctOk && totalPct > 0 && (
                            <p className="text-xs text-amber-600 mt-1">
                              Sieve fractions should sum to 100%. Current total:{' '}
                              {totalPct.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── SOLID WASTE SECTION (Quick entry fallback) ────────────── */}
            <div
              id="solid-waste"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-sm"
            >
              <div className="px-6 py-5 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                  <h2 className="text-base font-semibold text-white">Solid waste</h2>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  How is solid waste from this building disposed of? Include all waste types.
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Entry mode toggle */}
                <div className="flex items-center gap-1 p-1 bg-white/10 rounded-xl w-fit">
                  {(['building_total', 'zone_by_zone'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => dispatch({ type: 'SET_SOLID_WASTE_MODE', payload: mode })}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                        state.solidWasteMode === mode
                          ? 'bg-black/40 backdrop-blur-md text-white shadow-sm'
                          : 'text-gray-400 hover:text-gray-200'
                      )}
                    >
                      {mode === 'building_total' ? 'Building total' : 'Zone by zone'}
                    </button>
                  ))}
                </div>
                {state.solidWasteMode === 'zone_by_zone' && (
                  <p className="text-xs text-blue-600 -mt-3">
                    <Info className="w-3.5 h-3.5 inline mr-1" />
                    Zone by zone lets different parts of the building have different waste practices
                    (e.g. labs vs offices vs canteen)
                  </p>
                )}

                {/* ── BUILDING TOTAL MODE ──────────────────────────────────── */}
                {state.solidWasteMode === 'building_total' && (
                  <>
                    {/* Field 1 — Daily waste */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-200">
                          Daily waste generated
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">I don't have waste data</span>
                          <button
                            type="button"
                            onClick={() =>
                              dispatch({
                                type: 'SET_HAS_WASTE_DATA',
                                payload: !state.hasWasteData,
                              })
                            }
                            className={cn(
                              'relative w-10 h-5 rounded-full transition-colors',
                              !state.hasWasteData ? 'bg-rose-500' : 'bg-gray-200'
                            )}
                          >
                            <span
                              className={cn(
                                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black/40 backdrop-blur-md shadow transition-transform',
                                !state.hasWasteData ? 'translate-x-5' : 'translate-x-0'
                              )}
                            />
                          </button>
                        </div>
                      </div>

                      {!state.hasWasteData ? (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                          <AlertTriangle className="w-4 h-4 inline mr-1" />
                          Default values will be used based on your building type (
                          {estimatedKgPerDay.toFixed(1)} kg/day estimated from occupancy).
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div
                            className={cn(
                              'flex items-center gap-3',
                              isFieldChanged('solidWasteKgPerDay') &&
                                'ring-1 ring-amber-300 rounded-lg p-2'
                            )}
                          >
                            <input
                              type="number"
                              min={0}
                              value={state.solidWasteKgPerDay || ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'SET_SOLID_WASTE_KG_PER_DAY',
                                  payload: parseFloat(e.target.value) || 0,
                                })
                              }
                              placeholder="e.g. 50"
                              className="w-36 text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                            />
                            <span className="text-sm text-gray-400">kg/day total solid waste</span>
                            {isFieldChanged('solidWasteKgPerDay') && (
                              <span className="text-xs text-amber-600 font-medium">
                                Changed from previous version
                              </span>
                            )}
                          </div>

                          {/* Quick estimate chips */}
                          <div className="flex flex-wrap gap-2">
                            {[
                              { label: 'Small building', kg: estimatedKgPerDay * 0.5 },
                              { label: 'Use occupancy estimate', kg: estimatedKgPerDay },
                              { label: 'Large building', kg: estimatedKgPerDay * 3 },
                            ].map(({ label, kg }) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() =>
                                  dispatch({
                                    type: 'SET_SOLID_WASTE_KG_PER_DAY',
                                    payload: parseFloat(kg.toFixed(1)),
                                  })
                                }
                                className="px-3 py-1.5 text-xs font-medium bg-rose-50 text-rose-700 rounded-full hover:bg-rose-100 transition-colors border border-rose-200"
                              >
                                {label} ({kg.toFixed(1)} kg/day)
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Field 2 — Disposal breakdown */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-200">
                            How is this waste disposed?
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">Must total 100%</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-sm font-medium',
                              streamSumOk ? 'text-green-600' : 'text-red-500'
                            )}
                          >
                            Total: {streamTotal}%
                          </span>
                          {!streamSumOk && (
                            <button
                              type="button"
                              onClick={() => dispatch({ type: 'AUTO_BALANCE' })}
                              className="px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                            >
                              Auto-balance remaining{' '}
                              {streamTotal < 100
                                ? `+${100 - streamTotal}%`
                                : `-${streamTotal - 100}%`}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {state.wasteStreams.map((stream) => (
                          <DisposalMethodRow
                            key={stream.id}
                            stream={stream}
                            kgPerDay={state.solidWasteKgPerDay}
                            operatingDays={operatingDays}
                            onFractionChange={(id, fraction) =>
                              dispatch({
                                type: 'UPDATE_STREAM_FRACTION',
                                payload: { id, fraction },
                              })
                            }
                            onRemove={
                              stream.isCustomMethod
                                ? (sid) => dispatch({ type: 'REMOVE_STREAM', payload: sid })
                                : undefined
                            }
                            isChanged={false}
                          />
                        ))}
                      </div>

                      {/* Add custom stream */}
                      {showCustomStream ? (
                        <CustomWasteStreamForm
                          onAdd={(s) => {
                            dispatch({ type: 'ADD_CUSTOM_STREAM', payload: s });
                            setShowCustomStream(false);
                          }}
                          onCancel={() => setShowCustomStream(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowCustomStream(true)}
                          className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 font-medium mt-2"
                        >
                          <Plus className="w-4 h-4" />
                          Add custom disposal method
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* ── ZONE BY ZONE MODE ─────────────────────────────────────── */}
                {state.solidWasteMode === 'zone_by_zone' && (
                  <div className="space-y-4">
                    {/* Summary table */}
                    {state.zones.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs border border-white/5 rounded-lg overflow-hidden">
                          <thead className="bg-white/5">
                            <tr>
                              {[
                                'Zone',
                                'kg/day',
                                '% dump',
                                '% burning',
                                '% compost',
                                '% recycle',
                                'tCO₂e/yr',
                              ].map((h) => (
                                <th
                                  key={h}
                                  className="px-3 py-2 text-left font-semibold text-gray-400 uppercase tracking-wide"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 bg-black/40 backdrop-blur-md">
                            {state.zones.map((z) => {
                              const dumpFrac =
                                z.streams.find(
                                  (s) =>
                                    s.disposalMethod === SolidWasteDisposalMethod.UNMANAGED_DUMP
                                )?.fractionPercent ?? 0;
                              const burnFrac =
                                z.streams.find(
                                  (s) => s.disposalMethod === SolidWasteDisposalMethod.OPEN_BURNING
                                )?.fractionPercent ?? 0;
                              const compostFrac =
                                z.streams.find(
                                  (s) => s.disposalMethod === SolidWasteDisposalMethod.COMPOSTING
                                )?.fractionPercent ?? 0;
                              const recycleFrac =
                                z.streams.find(
                                  (s) => s.disposalMethod === SolidWasteDisposalMethod.RECYCLING
                                )?.fractionPercent ?? 0;
                              const zoneCO2 = z.streams.reduce(
                                (sum, s) =>
                                  sum +
                                  calcSolidCO2(
                                    z.kgPerDay,
                                    s.fractionPercent,
                                    s.disposalMethod,
                                    operatingDays
                                  ),
                                0
                              );
                              return (
                                <tr key={z.id} className="hover:bg-white/5">
                                  <td className="px-3 py-2 font-medium text-gray-100">
                                    {z.zoneName || '—'}
                                  </td>
                                  <td className="px-3 py-2">{z.kgPerDay}</td>
                                  <td className="px-3 py-2">{dumpFrac}%</td>
                                  <td className="px-3 py-2">{burnFrac}%</td>
                                  <td className="px-3 py-2">{compostFrac}%</td>
                                  <td className="px-3 py-2">{recycleFrac}%</td>
                                  <td className="px-3 py-2 font-mono">{zoneCO2.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Zone cards */}
                    <div className="space-y-4">
                      {state.zones.map((zone) => (
                        <ZoneCard
                          key={zone.id}
                          zone={zone}
                          kgTotalPerDay={state.solidWasteKgPerDay}
                          operatingDays={operatingDays}
                          onUpdateKg={(zid, kg) =>
                            dispatch({
                              type: 'UPDATE_ZONE',
                              payload: { id: zid, updates: { kgPerDay: kg } },
                            })
                          }
                          onUpdateName={(zid, name) =>
                            dispatch({
                              type: 'UPDATE_ZONE',
                              payload: { id: zid, updates: { zoneName: name } },
                            })
                          }
                          onStreamFraction={(zid, sid, frac) =>
                            dispatch({
                              type: 'UPDATE_ZONE_STREAM_FRACTION',
                              payload: { zoneId: zid, streamId: sid, fraction: frac },
                            })
                          }
                          onRemove={(zid) => dispatch({ type: 'REMOVE_ZONE', payload: zid })}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'ADD_ZONE',
                          payload: {
                            id: crypto.randomUUID(),
                            zoneName: '',
                            kgPerDay: 0,
                            streams: makeDefaultStreams(),
                          },
                        })
                      }
                      className="flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-800 font-medium border border-dashed border-rose-300 rounded-xl px-4 py-2.5 hover:bg-rose-50 transition-colors w-full justify-center"
                    >
                      <Plus className="w-4 h-4" />
                      Add zone
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                WASTEWATER GENERATION (Phase 2 — File 3.1)
            ══════════════════════════════════════════════════════════════════ */}
            <div
              id="ww-generation"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-blue-200 overflow-hidden shadow-sm"
            >
              <div className="px-6 py-5 border-b border-blue-100 bg-blue-50">
                <div className="flex items-center gap-2">
                  <Droplets className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-white">Wastewater generation</h2>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Record wastewater volumes by source. These flow figures drive the IPCC Tier 1
                  methane and nitrous oxide calculation — more accurate than occupant-based
                  estimates.
                </p>
                <div className="mt-2 flex gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                    Scope 1
                  </span>
                  <span className="text-gray-300">CH₄ &amp; N₂O from wastewater</span>
                </div>
              </div>
              <div className="p-6 space-y-5">
                {/* IPCC preview box */}
                {wastewaterTotals.totalKld > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                    <p className="font-medium mb-1">IPCC Tier 1 calculation inputs:</p>
                    <p className="text-xs font-mono">
                      CH₄ = flow × BOD × {IPCC_WASTEWATER.Bo} (Bo) × MCF × GWP
                      {IPCC_WASTEWATER.GWP_CH4}
                    </p>
                    <p className="text-xs font-mono">
                      N₂O = flow × TKN × {IPCC_WASTEWATER.EF_N2O} (EF) × GWP
                      {IPCC_WASTEWATER.GWP_N2O}
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Source: IPCC 2006 Vol. 5 Chapter 6, AR6 GWPs
                    </p>
                  </div>
                )}

                {/* Wastewater generation table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-2 text-gray-300 font-medium w-56">Source</th>
                        <th className="text-center py-2 text-gray-300 font-medium w-28">
                          Current (KLD)
                        </th>
                        <th className="text-center py-2 text-gray-300 font-medium w-28">
                          In 5 Years
                        </th>
                        <th className="text-center py-2 text-gray-300 font-medium w-28">
                          In 10 Years
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(
                        [
                          {
                            key: 'totalSewageKld',
                            label: 'Total sewage generated',
                            helper: 'Domestic + office sewage (primary CH₄/N₂O input)',
                            critical: true,
                          },
                          {
                            key: 'hospitalEffluentKld',
                            label: 'Hospital effluent',
                            helper: 'Higher organic load and pharmaceutical residues',
                            critical: false,
                          },
                          {
                            key: 'kitchenWastewaterKld',
                            label: 'Kitchen wastewater',
                            helper: 'High BOD, fats, oils and grease (FOG)',
                            critical: false,
                          },
                          {
                            key: 'vehicleWashWastewaterKld',
                            label: 'Vehicle wash wastewater',
                            helper: 'Usually requires oil/water separator',
                            critical: false,
                          },
                        ] as const
                      ).map(({ key, label, helper, critical }) => {
                        const horizon = state.wastewaterGeneration[key] ?? {};
                        return (
                          <tr key={key} className={critical ? 'bg-blue-50/40' : ''}>
                            <td className="py-2 pr-3">
                              <p
                                className={cn(
                                  'font-medium',
                                  critical ? 'text-blue-800' : 'text-gray-200'
                                )}
                              >
                                {critical && <span className="text-blue-500 mr-1">★</span>}
                                {label}
                              </p>
                              <p className="text-xs text-gray-400">{helper}</p>
                            </td>
                            {(['current', 'inFiveYears', 'inTenYears'] as const).map((h) => (
                              <td key={h} className="py-2 px-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  value={(horizon as Record<string, number | undefined>)[h] ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_WASTEWATER_GENERATION',
                                      payload: {
                                        [key]: {
                                          ...horizon,
                                          [h]: parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  placeholder="—"
                                  className="w-24 text-center text-sm border border-white/10 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Totals row */}
                {wastewaterTotals.totalKld > 0 && (
                  <div className="bg-white/5 rounded-xl p-4 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Total current wastewater:</span>
                      <span className="font-semibold text-white">
                        {wastewaterTotals.totalKld.toFixed(1)} KLD
                      </span>
                    </div>
                    {wastewaterTotals.greyReduction > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Greywater reuse reduction:</span>
                        <span className="font-semibold">
                          −{wastewaterTotals.greyReduction.toFixed(1)} KLD
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-white/10 pt-1 mt-1">
                      <span className="font-medium text-gray-200">
                        Net wastewater to treatment:
                      </span>
                      <span className="font-bold text-blue-700">
                        {wastewaterTotals.netKld.toFixed(1)} KLD
                      </span>
                    </div>
                  </div>
                )}

                {/* Greywater reuse toggle */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-200">Greywater reuse feasible?</p>
                      <p className="text-xs text-gray-400">
                        Reduces STP load and wastewater emissions
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'UPDATE_WASTEWATER_GENERATION',
                          payload: {
                            greywaterReuseFeasible:
                              !state.wastewaterGeneration.greywaterReuseFeasible,
                          },
                        })
                      }
                      className={cn(
                        'relative w-10 h-5 rounded-full transition-colors',
                        state.wastewaterGeneration.greywaterReuseFeasible
                          ? 'bg-green-500'
                          : 'bg-gray-200'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black/40 backdrop-blur-md shadow transition-transform',
                          state.wastewaterGeneration.greywaterReuseFeasible
                            ? 'translate-x-5'
                            : 'translate-x-0'
                        )}
                      />
                    </button>
                  </div>
                  {state.wastewaterGeneration.greywaterReuseFeasible && (
                    <div className="pl-4 space-y-3 bg-green-50 p-3 rounded-xl">
                      <div className="flex items-center gap-3">
                        <label className="text-sm text-gray-200 w-44 shrink-0">
                          Reuse capacity (KLD):
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={state.wastewaterGeneration.greywaterReuseCapacityKld ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_WASTEWATER_GENERATION',
                              payload: {
                                greywaterReuseCapacityKld: parseFloat(e.target.value) || undefined,
                              },
                            })
                          }
                          className="w-28 text-sm border border-white/10 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">
                          Reuse application:
                        </label>
                        <input
                          type="text"
                          value={state.wastewaterGeneration.greywaterReuseDescription ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_WASTEWATER_GENERATION',
                              payload: { greywaterReuseDescription: e.target.value },
                            })
                          }
                          placeholder="e.g. Toilet flushing, irrigation, vehicle washing"
                          className="w-full text-sm border border-white/10 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 bg-black/40 backdrop-blur-md"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Carbon calculation preview */}
                {wastewaterCarbonPreview && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-2">
                    <p className="font-medium text-amber-800">
                      Live carbon estimate (with defaults):
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-black/40 backdrop-blur-md rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-red-600">
                          {wastewaterCarbonPreview.ch4Co2e.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">CH₄ tCO₂e/yr</p>
                      </div>
                      <div className="bg-black/40 backdrop-blur-md rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-orange-600">
                          {wastewaterCarbonPreview.n2oCo2e.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">N₂O tCO₂e/yr</p>
                      </div>
                    </div>
                    <p className="text-xs text-amber-700">
                      Using BOD {wastewaterCarbonPreview.bodUsed} mg/L default · MCF{' '}
                      {wastewaterCarbonPreview.mcfUsed}. Fill wastewater characteristics (BOD, TKN)
                      and STP records below to refine.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                WASTEWATER CHARACTERISTICS (Phase 2 — File 3.2)
            ══════════════════════════════════════════════════════════════════ */}
            <div
              id="ww-characteristics"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-sm"
            >
              <div className="px-6 py-5 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                  <Waves className="w-5 h-5 text-teal-600" />
                  <h2 className="text-base font-semibold text-white">
                    Wastewater characteristics
                  </h2>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Monthly monitoring as per IS 3025. BOD and TKN directly improve the accuracy of
                  CH₄ and N₂O emission calculations.
                </p>
              </div>
              <div className="p-6 space-y-4">
                {/* Key parameters note */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
                  <p className="font-medium">
                    ★ BOD and TKN are the key parameters for carbon calculation.
                  </p>
                  <p className="text-xs mt-0.5">
                    Filling these month-by-month gives the most accurate emission estimate.
                  </p>
                </div>

                {/* Compliance summary */}
                {state.wastewaterCharacteristics.some((r) =>
                  Object.values(r.monthlyValues ?? {}).some((v) => v !== undefined && v !== '')
                ) && (
                  <div
                    className={cn(
                      'rounded-xl p-3 text-sm',
                      wastewaterCompliance.compliant
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    )}
                  >
                    {wastewaterCompliance.compliant ? (
                      <p className="text-green-700 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        All monitored values within CPCB discharge standards
                      </p>
                    ) : (
                      <div>
                        <p className="text-red-700 font-semibold flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-4 h-4" />
                          {wastewaterCompliance.violations.length} CPCB discharge standard
                          exceedance(s)
                        </p>
                        <ul className="text-xs text-red-600 space-y-0.5">
                          {wastewaterCompliance.violations.slice(0, 5).map((v, i) => (
                            <li key={i}>• {v}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Monthly matrix */}
                <div className="overflow-x-auto">
                  <table className="text-xs min-w-[900px]">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="px-3 py-2 text-left font-semibold text-gray-400 sticky left-0 bg-white/5 w-52">
                          Parameter
                        </th>
                        <th className="px-2 py-2 text-center font-semibold text-gray-400 w-16">
                          Unit
                        </th>
                        {MONTH_LABELS.map((m) => (
                          <th
                            key={m}
                            className="px-1 py-2 text-center font-semibold text-gray-400 w-14"
                          >
                            {m}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center font-semibold text-gray-400 w-20">
                          CPCB Limit
                        </th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-black/40 backdrop-blur-md">
                      {state.wastewaterCharacteristics.map((rec) => {
                        const isCustom = rec.parameter === 'custom';
                        const isCritical =
                          rec.parameter === 'bod' || rec.parameter === 'total_kjeldahl_nitrogen';
                        const std = CPCB_DISCHARGE_STANDARDS[rec.parameter];
                        return (
                          <tr
                            key={rec.id}
                            className={cn('hover:bg-white/5', isCritical && 'bg-amber-50/40')}
                          >
                            <td className="px-3 py-1.5 sticky left-0 bg-inherit font-medium text-gray-200">
                              <div className="flex items-center gap-1">
                                {isCritical && <span className="text-amber-500 text-xs">★</span>}
                                {isCustom ? (
                                  <input
                                    type="text"
                                    value={rec.customParameterLabel ?? ''}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_WASTEWATER_CHARACTERISTIC',
                                        payload: {
                                          id: rec.id,
                                          updates: { customParameterLabel: e.target.value },
                                        },
                                      })
                                    }
                                    placeholder="Parameter name"
                                    className="w-full text-xs border border-white/10 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400"
                                  />
                                ) : (
                                  <span>
                                    {WASTEWATER_PARAMETER_LABELS[rec.parameter] ?? rec.parameter}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-center text-gray-400">
                              {isCustom ? (
                                <input
                                  type="text"
                                  value={rec.unit ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_WASTEWATER_CHARACTERISTIC',
                                      payload: { id: rec.id, updates: { unit: e.target.value } },
                                    })
                                  }
                                  placeholder="unit"
                                  className="w-12 text-center text-xs border border-white/10 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400"
                                />
                              ) : (
                                (rec.unit ?? WASTEWATER_PARAMETER_UNITS[rec.parameter] ?? '—')
                              )}
                            </td>
                            {MONTHS.map((month) => {
                              const val = (rec.monthlyValues ?? {})[month];
                              const numVal = parseFloat(String(val));
                              let cellColor = '';
                              if (val !== undefined && val !== '' && std) {
                                const limitStr = std.limit
                                  .replace('≤', '')
                                  .replace('≥', '')
                                  .split('–')[0];
                                const limitNum = parseFloat(limitStr);
                                if (!isNaN(limitNum) && !isNaN(numVal)) {
                                  cellColor = numVal <= limitNum ? 'bg-green-50' : 'bg-red-100';
                                }
                              }
                              return (
                                <td key={month} className={cn('px-1 py-1', cellColor)}>
                                  <input
                                    type="text"
                                    value={val ?? ''}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_WASTEWATER_CHARACTERISTIC',
                                        payload: {
                                          id: rec.id,
                                          updates: {
                                            monthlyValues: {
                                              ...rec.monthlyValues,
                                              [month]: e.target.value,
                                            },
                                          },
                                        },
                                      })
                                    }
                                    placeholder="—"
                                    className="w-12 text-center text-xs border border-white/10 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-transparent"
                                  />
                                </td>
                              );
                            })}
                            <td className="px-2 py-1.5 text-center text-gray-400 text-xs">
                              {rec.cpcbLimit ?? std?.limit ?? '—'}
                            </td>
                            <td className="px-1 py-1.5">
                              {isCustom && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    dispatch({
                                      type: 'REMOVE_WASTEWATER_CHARACTERISTIC',
                                      payload: rec.id,
                                    })
                                  }
                                  className="text-gray-300 hover:text-red-500"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'ADD_WASTEWATER_CHARACTERISTIC',
                      payload: {
                        id: crypto.randomUUID(),
                        parameter: 'custom',
                        monthlyValues: {},
                      },
                    })
                  }
                  className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-800 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add custom parameter
                </button>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                STP & ETP PLANTS (Phase 2 — File 3.3)
            ══════════════════════════════════════════════════════════════════ */}
            <div
              id="stp-etp"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-teal-200 overflow-hidden shadow-sm"
            >
              <div className="px-6 py-5 border-b border-teal-100 bg-teal-50">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-teal-600" />
                  <h2 className="text-base font-semibold text-white">
                    Sewage &amp; effluent treatment plants (STP / ETP)
                  </h2>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Treatment stages determine the methane emission factor (MCF) and electricity
                  consumption. More complete treatment = lower CH₄ but higher electricity use.
                </p>
              </div>
              <div className="p-6 space-y-5">
                {/* MCF reference */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-200 font-medium flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    MCF reference table (IPCC 2006 Table 6.8)
                  </summary>
                  <div className="mt-2 bg-white/5 rounded-xl p-3 text-xs space-y-1 text-gray-300">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <span>No treatment (direct discharge):</span>
                      <span className="font-mono text-red-600">MCF = 1.0</span>
                      <span>Preliminary only (screening):</span>
                      <span className="font-mono text-orange-600">MCF = 0.9</span>
                      <span>Primary only (sedimentation):</span>
                      <span className="font-mono text-amber-600">MCF = 0.6</span>
                      <span>Aerobic secondary (ASP, SBR, MBR):</span>
                      <span className="font-mono text-green-600">MCF = 0.1 ✓</span>
                      <span>Anaerobic (lagoon, digester):</span>
                      <span className="font-mono text-orange-600">MCF = 0.8</span>
                    </div>
                    <p className="text-gray-400 mt-1">
                      Lower MCF = less methane = better for carbon. Aerobic secondary is
                      significantly better than primary-only.
                    </p>
                  </div>
                </details>

                {/* Plant cards */}
                <div className="space-y-4">
                  {state.stpEtpPlants.map((plant, idx) => {
                    const m = plant.treatmentMethods;
                    const mcf =
                      m.secondary && !m.isAnaerobic
                        ? 0.1
                        : m.primary && !m.secondary
                          ? 0.6
                          : m.isAnaerobic
                            ? 0.8
                            : m.preliminary && !m.primary && !m.secondary
                              ? 0.9
                              : 1.0;
                    const mcfColor =
                      mcf <= 0.1
                        ? 'text-green-600 bg-green-50 border-green-200'
                        : mcf <= 0.6
                          ? 'text-amber-600 bg-amber-50 border-amber-200'
                          : 'text-red-600 bg-red-50 border-red-200';

                    // Per-plant carbon estimate
                    const m3day = (plant.actualInflowMld ?? plant.plantCapacityMld) * 1000;
                    const flowKld = m3day; // m³/day = KLD
                    const bod = avgBOD ?? 250;
                    const tow = (flowKld * 365 * bod) / 1000;
                    const plantCh4Co2e =
                      (tow * IPCC_WASTEWATER.Bo * mcf * IPCC_WASTEWATER.GWP_CH4) / 1000;
                    const tkn = avgTKN ?? 40;
                    const nEff = (flowKld * 365 * tkn) / 1000;
                    const plantN2oCo2e =
                      (nEff * IPCC_WASTEWATER.EF_N2O * IPCC_WASTEWATER.GWP_N2O) / 1000;
                    const stpEf =
                      plant.energyConsumptionKwhPerM3 ??
                      ((m.preliminary ? STP_ENERGY_KWH_M3.preliminary : 0) +
                        (m.primary ? STP_ENERGY_KWH_M3.primary : 0) +
                        (m.secondary ? STP_ENERGY_KWH_M3.secondary : 0) +
                        (m.tertiary ? STP_ENERGY_KWH_M3.tertiary : 0) ||
                        STP_ENERGY_KWH_M3.secondary);
                    const stpKwh = stpEf * m3day * 365;
                    const stpTco2e = (stpKwh * 0.716) / 1000;

                    return (
                      <div
                        key={plant.id}
                        className="border border-white/10 rounded-xl overflow-hidden"
                      >
                        {/* Card header */}
                        <div className="px-4 py-3 bg-white/5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-200">
                              Plant {idx + 1} —{' '}
                              {WW_SOURCE_LABELS[plant.sourceOfWastewater] ??
                                plant.sourceOfWastewater}
                            </span>
                            <span className="text-xs text-gray-400">
                              {plant.plantCapacityMld} MLD
                            </span>
                            <span
                              className={cn(
                                'text-xs font-mono px-2 py-0.5 rounded border',
                                mcfColor
                              )}
                            >
                              MCF {mcf}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => dispatch({ type: 'REMOVE_STP_ETP', payload: plant.id })}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-4 space-y-4">
                          {/* Group A: Identity */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">
                                Source of wastewater *
                              </label>
                              <select
                                value={plant.sourceOfWastewater}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_STP_ETP',
                                    payload: {
                                      id: plant.id,
                                      updates: {
                                        sourceOfWastewater: e.target.value as WastewaterSourceType,
                                      },
                                    },
                                  })
                                }
                                className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                              >
                                {Object.entries(WW_SOURCE_LABELS).map(([v, l]) => (
                                  <option key={v} value={v}>
                                    {l}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">
                                Plant capacity (MLD) *
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={plant.plantCapacityMld || ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_STP_ETP',
                                      payload: {
                                        id: plant.id,
                                        updates: {
                                          plantCapacityMld: parseFloat(e.target.value) || 0,
                                        },
                                      },
                                    })
                                  }
                                  className="w-28 text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                                />
                                <span className="text-xs text-gray-400">
                                  = {(plant.plantCapacityMld * 1000).toFixed(0)} m³/day
                                </span>
                              </div>
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs text-gray-400 mb-1 block">
                                Source description (optional)
                              </label>
                              <input
                                type="text"
                                value={plant.sourceDescription ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_STP_ETP',
                                    payload: {
                                      id: plant.id,
                                      updates: { sourceDescription: e.target.value },
                                    },
                                  })
                                }
                                maxLength={200}
                                placeholder="e.g. Combined sewage from all residential hostels"
                                className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                              />
                            </div>
                          </div>

                          {/* Group B: Treatment stages */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                              Treatment stages (determines MCF)
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {(
                                [
                                  {
                                    key: 'preliminary',
                                    label: 'Preliminary',
                                    desc: 'Screening, grit chamber',
                                    ef: STP_ENERGY_KWH_M3.preliminary,
                                  },
                                  {
                                    key: 'primary',
                                    label: 'Primary',
                                    desc: 'Sedimentation, clarifier',
                                    ef: STP_ENERGY_KWH_M3.primary,
                                  },
                                  {
                                    key: 'tertiary',
                                    label: 'Tertiary',
                                    desc: 'UV, RO, nutrient removal',
                                    ef: STP_ENERGY_KWH_M3.tertiary,
                                  },
                                ] as const
                              ).map(({ key, label, desc, ef }) => (
                                <label
                                  key={key}
                                  className="flex items-start gap-2 p-2 rounded-lg border border-white/5 hover:bg-white/5 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={!!(m as Record<string, boolean | undefined>)[key]}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_STP_ETP',
                                        payload: {
                                          id: plant.id,
                                          updates: {
                                            treatmentMethods: { ...m, [key]: e.target.checked },
                                          },
                                        },
                                      })
                                    }
                                    className="mt-0.5 accent-teal-600"
                                  />
                                  <div>
                                    <p className="text-xs font-medium text-gray-200">{label}</p>
                                    <p className="text-xs text-gray-400">
                                      {desc} · {ef} kWh/m³
                                    </p>
                                  </div>
                                </label>
                              ))}
                              <div className="p-2 rounded-lg border border-white/5">
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!m.secondary}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_STP_ETP',
                                        payload: {
                                          id: plant.id,
                                          updates: {
                                            treatmentMethods: { ...m, secondary: e.target.checked },
                                          },
                                        },
                                      })
                                    }
                                    className="mt-0.5 accent-teal-600"
                                  />
                                  <div>
                                    <p className="text-xs font-medium text-gray-200">Secondary</p>
                                    <p className="text-xs text-gray-400">
                                      Biological · {STP_ENERGY_KWH_M3.secondary} kWh/m³
                                    </p>
                                  </div>
                                </label>
                                {m.secondary && (
                                  <div className="mt-2 ml-6 space-y-1">
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                      <input
                                        type="radio"
                                        checked={!m.isAnaerobic}
                                        onChange={() =>
                                          dispatch({
                                            type: 'UPDATE_STP_ETP',
                                            payload: {
                                              id: plant.id,
                                              updates: {
                                                treatmentMethods: { ...m, isAnaerobic: false },
                                              },
                                            },
                                          })
                                        }
                                        className="accent-green-600"
                                      />
                                      <span className="text-green-700 font-medium">Aerobic</span>
                                      <span className="text-gray-400">
                                        (ASP, SBR, MBR, MBBR) · MCF 0.1
                                      </span>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                      <input
                                        type="radio"
                                        checked={!!m.isAnaerobic}
                                        onChange={() =>
                                          dispatch({
                                            type: 'UPDATE_STP_ETP',
                                            payload: {
                                              id: plant.id,
                                              updates: {
                                                treatmentMethods: { ...m, isAnaerobic: true },
                                              },
                                            },
                                          })
                                        }
                                        className="accent-orange-600"
                                      />
                                      <span className="text-orange-700 font-medium">Anaerobic</span>
                                      <span className="text-gray-400">
                                        (lagoon, UASB, digester) · MCF 0.8
                                      </span>
                                    </label>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Live MCF badge */}
                            <div
                              className={cn(
                                'flex items-center gap-2 p-2 rounded-lg border text-sm font-medium',
                                mcfColor
                              )}
                            >
                              <span>Current MCF: {mcf}</span>
                              <span className="text-xs font-normal">
                                {mcf <= 0.1
                                  ? '— Aerobic treatment: lowest methane emission'
                                  : mcf <= 0.6
                                    ? '— Primary treatment: moderate methane'
                                    : '— Minimal/no treatment: highest methane'}
                              </span>
                            </div>

                            {/* Biogas capture (shown for anaerobic) */}
                            {m.isAnaerobic && (
                              <div className="space-y-2 bg-orange-50 rounded-xl p-3">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!m.hasBiogasCapture}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_STP_ETP',
                                        payload: {
                                          id: plant.id,
                                          updates: {
                                            treatmentMethods: {
                                              ...m,
                                              hasBiogasCapture: e.target.checked,
                                            },
                                          },
                                        },
                                      })
                                    }
                                    className="accent-orange-600"
                                  />
                                  <span className="text-orange-800 font-medium">
                                    Biogas capture installed?
                                  </span>
                                </label>
                                {m.hasBiogasCapture && (
                                  <div className="flex items-center gap-3 ml-6">
                                    <label className="text-xs text-gray-300">
                                      Capture efficiency (%):
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={m.biogasCaptureEfficiency ?? 80}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_STP_ETP',
                                          payload: {
                                            id: plant.id,
                                            updates: {
                                              treatmentMethods: {
                                                ...m,
                                                biogasCaptureEfficiency:
                                                  parseInt(e.target.value) || 80,
                                              },
                                            },
                                          },
                                        })
                                      }
                                      className="w-20 text-sm border border-orange-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">
                                Technology details (optional)
                              </label>
                              <input
                                type="text"
                                value={m.methodDetails ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_STP_ETP',
                                    payload: {
                                      id: plant.id,
                                      updates: {
                                        treatmentMethods: { ...m, methodDetails: e.target.value },
                                      },
                                    },
                                  })
                                }
                                maxLength={300}
                                placeholder="e.g. SBR with secondary clarifier + UV disinfection"
                                className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                              />
                            </div>
                          </div>

                          {/* Group C: Effluent quality */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                              Effluent quality &amp; disposal
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">
                                  Effluent disposal method
                                </label>
                                <select
                                  value={plant.effluentDisposalMethod ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_STP_ETP',
                                      payload: {
                                        id: plant.id,
                                        updates: {
                                          effluentDisposalMethod: e.target
                                            .value as IStpEtpPlant['effluentDisposalMethod'],
                                        },
                                      },
                                    })
                                  }
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                                >
                                  <option value="">Select method…</option>
                                  <option value="reuse_irrigation">Reuse — irrigation</option>
                                  <option value="reuse_flushing">Reuse — toilet flushing</option>
                                  <option value="surface_discharge">Surface water discharge</option>
                                  <option value="sewer_discharge">Sewer discharge</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">
                                  Effluent BOD (mg/L)
                                </label>
                                <div>
                                  <input
                                    type="number"
                                    min={0}
                                    value={plant.effluentBodMgL ?? ''}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_STP_ETP',
                                        payload: {
                                          id: plant.id,
                                          updates: {
                                            effluentBodMgL: parseFloat(e.target.value) || undefined,
                                          },
                                        },
                                      })
                                    }
                                    placeholder="target <30"
                                    className={cn(
                                      'w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2',
                                      plant.effluentBodMgL && plant.effluentBodMgL > 30
                                        ? 'border-amber-300 focus:ring-amber-500/20'
                                        : 'border-white/10 focus:ring-teal-500/20'
                                    )}
                                  />
                                  {plant.effluentBodMgL && plant.effluentBodMgL > 30 && (
                                    <p className="text-xs text-amber-600 mt-0.5">
                                      Exceeds CPCB limit of 30 mg/L
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Per-plant carbon estimate */}
                          <div className="bg-teal-50 rounded-xl p-3 text-sm">
                            <p className="font-medium text-teal-800 mb-2">
                              Estimated emissions from this plant:
                            </p>
                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                              <div>
                                <p className="font-bold text-red-600">{plantCh4Co2e.toFixed(2)}</p>
                                <p className="text-gray-400">CH₄ tCO₂e/yr (Scope 1)</p>
                              </div>
                              <div>
                                <p className="font-bold text-orange-600">
                                  {plantN2oCo2e.toFixed(2)}
                                </p>
                                <p className="text-gray-400">N₂O tCO₂e/yr (Scope 1)</p>
                              </div>
                              <div>
                                <p className="font-bold text-blue-600">{stpTco2e.toFixed(2)}</p>
                                <p className="text-gray-400">Electricity tCO₂e/yr (Scope 2)</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add STP button */}
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'ADD_STP_ETP',
                      payload: {
                        id: crypto.randomUUID(),
                        serialNo: state.stpEtpPlants.length + 1,
                        sourceOfWastewater: 'domestic_sewage',
                        plantCapacityMld: 0,
                        treatmentMethods: {},
                      },
                    })
                  }
                  className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-800 font-medium border border-dashed border-teal-300 rounded-xl px-4 py-2.5 hover:bg-teal-50 transition-colors w-full justify-center"
                >
                  <Plus className="w-4 h-4" />
                  Add STP / ETP plant
                </button>

                {/* STP/ETP summary */}
                {state.stpEtpPlants.length > 0 && wastewaterCarbonPreview && (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-2 text-sm">
                    <p className="font-semibold text-teal-800">
                      {state.stpEtpPlants.length} plant(s) — Combined IPCC Tier 1 estimate:
                    </p>
                    <div className="flex justify-between">
                      <span className="text-gray-300">CH₄ (Scope 1):</span>
                      <span className="font-mono text-red-600">
                        {wastewaterCarbonPreview.ch4Co2e.toFixed(2)} tCO₂e/yr
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">N₂O (Scope 1):</span>
                      <span className="font-mono text-orange-600">
                        {wastewaterCarbonPreview.n2oCo2e.toFixed(2)} tCO₂e/yr
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-teal-200 pt-1">
                      <span className="font-medium text-teal-800">Combined wastewater:</span>
                      <span className="font-bold text-teal-700">
                        {wastewaterCarbonPreview.total.toFixed(2)} tCO₂e/yr
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── LIQUID WASTE SECTION (Quick entry — fallback) ────────────── */}
            <div
              id="liquid-waste"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-sm"
            >
              <div className="px-6 py-5 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                  <Droplets className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-white">Quick entry (fallback)</h2>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Used only when Phase 2 wastewater generation and STP data above is incomplete. If
                  you have filled the sections above, this section is optional.
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Treatment type — 3 radio cards */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-200">Wastewater treatment type</p>
                  <p className="text-xs text-blue-600 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    Many older hostels use septic tanks — select option A unless you know
                    otherwise
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {WASTEWATER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: 'SET_WASTEWATER_TREATMENT',
                            payload: opt.value,
                          })
                        }
                        className={cn(
                          'text-left p-4 rounded-xl border-2 transition-colors',
                          state.wastewaterTreatmentType === opt.value
                            ? `${opt.color} border-2 border-opacity-100`
                            : 'border-white/10 hover:border-white/20',
                          isFieldChanged('wastewaterTreatmentType') &&
                            state.wastewaterTreatmentType === opt.value &&
                            'ring-2 ring-amber-300'
                        )}
                      >
                        <p className="text-sm font-semibold text-gray-100">{opt.label}</p>
                        <p className="text-xs text-gray-400 mt-1">{opt.desc}</p>
                        <span
                          className={cn(
                            'inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full',
                            opt.textColor,
                            opt.color
                          )}
                        >
                          {opt.efLabel}
                        </span>
                      </button>
                    ))}
                  </div>
                  {isFieldChanged('wastewaterTreatmentType') && (
                    <p className="text-xs text-amber-600 font-medium">
                      Changed from previous version
                    </p>
                  )}
                </div>

                {/* Wastewater volume */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-200">
                      Wastewater volume
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">I don't know volume</span>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: 'SET_WASTEWATER_IS_ESTIMATED',
                            payload: !state.wastewaterIsEstimated,
                          })
                        }
                        className={cn(
                          'relative w-10 h-5 rounded-full transition-colors',
                          state.wastewaterIsEstimated ? 'bg-blue-500' : 'bg-gray-200'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black/40 backdrop-blur-md shadow transition-transform',
                            state.wastewaterIsEstimated ? 'translate-x-5' : 'translate-x-0'
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {!state.wastewaterIsEstimated && (
                    <div
                      className={cn(
                        'flex items-center gap-3',
                        isFieldChanged('wastewaterLitresPerDay') &&
                          'ring-1 ring-amber-300 rounded-lg p-2'
                      )}
                    >
                      <input
                        type="number"
                        min={0}
                        value={state.wastewaterLitresPerDay || ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'SET_WASTEWATER_LITRES_PER_DAY',
                            payload: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="e.g. 5000"
                        className="w-36 text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <span className="text-sm text-gray-400">litres/day</span>
                      {isFieldChanged('wastewaterLitresPerDay') && (
                        <span className="text-xs text-amber-600 font-medium">
                          Changed from previous version
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-400">
                    Estimated{' '}
                    <span className="font-medium">{estimatedLitresPerDay.toFixed(0)} L/day</span>{' '}
                    from {occupantEstimate} occupants ×{' '}
                    {wasteDefaults.wastewaterLitresPerPersonPerDay} L/person
                    {state.wastewaterIsEstimated && ' (using estimate)'}
                  </p>
                </div>

                {/* Custom discharge points */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-200">Additional discharge points</p>
                  {state.customDischargePoints.length > 0 && (
                    <div className="space-y-2">
                      {state.customDischargePoints.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-3 bg-blue-50 rounded-lg text-sm"
                        >
                          <div>
                            <span className="font-medium text-gray-100">{p.label}</span>
                            <span className="text-gray-400 ml-2">
                              {p.value} {p.unit}
                            </span>
                            {p.notes && (
                              <span className="text-xs text-gray-400 ml-2">{p.notes}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              dispatch({
                                type: 'REMOVE_CUSTOM_DISCHARGE_POINT',
                                payload: p.id,
                              })
                            }
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showCustomDischarge ? (
                    <CustomDischargePointForm
                      onAdd={(p) => {
                        dispatch({ type: 'ADD_CUSTOM_DISCHARGE_POINT', payload: p });
                        setShowCustomDischarge(false);
                      }}
                      onCancel={() => setShowCustomDischarge(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCustomDischarge(true)}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add a custom liquid discharge point
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                WATER SYSTEMS SECTION (3A-3E)
            ══════════════════════════════════════════════════════════════════ */}
            <div
              id="water-systems"
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-blue-200 overflow-hidden shadow-sm"
            >
              {/* Section header */}
              <div className="px-6 py-5 border-b border-blue-100 bg-blue-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Waves className="w-5 h-5 text-blue-600" />
                    <h2 className="text-base font-semibold text-white">Water systems</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'TOGGLE_WATER_SECTION' })}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    {state.showWaterSection ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    {state.showWaterSection ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Water treatment and distribution consume electricity. Enter campus water system
                  details for a complete Scope 2 picture.
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full font-medium">
                    Scope 2
                  </span>
                  <span className="text-gray-300">Water treatment operations (campus-owned)</span>
                  <span className="px-2 py-0.5 bg-gray-200 text-gray-300 rounded-full font-medium ml-2">
                    Scope 3
                  </span>
                  <span className="text-gray-300">Municipal supply treatment (reported only)</span>
                </div>
              </div>

              {state.showWaterSection && (
                <div className="p-6 space-y-8">
                  {/* Water warnings */}
                  {waterWarnings.length > 0 && (
                    <div className="space-y-2">
                      {waterWarnings.map((w, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800"
                        >
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── 3A: WATER DEMAND ─────────────────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">Water demand</h3>
                    <p className="text-xs text-gray-400 mb-4">
                      Record water demand by use category. Three time horizons help with
                      infrastructure planning.
                    </p>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs border border-white/10 rounded-lg overflow-hidden">
                        <thead className="bg-white/5">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-400 w-48">
                              Category
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-400 w-20">
                              Unit
                            </th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-400 w-28">
                              Current
                            </th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-400 w-28">
                              In 5 years
                            </th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-400 w-28">
                              In 10 years
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-black/40 backdrop-blur-md">
                          {/* Residential group */}
                          <tr className="bg-blue-50">
                            <td
                              colSpan={5}
                              className="px-3 py-1.5 text-xs font-semibold text-blue-700 uppercase tracking-wide"
                            >
                              Residential area
                            </td>
                          </tr>
                          {[
                            {
                              label: 'Population',
                              field: 'residentialPopulationThousands' as const,
                              unit: 'Thousand persons',
                            },
                            {
                              label: 'Households',
                              field: 'residentialHouseholdsThousands' as const,
                              unit: 'Thousand units',
                            },
                            {
                              label: 'Per capita demand',
                              field: 'residentialPerCapitaDemandLpcd' as const,
                              unit: 'LPCD',
                            },
                            {
                              label: 'Total residential demand',
                              field: 'residentialTotalDemandKld' as const,
                              unit: 'KLD',
                            },
                          ].map(({ label, field, unit }) => (
                            <tr key={field} className="hover:bg-white/5">
                              <td className="px-3 py-2 text-gray-200">{label}</td>
                              <td className="px-3 py-2 text-gray-400">{unit}</td>
                              {(['current', 'inFiveYears', 'inTenYears'] as const).map((h) => (
                                <td key={h} className="px-2 py-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={state.waterDemand[field]?.[h] ?? ''}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_WATER_DEMAND',
                                        payload: {
                                          [field]: {
                                            ...(state.waterDemand[field] ?? { unit }),
                                            [h]: parseFloat(e.target.value) || undefined,
                                          },
                                        },
                                      })
                                    }
                                    placeholder="—"
                                    className="w-full text-center text-xs border border-white/10 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                          {/* Office group */}
                          <tr className="bg-indigo-50">
                            <td
                              colSpan={5}
                              className="px-3 py-1.5 text-xs font-semibold text-indigo-700 uppercase tracking-wide"
                            >
                              Office area
                            </td>
                          </tr>
                          {[
                            {
                              label: 'Office population',
                              field: 'officePopulationThousands' as const,
                              unit: 'Thousand persons',
                            },
                            {
                              label: 'Per capita demand',
                              field: 'officePerCapitaDemandLpcd' as const,
                              unit: 'LPCD',
                            },
                            {
                              label: 'Total office demand',
                              field: 'officeTotalDemandKld' as const,
                              unit: 'KLD',
                            },
                          ].map(({ label, field, unit }) => (
                            <tr key={field} className="hover:bg-white/5">
                              <td className="px-3 py-2 text-gray-200">{label}</td>
                              <td className="px-3 py-2 text-gray-400">{unit}</td>
                              {(['current', 'inFiveYears', 'inTenYears'] as const).map((h) => (
                                <td key={h} className="px-2 py-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={state.waterDemand[field]?.[h] ?? ''}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_WATER_DEMAND',
                                        payload: {
                                          [field]: {
                                            ...(state.waterDemand[field] ?? { unit }),
                                            [h]: parseFloat(e.target.value) || undefined,
                                          },
                                        },
                                      })
                                    }
                                    placeholder="—"
                                    className="w-full text-center text-xs border border-white/10 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                          {/* Other uses */}
                          <tr className="bg-white/5">
                            <td
                              colSpan={5}
                              className="px-3 py-1.5 text-xs font-semibold text-gray-300 uppercase tracking-wide"
                            >
                              Other uses
                            </td>
                          </tr>
                          {[
                            {
                              label: 'Hospital water demand',
                              field: 'hospitalDemandKld' as const,
                              unit: 'KLD',
                            },
                            {
                              label: 'Construction & maintenance',
                              field: 'constructionMaintenanceDemandKld' as const,
                              unit: 'KLD',
                            },
                            {
                              label: 'Kitchen & canteen',
                              field: 'kitchenCanteenDemandKld' as const,
                              unit: 'KLD',
                            },
                            {
                              label: 'Laundry services',
                              field: 'laundryDemandKld' as const,
                              unit: 'KLD',
                            },
                            {
                              label: 'Vehicle washing',
                              field: 'vehicleWashingDemandKld' as const,
                              unit: 'KLD',
                            },
                            {
                              label: 'Commercial/market area',
                              field: 'commercialAreaSqFt' as const,
                              unit: 'sq. feet',
                            },
                            {
                              label: 'Commercial/market demand',
                              field: 'commercialDemandKld' as const,
                              unit: 'KLD',
                            },
                            {
                              label: 'Gardening & horticulture',
                              field: 'gardeningHorticultureDemandKld' as const,
                              unit: 'KLD',
                            },
                            {
                              label: 'Fire fighting storage',
                              field: 'fireFightingStorageKl' as const,
                              unit: 'KL (total)',
                            },
                            {
                              label: 'Special uses (pool, fountain)',
                              field: 'specialUsesDemandKld' as const,
                              unit: 'KLD',
                            },
                          ].map(({ label, field, unit }) => (
                            <tr key={field} className="hover:bg-white/5">
                              <td className="px-3 py-2 text-gray-200">{label}</td>
                              <td className="px-3 py-2 text-gray-400">{unit}</td>
                              {(['current', 'inFiveYears', 'inTenYears'] as const).map((h) => (
                                <td key={h} className="px-2 py-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={state.waterDemand[field]?.[h] ?? ''}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_WATER_DEMAND',
                                        payload: {
                                          [field]: {
                                            ...(state.waterDemand[field] ?? { unit }),
                                            [h]: parseFloat(e.target.value) || undefined,
                                          },
                                        },
                                      })
                                    }
                                    placeholder="—"
                                    className="w-full text-center text-xs border border-white/10 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Special uses description */}
                    <div className="mt-3">
                      <label className="text-xs text-gray-400 block mb-1">
                        Describe special uses (pool, fountains, etc.)
                      </label>
                      <input
                        type="text"
                        value={state.waterDemand.specialUsesDescription ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_WATER_DEMAND',
                            payload: { specialUsesDescription: e.target.value },
                          })
                        }
                        placeholder="e.g. Olympic swimming pool, decorative fountains"
                        className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    {/* Running totals */}
                    {waterDemandTotals.hasDemandData && (
                      <div className="mt-4 bg-blue-50 rounded-xl p-4 text-sm space-y-1">
                        <p className="font-semibold text-blue-800">Demand totals</p>
                        <p className="text-blue-700">
                          Current:{' '}
                          <span className="font-mono font-semibold">
                            {waterDemandTotals.totalCurrent.toFixed(1)} KLD
                          </span>
                        </p>
                        {waterDemandTotals.total5yr > 0 && (
                          <>
                            <p className="text-blue-700">
                              In 5 years:{' '}
                              <span className="font-mono">
                                {waterDemandTotals.total5yr.toFixed(1)} KLD
                              </span>
                            </p>
                            {waterDemandTotals.totalCurrent > 0 && (
                              <p className="text-xs text-blue-500">
                                Growth implied:{' '}
                                {(
                                  ((waterDemandTotals.total5yr / waterDemandTotals.totalCurrent) **
                                    (1 / 5) -
                                    1) *
                                  100
                                ).toFixed(1)}
                                % per year
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── 3B: WATER SUPPLY & STORAGE ───────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">
                      Water supply sources &amp; storage
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">
                      Record where campus water comes from and storage capacity. Groundwater pumping
                      contributes to Scope 2 carbon.
                    </p>

                    {/* Supply sources */}
                    <div className="space-y-3 mb-6">
                      <p className="text-sm font-medium text-gray-200">Supply sources</p>
                      {(
                        [
                          'municipal',
                          'groundwater_borewell',
                          'recycled_reclaimed',
                          'surface_water',
                          'rainwater_harvested',
                        ] as WaterSourceType[]
                      ).map((sourceType) => {
                        const existing = state.waterSupply.sources.find(
                          (s) => s.sourceType === sourceType
                        );
                        const scope = SOURCE_SCOPE[sourceType];
                        return (
                          <div
                            key={sourceType}
                            className="border border-white/10 rounded-xl overflow-hidden"
                          >
                            <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-100">
                                  {SOURCE_LABELS[sourceType]}
                                </span>
                                <span
                                  className={cn(
                                    'text-xs px-2 py-0.5 rounded-full font-medium',
                                    scope.color
                                  )}
                                >
                                  {scope.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                {existing?.currentKld && (
                                  <span className="text-xs text-gray-400 font-mono">
                                    Current: {existing.currentKld} KLD
                                  </span>
                                )}
                                {!existing ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      dispatch({
                                        type: 'ADD_WATER_SOURCE',
                                        payload: {
                                          id: crypto.randomUUID(),
                                          sourceType,
                                          currentKld: undefined,
                                        },
                                      })
                                    }
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    + Add
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      dispatch({
                                        type: 'REMOVE_WATER_SOURCE',
                                        payload: existing.id,
                                      })
                                    }
                                    className="text-xs text-red-400 hover:text-red-600"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {existing && (
                              <div className="px-4 py-3 grid grid-cols-3 gap-3">
                                {[
                                  { label: 'Current (KLD)', field: 'currentKld' as const },
                                  { label: 'In 5 years (KLD)', field: 'inFiveYearsKld' as const },
                                  { label: 'In 10 years (KLD)', field: 'inTenYearsKld' as const },
                                ].map(({ label, field }) => (
                                  <div key={field}>
                                    <label className="text-xs text-gray-400 block mb-0.5">
                                      {label}
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.1}
                                      value={existing[field] ?? ''}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_WATER_SOURCE',
                                          payload: {
                                            id: existing.id,
                                            updates: {
                                              [field]: parseFloat(e.target.value) || undefined,
                                            },
                                          },
                                        })
                                      }
                                      placeholder="0"
                                      className="w-full text-sm border border-white/10 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Groundwater pumping preview */}
                    {gwPumpingPreview.annualKwh > 0 && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                        <p className="font-medium text-amber-800 flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5" />
                          Groundwater pumping estimate
                        </p>
                        <p className="text-amber-700 text-xs mt-1">
                          {gwPumpingPreview.annualKwh.toFixed(0)} kWh/year →{' '}
                          <span className="font-semibold">
                            {gwPumpingPreview.tco2e.toFixed(2)} tCO₂e/year (Scope 2)
                          </span>
                        </p>
                        <p className="text-xs text-amber-500 mt-0.5">
                          Assuming 50m head, 65% pump efficiency
                        </p>
                      </div>
                    )}

                    {/* Storage tanks */}
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-gray-200">Storage capacity</p>
                      {(['overhead', 'underground'] as const).map((cat) => {
                        const tanks = state.waterSupply.storageTanks.filter(
                          (t) => t.tankCategory === cat
                        );
                        return (
                          <div key={cat}>
                            <p className="text-xs font-semibold text-gray-300 mb-2 capitalize">
                              {cat} tanks
                            </p>
                            {tanks.length > 0 && (
                              <table className="min-w-full text-xs border border-white/10 rounded-lg overflow-hidden mb-2">
                                <thead className="bg-white/5">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-gray-400">Label</th>
                                    <th className="px-3 py-2 text-center text-gray-400">
                                      Capacity (KL)
                                    </th>
                                    <th className="px-3 py-2 text-center text-gray-400">
                                      Quantity
                                    </th>
                                    <th className="px-3 py-2 text-center text-gray-400">
                                      Total (KL)
                                    </th>
                                    <th className="px-2 py-2"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-black/40 backdrop-blur-md">
                                  {tanks.map((tank) => (
                                    <tr key={tank.id}>
                                      <td className="px-2 py-1">
                                        <input
                                          type="text"
                                          value={tank.typeLabel ?? ''}
                                          onChange={(e) =>
                                            dispatch({
                                              type: 'UPDATE_STORAGE_TANK',
                                              payload: {
                                                id: tank.id,
                                                updates: { typeLabel: e.target.value },
                                              },
                                            })
                                          }
                                          placeholder="Type I"
                                          className="w-full text-xs border border-white/10 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                      </td>
                                      <td className="px-2 py-1">
                                        <input
                                          type="number"
                                          min={0}
                                          step={0.5}
                                          value={tank.capacityKl || ''}
                                          onChange={(e) =>
                                            dispatch({
                                              type: 'UPDATE_STORAGE_TANK',
                                              payload: {
                                                id: tank.id,
                                                updates: {
                                                  capacityKl: parseFloat(e.target.value) || 0,
                                                },
                                              },
                                            })
                                          }
                                          className="w-full text-center text-xs border border-white/10 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                      </td>
                                      <td className="px-2 py-1">
                                        <input
                                          type="number"
                                          min={1}
                                          step={1}
                                          value={tank.quantity || ''}
                                          onChange={(e) =>
                                            dispatch({
                                              type: 'UPDATE_STORAGE_TANK',
                                              payload: {
                                                id: tank.id,
                                                updates: {
                                                  quantity: parseInt(e.target.value) || 1,
                                                },
                                              },
                                            })
                                          }
                                          className="w-full text-center text-xs border border-white/10 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                      </td>
                                      <td className="px-3 py-1 text-center font-mono text-gray-300">
                                        {(tank.capacityKl * tank.quantity).toFixed(1)}
                                      </td>
                                      <td className="px-2 py-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            dispatch({
                                              type: 'REMOVE_STORAGE_TANK',
                                              payload: tank.id,
                                            })
                                          }
                                          className="text-gray-300 hover:text-red-500"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                dispatch({
                                  type: 'ADD_STORAGE_TANK',
                                  payload: {
                                    id: crypto.randomUUID(),
                                    tankCategory: cat,
                                    capacityKl: 0,
                                    quantity: 1,
                                  },
                                })
                              }
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add {cat} tank
                            </button>
                          </div>
                        );
                      })}

                      {/* Storage summary */}
                      {storageSummary.totalCap > 0 && (
                        <div className="bg-white/5 rounded-xl p-4 text-sm space-y-1">
                          <p className="font-semibold text-gray-200">Storage summary</p>
                          <p className="text-gray-300">
                            Overhead:{' '}
                            <span className="font-mono">{storageSummary.ohCap.toFixed(1)} KL</span>
                          </p>
                          <p className="text-gray-300">
                            Underground:{' '}
                            <span className="font-mono">{storageSummary.ugCap.toFixed(1)} KL</span>
                          </p>
                          <p className="text-gray-100 font-medium">
                            Total:{' '}
                            <span className="font-mono">
                              {storageSummary.totalCap.toFixed(1)} KL
                            </span>
                          </p>
                          {waterDemandTotals.totalCurrent > 0 && (
                            <p
                              className={cn(
                                'text-xs',
                                storageSummary.storageRatio < 1
                                  ? 'text-amber-600'
                                  : 'text-green-600'
                              )}
                            >
                              Storage-to-demand ratio: {storageSummary.storageRatio.toFixed(1)} days
                              {storageSummary.storageRatio < 1
                                ? ' — less than 1 day of storage'
                                : ' — good buffer'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── 3C: WATER TREATMENT PLANTS ───────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">
                      Conventional water treatment plants
                    </h3>
                    <p className="text-xs text-gray-400 mb-2">
                      Campus-owned WTPs consume electricity for pumping, aeration, and dosing.
                    </p>

                    {/* Energy reference */}
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                      <p className="font-semibold mb-1">
                        Treatment stage energy intensity (kWh/m³)
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {[
                          { label: 'Preliminary', value: 0.04 },
                          { label: 'Primary', value: 0.09 },
                          { label: 'Secondary', value: 0.25 },
                          { label: 'Tertiary', value: 0.4 },
                        ].map(({ label, value }) => (
                          <span key={label} className="font-mono">
                            {label}: {value}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {state.treatmentPlants.map((wtp, idx) => {
                        const m3day = (wtp.actualTreatmentMld ?? wtp.plantCapacityMld) * 1000;
                        let efSum = 0;
                        if (wtp.energyConsumptionKwhPerM3) {
                          efSum = wtp.energyConsumptionKwhPerM3;
                        } else {
                          const m = wtp.treatmentMethods;
                          efSum =
                            (m?.preliminary ? 0.04 : 0) +
                              (m?.primary ? 0.09 : 0) +
                              (m?.secondary ? 0.25 : 0) +
                              (m?.tertiary ? 0.4 : 0) || 0.25;
                        }
                        const dailyKwh = efSum * m3day;
                        const annualKwh = dailyKwh * 365;
                        const tco2e = (annualKwh * 0.716) / 1000;

                        return (
                          <div
                            key={wtp.id}
                            className="border border-white/10 rounded-xl overflow-hidden"
                          >
                            <div className="px-4 py-3 bg-white/5 flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-100">
                                Plant {idx + 1}
                                {wtp.sourceOfWater ? ` — ${wtp.sourceOfWater}` : ''}
                                {wtp.plantCapacityMld > 0 && (
                                  <span className="ml-2 text-xs text-gray-400">
                                    {wtp.plantCapacityMld} MLD
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-2">
                                {wtp.plantCapacityMld > 0 && tco2e > 0 && (
                                  <span className="text-xs text-blue-600 font-mono">
                                    {tco2e.toFixed(1)} tCO₂e/yr
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => dispatch({ type: 'REMOVE_WTP', payload: wtp.id })}
                                  className="text-gray-300 hover:text-red-500"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Source of water *
                                </label>
                                <input
                                  type="text"
                                  value={wtp.sourceOfWater ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_WTP',
                                      payload: {
                                        id: wtp.id,
                                        updates: { sourceOfWater: e.target.value },
                                      },
                                    })
                                  }
                                  placeholder="Municipal supply intake, Reservoir"
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Plant capacity (MLD) *
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={wtp.plantCapacityMld || ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_WTP',
                                      payload: {
                                        id: wtp.id,
                                        updates: {
                                          plantCapacityMld: parseFloat(e.target.value) || 0,
                                        },
                                      },
                                    })
                                  }
                                  placeholder="e.g. 1.5"
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                                {wtp.plantCapacityMld > 0 && (
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    = {(wtp.plantCapacityMld * 1000).toFixed(0)} m³/day
                                  </p>
                                )}
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Actual treatment (MLD)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={wtp.actualTreatmentMld ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_WTP',
                                      payload: {
                                        id: wtp.id,
                                        updates: {
                                          actualTreatmentMld:
                                            parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  placeholder="Same as capacity"
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Direct energy (kWh/m³)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={wtp.energyConsumptionKwhPerM3 ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_WTP',
                                      payload: {
                                        id: wtp.id,
                                        updates: {
                                          energyConsumptionKwhPerM3:
                                            parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  placeholder="Overrides stage estimate"
                                  className={cn(
                                    'w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                                    wtp.energyConsumptionKwhPerM3
                                      ? 'border-green-400 bg-green-50'
                                      : 'border-white/10'
                                  )}
                                />
                              </div>

                              {/* Treatment stages */}
                              <div className="col-span-2">
                                <label className="text-xs text-gray-400 block mb-2">
                                  Treatment stages
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {[
                                    {
                                      key: 'preliminary' as const,
                                      label: 'Preliminary',
                                      desc: 'Screening, grit',
                                      ef: 0.04,
                                    },
                                    {
                                      key: 'primary' as const,
                                      label: 'Primary',
                                      desc: 'Sedimentation',
                                      ef: 0.09,
                                    },
                                    {
                                      key: 'secondary' as const,
                                      label: 'Secondary',
                                      desc: 'Biological',
                                      ef: 0.25,
                                    },
                                    {
                                      key: 'tertiary' as const,
                                      label: 'Tertiary',
                                      desc: 'UV, filtration',
                                      ef: 0.4,
                                    },
                                  ].map(({ key, label, desc, ef }) => (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={() =>
                                        dispatch({
                                          type: 'UPDATE_WTP',
                                          payload: {
                                            id: wtp.id,
                                            updates: {
                                              treatmentMethods: {
                                                ...wtp.treatmentMethods,
                                                [key]: !wtp.treatmentMethods[key],
                                              },
                                            },
                                          },
                                        })
                                      }
                                      className={cn(
                                        'p-3 rounded-xl text-left border-2 transition-colors',
                                        wtp.treatmentMethods[key]
                                          ? 'border-blue-500 bg-blue-50'
                                          : 'border-white/10 bg-black/40 backdrop-blur-md hover:border-white/20'
                                      )}
                                    >
                                      <p className="text-xs font-semibold text-gray-100">{label}</p>
                                      <p className="text-xs text-gray-400">{desc}</p>
                                      <p className="text-xs font-mono text-blue-600 mt-1">
                                        {ef} kWh/m³
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Live estimate */}
                              {wtp.plantCapacityMld > 0 && (
                                <div className="col-span-2 bg-blue-50 rounded-lg p-3 text-xs space-y-1">
                                  <p className="font-semibold text-blue-800">
                                    Live carbon estimate
                                  </p>
                                  <p className="text-blue-700 font-mono">
                                    Daily energy: {dailyKwh.toFixed(0)} kWh/day
                                  </p>
                                  <p className="text-blue-700 font-mono">
                                    Annual energy: {annualKwh.toFixed(0)} kWh/year
                                  </p>
                                  <p className="text-blue-800 font-semibold font-mono">
                                    Scope 2 carbon: {tco2e.toFixed(2)} tCO₂e/year
                                  </p>
                                  <p className="text-blue-400">
                                    {wtp.energyConsumptionKwhPerM3
                                      ? 'From direct energy input'
                                      : `From ${[wtp.treatmentMethods.preliminary && 'preliminary', wtp.treatmentMethods.primary && 'primary', wtp.treatmentMethods.secondary && 'secondary', wtp.treatmentMethods.tertiary && 'tertiary'].filter(Boolean).join(', ') || 'default secondary'} stages`}
                                  </p>
                                </div>
                              )}

                              <div className="col-span-2">
                                <label className="text-xs text-gray-400 block mb-1">Remarks</label>
                                <input
                                  type="text"
                                  maxLength={200}
                                  value={wtp.remarks ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_WTP',
                                      payload: { id: wtp.id, updates: { remarks: e.target.value } },
                                    })
                                  }
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'ADD_WTP',
                          payload: {
                            id: crypto.randomUUID(),
                            serialNo: state.treatmentPlants.length + 1,
                            plantCapacityMld: 0,
                            treatmentMethods: {},
                          },
                        })
                      }
                      className="mt-4 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium border border-dashed border-blue-300 rounded-xl px-4 py-2.5 hover:bg-blue-50 transition-colors w-full justify-center"
                    >
                      <Plus className="w-4 h-4" />
                      Add treatment plant
                    </button>

                    {/* WTP summary */}
                    {state.treatmentPlants.length > 0 && (
                      <div className="mt-3 bg-white/5 rounded-xl p-4 text-sm space-y-1">
                        <p className="font-semibold text-gray-200">
                          {state.treatmentPlants.length} treatment plant(s)
                        </p>
                        <p className="text-gray-300">
                          Total capacity:{' '}
                          <span className="font-mono">
                            {state.treatmentPlants
                              .reduce((s, p) => s + p.plantCapacityMld, 0)
                              .toFixed(2)}{' '}
                            MLD
                          </span>
                        </p>
                        <p className="text-blue-700 font-semibold">
                          Scope 2 WTP carbon:{' '}
                          <span className="font-mono">
                            {wtpCarbonPreview.tco2e.toFixed(2)} tCO₂e/year
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* ── 3D: RO PLANTS ────────────────────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">
                      RO water treatment plants
                    </h3>
                    <p className="text-xs text-gray-400 mb-2">
                      RO is significantly more energy-intensive than conventional treatment.
                    </p>

                    {/* RO energy reference */}
                    <div className="mb-4 p-3 bg-purple-50 rounded-lg text-xs text-purple-700">
                      <p className="font-semibold mb-1">
                        RO energy intensity by technology (kWh/m³ product water)
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(RO_TECH_LABELS).map(([key, label]) => (
                          <span key={key} className="font-mono">
                            {label}: {RO_ENERGY_KWH_M3[key]?.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {state.roPlants.map((ro, idx) => {
                        const productM3day =
                          (ro.treatedWaterOutputMld ?? ro.plantCapacityMld * 0.7) * 1000;
                        const ef =
                          ro.energyConsumptionKwhPerM3 ??
                          RO_ENERGY_KWH_M3[ro.roTechnologyType ?? 'standard_ro'] ??
                          0.65;
                        const annualKwh = ef * productM3day * 365;
                        const tco2e = (annualKwh * 0.716) / 1000;
                        const recovery =
                          ro.inletFlowRateMld && ro.treatedWaterOutputMld
                            ? (ro.treatedWaterOutputMld / ro.inletFlowRateMld) * 100
                            : null;
                        const rejectExpected =
                          ro.inletFlowRateMld && ro.treatedWaterOutputMld
                            ? ro.inletFlowRateMld - ro.treatedWaterOutputMld
                            : null;
                        const rejectMismatch =
                          rejectExpected && ro.rejectWaterFlowMld
                            ? Math.abs(rejectExpected - ro.rejectWaterFlowMld) / rejectExpected >
                              0.1
                            : false;

                        return (
                          <div
                            key={ro.id}
                            className="border border-white/10 rounded-xl overflow-hidden"
                          >
                            <div className="px-4 py-3 bg-white/5 flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-100">
                                RO Plant {idx + 1}
                                {ro.sourceOfWater ? ` — ${ro.sourceOfWater}` : ''}
                                {ro.plantCapacityMld > 0 && (
                                  <span className="ml-2 text-xs text-gray-400">
                                    {ro.plantCapacityMld} MLD
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-2">
                                {tco2e > 0 && (
                                  <span className="text-xs text-purple-600 font-mono">
                                    {tco2e.toFixed(1)} tCO₂e/yr
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    dispatch({ type: 'REMOVE_RO_PLANT', payload: ro.id })
                                  }
                                  className="text-gray-300 hover:text-red-500"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Source of water *
                                </label>
                                <input
                                  type="text"
                                  value={ro.sourceOfWater ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_RO_PLANT',
                                      payload: {
                                        id: ro.id,
                                        updates: { sourceOfWater: e.target.value },
                                      },
                                    })
                                  }
                                  placeholder="Borewell, Municipal supply"
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Plant capacity (MLD) *
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={ro.plantCapacityMld || ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_RO_PLANT',
                                      payload: {
                                        id: ro.id,
                                        updates: {
                                          plantCapacityMld: parseFloat(e.target.value) || 0,
                                        },
                                      },
                                    })
                                  }
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  RO technology type
                                </label>
                                <select
                                  value={ro.roTechnologyType ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_RO_PLANT',
                                      payload: {
                                        id: ro.id,
                                        updates: {
                                          roTechnologyType:
                                            (e.target.value as ROTechnologyType) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                >
                                  <option value="">Select technology</option>
                                  {(
                                    Object.entries(RO_TECH_LABELS) as [ROTechnologyType, string][]
                                  ).map(([key, label]) => (
                                    <option key={key} value={key}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Inlet flow rate (MLD)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={ro.inletFlowRateMld ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_RO_PLANT',
                                      payload: {
                                        id: ro.id,
                                        updates: {
                                          inletFlowRateMld: parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Treated water output (MLD)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={ro.treatedWaterOutputMld ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_RO_PLANT',
                                      payload: {
                                        id: ro.id,
                                        updates: {
                                          treatedWaterOutputMld:
                                            parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                />
                                {recovery !== null && (
                                  <p
                                    className={cn(
                                      'text-xs mt-0.5',
                                      recovery >= 70
                                        ? 'text-green-600'
                                        : recovery >= 60
                                          ? 'text-amber-600'
                                          : 'text-red-500'
                                    )}
                                  >
                                    Recovery: {recovery.toFixed(0)}% {recovery >= 70 ? '✓' : '⚠'}
                                  </p>
                                )}
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Reject water flow (MLD)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={ro.rejectWaterFlowMld ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_RO_PLANT',
                                      payload: {
                                        id: ro.id,
                                        updates: {
                                          rejectWaterFlowMld:
                                            parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  className={cn(
                                    'w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20',
                                    rejectMismatch
                                      ? 'border-amber-400 bg-amber-50'
                                      : 'border-white/10'
                                  )}
                                />
                                {rejectExpected !== null && (
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    Expected: {rejectExpected.toFixed(3)} MLD
                                  </p>
                                )}
                                {rejectMismatch && (
                                  <p className="text-xs text-amber-600">
                                    Check: inlet − output doesn't balance
                                  </p>
                                )}
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Rejection rate (%)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.1}
                                  value={ro.rejectionRatePercent ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_RO_PLANT',
                                      payload: {
                                        id: ro.id,
                                        updates: {
                                          rejectionRatePercent:
                                            parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">
                                  Direct energy (kWh/m³ product)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={ro.energyConsumptionKwhPerM3 ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_RO_PLANT',
                                      payload: {
                                        id: ro.id,
                                        updates: {
                                          energyConsumptionKwhPerM3:
                                            parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  className={cn(
                                    'w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20',
                                    ro.energyConsumptionKwhPerM3
                                      ? 'border-green-400 bg-green-50'
                                      : 'border-white/10'
                                  )}
                                />
                              </div>

                              {/* RO live estimate */}
                              {ro.plantCapacityMld > 0 && (
                                <div className="col-span-2 bg-purple-50 rounded-lg p-3 text-xs space-y-1">
                                  <p className="font-semibold text-purple-800">
                                    Live carbon estimate
                                  </p>
                                  <p className="text-purple-700 font-mono">
                                    Product water: {productM3day.toFixed(0)} m³/day
                                  </p>
                                  <p className="text-purple-700 font-mono">
                                    Annual energy: {annualKwh.toFixed(0)} kWh/year
                                  </p>
                                  <p className="text-purple-800 font-semibold font-mono">
                                    Scope 2 carbon: {tco2e.toFixed(2)} tCO₂e/year
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'ADD_RO_PLANT',
                          payload: {
                            id: crypto.randomUUID(),
                            serialNo: state.roPlants.length + 1,
                            plantCapacityMld: 0,
                          },
                        })
                      }
                      className="mt-4 flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 font-medium border border-dashed border-purple-300 rounded-xl px-4 py-2.5 hover:bg-purple-50 transition-colors w-full justify-center"
                    >
                      <Plus className="w-4 h-4" />
                      Add RO plant
                    </button>

                    {/* RO summary */}
                    {state.roPlants.length > 0 && (
                      <div className="mt-3 bg-white/5 rounded-xl p-4 text-sm space-y-1">
                        <p className="font-semibold text-gray-200">
                          {state.roPlants.length} RO plant(s)
                        </p>
                        <p className="text-purple-700 font-semibold">
                          Scope 2 RO carbon:{' '}
                          <span className="font-mono">
                            {roCarbonPreview.tco2e.toFixed(2)} tCO₂e/year
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* ── 3E: WATER QUALITY MONITORING ─────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">
                      Water quality parameters
                    </h3>
                    <p className="text-xs text-gray-400 mb-2">
                      Monthly monitoring per IS 10500:2012. This is for compliance tracking and does
                      not affect carbon calculations.
                    </p>

                    <div className="mb-3 p-3 bg-white/5 rounded-lg text-xs text-gray-300">
                      <p className="font-semibold text-gray-200">
                        IS 10500:2012 — Indian Standard for Drinking Water Specifications
                      </p>
                      <p className="mt-0.5">
                        8 standard parameters are pre-populated. Add custom parameters as needed.
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs border border-white/10 rounded-lg overflow-hidden">
                        <thead className="bg-white/5">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-400 w-40 sticky left-0 bg-white/5">
                              Parameter
                            </th>
                            <th className="px-2 py-2 text-center font-semibold text-gray-400 w-16">
                              Unit
                            </th>
                            {MONTH_LABELS.map((m) => (
                              <th
                                key={m}
                                className="px-2 py-2 text-center font-semibold text-gray-400 w-14"
                              >
                                {m}
                              </th>
                            ))}
                            <th className="px-2 py-2 text-center font-semibold text-gray-400 w-24">
                              IS Limit
                            </th>
                            <th className="px-2 py-2 w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-black/40 backdrop-blur-md">
                          {state.qualityRecords.map((rec) => {
                            const isCustom = rec.parameter === 'custom';
                            return (
                              <tr key={rec.id} className="hover:bg-white/5">
                                <td className="px-3 py-1.5 sticky left-0 bg-black/40 backdrop-blur-md font-medium text-gray-200">
                                  {isCustom ? (
                                    <input
                                      type="text"
                                      value={rec.customParameterLabel ?? ''}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_QUALITY_RECORD',
                                          payload: {
                                            id: rec.id,
                                            updates: { customParameterLabel: e.target.value },
                                          },
                                        })
                                      }
                                      placeholder="Parameter name"
                                      className="w-full text-xs border border-white/10 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                  ) : (
                                    (QUALITY_PARAM_LABELS[rec.parameter] ?? rec.parameter)
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-center text-gray-400">
                                  {isCustom ? (
                                    <input
                                      type="text"
                                      value={rec.unit ?? ''}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_QUALITY_RECORD',
                                          payload: {
                                            id: rec.id,
                                            updates: { unit: e.target.value },
                                          },
                                        })
                                      }
                                      placeholder="unit"
                                      className="w-12 text-center text-xs border border-white/10 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                  ) : (
                                    rec.unit
                                  )}
                                </td>
                                {MONTHS.map((month) => {
                                  const val = (rec.monthlyValues ?? {})[month];
                                  const numVal = typeof val === 'string' ? parseFloat(val) : val;
                                  let cellColor = '';
                                  if (val !== undefined && val !== '') {
                                    if (rec.parameter === 'ph' && !isNaN(numVal as number)) {
                                      cellColor =
                                        (numVal as number) >= 6.5 && (numVal as number) <= 8.5
                                          ? 'bg-green-50'
                                          : 'bg-red-100';
                                    } else if (
                                      rec.parameter === 'turbidity_ntu' &&
                                      !isNaN(numVal as number)
                                    ) {
                                      cellColor =
                                        (numVal as number) <= 5 ? 'bg-green-50' : 'bg-red-100';
                                    } else if (
                                      rec.parameter === 'tds_mg_l' &&
                                      !isNaN(numVal as number)
                                    ) {
                                      cellColor =
                                        (numVal as number) <= 2000 ? 'bg-green-50' : 'bg-red-100';
                                    } else if (
                                      rec.parameter === 'total_coliform_mpn' ||
                                      rec.parameter === 'fecal_coliform_mpn'
                                    ) {
                                      const s = String(val).toLowerCase();
                                      cellColor =
                                        s.includes('absent') || s === '0'
                                          ? 'bg-green-50'
                                          : 'bg-red-100';
                                    }
                                  }
                                  return (
                                    <td key={month} className={cn('px-1 py-1', cellColor)}>
                                      <input
                                        type="text"
                                        value={val ?? ''}
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_QUALITY_RECORD',
                                            payload: {
                                              id: rec.id,
                                              updates: {
                                                monthlyValues: {
                                                  ...rec.monthlyValues,
                                                  [month]: e.target.value,
                                                },
                                              },
                                            },
                                          })
                                        }
                                        placeholder="—"
                                        className="w-12 text-center text-xs border border-white/10 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-transparent"
                                      />
                                    </td>
                                  );
                                })}
                                <td className="px-2 py-1.5 text-center text-gray-400 text-xs">
                                  {rec.is10500Limit ?? '—'}
                                </td>
                                <td className="px-1 py-1.5">
                                  {isCustom && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        dispatch({ type: 'REMOVE_QUALITY_RECORD', payload: rec.id })
                                      }
                                      className="text-gray-300 hover:text-red-500"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'ADD_QUALITY_RECORD',
                          payload: {
                            id: crypto.randomUUID(),
                            parameter: 'custom',
                            monthlyValues: {},
                          },
                        })
                      }
                      className="mt-3 flex items-center gap-1.5 text-sm text-gray-300 hover:text-gray-100 font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add custom parameter
                    </button>

                    {/* Compliance summary */}
                    {state.qualityRecords.some((r) =>
                      Object.values(r.monthlyValues ?? {}).some((v) => v !== undefined && v !== '')
                    ) && (
                      <div
                        className={cn(
                          'mt-4 rounded-xl p-4 text-sm',
                          qualityCompliance.isCompliant
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-red-50 border border-red-200'
                        )}
                      >
                        {qualityCompliance.isCompliant ? (
                          <p className="text-green-700 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            All monitored parameters within IS 10500:2012 permissible limits
                          </p>
                        ) : (
                          <div>
                            <p className="text-red-700 font-semibold flex items-center gap-2 mb-2">
                              <AlertTriangle className="w-4 h-4" />
                              {qualityCompliance.violations.length} exceedance(s) detected
                            </p>
                            <ul className="text-xs text-red-600 space-y-0.5">
                              {qualityCompliance.violations.map((v, i) => (
                                <li key={i}>• {v}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          This data is for compliance records and does not affect carbon
                          calculations.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── LIVE WASTE CARBON SUMMARY ─────────────────────────────────── */}
            {showLiveSummary && (
              <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-sm p-5 space-y-3 sticky bottom-4">
                <p className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Waste carbon estimate
                </p>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-white font-mono">
                      {solidCO2.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">Solid waste tCO₂e/yr</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white font-mono">
                      {liquidCO2.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">Liquid waste tCO₂e/yr</p>
                  </div>
                  <div className="bg-rose-50 rounded-xl p-2">
                    <p className="text-xl font-bold text-rose-700 font-mono">
                      {totalCO2.toFixed(2)}
                    </p>
                    <p className="text-xs text-rose-600">Total tCO₂e/yr</p>
                  </div>
                </div>
                {hasOpenBurning && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <Flame className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 font-medium">
                      Open burning detected — this is the highest-emission disposal method. Consider
                      eliminating or reducing this practice.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
