import { useEffect, useReducer, useRef, useCallback, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Zap,
  Sun,
  Flame,
  Settings,
  Activity,
  BarChart3,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Save,
  Send,
  Clock,
  CheckCircle2,
  Info,
  AlertTriangle,
  Layers,
  Cpu,
  Lightbulb,
  Wind,
  Database,
  Upload,
  FileText,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  EntryMode,
  EnergySource,
  ApplianceCategory,
  IAppliance,
  ICustomField,
  ITransformer,
  ISwitchgearPanel,
  ICapacitorBank,
  IDGSet,
  IElectricalProjectionsMatrix,
  IProjectionHorizons,
  IUtilityBillRecord,
  IDGGenerationRecord,
  ILoadProfileStats,
  ISubLoadProfileStats,
  // Phase 3
  IPVSitingRecord,
  IBatteryStorageRecord,
  IRenewableAssessmentRecord,
  AssessedEnergySource,
  RoofType,
  BatteryApplication,
  // Phase 4
  ILightingSurveyRecord,
  LightingFixtureType,
  LightingControlType,
  IMotorPumpRecord,
  MotorDuty,
  IEEfficiencyClass,
  MotorControlType,
  // Phase 5
  ITariffSchedule,
  ITodBlock,
  ICmdVsActualRecord,
  IPowerFactorTrendRecord,
  // Phase 6-9
  IGridEmissionFactor,
  EmissionFactorSource,
  IScadaSystem,
  ScadaProtocol,
  ISmartMeterPlan,
  MeterVoltageLevel,
  MeterCommunicationType,
  IEvCharger,
  EvConnectorType,
  IVehicleFuelRecord,
  VehicleType,
  IRefrigerantRecord,
  IFireExtinguisherRecord,
  ICommuteRecord,
  IAirTravelRecord,
  IOfficeEquipmentRecord,
} from '@shared/types/submission.types';
import { electricalOperationalApi } from '@/features/electrical/electricalApi';
import {
  APPLIANCE_DEFAULTS,
  INDIA_GRID_EMISSION_FACTOR,
  DG_DEFAULTS,
  DG_FUEL_TYPES,
  TRANSFORMER_COOLING_TYPES,
  PROJECTION_HORIZONS,
  LIGHTING_FIXTURE_LABELS,
  LIGHTING_CONTROL_LABELS,
  MOTOR_DUTY_LABELS,
  IE_CLASS_CORRECTION,
  PF_THRESHOLDS,
  CEA_EMISSION_FACTORS_BY_YEAR,
  VEHICLE_TYPE_LABELS,
  DEFAULT_VEHICLE_TYPES,
  EV_CONNECTOR_LABELS,
  SCADA_PROTOCOL_LABELS,
  METER_VOLTAGE_LABELS,
  METER_COMM_LABELS,
  VEHICLE_FUEL_EMISSION_FACTORS,
} from '@shared/constants/defaults';
import { buildingsApi } from '@/features/buildings/buildingsApi';
import { submissionsApi } from '@/features/submissions/submissionsApi';
import { useAuthStore } from '@/features/auth/authStore';
import { useToast } from '@/hooks/useToast';
import PageWrapper from '@/components/layout/PageWrapper';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import Badge from '@/components/common/Badge';
import Skeleton from '@/components/common/Skeleton';
import { cn } from '@/utils/cn';
import {
  electricalEntryReducer,
  initialState,
  makeDefaultAppliances,
} from '@/features/electrical/electricalEntryReducer';

// ── nanoid-lite ────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

// ── Constants ──────────────────────────────────────────────────────────────────
const SECTION_IDS = [
  'infrastructure',
  'dg-sets',
  'grid-energy',
  'appliances',
  'projections',
  'operational',
  'renewable',
  'billing-analytics',
  'grid-emission-factors',
  'automation-scada',
  'ev-vehicles',
  'refrigerants-fire',
  'scope3-activities',
] as const;
type SectionId = (typeof SECTION_IDS)[number];

const SIDEBAR_SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: 'infrastructure', label: 'Electrical infrastructure', icon: <Layers size={16} /> },
  { id: 'dg-sets', label: 'DG sets & backup power', icon: <Flame size={16} /> },
  { id: 'grid-energy', label: 'Grid energy & solar', icon: <Zap size={16} /> },
  { id: 'appliances', label: 'Appliances & equipment', icon: <Lightbulb size={16} /> },
  { id: 'projections', label: 'Demand projections', icon: <BarChart3 size={16} /> },
  { id: 'operational', label: 'Operational data', icon: <Database size={16} /> },
  { id: 'renewable', label: 'Renewable energy systems', icon: <Sun size={16} /> },
  {
    id: 'billing-analytics',
    label: 'Billing analytics & power quality',
    icon: <BarChart3 size={16} />,
  },
  { id: 'grid-emission-factors', label: 'Grid emission factors', icon: <Activity size={16} /> },
  { id: 'automation-scada', label: 'Automation & SCADA / smart meters', icon: <Cpu size={16} /> },
  { id: 'ev-vehicles', label: 'EV infrastructure & vehicle fleet', icon: <Zap size={16} /> },
  {
    id: 'refrigerants-fire',
    label: 'Refrigerants & fire extinguishers',
    icon: <Flame size={16} />,
  },
  { id: 'scope3-activities', label: 'Scope 3 activities', icon: <Activity size={16} /> },
];

const EF_GRID = INDIA_GRID_EMISSION_FACTOR; // 0.716 kgCO₂/kWh

// ── Live carbon helpers ───────────────────────────────────────────────────────
function calcTransformerLossTco2e(tr: ITransformer): number {
  const noLoadKg = (tr.noLoadLossKw ?? 0) * 8760 * EF_GRID;
  const loadLossKg = (tr.loadLossKw ?? 0) * 0.5 * 8760 * EF_GRID;
  return (noLoadKg + loadLossKg) / 1000;
}

function calcDgAnnualTco2e(dg: IDGSet): number {
  const ef = dg.emissionFactorKgCo2PerL ?? DG_DEFAULTS.emissionFactorKgCo2PerL;
  const retrofit = dg.emissionReductionRetrofitPercent
    ? 1 - dg.emissionReductionRetrofitPercent / 100
    : 1;

  if (dg.monthlyFuelConsumptionL) {
    return (dg.monthlyFuelConsumptionL * 12 * ef * retrofit) / 1000;
  }
  if (dg.emissionFactorKgCo2PerKwhr && dg.monthlyEnergyGenerationKwhr) {
    return (dg.monthlyEnergyGenerationKwhr * 12 * dg.emissionFactorKgCo2PerKwhr * retrofit) / 1000;
  }
  if (dg.monthlyEnergyGenerationKwhr && dg.specificFuelConsumptionLPerKwh) {
    const fuel = dg.monthlyEnergyGenerationKwhr * dg.specificFuelConsumptionLPerKwh;
    return (fuel * 12 * ef * retrofit) / 1000;
  }
  if (dg.monthlyRuntimeHours && dg.capacityKva) {
    const sfc = dg.specificFuelConsumptionLPerKwh ?? DG_DEFAULTS.specificFuelConsumptionLPerKwh;
    const kw = dg.capacityKva * 0.8;
    const kwh = kw * DG_DEFAULTS.loadFactor * dg.monthlyRuntimeHours;
    return (kwh * sfc * 12 * ef * retrofit) / 1000;
  }
  return 0;
}

// ── Small reusable UI bits ────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-200 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 mt-0.5">{children}</p>;
}

function Field({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-0.5', className)}>{children}</div>;
}

function TextInput({
  value,
  onChange,
  placeholder,
  required,
  maxLength,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      maxLength={maxLength}
      className={cn(
        'w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500',
        className
      )}
    />
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  className,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? undefined : parseFloat(v));
      }}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step ?? 1}
      className={cn(
        'w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500',
        className
      )}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500',
        checked ? 'bg-green-600' : 'bg-gray-300'
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-black/40 backdrop-blur-md transition-transform',
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        )}
      />
      {label && <span className="ml-10 text-sm text-gray-200 whitespace-nowrap">{label}</span>}
    </button>
  );
}

// ── SECTION 1: TRANSFORMERS ───────────────────────────────────────────────────
function TransformerCard({
  transformer,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  transformer: ITransformer;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<ITransformer>) => void;
  onRemove: () => void;
}) {
  const lossPreview = calcTransformerLossTco2e(transformer);
  const showPreview = (transformer.noLoadLossKw ?? 0) > 0 || (transformer.loadLossKw ?? 0) > 0;

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-black/40 backdrop-blur-md">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="font-medium text-white text-sm min-w-[80px]">
          {transformer.transformerId || 'New transformer'}
        </span>
        <span className="text-xs text-gray-400 truncate flex-1">
          {transformer.location || '—'}{' '}
          {transformer.ratingKva ? `· ${transformer.ratingKva} kVA` : ''}{' '}
          {transformer.voltageRatio ? `· ${transformer.voltageRatio}` : ''}
        </span>
        {showPreview && (
          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            {lossPreview.toFixed(2)} tCO₂e/yr
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-red-400 hover:text-red-600 p-1 rounded"
        >
          <Trash2 size={14} />
        </button>
        {isExpanded ? (
          <ChevronDown size={16} className="text-gray-400" />
        ) : (
          <ChevronRight size={16} className="text-gray-400" />
        )}
      </button>

      {/* Expanded form */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-white/5 bg-white/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Left column */}
            <div className="space-y-3">
              <Field>
                <Label required>Transformer ID</Label>
                <TextInput
                  value={transformer.transformerId}
                  onChange={(v) => onUpdate({ transformerId: v })}
                  placeholder="TR-01, TR-North, Main-TR"
                />
              </Field>
              <Field>
                <Label required>Location</Label>
                <TextInput
                  value={transformer.location}
                  onChange={(v) => onUpdate({ location: v })}
                  placeholder="Substation A, Ground Floor Plant Room"
                />
              </Field>
              <Field>
                <Label required>Rating (kVA)</Label>
                <NumberInput
                  value={transformer.ratingKva}
                  onChange={(v) => onUpdate({ ratingKva: v ?? 0 })}
                  min={0}
                  placeholder="e.g. 500"
                />
                <Helper>Nameplate capacity in kVA</Helper>
              </Field>
              <Field>
                <Label>Voltage ratio</Label>
                <TextInput
                  value={transformer.voltageRatio ?? ''}
                  onChange={(v) => onUpdate({ voltageRatio: v })}
                  placeholder="11kV/0.433kV or 33kV/11kV"
                />
              </Field>
              <Field>
                <Label>% Impedance</Label>
                <NumberInput
                  value={transformer.impedancePercent}
                  onChange={(v) => onUpdate({ impedancePercent: v })}
                  step={0.01}
                />
              </Field>
              <Field>
                <Label>No-load loss (kW)</Label>
                <NumberInput
                  value={transformer.noLoadLossKw}
                  onChange={(v) => onUpdate({ noLoadLossKw: v })}
                  step={0.01}
                  min={0}
                />
                <Helper>
                  Core / iron losses — constant even at zero load. Used in carbon calculation.
                </Helper>
              </Field>
              <Field>
                <Label>Load loss (kW)</Label>
                <NumberInput
                  value={transformer.loadLossKw}
                  onChange={(v) => onUpdate({ loadLossKw: v })}
                  step={0.01}
                  min={0}
                />
                <Helper>
                  Copper losses at full load. Carbon calculated at 50% average loading.
                </Helper>
              </Field>
            </div>
            {/* Right column */}
            <div className="space-y-3">
              <Field>
                <Label>Cooling type</Label>
                <select
                  value={transformer.coolingType ?? ''}
                  onChange={(e) => onUpdate({ coolingType: e.target.value })}
                  className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select cooling type</option>
                  {TRANSFORMER_COOLING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <Label>Year of installation</Label>
                <NumberInput
                  value={transformer.yearOfInstallation}
                  onChange={(v) => onUpdate({ yearOfInstallation: v })}
                  min={1950}
                  max={2030}
                  placeholder="e.g. 2015"
                />
              </Field>
              <Field>
                <Label>Last oil/test date</Label>
                <TextInput
                  value={transformer.lastOilTestDate ?? ''}
                  onChange={(v) => onUpdate({ lastOilTestDate: v })}
                  placeholder="MM/YYYY"
                />
              </Field>
              <Field>
                <Label>Efficiency at 50% load (%)</Label>
                <NumberInput
                  value={transformer.efficiencyAt50Percent}
                  onChange={(v) => onUpdate({ efficiencyAt50Percent: v })}
                  step={0.01}
                  max={100}
                />
              </Field>
              <Field>
                <Label>Efficiency at 100% load (%)</Label>
                <NumberInput
                  value={transformer.efficiencyAt100Percent}
                  onChange={(v) => onUpdate({ efficiencyAt100Percent: v })}
                  step={0.01}
                  max={100}
                />
              </Field>
              <Field>
                <Label>Protection type</Label>
                <TextInput
                  value={transformer.protectionType ?? ''}
                  onChange={(v) => onUpdate({ protectionType: v })}
                  placeholder="Buchholz relay, OTI, WTI, REF, Differential"
                />
              </Field>
              <Field>
                <Label>Remarks</Label>
                <TextInput
                  value={transformer.remarks ?? ''}
                  onChange={(v) => onUpdate({ remarks: v })}
                  maxLength={200}
                  placeholder="Any additional notes"
                />
              </Field>
            </div>
          </div>
          {/* Carbon preview */}
          {showPreview && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
              Annual carbon from transformer losses:{' '}
              <span className="font-semibold">{lossPreview.toFixed(3)} tCO₂e/yr</span>
              <span className="text-xs ml-2 text-amber-600">
                ({(transformer.noLoadLossKw ?? 0).toFixed(2)} kW no-load × 8760h +{' '}
                {(transformer.loadLossKw ?? 0).toFixed(2)} kW load × 4380h) × {EF_GRID} kgCO₂/kWh
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SECTION 1B: SWITCHGEAR ────────────────────────────────────────────────────
function SwitchgearCard({
  panel,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  panel: ISwitchgearPanel;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<ISwitchgearPanel>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-black/40 backdrop-blur-md">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="font-medium text-white text-sm min-w-[80px]">
          {panel.panelId || 'New panel'}
        </span>
        <span className="text-xs text-gray-400 truncate flex-1">
          {panel.voltageKv ? `${panel.voltageKv} kV` : ''}{' '}
          {panel.busRatingA ? `· ${panel.busRatingA} A` : ''}{' '}
          {panel.commissionedYear ? `· ${panel.commissionedYear}` : ''}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-red-400 hover:text-red-600 p-1 rounded"
        >
          <Trash2 size={14} />
        </button>
        {isExpanded ? (
          <ChevronDown size={16} className="text-gray-400" />
        ) : (
          <ChevronRight size={16} className="text-gray-400" />
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-white/5 bg-white/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-3">
              <Field>
                <Label required>Panel ID</Label>
                <TextInput
                  value={panel.panelId}
                  onChange={(v) => onUpdate({ panelId: v })}
                  placeholder="MDB-01, LT-Panel-Lab"
                />
              </Field>
              <Field>
                <Label required>Voltage (kV)</Label>
                <div className="flex gap-2 flex-wrap mb-1">
                  {[0.433, 11, 33].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => onUpdate({ voltageKv: v })}
                      className={cn(
                        'px-2 py-1 rounded text-xs border',
                        panel.voltageKv === v
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-black/40 backdrop-blur-md text-gray-200 border-white/20 hover:border-green-400'
                      )}
                    >
                      {v} kV
                    </button>
                  ))}
                </div>
                <NumberInput
                  value={panel.voltageKv}
                  onChange={(v) => onUpdate({ voltageKv: v ?? 0 })}
                  step={0.001}
                  min={0}
                  placeholder="Custom kV"
                />
              </Field>
              <Field>
                <Label>Bus rating (A)</Label>
                <NumberInput
                  value={panel.busRatingA}
                  onChange={(v) => onUpdate({ busRatingA: v })}
                  placeholder="Bus current capacity"
                />
              </Field>
              <Field>
                <Label>Short-circuit rating (kA)</Label>
                <NumberInput
                  value={panel.shortCircuitRatingKa}
                  onChange={(v) => onUpdate({ shortCircuitRatingKa: v })}
                  placeholder="Fault withstand rating"
                />
              </Field>
            </div>
            <div className="space-y-3">
              <Field>
                <Label>Protection relays</Label>
                <TextInput
                  value={panel.protectionRelays ?? ''}
                  onChange={(v) => onUpdate({ protectionRelays: v })}
                  placeholder="List of relays: OC, EF, Diff etc."
                />
              </Field>
              <Field>
                <Label>Metering provided</Label>
                <TextInput
                  value={panel.meteringProvided ?? ''}
                  onChange={(v) => onUpdate({ meteringProvided: v })}
                  placeholder="Energy meter type / CT ratio"
                />
              </Field>
              <Field>
                <Label>SCADA-ready</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Toggle
                    checked={panel.scadaReady ?? false}
                    onChange={(v) => onUpdate({ scadaReady: v })}
                  />
                  <span className="text-sm text-gray-200">{panel.scadaReady ? 'Yes' : 'No'}</span>
                </div>
              </Field>
              <Field>
                <Label>Commissioned year</Label>
                <NumberInput
                  value={panel.commissionedYear}
                  onChange={(v) => onUpdate({ commissionedYear: v })}
                  min={1950}
                  max={2030}
                />
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SECTION 1C: CAPACITOR BANKS ───────────────────────────────────────────────
function CapacitorCard({
  bank,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  bank: ICapacitorBank;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<ICapacitorBank>) => void;
  onRemove: () => void;
}) {
  const lowPf = (bank.averageMeteredPf ?? 1) < 0.9;
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-black/40 backdrop-blur-md">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="font-medium text-white text-sm min-w-[80px] truncate">
          {bank.location || 'New bank'}
        </span>
        <span className="text-xs text-gray-400 truncate flex-1">
          {bank.kvar ? `${bank.kvar} kVAr` : ''} {bank.controlType ? `· ${bank.controlType}` : ''}{' '}
          {bank.setPowerFactor ? `· Set PF: ${bank.setPowerFactor}` : ''}{' '}
          {bank.averageMeteredPf ? `· Avg PF: ${bank.averageMeteredPf}` : ''}
        </span>
        {lowPf && bank.averageMeteredPf && (
          <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Low PF</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-red-400 hover:text-red-600 p-1 rounded"
        >
          <Trash2 size={14} />
        </button>
        {isExpanded ? (
          <ChevronDown size={16} className="text-gray-400" />
        ) : (
          <ChevronRight size={16} className="text-gray-400" />
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-white/5 bg-white/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-3">
              <Field>
                <Label required>Location</Label>
                <TextInput
                  value={bank.location}
                  onChange={(v) => onUpdate({ location: v })}
                  placeholder="Where installed"
                />
              </Field>
              <Field>
                <Label required>Capacity (kVAr)</Label>
                <NumberInput
                  value={bank.kvar}
                  onChange={(v) => onUpdate({ kvar: v ?? 0 })}
                  min={0}
                />
              </Field>
              <Field>
                <Label>Number of steps</Label>
                <NumberInput
                  value={bank.steps}
                  onChange={(v) => onUpdate({ steps: v })}
                  min={1}
                  placeholder="e.g. 8"
                />
              </Field>
              <Field>
                <Label>Control type</Label>
                <div className="flex gap-2">
                  {(['manual', 'automatic', 'other'] as const).map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => onUpdate({ controlType: ct })}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-xs border capitalize',
                        bank.controlType === ct
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-black/40 backdrop-blur-md text-gray-200 border-white/20 hover:border-green-400'
                      )}
                    >
                      {ct}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="space-y-3">
              <Field>
                <Label>Set power factor target</Label>
                <NumberInput
                  value={bank.setPowerFactor}
                  onChange={(v) => onUpdate({ setPowerFactor: v })}
                  min={0.85}
                  max={1}
                  step={0.01}
                  placeholder="e.g. 0.95"
                />
                <Helper>The target PF the bank is programmed to maintain</Helper>
              </Field>
              <Field>
                <Label>Average metered power factor</Label>
                <NumberInput
                  value={bank.averageMeteredPf}
                  onChange={(v) => onUpdate({ averageMeteredPf: v })}
                  min={0.85}
                  max={1}
                  step={0.01}
                  placeholder="e.g. 0.92"
                />
                <Helper>Actual measured average PF from energy meter records</Helper>
                {lowPf && bank.averageMeteredPf && (
                  <p className="text-xs text-red-600 mt-0.5">
                    Average PF {bank.averageMeteredPf} is below 0.90 — utility penalties may apply.
                  </p>
                )}
              </Field>
              <Field>
                <Label>Commissioned year</Label>
                <NumberInput
                  value={bank.commissionedYear}
                  onChange={(v) => onUpdate({ commissionedYear: v })}
                  min={1950}
                  max={2030}
                />
              </Field>
              <Field>
                <Label>Remarks</Label>
                <TextInput value={bank.remarks ?? ''} onChange={(v) => onUpdate({ remarks: v })} />
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SECTION 2: DG SET CARD ────────────────────────────────────────────────────
function DGSetCard({
  dg,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  dg: IDGSet;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<IDGSet>) => void;
  onRemove: () => void;
}) {
  const annualTco2e = calcDgAnnualTco2e(dg);
  const hasOpsData = !!(
    dg.monthlyFuelConsumptionL ||
    dg.monthlyEnergyGenerationKwhr ||
    dg.monthlyRuntimeHours
  );
  const efPerL = dg.emissionFactorKgCo2PerL ?? DG_DEFAULTS.emissionFactorKgCo2PerL;

  let calcPath = '';
  let calcFormula = '';
  if (dg.monthlyFuelConsumptionL) {
    calcPath = 'Using fuel consumption data';
    calcFormula = `${dg.monthlyFuelConsumptionL} L/mo × 12 × ${efPerL} kgCO₂/L ÷ 1000 = ${annualTco2e.toFixed(2)} tCO₂e`;
  } else if (dg.monthlyEnergyGenerationKwhr) {
    calcPath = 'Using energy generation';
    calcFormula = `${dg.monthlyEnergyGenerationKwhr} kWh/mo × 12 × EF ÷ 1000 = ${annualTco2e.toFixed(2)} tCO₂e`;
  } else if (dg.monthlyRuntimeHours) {
    calcPath = 'Estimated from runtime + capacity';
    calcFormula = `${dg.monthlyRuntimeHours} h/mo × ${dg.capacityKva ? `${(dg.capacityKva * 0.8 * 0.75).toFixed(0)} kW (est.)` : '—'} × SFC × EF ÷ 1000 = ${annualTco2e.toFixed(2)} tCO₂e`;
  }

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-black/40 backdrop-blur-md">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="font-medium text-white text-sm min-w-[80px]">
          {dg.dgId || 'New DG set'}
        </span>
        <span className="text-xs text-gray-400 truncate flex-1">
          {dg.capacityKva ? `${dg.capacityKva} kVA` : ''} {dg.fuelType ? `· ${dg.fuelType}` : ''}{' '}
          {dg.monthlyFuelConsumptionL ? `· ${dg.monthlyFuelConsumptionL} L/mo` : ''}
        </span>
        {hasOpsData && (
          <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
            {annualTco2e.toFixed(1)} tCO₂e/yr
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-red-400 hover:text-red-600 p-1 rounded"
        >
          <Trash2 size={14} />
        </button>
        {isExpanded ? (
          <ChevronDown size={16} className="text-gray-400" />
        ) : (
          <ChevronRight size={16} className="text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-white/5 bg-white/5 space-y-5">
          {/* GROUP A: Identity */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-3">
              Identity
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Field>
                  <Label required>DG ID</Label>
                  <TextInput
                    value={dg.dgId}
                    onChange={(v) => onUpdate({ dgId: v })}
                    placeholder="DG-01, DG-Emergency-Lab"
                  />
                </Field>
                <Field>
                  <Label required>Capacity (kVA)</Label>
                  <NumberInput
                    value={dg.capacityKva}
                    onChange={(v) => onUpdate({ capacityKva: v ?? 0 })}
                    min={0}
                  />
                </Field>
                <Field>
                  <Label>Purpose</Label>
                  <select
                    value={dg.purpose ?? ''}
                    onChange={(e) => onUpdate({ purpose: e.target.value as IDGSet['purpose'] })}
                    className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select purpose</option>
                    <option value="emergency">Emergency</option>
                    <option value="standby">Standby</option>
                    <option value="prime">Prime</option>
                    <option value="peak_shaving">Peak shaving</option>
                    <option value="other">Other</option>
                  </select>
                  {dg.purpose === 'other' && (
                    <TextInput
                      value={dg.purposeOther ?? ''}
                      onChange={(v) => onUpdate({ purposeOther: v })}
                      placeholder="Specify purpose"
                      className="mt-1"
                    />
                  )}
                </Field>
              </div>
              <div className="space-y-3">
                <Field>
                  <Label>Location</Label>
                  <TextInput
                    value={dg.location ?? ''}
                    onChange={(v) => onUpdate({ location: v })}
                    placeholder="Plant room, Basement, External yard"
                  />
                </Field>
                <Field>
                  <Label required>Fuel type</Label>
                  <select
                    value={dg.fuelType}
                    onChange={(e) => onUpdate({ fuelType: e.target.value as IDGSet['fuelType'] })}
                    className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {DG_FUEL_TYPES.map((ft) => (
                      <option key={ft.value} value={ft.value}>
                        {ft.label}
                      </option>
                    ))}
                  </select>
                  {dg.fuelType === 'other' && (
                    <TextInput
                      value={dg.fuelTypeOther ?? ''}
                      onChange={(v) => onUpdate({ fuelTypeOther: v })}
                      placeholder="Specify fuel type"
                      className="mt-1"
                    />
                  )}
                </Field>
                <Field>
                  <Label>Commissioned year</Label>
                  <NumberInput
                    value={dg.commissionedYear}
                    onChange={(v) => onUpdate({ commissionedYear: v })}
                    min={1950}
                    max={2030}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* GROUP B: Emission factors */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Emission factors (optional)
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mb-3">
              If known, enter the manufacturer's or measured emission factors below. Otherwise the
              engine uses IPCC defaults ({DG_DEFAULTS.emissionFactorKgCo2PerL} kgCO₂/L for diesel).
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Field>
                  <Label>Emission factor (kgCO₂/kWhr)</Label>
                  <NumberInput
                    value={dg.emissionFactorKgCo2PerKwhr}
                    onChange={(v) => onUpdate({ emissionFactorKgCo2PerKwhr: v })}
                    step={0.001}
                    placeholder="Default: 0.716"
                  />
                  <Helper>From manufacturer datasheet or measured stack test</Helper>
                </Field>
                <Field>
                  <Label>Emission factor (kgCO₂/L)</Label>
                  <NumberInput
                    value={dg.emissionFactorKgCo2PerL}
                    onChange={(v) => onUpdate({ emissionFactorKgCo2PerL: v })}
                    step={0.001}
                    placeholder={`Default: ${DG_DEFAULTS.emissionFactorKgCo2PerL}`}
                  />
                </Field>
              </div>
              <div className="space-y-3">
                <Field>
                  <Label>Specific fuel consumption (L/kWh)</Label>
                  <NumberInput
                    value={dg.specificFuelConsumptionLPerKwh}
                    onChange={(v) => onUpdate({ specificFuelConsumptionLPerKwh: v })}
                    step={0.001}
                    placeholder={`Default: ${DG_DEFAULTS.specificFuelConsumptionLPerKwh}`}
                  />
                </Field>
                <Field>
                  <Label>% Reduction from retrofitting</Label>
                  <NumberInput
                    value={dg.emissionReductionRetrofitPercent}
                    onChange={(v) => onUpdate({ emissionReductionRetrofitPercent: v })}
                    min={0}
                    max={50}
                    placeholder="0"
                  />
                  <Helper>
                    If this DG set has been retrofitted with emission controls, enter the %
                    reduction
                  </Helper>
                </Field>
                <Field>
                  <Label>Fuel price (Rs/litre)</Label>
                  <NumberInput
                    value={dg.fuelPriceRs}
                    onChange={(v) => onUpdate({ fuelPriceRs: v })}
                    placeholder="Current local price"
                  />
                  <Helper>Used for cost estimation only</Helper>
                </Field>
              </div>
            </div>
          </div>

          {/* GROUP C: Operational data */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Operational data
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800 mb-3">
              Enter at least one of the following for carbon calculation. Monthly fuel consumption
              is most accurate.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field>
                <Label>Monthly runtime (avg hours/month)</Label>
                <NumberInput
                  value={dg.monthlyRuntimeHours}
                  onChange={(v) => onUpdate({ monthlyRuntimeHours: v })}
                  min={0}
                  max={744}
                />
              </Field>
              <Field>
                <Label>Monthly fuel consumption (avg L/month)</Label>
                <NumberInput
                  value={dg.monthlyFuelConsumptionL}
                  onChange={(v) => onUpdate({ monthlyFuelConsumptionL: v })}
                  min={0}
                />
                <Helper>PRIMARY — most accurate input</Helper>
              </Field>
              <Field>
                <Label>Monthly energy generation (avg kWhr/month)</Label>
                <NumberInput
                  value={dg.monthlyEnergyGenerationKwhr}
                  onChange={(v) => onUpdate({ monthlyEnergyGenerationKwhr: v })}
                  min={0}
                />
              </Field>
            </div>
            {/* Live calculation box */}
            {hasOpsData && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-xs font-semibold text-red-800 mb-1">
                  Estimated annual emissions from this DG set:
                </p>
                <p className="text-xs text-red-600 mb-1">Calculation: {calcPath}</p>
                <p className="text-sm font-bold text-red-700">
                  {annualTco2e.toFixed(2)} tCO₂e/year
                </p>
                <p className="text-xs text-red-500 mt-1">{calcFormula}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SECTION 4: APPLIANCE ROW ──────────────────────────────────────────────────
function ApplianceRow({
  appliance,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  appliance: IAppliance;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<IAppliance>) => void;
  onRemove: () => void;
}) {
  const label = appliance.isCustom
    ? appliance.customLabel || 'Custom'
    : APPLIANCE_DEFAULTS[appliance.type]?.label || appliance.type;
  const effPct =
    appliance.count > 0 && appliance.qtyEfficientUnits !== undefined
      ? Math.round((appliance.qtyEfficientUnits / appliance.count) * 100)
      : undefined;

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden bg-black/40 backdrop-blur-md">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <span className="text-sm text-gray-100 truncate min-w-[120px]">{label}</span>
          <span className="text-xs text-gray-400">
            {appliance.count > 0 ? `×${appliance.count}` : '—'}
            {appliance.wattsEach ? ` · ${appliance.wattsEach}W` : ''}
            {appliance.hoursPerDay ? ` · ${appliance.hoursPerDay}h/day` : ''}
          </span>
          {effPct !== undefined && (
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                effPct >= 80
                  ? 'bg-green-100 text-green-700'
                  : effPct >= 50
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
              )}
            >
              {effPct}% eff
            </span>
          )}
          {isExpanded ? (
            <ChevronDown size={14} className="text-gray-400 ml-auto" />
          ) : (
            <ChevronRight size={14} className="text-gray-400 ml-auto" />
          )}
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onUpdate({ count: Math.max(0, appliance.count - 1) })}
            className="w-6 h-6 flex items-center justify-center rounded border border-white/20 text-gray-300 hover:bg-white/10"
          >
            −
          </button>
          <input
            type="number"
            value={appliance.count}
            min={0}
            onChange={(e) => onUpdate({ count: parseInt(e.target.value) || 0 })}
            className="w-12 text-center text-sm border border-white/20 rounded py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="button"
            onClick={() => onUpdate({ count: appliance.count + 1 })}
            className="w-6 h-6 flex items-center justify-center rounded border border-white/20 text-gray-300 hover:bg-white/10"
          >
            +
          </button>
        </div>
        {appliance.isCustom && (
          <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 p-1">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-white/5 bg-white/5 pt-3 space-y-3">
          {/* Zone A: Base fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {appliance.isCustom && (
              <Field className="col-span-2">
                <Label>Custom label</Label>
                <TextInput
                  value={appliance.customLabel ?? ''}
                  onChange={(v) => onUpdate({ customLabel: v })}
                  placeholder="Appliance name"
                />
              </Field>
            )}
            <Field>
              <Label>Total qty</Label>
              <NumberInput
                value={appliance.count}
                onChange={(v) => onUpdate({ count: v ?? 0 })}
                min={0}
              />
            </Field>
            <Field>
              <Label>Watts each</Label>
              <NumberInput
                value={appliance.wattsEach}
                onChange={(v) => onUpdate({ wattsEach: v })}
                min={0}
              />
            </Field>
            <Field>
              <Label>Hours/day</Label>
              <NumberInput
                value={appliance.hoursPerDay}
                onChange={(v) => onUpdate({ hoursPerDay: v })}
                min={0}
                max={24}
                step={0.5}
              />
            </Field>
            <Field className="col-span-2 md:col-span-4">
              <Label>Notes</Label>
              <TextInput
                value={appliance.notes ?? ''}
                onChange={(v) => onUpdate({ notes: v })}
                placeholder="Optional notes"
              />
            </Field>
          </div>

          {/* Zone B: Efficiency tracking */}
          <div className="border-t border-white/10 pt-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Efficiency split
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field>
                <Label>Is this an energy efficient type?</Label>
                <div className="flex items-center gap-3 mt-1">
                  <Toggle
                    checked={appliance.isEnergyEfficientType ?? false}
                    onChange={(v) => onUpdate({ isEnergyEfficientType: v })}
                  />
                  <span className="text-sm text-gray-200">
                    {appliance.isEnergyEfficientType ? 'Yes' : 'No'}
                  </span>
                </div>
              </Field>
              {appliance.isEnergyEfficientType && (
                <Field>
                  <Label>Type / Rating</Label>
                  <TextInput
                    value={appliance.efficientTypeRating ?? ''}
                    onChange={(v) => onUpdate({ efficientTypeRating: v })}
                    placeholder="LED, BLDC, 5-Star BEE, Inverter type"
                  />
                </Field>
              )}
              <Field>
                <Label>Efficient units (qty)</Label>
                <NumberInput
                  value={appliance.qtyEfficientUnits}
                  onChange={(v) => {
                    const qty = v ?? 0;
                    const nonEfficient = Math.max(0, appliance.count - qty);
                    const pct = appliance.count > 0 ? Math.round((qty / appliance.count) * 100) : 0;
                    onUpdate({
                      qtyEfficientUnits: qty,
                      qtyNonEfficientUnits: nonEfficient,
                      percentEfficientUnits: pct,
                    });
                  }}
                  min={0}
                  max={appliance.count}
                />
              </Field>
              <Field>
                <Label>Non-efficient units (auto)</Label>
                <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-gray-300">
                  {appliance.qtyNonEfficientUnits ?? appliance.count} units
                </div>
              </Field>
            </div>

            {/* Progress bar */}
            {appliance.qtyEfficientUnits !== undefined && appliance.count > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Efficiency: {effPct}%</span>
                  <span>
                    {appliance.qtyEfficientUnits}/{appliance.count} efficient
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all',
                      (effPct ?? 0) >= 80
                        ? 'bg-green-500'
                        : (effPct ?? 0) >= 50
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                    )}
                    style={{ width: `${effPct ?? 0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <Field>
                <Label>Planned upgrade date</Label>
                <TextInput
                  value={appliance.plannedUpgradeDate ?? ''}
                  onChange={(v) => onUpdate({ plannedUpgradeDate: v })}
                  placeholder="March 2026 or Q2 2025"
                />
              </Field>
              <Field>
                <Label>Expected timeline to 100% efficiency</Label>
                <TextInput
                  value={appliance.expectedMonthsToFullEfficiency ?? ''}
                  onChange={(v) => onUpdate({ expectedMonthsToFullEfficiency: v })}
                  placeholder="18 months, By FY 2026-27"
                />
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SECTION 6 HELPER: Add DG Generation Record form ──────────────────────────
function AddDGRecordForm({
  dgId,
  onAdd,
}: {
  dgId: string;
  onAdd: (rec: IDGGenerationRecord) => void;
}) {
  const [draft, setDraft] = useState<Partial<IDGGenerationRecord>>({ dgId });
  const set = (k: keyof IDGGenerationRecord, v: string | number) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border-t border-dashed border-white/10 pt-3 mt-1">
      <div>
        <label className="block text-xs text-gray-400 mb-0.5">Month (YYYY-MM)</label>
        <input
          type="month"
          value={draft.month ?? ''}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-').map(Number);
            setDraft((d) => ({ ...d, month: e.target.value, year: y, monthIndex: m }));
          }}
          className="w-full rounded border border-white/20 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-0.5">Runtime (h)</label>
        <input
          type="number"
          min={0}
          value={draft.totalRuntimeHours ?? ''}
          onChange={(e) => set('totalRuntimeHours', Number(e.target.value))}
          className="w-full rounded border border-white/20 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="hours"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-0.5">Fuel (L)</label>
        <input
          type="number"
          min={0}
          value={draft.totalFuelConsumptionL ?? ''}
          onChange={(e) => set('totalFuelConsumptionL', Number(e.target.value))}
          className="w-full rounded border border-white/20 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="litres"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-0.5">kWh generated</label>
        <input
          type="number"
          min={0}
          value={draft.totalKwhGenerated ?? ''}
          onChange={(e) => set('totalKwhGenerated', Number(e.target.value))}
          className="w-full rounded border border-white/20 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="kWh"
        />
      </div>
      <div>
        <button
          type="button"
          onClick={() => {
            if (!draft.month) return;
            const rec: IDGGenerationRecord = {
              id: Math.random().toString(36).slice(2, 10),
              dgId,
              month: draft.month,
              monthIndex: draft.monthIndex ?? 1,
              year: draft.year ?? new Date().getFullYear(),
              totalRuntimeHours: draft.totalRuntimeHours,
              totalFuelConsumptionL: draft.totalFuelConsumptionL,
              totalKwhGenerated: draft.totalKwhGenerated,
              dataSource: 'manual_entry',
            };
            onAdd(rec);
            setDraft({ dgId });
          }}
          className="w-full flex items-center justify-center gap-1 bg-orange-600 text-white rounded px-2 py-1 text-xs font-medium hover:bg-orange-700 transition-colors"
        >
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

// ── SECTION 5: PROJECTIONS ────────────────────────────────────────────────────
const PROJECTION_GROUPS: Array<{
  title: string;
  questions: Array<{
    key: keyof IElectricalProjectionsMatrix;
    label: string;
    type: 'number' | 'yesno' | 'text';
    unit?: string;
    conditional?: { parentKey: keyof IElectricalProjectionsMatrix; parentValue: string };
  }>;
}> = [
  {
    title: 'Contract & current status',
    questions: [
      {
        key: 'q1SanctionedLoadKva',
        label: 'Sanctioned load / contracted demand',
        type: 'number',
        unit: 'kVA',
      },
      {
        key: 'q2AvgUtilizationPercent',
        label: 'Present average utilization (% of CMD)',
        type: 'number',
        unit: '%',
      },
      {
        key: 'q3AvgMonthlyConsumptionKwh',
        label: 'Average monthly consumption',
        type: 'number',
        unit: 'kWh',
      },
    ],
  },
  {
    title: 'Future expansion',
    questions: [
      { key: 'q4NewBuildingsPlanned', label: 'New buildings planned?', type: 'yesno' },
      {
        key: 'q5NewBuildingsAndLoadKw',
        label: 'No. of new buildings & expected load',
        type: 'text',
      },
      {
        key: 'q6NewFacilitiesPlanned',
        label: 'New facilities planned (hospital/data centre)?',
        type: 'yesno',
      },
      {
        key: 'q7NewFacilitiesLoadKw',
        label: 'Additional load from new facilities',
        type: 'number',
        unit: 'kW',
      },
    ],
  },
  {
    title: 'Equipment changes',
    questions: [
      { key: 'q8HighLoadEquipmentPlanned', label: 'High-load equipment planned?', type: 'yesno' },
      {
        key: 'q9EstimatedLoadAdditionKw',
        label: 'Estimated load addition from equipment',
        type: 'number',
        unit: 'kW',
      },
      {
        key: 'q10EfficiencyUpgradesPlanned',
        label: 'Energy-efficient upgrades planned?',
        type: 'yesno',
      },
      {
        key: 'q11EstimatedLoadReductionPct',
        label: 'Estimated % reduction in load',
        type: 'number',
        unit: '%',
      },
    ],
  },
  {
    title: 'Renewable integration',
    questions: [
      { key: 'q12SolarPlantPlanned', label: 'Solar plant planned?', type: 'yesno' },
      { key: 'q13SolarCapacityKw', label: 'Expected solar capacity & timeline', type: 'text' },
      {
        key: 'q14HybridSystemPlanned',
        label: 'Hybrid system (solar+battery+DG) planned?',
        type: 'yesno',
      },
      {
        key: 'q15RenewableContributionPct',
        label: 'Expected renewable contribution',
        type: 'number',
        unit: '%',
      },
    ],
  },
  {
    title: 'Backup power / DG',
    questions: [
      {
        key: 'q16DgCapacityAndHoursPerDay',
        label: 'Current DG capacity & hours/day',
        type: 'text',
      },
      { key: 'q17DgUpgradePlanned', label: 'DG sets to be upgraded/reduced?', type: 'yesno' },
      {
        key: 'q18ProjectedDieselLPerYear',
        label: 'Projected diesel consumption',
        type: 'number',
        unit: 'L/yr',
      },
    ],
  },
  {
    title: 'Load patterns',
    questions: [
      {
        key: 'q19PeakDemandChangeKw',
        label: 'Expected change in peak demand',
        type: 'number',
        unit: 'kW',
      },
      {
        key: 'q20BaseDemandChangeKw',
        label: 'Expected change in base demand',
        type: 'number',
        unit: 'kW',
      },
      {
        key: 'q21SeasonalEventsExpected',
        label: 'Seasonal events expected to raise loads?',
        type: 'yesno',
      },
    ],
  },
  {
    title: 'Growth rates (% per year)',
    questions: [
      {
        key: 'q22aGridConsumptionGrowthPct',
        label: 'Grid consumption growth rate',
        type: 'number',
        unit: '%/yr',
      },
      {
        key: 'q22bGridTariffGrowthPct',
        label: 'Grid tariff growth rate',
        type: 'number',
        unit: '%/yr',
      },
      {
        key: 'q22cSolarGenerationGrowthPct',
        label: 'Solar generation growth rate',
        type: 'number',
        unit: '%/yr',
      },
      {
        key: 'q22dSolarSubsidyGrowthPct',
        label: 'Solar subsidy/income growth rate',
        type: 'number',
        unit: '%/yr',
      },
      { key: 'q22eCmdGrowthPct', label: 'CMD growth rate', type: 'number', unit: '%/yr' },
      {
        key: 'q22fDgConsumptionGrowthPct',
        label: 'DG consumption growth rate',
        type: 'number',
        unit: '%/yr',
      },
      {
        key: 'q22gDgFuelConsumptionGrowthPct',
        label: 'DG fuel consumption growth rate',
        type: 'number',
        unit: '%/yr',
      },
      {
        key: 'q22hFuelPriceGrowthPct',
        label: 'Fuel price growth rate',
        type: 'number',
        unit: '%/yr',
      },
    ],
  },
];

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ElectricalEntry() {
  const { id: buildingId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const [state, dispatch] = useReducer(electricalEntryReducer, initialState);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [uploadingLoadProfile, setUploadingLoadProfile] = useState(false);
  const [uploadingSubLoad, setUploadingSubLoad] = useState(false);
  const [uploadingDGGen, setUploadingDGGen] = useState(false);
  // Phase 3 inline form draft states
  const [newPlantDraft, setNewPlantDraft] = useState<{
    plantId: string;
    technology: string;
    capacityKwp: string;
  }>({ plantId: '', technology: 'solar_pv_rooftop', capacityKwp: '' });
  const [newPlantMonthDraft, setNewPlantMonthDraft] = useState<{
    [plantId: string]: {
      month: string;
      kwhGenerated: string;
      perfRatio: string;
      outageCount: string;
    };
  }>({});
  const [registeredPlantMeta, setRegisteredPlantMeta] = useState<{
    [plantId: string]: { technology: string; capacityKwp: number };
  }>({});
  const [newSolarMonthDraft, setNewSolarMonthDraft] = useState<{
    month: string;
    avgGhiWm2: string;
    peakSunHours: string;
    avgModuleTempC: string;
  }>({ month: '', avgGhiWm2: '', peakSunHours: '', avgModuleTempC: '' });
  const [newWindMonthDraft, setNewWindMonthDraft] = useState<{
    month: string;
    avgWindSpeedMs: string;
    maxWindSpeedMs: string;
    avgDirectionDeg: string;
    mastHeightM: string;
  }>({ month: '', avgWindSpeedMs: '', maxWindSpeedMs: '', avgDirectionDeg: '', mastHeightM: '' });
  const [showPrepopulateModal, setShowPrepopulateModal] = useState(false);
  const [prepopulateSelected, setPrepopulateSelected] = useState<Set<AssessedEnergySource>>(
    new Set(['solar_pv_rooftop', 'solar_pv_ground'])
  );
  const [dgEntryMode, setDgEntryMode] = useState<'manual' | 'upload'>('manual');
  const [newBillDraft, setNewBillDraft] = useState<Partial<IUtilityBillRecord>>({});
  const [expandedApplianceIds, setExpandedApplianceIds] = useState<Set<string>>(new Set());
  const [expandedProjectionGroups, setExpandedProjectionGroups] = useState<Set<number>>(
    new Set([0]) // first group open by default
  );
  const [phase10SubTab, setPhase10SubTab] = useState<'refrigerants' | 'fire'>('refrigerants');
  const [phase11SubTab, setPhase11SubTab] = useState<'commute' | 'air_travel' | 'equipment'>(
    'commute'
  );

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // ── Fetch building ────────────────────────────────────────────────────────
  const { data: buildingRes, isLoading: buildingLoading } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => buildingsApi.getById(buildingId!),
    enabled: !!buildingId,
  });

  // ── Fetch or create draft ────────────────────────────────────────────────
  const { data: draftRes, isLoading: draftLoading } = useQuery({
    queryKey: ['submission-draft', buildingId, 'electrical'],
    queryFn: () => submissionsApi.getOrCreateDraft(buildingId!, 'electrical'),
    enabled: !!buildingId,
  });

  // ── Hydrate state from draft ──────────────────────────────────────────────
  useEffect(() => {
    if (!draftRes?.data) return;
    const draft = draftRes.data?.data;
    if (!draft) return;
    dispatch({ type: 'SET_ELECTRICAL_SUBMISSION_ID', payload: draft._id });
    if (draft.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electricalData = (draft.data as any).electrical ?? draft.data;
      dispatch({ type: 'HYDRATE', payload: { ...electricalData, version: draft.version } });
    }
  }, [draftRes]);

  // ── Pre-populate vehicle types on mount if empty ─────────────────────────
  useEffect(() => {
    if (state.vehicleFuelRecords.length === 0 && draftRes?.data) {
      // Only pre-populate after hydration if still empty
      const draftVehicles = (draftRes.data?.data?.data as Partial<typeof state>)
        ?.vehicleFuelRecords;
      if (!draftVehicles || draftVehicles.length === 0) {
        dispatch({
          type: 'PREPOPULATE_VEHICLE_TYPES',
          payload: DEFAULT_VEHICLE_TYPES.map((vt) => ({
            id: uid(),
            vehicleType: vt as VehicleType,
          })) as IVehicleFuelRecord[],
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRes]);

  // ── Derived Phase 6: effective grid EF (mirrors server logic) ────────────
  const effectiveGridEf = useMemo(() => {
    const sorted = [...state.gridEmissionFactors]
      .filter((r) => r.emissionFactorKgCo2PerKwhr > 0)
      .sort((a, b) => b.year - a.year);
    const match = sorted[0];
    if (!match) return { ef: 0.716, tdLoss: 0, gross: 0.716, source: 'default' };
    const tdLoss = match.tdLossPercent ?? 0;
    const gross =
      tdLoss > 0
        ? match.emissionFactorKgCo2PerKwhr / (1 - tdLoss / 100)
        : match.emissionFactorKgCo2PerKwhr;
    return { ef: match.emissionFactorKgCo2PerKwhr, tdLoss, gross, source: `user_${match.year}` };
  }, [state.gridEmissionFactors]);

  // ── Derived Phase 9: EV charging totals ──────────────────────────────────
  const evChargingTotals = useMemo(() => {
    let annualKwh = 0;
    for (const ev of state.evChargers) {
      if (ev.monthlyKwhConsumption) {
        annualKwh += ev.monthlyKwhConsumption * 12;
      } else if (ev.ratingKw && ev.quantity) {
        const div = ev.diversityFactor ?? 0.4;
        const hours = ev.operatingHoursPerDay ?? 8;
        annualKwh += ev.ratingKw * ev.quantity * div * hours * 365;
      }
    }
    return { annualKwh, tco2e: (annualKwh * effectiveGridEf.gross) / 1000 };
  }, [state.evChargers, effectiveGridEf]);

  // ── Derived Phase 9: Vehicle fleet totals ────────────────────────────────
  const vehicleFleetTotals = useMemo(() => {
    let dieselL = 0,
      kerL = 0,
      dieselCo2 = 0,
      kerCo2 = 0,
      cost = 0;
    for (const v of state.vehicleFuelRecords) {
      const annDiesel =
        v.annualDieselLitres ?? (v.monthlyDieselLitres ? v.monthlyDieselLitres * 12 : 0);
      const annKer =
        v.annualKeroseneLitres ?? (v.monthlyKeroseneLitres ? v.monthlyKeroseneLitres * 12 : 0);
      const dEF = v.dieselEmissionFactorKgCo2PerL ?? 2.68;
      const kEF = v.keroseneEmissionFactorKgCo2PerL ?? 2.54;
      dieselL += annDiesel;
      kerL += annKer;
      dieselCo2 += annDiesel * dEF;
      kerCo2 += annKer * kEF;
      cost += annDiesel * (v.dieselPriceRsPerL ?? 95) + annKer * (v.kerosenepriceRsPerL ?? 65);
    }
    return {
      totalDieselL: dieselL,
      totalKerL: kerL,
      tco2eDiesel: dieselCo2 / 1000,
      tco2eKer: kerCo2 / 1000,
      totalTco2e: (dieselCo2 + kerCo2) / 1000,
      annualCostRs: cost,
    };
  }, [state.vehicleFuelRecords]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!state.electricalSubmissionId) return;
    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      await submissionsApi.updateDraft(
        state.electricalSubmissionId,
        {
          transformers: state.transformers,
          switchgear: state.switchgear,
          capacitorBanks: state.capacitorBanks,
          dgSets: state.dgSets,
          energy: state.energyData,
          appliances: state.appliancesData,
          projections: state.projectionsData,
          operational: {
            utilityBills: state.operationalData.utilityBills,
            loadProfileStats: state.operationalData.loadProfileStats,
            hasLoadProfileData: state.operationalData.hasLoadProfileData,
            subLoadProfileStats: state.operationalData.subLoadProfileStats,
            hasSubLoadData: state.operationalData.hasSubLoadData,
            dgGenerationRecords: state.operationalData.dgGenerationRecords,
          },
          // Phase 3 fields
          plantGenerationMonthly: state.plantGenerationMonthly,
          plantGenerationUploadMeta: state.plantGenerationUploadMeta,
          solarResourceMonthly: state.solarResourceMonthly,
          solarResourceUploadMeta: state.solarResourceUploadMeta,
          windResourceMonthly: state.windResourceMonthly,
          windResourceUploadMeta: state.windResourceUploadMeta,
          pvSiting: state.pvSiting,
          batteryStorage: state.batteryStorage,
          renewableAssessment: state.renewableAssessment,
          // Phase 4 fields
          lightingSurvey: state.lightingSurvey,
          motorsPumps: state.motorsPumps,
          // Phase 5 fields
          tariffSchedules: state.tariffSchedules,
          cmdVsActual: state.cmdVsActual,
          pfTrend: state.pfTrend,
          // Phase 6 fields
          gridEmissionFactors: state.gridEmissionFactors,
          // Phase 7 fields
          pumpingExtensions: state.pumpingExtensions,
          scadaSystems: state.scadaSystems,
          // Phase 8 fields
          smartMeterPlan: state.smartMeterPlan,
          // Phase 9 fields
          evChargers: state.evChargers,
          vehicleFuelRecords: state.vehicleFuelRecords,
          // Phase 10 fields
          refrigerantRecords: state.refrigerantRecords,
          fireExtinguisherRecords: state.fireExtinguisherRecords,
          // Phase 11 fields
          scope3Activities: state.scope3Activities,
        },
        state.energyData.entryMode ?? 'cumulative'
      );
      dispatch({ type: 'SET_LAST_SAVED', payload: new Date() });
    } catch {
      showToast({ type: 'error', message: 'Auto-save failed' });
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state]);

  // Keep a ref to the latest save so the debounce effect never needs save in its deps.
  const saveRef = useRef<() => Promise<void>>();
  saveRef.current = save;

  useEffect(() => {
    if (!state.isDirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveRef.current?.(), 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [state.isDirty]);

  // ── Scroll to section ────────────────────────────────────────────────────
  const scrollTo = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dispatch({ type: 'SET_ACTIVE_SECTION', payload: id });
  };

  // ── Sidebar live estimates ─────────────────────────────────────────────────
  const liveEstimates = useMemo(() => {
    const trLoss = state.transformers.reduce((s, t) => s + calcTransformerLossTco2e(t), 0);

    // Grid source determination
    const bills = state.operationalData.utilityBills;
    let gridTco2e: number;
    let gridSource: 'bills' | 'manual' | 'estimated';
    if (bills.length > 0) {
      const totalKwh = bills.reduce((s, b) => s + (b.unitConsumedKwhr ?? 0), 0);
      const months = new Set(bills.map((b) => `${b.consumerNumber}||${b.month}`)).size;
      const annual = months < 12 ? (totalKwh / months) * 12 : totalKwh;
      gridTco2e = (annual * EF_GRID) / 1000;
      gridSource = 'bills';
    } else if (state.energyData.monthlyConsumptionKwh && !state.energyData.isEstimated) {
      gridTco2e = (state.energyData.monthlyConsumptionKwh * 12 * EF_GRID) / 1000;
      gridSource = 'manual';
    } else {
      gridTco2e = ((state.energyData.monthlyConsumptionKwh ?? 0) * 12 * EF_GRID) / 1000;
      gridSource = 'estimated';
    }

    // Phase 3 — renewable offset hierarchy (client-side live estimate)
    let renewableOffsetKwh = 0;
    let renewableOffsetSource: 'plant_log' | 'ghi_derived' | 'capacity_estimate' | 'none' = 'none';

    if (state.plantGenerationMonthly.length > 0) {
      const solarPlants = state.plantGenerationMonthly.filter((r) =>
        r.technology.startsWith('solar')
      );
      renewableOffsetKwh = solarPlants.reduce((s, r) => s + (r.totalKwhGenerated ?? 0), 0);
      renewableOffsetSource = 'plant_log';
    } else if (state.solarResourceMonthly.length > 0 && state.energyData.solarCapacityKw) {
      renewableOffsetKwh = state.solarResourceMonthly.reduce((s, m) => {
        const psh =
          m.peakSunHours ??
          ((m.avgGhiWm2 ?? 0) / 1000) *
            [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m.monthIndex - 1];
        return s + psh * (state.energyData.solarCapacityKw ?? 0) * 0.8;
      }, 0);
      renewableOffsetSource = 'ghi_derived';
    } else if (state.energyData.solarCapacityKw) {
      renewableOffsetKwh = state.energyData.solarCapacityKw * 1200;
      renewableOffsetSource = 'capacity_estimate';
    }

    const solarOffset = (renewableOffsetKwh * EF_GRID) / 1000;
    const netGrid = Math.max(gridTco2e - solarOffset, 0);

    // DG source determination
    const genRecords = state.operationalData.dgGenerationRecords;
    const hasDgActual = state.dgSets.some((d) => genRecords.some((r) => r.dgId === d.dgId));
    const dgSource: 'actual' | 'estimated' = hasDgActual ? 'actual' : 'estimated';
    const dgTotal = state.dgSets.reduce((s, d) => {
      const recs = genRecords.filter((r) => r.dgId === d.dgId);
      if (recs.length > 0) {
        const fuel = recs.reduce((f, r) => f + (r.totalFuelConsumptionL ?? 0), 0);
        const months = new Set(recs.map((r) => r.month)).size;
        const annualFuel = months < 12 ? (fuel / months) * 12 : fuel;
        return (
          s +
          (annualFuel * (d.emissionFactorKgCo2PerL ?? DG_DEFAULTS.emissionFactorKgCo2PerL)) / 1000
        );
      }
      return s + calcDgAnnualTco2e(d);
    }, 0);

    return {
      trLoss,
      dgTotal,
      dgSource,
      gridTco2e: netGrid,
      gridSource,
      solarOffset,
      renewableOffsetSource,
      total: trLoss + netGrid + dgTotal,
    };
  }, [
    state.transformers,
    state.dgSets,
    state.energyData,
    state.operationalData,
    state.plantGenerationMonthly,
    state.solarResourceMonthly,
  ]);

  // ── PF analysis (must be declared before buildValidation to avoid TDZ) ──────
  const pfAnalysis = useMemo(() => {
    const records = state.pfTrend.filter((r) => r.averagePf);
    if (!records.length) return null;
    const annualPenalty = state.pfTrend.reduce(
      (s, r) => s + Math.max(r.penaltyOrIncentiveRs ?? 0, 0),
      0
    );
    const annualIncentive = state.pfTrend.reduce(
      (s, r) => s + Math.abs(Math.min(r.penaltyOrIncentiveRs ?? 0, 0)),
      0
    );
    return {
      avgPf: records.reduce((s, r) => s + r.averagePf, 0) / records.length,
      monthsInPenalty: records.filter((r) => r.averagePf < PF_THRESHOLDS.poor).length,
      monthsIncentive: records.filter((r) => r.averagePf >= PF_THRESHOLDS.good).length,
      annualPenalty,
      annualIncentive,
      netImpact: annualPenalty - annualIncentive,
      trend: records.length >= 2 ? records[records.length - 1].averagePf - records[0].averagePf : 0,
    };
  }, [state.pfTrend]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const buildValidation = useCallback(() => {
    const warnings: string[] = [];
    let score = 0;

    if (!state.transformers.length) {
      warnings.push(
        'No transformer data — transformer losses will not be included in carbon calculation'
      );
    } else {
      score += 15;
      const noLoss = state.transformers.filter((t) => !t.noLoadLossKw && !t.loadLossKw);
      if (noLoss.length)
        warnings.push(
          `${noLoss.length} transformer(s) have no loss data — engine will estimate using standard loss factors`
        );
    }

    if (!state.dgSets.length) {
      if (state.energyData.primarySource === EnergySource.DIESEL) {
        warnings.push(
          'Diesel is selected as primary source but no DG sets have been entered — diesel emissions will not be calculated'
        );
      }
    } else {
      const hasOps = state.dgSets.some(
        (d) => d.monthlyFuelConsumptionL || d.monthlyEnergyGenerationKwhr || d.monthlyRuntimeHours
      );
      if (hasOps) score += 15;
      state.dgSets.forEach((d) => {
        if (
          !d.monthlyFuelConsumptionL &&
          !d.monthlyEnergyGenerationKwhr &&
          !d.monthlyRuntimeHours
        ) {
          warnings.push(
            `DG set ${d.dgId || d.id} has no operational data — cannot calculate its emissions`
          );
        }
      });
    }

    state.capacitorBanks.forEach((b) => {
      if (b.averageMeteredPf !== undefined && b.averageMeteredPf < 0.9) {
        warnings.push(
          `Average power factor ${b.averageMeteredPf} is below 0.90 — this may incur utility penalties`
        );
      }
    });

    if (state.energyData.monthlyConsumptionKwh) score += 15;

    const activeAppliances = state.appliancesData.appliances.filter((a) => a.count > 0);
    if (!activeAppliances.length) {
      warnings.push(
        'No appliance data — electricity consumption will be estimated from building type and floor area only'
      );
    } else if (activeAppliances.length >= 5) {
      score += 15;
    }

    const projFilled = Object.values(state.projectionsData).filter(
      (v) => v && typeof v === 'object' && 'thisYear' in (v as object)
    ).length;
    if (projFilled >= 3) score += 10;

    state.appliancesData.appliances.forEach((a) => {
      if (a.qtyEfficientUnits !== undefined && a.count > 0 && a.qtyEfficientUnits > a.count) {
        warnings.push(
          `Efficient unit count exceeds total for ${APPLIANCE_DEFAULTS[a.type]?.label || a.type} — please check`
        );
      }
    });

    // ── Phase 2 operational warnings ──────────────────────────────────────
    const bills = state.operationalData.utilityBills;
    const billMonths = new Set(bills.map((b) => `${b.consumerNumber}||${b.month}`)).size;
    if (bills.length > 0 && billMonths < 3) {
      warnings.push(
        `Only ${billMonths} month${billMonths === 1 ? '' : 's'} of utility bills entered — annual consumption is heavily extrapolated`
      );
    }
    if (bills.length >= 6) score += 10;

    if (bills.length > 0 && state.energyData.monthlyConsumptionKwh) {
      const billAvg = bills.reduce((s, b) => s + (b.unitConsumedKwhr ?? 0), 0) / bills.length;
      const manualMonthly = state.energyData.monthlyConsumptionKwh;
      if (manualMonthly > 0 && Math.abs(billAvg - manualMonthly) / manualMonthly > 0.2) {
        warnings.push(
          `Utility bill average (${billAvg.toFixed(0)} kWh/month) differs from manual estimate (${manualMonthly} kWh/month) by more than 20%`
        );
      }
    }

    if (state.operationalData.hasLoadProfileData) {
      score += 5;
      const coverage = state.operationalData.subLoadProfileStats?.coveragePercent;
      if (state.operationalData.hasSubLoadData && coverage !== undefined && coverage < 50) {
        warnings.push(
          `Sub-load profile coverage is only ${coverage.toFixed(0)}% — more than half of load is unaccounted for in sub-circuits`
        );
      }
    }

    if (state.dgSets.length > 0) {
      const dgRecords = state.operationalData.dgGenerationRecords;
      const dgIdsWithRecords = new Set(dgRecords.map((r) => r.dgId));
      const allDgsCovered = state.dgSets.every((d) => dgIdsWithRecords.has(d.dgId));
      const someDgsCovered = state.dgSets.some((d) => dgIdsWithRecords.has(d.dgId));
      if (someDgsCovered && !allDgsCovered) {
        warnings.push(
          'DG generation records exist for some DG sets but not all — missing DGs will use Phase 1 estimates'
        );
      }
      if (allDgsCovered) {
        const allHaveThreeMonths = state.dgSets.every((d) => {
          const count = dgRecords.filter((r) => r.dgId === d.dgId).length;
          return count >= 3;
        });
        if (allHaveThreeMonths) score += 5;
      }
      // W12: records show significantly more fuel than Phase 1 estimates
      state.dgSets.forEach((dg) => {
        const recs = dgRecords.filter((r) => r.dgId === dg.dgId);
        if (recs.length > 0 && dg.monthlyFuelConsumptionL) {
          const recAvgFuel =
            recs.reduce((s, r) => s + (r.totalFuelConsumptionL ?? 0), 0) / recs.length;
          if (recAvgFuel > dg.monthlyFuelConsumptionL * 1.3) {
            warnings.push(
              `DG set ${dg.dgId}: actual fuel records (avg ${recAvgFuel.toFixed(0)} L/month) are more than 30% above Phase 1 estimate (${dg.monthlyFuelConsumptionL} L/month)`
            );
          }
        }
      });
    }

    // ── Phase 4 warnings ──────────────────────────────────────────────────
    if (state.lightingSurvey.length >= 3) score += 5;
    if (state.motorsPumps.length >= 1) score += 5;

    // W_P4_1: Survey qty diverges from Phase 1 lighting by > 30%
    const phase1LightingCount = state.appliancesData.appliances
      .filter((a) => a.category === 'lighting')
      .reduce((s, a) => s + a.count, 0);
    const surveyCount = state.lightingSurvey.reduce((s, r) => s + r.quantity, 0);
    if (phase1LightingCount > 0 && surveyCount > 0) {
      const divergePct = Math.abs(surveyCount - phase1LightingCount) / phase1LightingCount;
      if (divergePct > 0.3) {
        warnings.push(
          `Lighting survey records ${surveyCount} fixtures but Phase 1 appliance count suggests ${phase1LightingCount}. The survey will be used for carbon calculation — verify counts are consistent.`
        );
      }
    }

    // W_P4_2: IE1 motor with VFD feasible
    state.motorsPumps.forEach((m) => {
      if (m.efficiencyClass === 'IE1' && m.vfdFeasible) {
        warnings.push(
          `Motor ${m.equipmentId} is IE1 class with VFD feasibility — upgrading to IE3 + VFD could save up to 35–45% energy.`
        );
      }
    });

    // W_P4_3: Continuous duty but < 18 h/day
    state.motorsPumps.forEach((m) => {
      if (m.duty === 'continuous' && m.operatingHoursPerDay < 18) {
        warnings.push(
          `Motor ${m.equipmentId} is marked Continuous but shows < 18 hours/day. Verify — if it truly runs continuously, set hours to 24.`
        );
      }
    });

    // ── Phase 5 warnings ──────────────────────────────────────────────────
    if (state.tariffSchedules.length >= 1) score += 5;
    const cmdMonths = new Set(state.cmdVsActual.map((r) => r.month)).size;
    if (cmdMonths >= 6) score += 5;
    const pfMonths = new Set(state.pfTrend.map((r) => r.month)).size;
    if (pfMonths >= 6) score += 5;

    // W_P5_1: CMD exceeded
    state.cmdVsActual.forEach((r) => {
      if (r.billedMdKva && r.billedMdKva > r.contractedMdKva) {
        warnings.push(
          `CMD exceeded in ${r.month}. This typically triggers demand penalty charges — check your utility bill for demand surcharges.`
        );
      }
    });

    // W_P5_2: PF below 0.90 majority of months
    const pfRecords = state.pfTrend.filter((r) => r.averagePf);
    if (pfRecords.length >= 3) {
      const badMonths = pfRecords.filter((r) => r.averagePf < 0.9).length;
      if (badMonths > pfRecords.length / 2) {
        warnings.push(
          `Average PF below 0.90 in ${badMonths} months. Significant PF penalties likely — review capacitor bank sizing in Phase 1 (Section 1C).`
        );
      }
    }

    // W_P5_4: Annual PF penalty > ₹50,000
    if (pfAnalysis && pfAnalysis.annualPenalty > 50000) {
      warnings.push(
        `Estimated annual PF penalty: ₹${pfAnalysis.annualPenalty.toLocaleString()}. Capacitor bank installation can typically recover this cost within 1–2 years.`
      );
    }

    // ── Phase 6 warnings ──────────────────────────────────────────────────
    state.gridEmissionFactors.forEach((ef) => {
      const ceaVal = CEA_EMISSION_FACTORS_BY_YEAR[ef.year];
      if (ceaVal && ef.emissionFactorKgCo2PerKwhr > 0) {
        const diffPct = Math.abs(((ef.emissionFactorKgCo2PerKwhr - ceaVal) / ceaVal) * 100);
        if (diffPct > 10) {
          warnings.push(
            `Your entered EF (${ef.emissionFactorKgCo2PerKwhr} kgCO₂/kWh) differs from CEA ${ef.year} value (${ceaVal.toFixed(3)}) by ${diffPct.toFixed(0)}%. Please verify the source.`
          );
        }
      }
      if ((ef.tdLossPercent ?? 0) > 35) {
        warnings.push(
          `T&D loss of ${ef.tdLossPercent}% is unusually high (India avg: 18–22%). Please verify.`
        );
      }
      if ((ef.tdLossPercent ?? 0) > 0 && !ef.emissionFactorKgCo2PerKwhr) {
        warnings.push(
          'T&D loss is set but no emission factor entered — T&D loss will not be applied. Enter the base EF.'
        );
      }
    });
    if (state.gridEmissionFactors.length >= 1) score += 5;

    // ── Phase 9 warnings ──────────────────────────────────────────────────
    state.evChargers.forEach((ev) => {
      if (!ev.interconnectionPoint) {
        warnings.push(
          `EV charger ${ev.evseId || ev.id} has no interconnection point — needed for demand and protection assessment.`
        );
      }
    });

    const totalAnnualDiesel = state.vehicleFuelRecords.reduce((s, v) => {
      return s + (v.annualDieselLitres ?? (v.monthlyDieselLitres ? v.monthlyDieselLitres * 12 : 0));
    }, 0);
    if (totalAnnualDiesel > 50000 && !state.vehicleFuelRecords.some((v) => v.plannedUpgradeDate)) {
      warnings.push(
        `Annual diesel consumption is ${totalAnnualDiesel.toLocaleString()} L/year. No EV upgrade target is set — consider adding an electrification timeline.`
      );
    }

    if (
      state.vehicleFuelRecords.some((v) => v.vehicleType === 'generator_vehicle') &&
      !state.dgSets.length
    ) {
      warnings.push(
        'Vehicle-mounted generators are in fleet records. If they have significant runtime, also consider adding them to Section 2 (DG Sets) for detailed EF tracking.'
      );
    }

    if (state.gridEmissionFactors.length >= 1) score += 5;
    if (state.pumpingExtensions.some((p) => p.monthlyKwhConsumption)) score += 3;
    if (state.evChargers.some((e) => e.monthlyKwhConsumption)) score += 3;
    const vehiclesWithData = state.vehicleFuelRecords.filter(
      (v) =>
        v.annualDieselLitres ||
        v.monthlyDieselLitres ||
        v.annualKeroseneLitres ||
        v.monthlyKeroseneLitres
    );
    if (vehiclesWithData.length >= 2) score += 5;

    if (!warnings.length) score += 30;
    return { warnings, completenessScore: Math.min(score, 100) };
  }, [state, pfAnalysis]);

  const handleValidateAndSubmit = async () => {
    const result = buildValidation();
    dispatch({ type: 'SET_VALIDATION_RESULT', payload: result });
    await save();
    setShowSubmitModal(true);
  };

  const handleSubmit = async () => {
    if (!state.electricalSubmissionId) return;
    try {
      await submissionsApi.submit(state.electricalSubmissionId);
      showToast({ type: 'success', message: 'Electrical data submitted successfully' });
      setShowSubmitModal(false);
      navigate(`/buildings/${buildingId}`);
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (err as any)?.response?.data?.message ?? 'Submission failed';
      showToast({ type: 'error', message: msg });
    }
  };

  // ── Appliance helpers ────────────────────────────────────────────────────
  const appliancesByCategory = useMemo(() => {
    const cats: Record<ApplianceCategory, IAppliance[]> = {
      [ApplianceCategory.LIGHTING]: [],
      [ApplianceCategory.TEMPERATURE_CONTROL]: [],
      [ApplianceCategory.COMPUTING]: [],
      [ApplianceCategory.LAB_EQUIPMENT]: [],
      [ApplianceCategory.MISC]: [],
      [ApplianceCategory.CUSTOM]: [],
    };
    for (const a of state.appliancesData.appliances) {
      cats[a.category].push(a);
    }
    return cats;
  }, [state.appliancesData.appliances]);

  const addCustomAppliance = (category: ApplianceCategory) => {
    const newA: IAppliance = {
      id: `custom-${uid()}`,
      type: `custom-${uid()}`,
      isCustom: true,
      customLabel: '',
      category,
      count: 1,
      wattsEach: 100,
      hoursPerDay: 8,
    };
    dispatch({ type: 'ADD_APPLIANCE', payload: newA });
    setExpandedApplianceIds((prev) => new Set(prev).add(newA.id));
  };

  // ── Efficiency summary ────────────────────────────────────────────────────
  const efficiencySummary = useMemo(() => {
    const cats = [
      ApplianceCategory.LIGHTING,
      ApplianceCategory.TEMPERATURE_CONTROL,
      ApplianceCategory.COMPUTING,
    ];
    return cats.map((cat) => {
      const items = appliancesByCategory[cat].filter((a) => a.count > 0);
      const total = items.reduce((s, a) => s + a.count, 0);
      const eff = items.reduce((s, a) => s + (a.qtyEfficientUnits ?? 0), 0);
      return {
        cat,
        label:
          cat === ApplianceCategory.LIGHTING
            ? 'Lighting'
            : cat === ApplianceCategory.TEMPERATURE_CONTROL
              ? 'Temperature control'
              : 'Computing',
        pct: total > 0 ? Math.round((eff / total) * 100) : null,
      };
    });
  }, [appliancesByCategory]);

  const totalEffPct = useMemo(() => {
    const all = state.appliancesData.appliances.filter((a) => a.count > 0);
    const total = all.reduce((s, a) => s + a.count, 0);
    const eff = all.reduce((s, a) => s + (a.qtyEfficientUnits ?? 0), 0);
    return total > 0 ? Math.round((eff / total) * 100) : null;
  }, [state.appliancesData.appliances]);

  // ── Phase 4: Lighting survey totals ──────────────────────────────────────
  const lightingSurveyTotals = useMemo(
    () => ({
      totalFixtures: state.lightingSurvey.reduce((s, r) => s + r.quantity, 0),
      annualKwhTotal: state.lightingSurvey.reduce((s, r) => {
        return (
          s +
          ((r.quantity * r.wattageEach) / 1000) *
            (r.hoursPerDaySummer * 6 * 30 + r.hoursPerDayWinter * 6 * 30)
        );
      }, 0),
      annualKwhAfterLed: state.lightingSurvey.reduce((s, r) => {
        if (!r.proposedLedWattage || r.proposedLedWattage >= r.wattageEach) return s;
        return (
          s +
          ((r.quantity * r.proposedLedWattage) / 1000) *
            (r.hoursPerDaySummer * 6 * 30 + r.hoursPerDayWinter * 6 * 30)
        );
      }, 0),
    }),
    [state.lightingSurvey]
  );

  // ── Phase 4: Motors & pumps totals ───────────────────────────────────────
  const motorsTotals = useMemo(() => {
    const active = state.motorsPumps.filter((m) => m.duty !== 'standby');
    return {
      totalContinuousKw: active
        .filter((m) => m.duty === 'continuous')
        .reduce((s, m) => s + m.ratedPowerKw, 0),
      annualKwhTotal: active.reduce((s, m) => {
        const eff = IE_CLASS_CORRECTION[m.efficiencyClass] ?? 1.05;
        const days = m.operatingDaysPerYear ?? 365;
        return s + m.ratedPowerKw * eff * m.operatingHoursPerDay * days;
      }, 0),
      vfdSavingsKwh: active
        .filter((m) => m.vfdFeasible)
        .reduce((s, m) => {
          const eff = IE_CLASS_CORRECTION[m.efficiencyClass] ?? 1.05;
          const days = m.operatingDaysPerYear ?? 365;
          const annKwh = m.ratedPowerKw * eff * m.operatingHoursPerDay * days;
          return s + annKwh * ((m.estimatedVfdSavingsPercent ?? 25) / 100);
        }, 0),
    };
  }, [state.motorsPumps]);

  // ── Phase 5: CMD analysis ─────────────────────────────────────────────────
  const cmdAnalysis = useMemo(() => {
    const records = state.cmdVsActual.filter((r) => r.contractedMdKva && r.billedMdKva);
    if (!records.length) return null;
    const utils = records.map((r) => (r.billedMdKva! / r.contractedMdKva) * 100);
    return {
      avgUtilisation: utils.reduce((a, b) => a + b) / utils.length,
      maxBilledMd: Math.max(...records.map((r) => r.billedMdKva ?? 0)),
      monthsExceeding: records.filter((r) => r.billedMdKva! > r.contractedMdKva).length,
      monthsBelow60: records.filter((r) => (r.billedMdKva! / r.contractedMdKva) * 100 < 60).length,
    };
  }, [state.cmdVsActual]);

  // ── Phase 5: PF analysis ──────────────────────────────────────────────────

  // ── DG summary ───────────────────────────────────────────────────────────
  const dgSummary = useMemo(() => {
    const totalKva = state.dgSets.reduce((s, d) => s + (d.capacityKva ?? 0), 0);
    const totalTco2e = state.dgSets.reduce((s, d) => s + calcDgAnnualTco2e(d), 0);
    const fuels = state.dgSets.map((d) => d.fuelType).filter(Boolean);
    const primaryFuel = fuels.length
      ? fuels.sort(
          (a, b) => fuels.filter((f) => f === b).length - fuels.filter((f) => f === a).length
        )[0]
      : null;
    return { totalKva, totalTco2e, primaryFuel, count: state.dgSets.length };
  }, [state.dgSets]);

  // ── Loading state ─────────────────────────────────────────────────────────
  const isLoading = buildingLoading || draftLoading;
  const building = buildingRes?.data;

  if (isLoading) {
    return (
      <PageWrapper title="Electrical data entry">
        <div className="max-w-6xl mx-auto p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageWrapper>
    );
  }

  const CATEGORY_CONFIG: Array<{
    cat: ApplianceCategory;
    label: string;
    icon: React.ReactNode;
  }> = [
    { cat: ApplianceCategory.LIGHTING, label: 'Lighting', icon: <Lightbulb size={16} /> },
    {
      cat: ApplianceCategory.TEMPERATURE_CONTROL,
      label: 'Temperature control',
      icon: <Wind size={16} />,
    },
    { cat: ApplianceCategory.COMPUTING, label: 'Computing & servers', icon: <Cpu size={16} /> },
    { cat: ApplianceCategory.LAB_EQUIPMENT, label: 'Lab equipment', icon: <Activity size={16} /> },
    { cat: ApplianceCategory.MISC, label: 'Miscellaneous', icon: <Settings size={16} /> },
    { cat: ApplianceCategory.CUSTOM, label: 'Custom appliances', icon: <Plus size={16} /> },
  ];

  return (
    <PageWrapper title={`Electrical data — ${building?.name ?? '...'}`}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Electrical data entry</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {building?.name} · {building?.buildingType}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {state.lastSavedAt && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock size={12} />
                Saved {state.lastSavedAt.toLocaleTimeString()}
              </span>
            )}
            {state.isSaving && (
              <span className="text-xs text-blue-500 flex items-center gap-1">
                <Save size={12} className="animate-pulse" />
                Saving…
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={save} disabled={state.isSaving}>
              <Save size={14} /> Save
            </Button>
            <Button size="sm" onClick={handleValidateAndSubmit}>
              <Send size={14} /> Submit section
            </Button>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sticky sidebar */}
          <aside className="w-56 flex-shrink-0 hidden lg:block">
            <div className="sticky top-6 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Sections
              </p>
              {SIDEBAR_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                    state.activeSection === s.id
                      ? 'bg-green-50 text-green-700 font-medium'
                      : 'text-gray-300 hover:bg-white/10'
                  )}
                >
                  {s.icon}
                  {s.label}
                </button>
              ))}

              {/* Live estimates */}
              <div className="mt-6 border-t border-white/10 pt-4 space-y-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Live estimates
                </p>
                <div className="flex justify-between text-xs text-gray-300">
                  <span>Transformer losses</span>
                  <span>{liveEstimates.trLoss.toFixed(2)} t</span>
                </div>
                <div className="flex justify-between text-xs text-gray-300">
                  <span className="flex items-center gap-1">
                    Grid electricity
                    <span className="text-gray-400 italic">
                      {liveEstimates.gridSource === 'bills'
                        ? '(from bills)'
                        : liveEstimates.gridSource === 'manual'
                          ? '(manual)'
                          : '(estimated)'}
                    </span>
                  </span>
                  <span>{liveEstimates.gridTco2e.toFixed(2)} t</span>
                </div>
                {liveEstimates.solarOffset > 0 && (
                  <div className="flex items-start justify-between text-xs text-green-600">
                    <span className="flex-1">
                      Renewable offset
                      <span className="text-green-400 italic ml-1">
                        {liveEstimates.renewableOffsetSource === 'plant_log' && '(plant logs)'}
                        {liveEstimates.renewableOffsetSource === 'ghi_derived' && '(GHI-derived)'}
                        {liveEstimates.renewableOffsetSource === 'capacity_estimate' &&
                          '(capacity est.)'}
                      </span>
                    </span>
                    <span>−{liveEstimates.solarOffset.toFixed(2)} t</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-red-600">
                  <span className="flex items-center gap-1">
                    DG sets (scope 1)
                    <span className="text-red-300 italic">
                      {liveEstimates.dgSource === 'actual'
                        ? '(from records)'
                        : liveEstimates.dgSource === 'average'
                          ? '(monthly avg)'
                          : '(estimated)'}
                    </span>
                  </span>
                  <span>{liveEstimates.dgTotal.toFixed(2)} t</span>
                </div>
                {lightingSurveyTotals.annualKwhTotal > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="italic">incl. lighting survey:</span>
                    <span>
                      {((lightingSurveyTotals.annualKwhTotal * EF_GRID) / 1000).toFixed(1)} tCO₂e
                    </span>
                  </div>
                )}
                {motorsTotals.annualKwhTotal > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="italic">incl. motors/pumps:</span>
                    <span>{((motorsTotals.annualKwhTotal * EF_GRID) / 1000).toFixed(1)} tCO₂e</span>
                  </div>
                )}
                {motorsTotals.vfdSavingsKwh > 0 && (
                  <div className="flex items-center justify-between text-xs text-green-600 border-t border-white/5 pt-1 mt-1">
                    <span>VFD saving potential:</span>
                    <span className="font-medium">
                      −{((motorsTotals.vfdSavingsKwh * EF_GRID) / 1000).toFixed(1)} tCO₂e/yr
                    </span>
                  </div>
                )}
                {state.tariffSchedules[0]?.energyChargePerKwh && liveEstimates.gridTco2e > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Est. annual electricity cost:</span>
                      <span>
                        ₹
                        {(
                          (((liveEstimates.gridTco2e * 1000) / EF_GRID) *
                            state.tariffSchedules[0].energyChargePerKwh) /
                          100000
                        ).toFixed(2)}{' '}
                        L
                      </span>
                    </div>
                  </div>
                )}
                {/* Phase 6: EF source indicator */}
                <div className="text-xs text-gray-400 mt-1">
                  Grid EF: {effectiveGridEf.gross.toFixed(3)} kgCO₂/kWh
                  {effectiveGridEf.source !== 'default' && (
                    <span className="ml-1 text-green-600">✓ user-entered</span>
                  )}
                  {effectiveGridEf.tdLoss > 0 && (
                    <span className="ml-1">(+{effectiveGridEf.tdLoss}% T&D)</span>
                  )}
                </div>

                {/* Phase 9: EV charging */}
                {evChargingTotals.tco2e > 0 && (
                  <div className="flex items-center justify-between text-xs text-amber-700 border-t border-white/5 pt-1 mt-1">
                    <span>EV charging (Scope 2):</span>
                    <span>+{evChargingTotals.tco2e.toFixed(2)} t</span>
                  </div>
                )}

                {/* Phase 9: Vehicle fleet */}
                {vehicleFleetTotals.totalTco2e > 0 && (
                  <div className="flex items-center justify-between text-xs text-red-700 font-medium border-t border-white/5 pt-1 mt-1">
                    <span>Vehicle fleet (Scope 1):</span>
                    <span>+{vehicleFleetTotals.totalTco2e.toFixed(2)} t</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-semibold text-gray-100 border-t border-white/10 pt-1.5 mt-1">
                  <span>Total operational</span>
                  <span>
                    {(
                      liveEstimates.total +
                      evChargingTotals.tco2e +
                      vehicleFleetTotals.totalTco2e
                    ).toFixed(2)}{' '}
                    tCO₂e/yr
                  </span>
                </div>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 space-y-10 min-w-0">
            {/* ─────────────── SECTION 1: ELECTRICAL INFRASTRUCTURE ─────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['infrastructure'] = el;
              }}
              id="infrastructure"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">Electrical infrastructure</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Record the key electrical plant for this building. This data is used to account
                  for transformer losses and power quality.
                </p>
              </div>

              {/* 1A: Transformers */}
              <div className="mb-6">
                <h3 className="text-base font-medium text-gray-100 mb-1">Transformers</h3>
                <p className="text-xs text-gray-400 mb-3">
                  Enter one row per transformer unit serving this building.
                </p>
                <div className="space-y-3">
                  {state.transformers.map((tr) => (
                    <TransformerCard
                      key={tr.id}
                      transformer={tr}
                      isExpanded={state.expandedCards.includes(tr.id)}
                      onToggle={() => dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: tr.id })}
                      onUpdate={(u) =>
                        dispatch({ type: 'UPDATE_TRANSFORMER', payload: { id: tr.id, updates: u } })
                      }
                      onRemove={() => dispatch({ type: 'REMOVE_TRANSFORMER', payload: tr.id })}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newId = uid();
                    dispatch({
                      type: 'ADD_TRANSFORMER',
                      payload: {
                        id: newId,
                        transformerId: '',
                        location: '',
                        ratingKva: 0,
                        fuelType: 'diesel',
                      } as unknown as ITransformer,
                    });
                    dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: newId });
                  }}
                  className="mt-3 flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium"
                >
                  <Plus size={16} /> Add transformer
                </button>
              </div>

              {/* 1B: Switchgear */}
              <div className="mb-6">
                <h3 className="text-base font-medium text-gray-100 mb-1">
                  Switchgear panels (MDB / SDB)
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Main distribution boards and sub-distribution boards serving this building.
                </p>
                <div className="space-y-3">
                  {state.switchgear.map((panel) => (
                    <SwitchgearCard
                      key={panel.id}
                      panel={panel}
                      isExpanded={state.expandedCards.includes(panel.id)}
                      onToggle={() => dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: panel.id })}
                      onUpdate={(u) =>
                        dispatch({
                          type: 'UPDATE_SWITCHGEAR',
                          payload: { id: panel.id, updates: u },
                        })
                      }
                      onRemove={() => dispatch({ type: 'REMOVE_SWITCHGEAR', payload: panel.id })}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newId = uid();
                    dispatch({
                      type: 'ADD_SWITCHGEAR',
                      payload: { id: newId, panelId: '', voltageKv: 0.433 },
                    });
                    dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: newId });
                  }}
                  className="mt-3 flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium"
                >
                  <Plus size={16} /> Add switchgear panel
                </button>
              </div>

              {/* 1C: Capacitor Banks */}
              <div>
                <h3 className="text-base font-medium text-gray-100 mb-1">
                  Capacitor banks (power factor correction)
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Average metered PF is used to cross-check your stated consumption.
                </p>
                <div className="space-y-3">
                  {state.capacitorBanks.map((bank) => (
                    <CapacitorCard
                      key={bank.id}
                      bank={bank}
                      isExpanded={state.expandedCards.includes(bank.id)}
                      onToggle={() => dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: bank.id })}
                      onUpdate={(u) =>
                        dispatch({
                          type: 'UPDATE_CAPACITOR_BANK',
                          payload: { id: bank.id, updates: u },
                        })
                      }
                      onRemove={() => dispatch({ type: 'REMOVE_CAPACITOR_BANK', payload: bank.id })}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newId = uid();
                    dispatch({
                      type: 'ADD_CAPACITOR_BANK',
                      payload: { id: newId, location: '', kvar: 0 },
                    });
                    dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: newId });
                  }}
                  className="mt-3 flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium"
                >
                  <Plus size={16} /> Add capacitor bank
                </button>
              </div>
            </section>

            {/* ─────────────── SECTION 2: DG SETS ─────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['dg-sets'] = el;
              }}
              id="dg-sets"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">DG sets & backup power</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Diesel generators are a significant source of direct carbon emissions (Scope 1).
                  Enter each DG set separately for accurate calculation.
                </p>
              </div>

              <div className="space-y-3">
                {state.dgSets.map((dg) => (
                  <DGSetCard
                    key={dg.id}
                    dg={dg}
                    isExpanded={state.expandedCards.includes(dg.id)}
                    onToggle={() => dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: dg.id })}
                    onUpdate={(u) =>
                      dispatch({ type: 'UPDATE_DG_SET', payload: { id: dg.id, updates: u } })
                    }
                    onRemove={() => dispatch({ type: 'REMOVE_DG_SET', payload: dg.id })}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  const newId = uid();
                  dispatch({
                    type: 'ADD_DG_SET',
                    payload: { id: newId, dgId: '', capacityKva: 0, fuelType: 'diesel' },
                  });
                  dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: newId });
                }}
                className="mt-3 flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium"
              >
                <Plus size={16} /> Add DG set
              </button>

              {/* DG summary */}
              {state.dgSets.length > 0 && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
                  <p className="text-sm font-semibold text-red-800">
                    Total DG capacity: {dgSummary.totalKva} kVA across {dgSummary.count} unit
                    {dgSummary.count !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-red-700">
                    Combined estimated annual emissions: {dgSummary.totalTco2e.toFixed(2)}{' '}
                    tCO₂e/year
                  </p>
                  {dgSummary.primaryFuel && (
                    <p className="text-xs text-red-600">Primary fuel: {dgSummary.primaryFuel}</p>
                  )}
                </div>
              )}
            </section>

            {/* ─────────────── SECTION 3: GRID ENERGY ─────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['grid-energy'] = el;
              }}
              id="grid-energy"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">Grid energy & solar</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Monthly grid consumption and renewable generation for this building.
                </p>
              </div>

              {/* Primary source selection */}
              <div className="mb-5">
                <Label>Primary energy source</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                  {[
                    { value: EnergySource.GRID, label: 'UP Grid', icon: <Zap size={20} /> },
                    { value: EnergySource.SOLAR, label: 'Solar', icon: <Sun size={20} /> },
                    { value: EnergySource.DIESEL, label: 'Diesel', icon: <Flame size={20} /> },
                    { value: EnergySource.MIXED, label: 'Mixed', icon: <Settings size={20} /> },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        dispatch({ type: 'UPDATE_ENERGY', payload: { primarySource: opt.value } })
                      }
                      className={cn(
                        'flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors',
                        state.energyData.primarySource === opt.value
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-white/10 text-gray-200 hover:border-green-300'
                      )}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monthly consumption */}
              <div className="mb-5">
                <Field>
                  <Label>Monthly grid consumption (kWh)</Label>
                  <div className="flex gap-3 items-start">
                    <div className="flex-1">
                      <NumberInput
                        value={state.energyData.monthlyConsumptionKwh}
                        onChange={(v) =>
                          dispatch({ type: 'UPDATE_ENERGY', payload: { monthlyConsumptionKwh: v } })
                        }
                        placeholder="e.g. 45000"
                        min={0}
                      />
                      {state.energyData.monthlyConsumptionKwh && (
                        <p className="text-xs text-green-700 mt-1">
                          ≈{' '}
                          {((state.energyData.monthlyConsumptionKwh * 12 * EF_GRID) / 1000).toFixed(
                            2
                          )}{' '}
                          tCO₂e/year from grid
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Toggle
                        checked={state.energyData.isEstimated}
                        onChange={(v) =>
                          dispatch({ type: 'UPDATE_ENERGY', payload: { isEstimated: v } })
                        }
                      />
                      <span className="text-sm text-gray-300 whitespace-nowrap">
                        I don't know (estimate)
                      </span>
                    </div>
                  </div>
                </Field>
              </div>

              {/* Solar */}
              {(state.energyData.primarySource === EnergySource.SOLAR ||
                state.energyData.primarySource === EnergySource.MIXED) && (
                <div className="mb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field>
                    <Label>Solar plant capacity (kW)</Label>
                    <NumberInput
                      value={state.energyData.solarCapacityKw}
                      onChange={(v) =>
                        dispatch({ type: 'UPDATE_ENERGY', payload: { solarCapacityKw: v } })
                      }
                      placeholder="Installed capacity in kW"
                      min={0}
                    />
                    <Helper>
                      If unknown, engine estimates: capacity × 1200 kWh/kW/year (Varanasi average)
                    </Helper>
                  </Field>
                </div>
              )}

              {/* Custom energy sources */}
              <div>
                <p className="text-sm font-medium text-gray-200 mb-2">Custom energy sources</p>
                {(state.energyData.customEnergySources ?? []).map((src) => (
                  <div key={src.id} className="flex items-center gap-3 mb-2">
                    <TextInput
                      value={src.label}
                      onChange={() => {}}
                      placeholder="Source label"
                      className="flex-1"
                    />
                    <NumberInput
                      value={src.value}
                      onChange={() => {}}
                      placeholder="Value"
                      className="w-32"
                    />
                    <TextInput
                      value={src.unit ?? ''}
                      onChange={() => {}}
                      placeholder="Unit"
                      className="w-24"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({ type: 'REMOVE_CUSTOM_ENERGY_SOURCE', payload: src.id })
                      }
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'ADD_CUSTOM_ENERGY_SOURCE',
                      payload: { id: uid(), label: '', value: 0 },
                    })
                  }
                  className="flex items-center gap-1 text-sm text-green-700 hover:text-green-800"
                >
                  <Plus size={14} /> Add custom energy source
                </button>
              </div>
            </section>

            {/* ─────────────── SECTION 4: APPLIANCES ─────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['appliances'] = el;
              }}
              id="appliances"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">Appliances & equipment</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Record all electrical appliances by category. Use the efficiency split fields to
                  track the mix of efficient vs non-efficient units.
                </p>
              </div>

              {CATEGORY_CONFIG.map(({ cat, label, icon }) => {
                const items = appliancesByCategory[cat];
                const activeCount = items.filter((a) => a.count > 0).length;
                return (
                  <div key={cat} className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-gray-400">{icon}</span>
                      <h3 className="text-base font-medium text-gray-100">{label}</h3>
                      {activeCount > 0 && <Badge variant="info">{activeCount} active</Badge>}
                    </div>
                    <div className="space-y-2 bg-white/5 rounded-xl p-3">
                      {items.map((a) => (
                        <ApplianceRow
                          key={a.id}
                          appliance={a}
                          isExpanded={expandedApplianceIds.has(a.id)}
                          onToggle={() => {
                            setExpandedApplianceIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(a.id)) next.delete(a.id);
                              else next.add(a.id);
                              return next;
                            });
                          }}
                          onUpdate={(u) =>
                            dispatch({
                              type: 'UPDATE_APPLIANCE',
                              payload: { id: a.id, updates: u },
                            })
                          }
                          onRemove={() => dispatch({ type: 'REMOVE_APPLIANCE', payload: a.id })}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => addCustomAppliance(cat)}
                        className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800 font-medium mt-1"
                      >
                        <Plus size={13} /> Add custom {label.toLowerCase()} equipment
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* ── LIGHTING AUDIT (Phase 4.1) ── */}
              <div className="mb-6 border border-amber-200 rounded-xl overflow-hidden">
                <div className="bg-amber-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-amber-900">
                        Detailed lighting survey
                      </h3>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Record each fixture type per area. Summer/winter hours improve carbon
                        calculation accuracy. Proposed LED specs show savings potential.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'TOGGLE_LIGHTING_AUDIT' })}
                      className="flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-900 font-medium"
                    >
                      <ChevronDown
                        size={14}
                        className={cn(
                          'transition-transform',
                          state.showLightingAudit ? 'rotate-180' : ''
                        )}
                      />
                      {state.showLightingAudit ? 'Hide survey' : 'Show survey'}
                    </button>
                  </div>
                  {!state.showLightingAudit && state.lightingSurvey.length > 0 && (
                    <p className="text-xs text-amber-600 mt-2">
                      {state.lightingSurvey.length} fixture type(s) surveyed ·{' '}
                      {lightingSurveyTotals.totalFixtures} total fixtures ·{' '}
                      {lightingSurveyTotals.annualKwhTotal.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}{' '}
                      kWh/yr
                    </p>
                  )}
                </div>

                {state.showLightingAudit && (
                  <div className="px-4 pb-4 bg-black/40 backdrop-blur-md">
                    {/* Info box */}
                    <div className="mt-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                      <Info size={12} className="inline mr-1" />
                      The counts here are in addition to the building-level lighting totals above.
                      If you fill this survey, the carbon engine uses these seasonal figures instead
                      of the single hours/day from the appliance section.
                    </div>

                    {/* Table */}
                    {state.lightingSurvey.length > 0 && (
                      <div className="overflow-x-auto mb-3">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-white/5 text-gray-400 uppercase text-[10px] tracking-wide">
                              <th className="px-2 py-1.5 text-left font-medium">Area / Location</th>
                              <th className="px-2 py-1.5 text-left font-medium">Fixture Type</th>
                              <th className="px-2 py-1.5 text-center font-medium">Qty</th>
                              <th className="px-2 py-1.5 text-center font-medium">Watts</th>
                              <th className="px-2 py-1.5 text-center font-medium">Summer h/day</th>
                              <th className="px-2 py-1.5 text-center font-medium">Winter h/day</th>
                              <th className="px-2 py-1.5 text-left font-medium">Control</th>
                              <th className="px-2 py-1.5 text-left font-medium">LED Spec</th>
                              <th className="px-2 py-1.5 text-center font-medium">kWh/yr</th>
                              <th className="px-2 py-1.5 text-center font-medium">Savings</th>
                              <th className="px-2 py-1.5 text-center font-medium"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {state.lightingSurvey.map((row) => {
                              const annKwh =
                                ((row.quantity * row.wattageEach) / 1000) *
                                (row.hoursPerDaySummer * 6 * 30 + row.hoursPerDayWinter * 6 * 30);
                              const annKwhLed =
                                row.proposedLedWattage && row.proposedLedWattage < row.wattageEach
                                  ? ((row.quantity * row.proposedLedWattage) / 1000) *
                                    (row.hoursPerDaySummer * 6 * 30 +
                                      row.hoursPerDayWinter * 6 * 30)
                                  : null;
                              const savingsPct =
                                annKwhLed !== null && annKwh > 0
                                  ? Math.round((1 - annKwhLed / annKwh) * 100)
                                  : null;
                              return (
                                <tr key={row.id} className="hover:bg-white/5">
                                  <td className="px-2 py-1">
                                    <input
                                      type="text"
                                      value={row.buildingArea}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_LIGHTING_SURVEY',
                                          payload: {
                                            id: row.id,
                                            updates: { buildingArea: e.target.value },
                                          },
                                        })
                                      }
                                      placeholder="Lab 101"
                                      className="w-28 rounded border border-white/10 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <select
                                      value={row.fixtureType}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_LIGHTING_SURVEY',
                                          payload: {
                                            id: row.id,
                                            updates: {
                                              fixtureType: e.target.value as LightingFixtureType,
                                            },
                                          },
                                        })
                                      }
                                      className="w-36 rounded border border-white/10 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                                    >
                                      {Object.entries(LIGHTING_FIXTURE_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>
                                          {v}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1">
                                    <input
                                      type="number"
                                      value={row.quantity}
                                      min={1}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_LIGHTING_SURVEY',
                                          payload: {
                                            id: row.id,
                                            updates: { quantity: parseInt(e.target.value) || 0 },
                                          },
                                        })
                                      }
                                      className="w-14 rounded border border-white/10 px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <input
                                      type="number"
                                      value={row.wattageEach}
                                      min={1}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_LIGHTING_SURVEY',
                                          payload: {
                                            id: row.id,
                                            updates: {
                                              wattageEach: parseFloat(e.target.value) || 0,
                                            },
                                          },
                                        })
                                      }
                                      className="w-16 rounded border border-white/10 px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <input
                                      type="number"
                                      value={row.hoursPerDaySummer}
                                      min={0}
                                      max={24}
                                      step={0.5}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_LIGHTING_SURVEY',
                                          payload: {
                                            id: row.id,
                                            updates: {
                                              hoursPerDaySummer: parseFloat(e.target.value) || 0,
                                            },
                                          },
                                        })
                                      }
                                      className="w-16 rounded border border-white/10 px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <input
                                      type="number"
                                      value={row.hoursPerDayWinter}
                                      min={0}
                                      max={24}
                                      step={0.5}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_LIGHTING_SURVEY',
                                          payload: {
                                            id: row.id,
                                            updates: {
                                              hoursPerDayWinter: parseFloat(e.target.value) || 0,
                                            },
                                          },
                                        })
                                      }
                                      className="w-16 rounded border border-white/10 px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <select
                                      value={row.controlType}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_LIGHTING_SURVEY',
                                          payload: {
                                            id: row.id,
                                            updates: {
                                              controlType: e.target.value as LightingControlType,
                                            },
                                          },
                                        })
                                      }
                                      className="w-32 rounded border border-white/10 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                                    >
                                      {Object.entries(LIGHTING_CONTROL_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>
                                          {v}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1">
                                    <input
                                      type="text"
                                      value={row.proposedLedSpec ?? ''}
                                      onChange={(e) =>
                                        dispatch({
                                          type: 'UPDATE_LIGHTING_SURVEY',
                                          payload: {
                                            id: row.id,
                                            updates: {
                                              proposedLedSpec: e.target.value,
                                              proposedLedWattage:
                                                parseFloat(
                                                  e.target.value.match(/\d+/)?.[0] ?? ''
                                                ) || undefined,
                                            },
                                          },
                                        })
                                      }
                                      placeholder="18W LED tube"
                                      className="w-28 rounded border border-white/10 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-center text-gray-400">
                                    {annKwh > 0
                                      ? annKwh.toLocaleString(undefined, {
                                          maximumFractionDigits: 0,
                                        })
                                      : '—'}
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    {savingsPct !== null && (
                                      <span className="text-green-700 font-medium">
                                        −{savingsPct}%
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        dispatch({
                                          type: 'REMOVE_LIGHTING_SURVEY',
                                          payload: row.id,
                                        })
                                      }
                                      className="text-red-400 hover:text-red-600"
                                    >
                                      <X size={13} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'ADD_LIGHTING_SURVEY',
                          payload: {
                            id: uid(),
                            buildingArea: '',
                            fixtureType: 'led_tube',
                            quantity: 1,
                            wattageEach: 18,
                            hoursPerDaySummer: 10,
                            hoursPerDayWinter: 8,
                            controlType: 'manual_switch',
                          },
                        })
                      }
                      className="flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium"
                    >
                      <Plus size={14} /> Add fixture type
                    </button>

                    {/* Audit summary */}
                    {lightingSurveyTotals.totalFixtures > 0 && (
                      <div className="mt-4 bg-amber-50 rounded-xl p-4 text-sm text-amber-900 space-y-1">
                        <p className="font-medium">Lighting survey summary</p>
                        <p>Total fixtures surveyed: {lightingSurveyTotals.totalFixtures} units</p>
                        <p>
                          Annual lighting energy:{' '}
                          {lightingSurveyTotals.annualKwhTotal.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}{' '}
                          kWh/year (seasonal)
                        </p>
                        <p>
                          Current lighting carbon:{' '}
                          {((lightingSurveyTotals.annualKwhTotal * EF_GRID) / 1000).toFixed(2)}{' '}
                          tCO₂e/year
                        </p>
                        {lightingSurveyTotals.annualKwhAfterLed > 0 &&
                          lightingSurveyTotals.annualKwhAfterLed <
                            lightingSurveyTotals.annualKwhTotal && (
                            <p className="text-green-700 font-medium">
                              After full LED upgrade: −
                              {(
                                lightingSurveyTotals.annualKwhTotal -
                                lightingSurveyTotals.annualKwhAfterLed
                              ).toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                              kWh/yr savings · −
                              {(
                                ((lightingSurveyTotals.annualKwhTotal -
                                  lightingSurveyTotals.annualKwhAfterLed) *
                                  EF_GRID) /
                                1000
                              ).toFixed(2)}{' '}
                              tCO₂e/yr ·{' '}
                              {Math.round(
                                (1 -
                                  lightingSurveyTotals.annualKwhAfterLed /
                                    lightingSurveyTotals.annualKwhTotal) *
                                  100
                              )}
                              % reduction
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── MOTORS & PUMPS (Phase 4.2) ── */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <Settings size={16} className="text-gray-400" />
                  <h3 className="text-base font-medium text-gray-100">
                    Motors, pumps & mechanical equipment
                  </h3>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Record significant rotating equipment — water pumps, HVAC fans, air compressors,
                  lifts. IE efficiency class and VFD feasibility are used to estimate energy savings
                  opportunities.
                </p>

                {state.motorsPumps.map((motor) => {
                  const isExpanded = state.expandedCards.includes(motor.id);
                  const ieCorr = IE_CLASS_CORRECTION[motor.efficiencyClass] ?? 1.05;
                  const annKwh =
                    motor.duty !== 'standby'
                      ? motor.ratedPowerKw *
                        ieCorr *
                        motor.operatingHoursPerDay *
                        (motor.operatingDaysPerYear ?? 365)
                      : 0;
                  const vfdSavingsKwh =
                    motor.vfdFeasible && motor.estimatedVfdSavingsPercent
                      ? annKwh * (motor.estimatedVfdSavingsPercent / 100)
                      : 0;
                  const dutyColors: Record<string, string> = {
                    continuous: 'bg-red-100 text-red-700',
                    primary: 'bg-orange-100 text-orange-700',
                    intermittent: 'bg-amber-100 text-amber-700',
                    standby: 'bg-white/10 text-gray-300',
                  };
                  const ieCorrPct = Math.round((ieCorr - 1) * 100);
                  return (
                    <div
                      key={motor.id}
                      className="border border-white/10 rounded-xl overflow-hidden bg-black/40 backdrop-blur-md mb-3"
                    >
                      {/* Collapsed header */}
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: motor.id })}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                      >
                        <span className="font-medium text-white text-sm min-w-[100px]">
                          {motor.equipmentId || 'New equipment'}
                        </span>
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            dutyColors[motor.duty] ?? 'bg-white/10 text-gray-300'
                          )}
                        >
                          {MOTOR_DUTY_LABELS[motor.duty]?.split(' ')[0] ?? motor.duty}
                        </span>
                        <span className="text-xs text-gray-400">
                          {motor.ratedPowerKw} kW · {motor.efficiencyClass}
                        </span>
                        {motor.duty !== 'standby' && annKwh > 0 && (
                          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ml-auto">
                            {annKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh/yr
                          </span>
                        )}
                        {motor.duty === 'standby' && (
                          <span className="text-xs text-gray-400 ml-auto italic">
                            Excluded from estimates
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'REMOVE_MOTOR_PUMP', payload: motor.id });
                          }}
                          className="text-red-400 hover:text-red-600 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                        {isExpanded ? (
                          <ChevronDown size={16} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={16} className="text-gray-400" />
                        )}
                      </button>

                      {/* Expanded form */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-white/5 bg-white/5 space-y-4 mt-0 pt-4">
                          {/* Group A — Identity */}
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                              Identity & rating
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field>
                                <Label required>Equipment ID</Label>
                                <TextInput
                                  value={motor.equipmentId}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_MOTOR_PUMP',
                                      payload: { id: motor.id, updates: { equipmentId: v } },
                                    })
                                  }
                                  placeholder="PUMP-01, AHU-Lab-1, COMPRESSOR-HVAC"
                                />
                              </Field>
                              <Field>
                                <Label>Description</Label>
                                <TextInput
                                  value={motor.equipmentDescription ?? ''}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_MOTOR_PUMP',
                                      payload: {
                                        id: motor.id,
                                        updates: { equipmentDescription: v },
                                      },
                                    })
                                  }
                                  placeholder="Domestic water pump, Cooling tower fan"
                                  maxLength={150}
                                />
                              </Field>
                              <Field>
                                <Label required>Duty</Label>
                                <select
                                  value={motor.duty}
                                  onChange={(e) => {
                                    const duty = e.target.value as MotorDuty;
                                    const prefillHours: Record<string, number> = {
                                      continuous: 24,
                                      primary: 12,
                                      intermittent: 8,
                                      standby: 0,
                                    };
                                    const prefillDays: Record<string, number> = {
                                      continuous: 365,
                                      primary: 365,
                                      intermittent: 250,
                                      standby: 0,
                                    };
                                    dispatch({
                                      type: 'UPDATE_MOTOR_PUMP',
                                      payload: {
                                        id: motor.id,
                                        updates: {
                                          duty,
                                          operatingHoursPerDay: prefillHours[duty] ?? 8,
                                          operatingDaysPerYear: prefillDays[duty] ?? 250,
                                        },
                                      },
                                    });
                                  }}
                                  className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                >
                                  {Object.entries(MOTOR_DUTY_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>
                                      {v}
                                    </option>
                                  ))}
                                </select>
                                {motor.duty === 'standby' && (
                                  <Helper>
                                    Standby equipment is excluded from energy estimates
                                  </Helper>
                                )}
                              </Field>
                              <Field>
                                <Label required>Rated power (kW)</Label>
                                <NumberInput
                                  value={motor.ratedPowerKw}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_MOTOR_PUMP',
                                      payload: { id: motor.id, updates: { ratedPowerKw: v ?? 0 } },
                                    })
                                  }
                                  min={0}
                                  step={0.1}
                                />
                                <Helper>Nameplate rated power in kW</Helper>
                              </Field>
                              <Field>
                                <Label>IEC efficiency class</Label>
                                <div className="flex gap-2 flex-wrap">
                                  {(
                                    ['IE1', 'IE2', 'IE3', 'IE4', 'unknown'] as IEEfficiencyClass[]
                                  ).map((cls) => (
                                    <button
                                      key={cls}
                                      type="button"
                                      onClick={() =>
                                        dispatch({
                                          type: 'UPDATE_MOTOR_PUMP',
                                          payload: {
                                            id: motor.id,
                                            updates: { efficiencyClass: cls },
                                          },
                                        })
                                      }
                                      className={cn(
                                        'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                                        motor.efficiencyClass === cls
                                          ? 'bg-green-600 text-white border-green-600'
                                          : 'bg-black/40 backdrop-blur-md text-gray-200 border-white/20 hover:border-green-400'
                                      )}
                                    >
                                      {cls}
                                    </button>
                                  ))}
                                </div>
                                {motor.efficiencyClass && (
                                  <Helper>
                                    Correction factor: {ieCorrPct >= 0 ? '+' : ''}
                                    {ieCorrPct}% to nameplate consumption
                                  </Helper>
                                )}
                              </Field>
                            </div>
                          </div>

                          {/* Group B — Operation */}
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                              Operation
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field>
                                <Label>Operating hours/day</Label>
                                <NumberInput
                                  value={motor.operatingHoursPerDay}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_MOTOR_PUMP',
                                      payload: {
                                        id: motor.id,
                                        updates: { operatingHoursPerDay: v ?? 0 },
                                      },
                                    })
                                  }
                                  min={0}
                                  max={24}
                                  step={0.5}
                                />
                              </Field>
                              <Field>
                                <Label>Operating days/year</Label>
                                <NumberInput
                                  value={motor.operatingDaysPerYear}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_MOTOR_PUMP',
                                      payload: {
                                        id: motor.id,
                                        updates: { operatingDaysPerYear: v },
                                      },
                                    })
                                  }
                                  min={0}
                                  max={365}
                                />
                                <Helper>
                                  Reduce for seasonal equipment (e.g. cooling pumps: 180 days)
                                </Helper>
                              </Field>
                              {/* Pump-specific */}
                              {(motor.equipmentId.toLowerCase().includes('pump') ||
                                motor.equipmentId.toLowerCase().includes('fan') ||
                                motor.equipmentId.toLowerCase().includes('ahu') ||
                                (motor.equipmentDescription ?? '').toLowerCase().includes('pump') ||
                                (motor.equipmentDescription ?? '')
                                  .toLowerCase()
                                  .includes('fan')) && (
                                <>
                                  <Field>
                                    <Label>Process flow (m³/h)</Label>
                                    <NumberInput
                                      value={motor.processFlowM3H}
                                      onChange={(v) =>
                                        dispatch({
                                          type: 'UPDATE_MOTOR_PUMP',
                                          payload: { id: motor.id, updates: { processFlowM3H: v } },
                                        })
                                      }
                                      min={0}
                                      step={0.1}
                                    />
                                    <Helper>Volume flow rate of the pump or fan</Helper>
                                  </Field>
                                  <Field>
                                    <Label>Head / pressure (m)</Label>
                                    <NumberInput
                                      value={motor.headM}
                                      onChange={(v) =>
                                        dispatch({
                                          type: 'UPDATE_MOTOR_PUMP',
                                          payload: { id: motor.id, updates: { headM: v } },
                                        })
                                      }
                                      min={0}
                                      step={0.1}
                                    />
                                    <Helper>
                                      Total head for pumps, or pressure drop in equivalent metres
                                    </Helper>
                                  </Field>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Group C — Control & upgrade */}
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                              Control & upgrade
                            </p>
                            <Field className="mb-3">
                              <Label>Existing control</Label>
                              <div className="flex flex-wrap gap-2">
                                {(
                                  [
                                    ['dol', 'DOL'],
                                    ['star_delta', 'Star-Delta'],
                                    ['vfd', 'VFD (fitted)'],
                                    ['soft_starter', 'Soft Starter'],
                                    ['none', 'None'],
                                    ['other', 'Other'],
                                  ] as [MotorControlType, string][]
                                ).map(([k, v]) => (
                                  <button
                                    key={k}
                                    type="button"
                                    onClick={() =>
                                      dispatch({
                                        type: 'UPDATE_MOTOR_PUMP',
                                        payload: { id: motor.id, updates: { existingControl: k } },
                                      })
                                    }
                                    className={cn(
                                      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                                      motor.existingControl === k
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-black/40 backdrop-blur-md text-gray-200 border-white/20 hover:border-blue-400'
                                    )}
                                  >
                                    {v}
                                  </button>
                                ))}
                              </div>
                            </Field>
                            {motor.existingControl !== 'vfd' && (
                              <div className="mb-3">
                                <div className="flex items-center gap-3">
                                  <Label>VFD feasible?</Label>
                                  <Toggle
                                    checked={motor.vfdFeasible ?? false}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_MOTOR_PUMP',
                                        payload: { id: motor.id, updates: { vfdFeasible: v } },
                                      })
                                    }
                                  />
                                </div>
                                <Helper>
                                  Variable Frequency Drives typically save 20–40% for variable-load
                                  equipment
                                </Helper>
                                {motor.vfdFeasible && (
                                  <div className="mt-2">
                                    <Field>
                                      <Label>Estimated VFD savings (%)</Label>
                                      <NumberInput
                                        value={motor.estimatedVfdSavingsPercent ?? 25}
                                        onChange={(v) =>
                                          dispatch({
                                            type: 'UPDATE_MOTOR_PUMP',
                                            payload: {
                                              id: motor.id,
                                              updates: { estimatedVfdSavingsPercent: v },
                                            },
                                          })
                                        }
                                        min={10}
                                        max={50}
                                        step={5}
                                      />
                                    </Field>
                                    {vfdSavingsKwh > 0 && (
                                      <p className="text-xs text-green-700 mt-1">
                                        Savings:{' '}
                                        {vfdSavingsKwh.toLocaleString(undefined, {
                                          maximumFractionDigits: 0,
                                        })}{' '}
                                        kWh/year = {((vfdSavingsKwh * EF_GRID) / 1000).toFixed(2)}{' '}
                                        tCO₂e/year
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            <Field>
                              <Label>Remarks</Label>
                              <TextInput
                                value={motor.remarks ?? ''}
                                onChange={(v) =>
                                  dispatch({
                                    type: 'UPDATE_MOTOR_PUMP',
                                    payload: { id: motor.id, updates: { remarks: v } },
                                  })
                                }
                                maxLength={200}
                              />
                            </Field>
                          </div>

                          {/* Live energy estimate */}
                          {motor.duty !== 'standby' && annKwh > 0 && (
                            <div className="bg-white/10 rounded-lg p-3 text-xs text-gray-200 space-y-0.5">
                              <p className="font-medium">Estimated annual consumption</p>
                              <p>
                                {annKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                                kWh/year · {((annKwh * EF_GRID) / 1000).toFixed(2)} tCO₂e/year
                              </p>
                              {vfdSavingsKwh > 0 && (
                                <p className="text-green-700">
                                  With VFD: −
                                  {vfdSavingsKwh.toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                  })}{' '}
                                  kWh/year →{' '}
                                  {(((annKwh - vfdSavingsKwh) * EF_GRID) / 1000).toFixed(2)}{' '}
                                  tCO₂e/year
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    const newM: IMotorPumpRecord = {
                      id: uid(),
                      equipmentId: '',
                      duty: 'intermittent',
                      ratedPowerKw: 0,
                      efficiencyClass: 'IE3',
                      operatingHoursPerDay: 8,
                      operatingDaysPerYear: 250,
                      existingControl: 'dol',
                    };
                    dispatch({ type: 'ADD_MOTOR_PUMP', payload: newM });
                    dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: newM.id });
                  }}
                  className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800 font-medium mt-2"
                >
                  <Plus size={14} /> Add motor / pump
                </button>

                {/* Motors summary */}
                {state.motorsPumps.filter((m) => m.duty !== 'standby').length > 0 && (
                  <div className="mt-4 bg-white/5 rounded-xl p-4 text-sm">
                    <p className="font-medium text-gray-100 mb-2">Equipment summary</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 text-[10px] uppercase">
                            <th className="text-left py-1">Equipment</th>
                            <th className="text-left py-1">Duty</th>
                            <th className="text-right py-1">kW</th>
                            <th className="text-center py-1">IE Class</th>
                            <th className="text-right py-1">kWh/yr</th>
                            <th className="text-right py-1">tCO₂e/yr</th>
                            <th className="text-center py-1">VFD</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {state.motorsPumps.map((m) => {
                            const corr = IE_CLASS_CORRECTION[m.efficiencyClass] ?? 1.05;
                            const kwh =
                              m.duty !== 'standby'
                                ? m.ratedPowerKw *
                                  corr *
                                  m.operatingHoursPerDay *
                                  (m.operatingDaysPerYear ?? 365)
                                : 0;
                            return (
                              <tr key={m.id}>
                                <td className="py-1 text-gray-100">{m.equipmentId || '—'}</td>
                                <td className="py-1 text-gray-400">{m.duty}</td>
                                <td className="py-1 text-right">{m.ratedPowerKw}</td>
                                <td className="py-1 text-center">{m.efficiencyClass}</td>
                                <td className="py-1 text-right">
                                  {kwh > 0
                                    ? kwh.toLocaleString(undefined, { maximumFractionDigits: 0 })
                                    : '—'}
                                </td>
                                <td className="py-1 text-right">
                                  {kwh > 0 ? ((kwh * EF_GRID) / 1000).toFixed(2) : '—'}
                                </td>
                                <td className="py-1 text-center">{m.vfdFeasible ? '✓' : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="font-medium text-gray-200 border-t border-white/10">
                            <td className="pt-1.5" colSpan={2}>
                              Totals
                            </td>
                            <td className="pt-1.5 text-right">
                              {motorsTotals.totalContinuousKw.toFixed(1)}
                            </td>
                            <td></td>
                            <td className="pt-1.5 text-right">
                              {motorsTotals.annualKwhTotal.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}
                            </td>
                            <td className="pt-1.5 text-right">
                              {((motorsTotals.annualKwhTotal * EF_GRID) / 1000).toFixed(2)}
                            </td>
                            <td></td>
                          </tr>
                          {motorsTotals.vfdSavingsKwh > 0 && (
                            <tr className="text-green-700 text-xs">
                              <td colSpan={4} className="pt-1">
                                VFD upgrade potential:
                              </td>
                              <td className="pt-1 text-right">
                                −
                                {motorsTotals.vfdSavingsKwh.toLocaleString(undefined, {
                                  maximumFractionDigits: 0,
                                })}
                              </td>
                              <td className="pt-1 text-right">
                                −{((motorsTotals.vfdSavingsKwh * EF_GRID) / 1000).toFixed(2)}
                              </td>
                              <td></td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Efficiency summary */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-amber-800 mb-2">
                  Campus efficiency snapshot for this building
                </p>
                <div className="flex flex-wrap gap-4">
                  {efficiencySummary.map(({ cat, label, pct }) => (
                    <div key={cat} className="text-xs text-amber-700">
                      {label}: {pct !== null ? `${pct}%` : 'no data'}
                    </div>
                  ))}
                </div>
                {totalEffPct !== null && (
                  <p className="text-xs text-amber-700 mt-2">
                    {totalEffPct}% of all appliances are energy efficient
                  </p>
                )}
                {efficiencySummary.some((e) => e.pct !== null && e.pct < 50) && (
                  <p className="text-xs text-amber-800 font-medium mt-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Significant non-efficient appliances detected in one
                    or more categories
                  </p>
                )}
              </div>
            </section>

            {/* ─────────────── SECTION 5: DEMAND PROJECTIONS ─────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['projections'] = el;
              }}
              id="projections"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Demand projections & planning
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  This planning data is not used in the current carbon calculation but is essential
                  for campus energy planning and future scenario modelling. Fill what is known.
                </p>
              </div>

              {/* Sticky column headers */}
              <div className="sticky top-0 z-10 bg-black/40 backdrop-blur-md border-b border-white/10 mb-3">
                <div className="grid grid-cols-[minmax(180px,1fr)_repeat(5,80px)] gap-1 py-2 px-2 text-xs font-semibold text-gray-400">
                  <span>Question</span>
                  {PROJECTION_HORIZONS.map((h) => (
                    <span key={h.key} className="text-center">
                      {h.label}
                    </span>
                  ))}
                </div>
              </div>

              {PROJECTION_GROUPS.map((group, gi) => {
                const isGroupOpen = expandedProjectionGroups.has(gi);
                return (
                  <div key={gi} className="mb-4 border border-white/10 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedProjectionGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(gi)) next.delete(gi);
                          else next.add(gi);
                          return next;
                        })
                      }
                      className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 text-sm font-medium text-gray-100"
                    >
                      {group.title}
                      {isGroupOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    {isGroupOpen && (
                      <div className="divide-y divide-gray-100">
                        {group.questions.map((q) => {
                          const horizons = (state.projectionsData[q.key] ??
                            {}) as IProjectionHorizons;
                          return (
                            <div
                              key={q.key as string}
                              className="grid grid-cols-[minmax(180px,1fr)_repeat(5,80px)] gap-1 px-2 py-2 items-center"
                            >
                              <span className="text-xs text-gray-200 pr-2">
                                {q.label}
                                {q.unit && <span className="ml-1 text-gray-400">({q.unit})</span>}
                              </span>
                              {PROJECTION_HORIZONS.map((h) => {
                                const cell = horizons[h.key] ?? {};
                                return (
                                  <div key={h.key} className="flex flex-col gap-0.5">
                                    {q.type === 'yesno' ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          dispatch({
                                            type: 'UPDATE_PROJECTION',
                                            payload: {
                                              question: q.key,
                                              horizon: h.key,
                                              value: { data: cell.data === 'Yes' ? 'No' : 'Yes' },
                                            },
                                          })
                                        }
                                        className={cn(
                                          'text-xs px-1.5 py-1 rounded border w-full text-center',
                                          cell.data === 'Yes'
                                            ? 'bg-green-100 text-green-700 border-green-300'
                                            : 'bg-white/10 text-gray-400 border-white/10'
                                        )}
                                      >
                                        {cell.data ?? '—'}
                                      </button>
                                    ) : (
                                      <input
                                        type={q.type === 'number' ? 'number' : 'text'}
                                        value={cell.data ?? ''}
                                        onChange={(e) =>
                                          dispatch({
                                            type: 'UPDATE_PROJECTION',
                                            payload: {
                                              question: q.key,
                                              horizon: h.key,
                                              value: {
                                                data:
                                                  q.type === 'number'
                                                    ? e.target.value === ''
                                                      ? undefined
                                                      : parseFloat(e.target.value)
                                                    : e.target.value,
                                              },
                                            },
                                          })
                                        }
                                        className="w-full text-xs border border-white/10 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-green-400"
                                        placeholder="—"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Q23 Other details */}
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-100 mb-2">Additional information</h3>
                <textarea
                  value={state.projectionsData.q23OtherDetails ?? ''}
                  onChange={(e) =>
                    dispatch({ type: 'UPDATE_PROJECTION_TEXT', payload: { value: e.target.value } })
                  }
                  rows={4}
                  maxLength={1000}
                  placeholder="Any other details that can help in minimising consumption and carbon emissions..."
                  className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                />
              </div>
            </section>

            {/* ─────────────── SECTION 6: OPERATIONAL DATA ─────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['operational'] = el;
              }}
              id="operational"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">Operational data</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Actual metered data improves carbon accuracy significantly. Utility bills override
                  manual estimates; load profile and DG generation records are used for detailed
                  analysis.
                </p>
              </div>

              {/* 6A: Utility Bills */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                  <FileText size={18} className="text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-gray-100">Utility bills</h3>
                    <p className="text-xs text-gray-400">
                      Monthly electricity bills from the utility provider
                    </p>
                  </div>
                  <div className="ml-auto text-xs text-gray-400">
                    {state.operationalData.utilityBills.length} bill
                    {state.operationalData.utilityBills.length !== 1 ? 's' : ''} entered
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  {/* Bill entry form */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Consumer number
                      </label>
                      <input
                        type="text"
                        value={newBillDraft.consumerNumber ?? ''}
                        onChange={(e) =>
                          setNewBillDraft((d) => ({ ...d, consumerNumber: e.target.value }))
                        }
                        className="w-full rounded border border-white/20 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="e.g. IIT-MAIN-001"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Month (YYYY-MM)
                      </label>
                      <input
                        type="month"
                        value={newBillDraft.month ?? ''}
                        onChange={(e) => {
                          const val = e.target.value; // YYYY-MM
                          const [y, m] = val.split('-').map(Number);
                          setNewBillDraft((d) => ({ ...d, month: val, year: y, monthIndex: m }));
                        }}
                        className="w-full rounded border border-white/20 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Units consumed (kWh)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={newBillDraft.unitConsumedKwhr ?? ''}
                        onChange={(e) =>
                          setNewBillDraft((d) => ({
                            ...d,
                            unitConsumedKwhr: Number(e.target.value),
                          }))
                        }
                        className="w-full rounded border border-white/20 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="kWh"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Solar generated (kWh)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={newBillDraft.solarUnitGeneratedKwhr ?? ''}
                        onChange={(e) =>
                          setNewBillDraft((d) => ({
                            ...d,
                            solarUnitGeneratedKwhr: Number(e.target.value),
                          }))
                        }
                        className="w-full rounded border border-white/20 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="kWh (optional)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Max demand (kW)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={newBillDraft.maxDemandKw ?? ''}
                        onChange={(e) =>
                          setNewBillDraft((d) => ({ ...d, maxDemandKw: Number(e.target.value) }))
                        }
                        className="w-full rounded border border-white/20 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="kW (optional)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Power factor
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={newBillDraft.powerFactor ?? ''}
                        onChange={(e) =>
                          setNewBillDraft((d) => ({ ...d, powerFactor: Number(e.target.value) }))
                        }
                        className="w-full rounded border border-white/20 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="0.00–1.00 (optional)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Total bill (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={newBillDraft.totalEnergyChargesRs ?? ''}
                        onChange={(e) =>
                          setNewBillDraft((d) => ({
                            ...d,
                            totalEnergyChargesRs: Number(e.target.value),
                          }))
                        }
                        className="w-full rounded border border-white/20 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="₹ (optional)"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (!newBillDraft.consumerNumber || !newBillDraft.month) return;
                          const bill: IUtilityBillRecord = {
                            id: uid(),
                            consumerNumber: newBillDraft.consumerNumber,
                            month: newBillDraft.month,
                            monthIndex: newBillDraft.monthIndex ?? 1,
                            year: newBillDraft.year ?? new Date().getFullYear(),
                            ...newBillDraft,
                          };
                          dispatch({ type: 'ADD_UTILITY_BILL', payload: bill });
                          setNewBillDraft({});
                        }}
                        className="w-full flex items-center justify-center gap-1.5 bg-green-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-green-700 transition-colors"
                      >
                        <Plus size={14} /> Add bill
                      </button>
                    </div>
                  </div>

                  {/* Bills table */}
                  {state.operationalData.utilityBills.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-white/5">
                            <th className="text-left px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                              Consumer #
                            </th>
                            <th className="text-left px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                              Month
                            </th>
                            <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                              kWh
                            </th>
                            <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                              Solar kWh
                            </th>
                            <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                              Max kW
                            </th>
                            <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                              PF
                            </th>
                            <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                              Bill ₹
                            </th>
                            <th className="px-2 py-1.5 border border-white/10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...state.operationalData.utilityBills]
                            .sort((a, b) => a.month.localeCompare(b.month))
                            .map((bill) => (
                              <tr key={bill.id} className="hover:bg-white/5">
                                <td className="px-2 py-1 border border-white/10 text-gray-200">
                                  {bill.consumerNumber}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-gray-200">
                                  {bill.month}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                  {bill.unitConsumedKwhr?.toLocaleString() ?? '—'}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-green-700">
                                  {bill.solarUnitGeneratedKwhr?.toLocaleString() ?? '—'}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                  {bill.maxDemandKw ?? '—'}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                  {bill.powerFactor ?? '—'}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                  {bill.totalEnergyChargesRs?.toLocaleString() ?? '—'}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      dispatch({ type: 'REMOVE_UTILITY_BILL', payload: bill.id })
                                    }
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <X size={12} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-blue-50 font-semibold">
                            <td
                              colSpan={2}
                              className="px-2 py-1.5 border border-white/10 text-gray-200 text-xs"
                            >
                              Total ({state.operationalData.utilityBills.length} bills)
                            </td>
                            <td className="px-2 py-1.5 border border-white/10 text-right text-gray-200 text-xs">
                              {state.operationalData.utilityBills
                                .reduce((s, b) => s + (b.unitConsumedKwhr ?? 0), 0)
                                .toLocaleString()}
                            </td>
                            <td className="px-2 py-1.5 border border-white/10 text-right text-green-700 text-xs">
                              {state.operationalData.utilityBills
                                .reduce((s, b) => s + (b.solarUnitGeneratedKwhr ?? 0), 0)
                                .toLocaleString()}
                            </td>
                            <td
                              colSpan={4}
                              className="px-2 py-1.5 border border-white/10 text-xs text-gray-400"
                            >
                              ≈{' '}
                              {(
                                ((state.operationalData.utilityBills.reduce(
                                  (s, b) => s + (b.unitConsumedKwhr ?? 0),
                                  0
                                ) /
                                  Math.max(state.operationalData.utilityBills.length, 1)) *
                                  12 *
                                  INDIA_GRID_EMISSION_FACTOR) /
                                1000
                              ).toFixed(2)}{' '}
                              tCO₂e/yr (annualised)
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 6B: Load Profile Upload */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                  <Activity size={18} className="text-purple-600" />
                  <div>
                    <h3 className="font-semibold text-gray-100">Load profile</h3>
                    <p className="text-xs text-gray-400">
                      15-min or 30-min interval demand data (XLS/XLSX/CSV). Raw data is not stored —
                      only statistics are extracted.
                    </p>
                  </div>
                  {state.operationalData.hasLoadProfileData && (
                    <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      Uploaded
                    </span>
                  )}
                </div>
                <div className="p-5 space-y-4">
                  {/* Upload zone */}
                  <label
                    className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${uploadingLoadProfile ? 'border-purple-300 bg-purple-50' : 'border-white/20 hover:border-purple-400 hover:bg-purple-50'}`}
                  >
                    {uploadingLoadProfile ? (
                      <RefreshCw size={24} className="text-purple-500 animate-spin mb-2" />
                    ) : (
                      <Upload size={24} className="text-gray-400 mb-2" />
                    )}
                    <span className="text-sm text-gray-300 font-medium">
                      {uploadingLoadProfile ? 'Processing file…' : 'Click to upload load profile'}
                    </span>
                    <span className="text-xs text-gray-400 mt-1">XLS, XLSX, CSV · max 25 MB</span>
                    <input
                      type="file"
                      accept=".xls,.xlsx,.csv"
                      className="hidden"
                      disabled={uploadingLoadProfile || !state.electricalSubmissionId}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !state.electricalSubmissionId) return;
                        setUploadingLoadProfile(true);
                        try {
                          const res = await electricalOperationalApi.uploadLoadProfile(
                            state.electricalSubmissionId,
                            file
                          );
                          dispatch({
                            type: 'SET_LOAD_PROFILE_STATS',
                            payload: res.data.data as ILoadProfileStats,
                          });
                          showToast({
                            type: 'success',
                            message: 'Load profile processed successfully',
                          });
                        } catch {
                          showToast({ type: 'error', message: 'Failed to process load profile' });
                        } finally {
                          setUploadingLoadProfile(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>

                  {/* Stats card */}
                  {state.operationalData.loadProfileStats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        {
                          label: 'Peak demand',
                          value: state.operationalData.loadProfileStats.peakDemandKw
                            ? `${state.operationalData.loadProfileStats.peakDemandKw.toFixed(1)} kW`
                            : '—',
                        },
                        {
                          label: 'Average demand',
                          value: state.operationalData.loadProfileStats.averageDemandKw
                            ? `${state.operationalData.loadProfileStats.averageDemandKw.toFixed(1)} kW`
                            : '—',
                        },
                        {
                          label: 'Load factor',
                          value: state.operationalData.loadProfileStats.loadFactor
                            ? `${(state.operationalData.loadProfileStats.loadFactor * 100).toFixed(1)}%`
                            : '—',
                        },
                        {
                          label: 'Avg power factor',
                          value:
                            state.operationalData.loadProfileStats.averagePowerFactor?.toFixed(3) ??
                            '—',
                        },
                        {
                          label: 'Total readings',
                          value:
                            state.operationalData.loadProfileStats.totalReadings?.toLocaleString() ??
                            '—',
                        },
                        {
                          label: 'Period from',
                          value: state.operationalData.loadProfileStats.periodFrom ?? '—',
                        },
                        {
                          label: 'Period to',
                          value: state.operationalData.loadProfileStats.periodTo ?? '—',
                        },
                        {
                          label: 'Uploaded file',
                          value: state.operationalData.loadProfileStats.uploadedFileName ?? '—',
                        },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white/5 rounded-lg px-3 py-2">
                          <p className="text-xs text-gray-400">{label}</p>
                          <p className="text-sm font-semibold text-gray-100 truncate">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Data quality note */}
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Data quality note (optional)
                    </label>
                    <input
                      type="text"
                      value={state.operationalData.loadProfileStats?.dataQualityNote ?? ''}
                      onChange={(e) =>
                        dispatch({ type: 'UPDATE_LOAD_PROFILE_NOTE', payload: e.target.value })
                      }
                      className="w-full rounded border border-white/20 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="e.g. Data missing for March due to meter replacement"
                    />
                  </div>
                </div>
              </div>

              {/* 6C: Sub-load profiles */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                  <Layers size={18} className="text-indigo-600" />
                  <div>
                    <h3 className="font-semibold text-gray-100">Sub-load profiles</h3>
                    <p className="text-xs text-gray-400">
                      Per sub-circuit or feeder load data (XLS/XLSX/CSV). Statistics only — raw data
                      is discarded.
                    </p>
                  </div>
                  {state.operationalData.hasSubLoadData && (
                    <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                      Uploaded
                    </span>
                  )}
                </div>
                <div className="p-5 space-y-4">
                  <label
                    className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${uploadingSubLoad ? 'border-indigo-300 bg-indigo-50' : 'border-white/20 hover:border-indigo-400 hover:bg-indigo-50'}`}
                  >
                    {uploadingSubLoad ? (
                      <RefreshCw size={24} className="text-indigo-500 animate-spin mb-2" />
                    ) : (
                      <Upload size={24} className="text-gray-400 mb-2" />
                    )}
                    <span className="text-sm text-gray-300 font-medium">
                      {uploadingSubLoad ? 'Processing file…' : 'Click to upload sub-load profile'}
                    </span>
                    <span className="text-xs text-gray-400 mt-1">XLS, XLSX, CSV · max 25 MB</span>
                    <input
                      type="file"
                      accept=".xls,.xlsx,.csv"
                      className="hidden"
                      disabled={uploadingSubLoad || !state.electricalSubmissionId}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !state.electricalSubmissionId) return;
                        setUploadingSubLoad(true);
                        try {
                          const res = await electricalOperationalApi.uploadSubLoadProfile(
                            state.electricalSubmissionId,
                            file
                          );
                          dispatch({
                            type: 'SET_SUB_LOAD_STATS',
                            payload: res.data.data as ISubLoadProfileStats,
                          });
                          showToast({
                            type: 'success',
                            message: 'Sub-load profile processed successfully',
                          });
                        } catch {
                          showToast({
                            type: 'error',
                            message: 'Failed to process sub-load profile',
                          });
                        } finally {
                          setUploadingSubLoad(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>

                  {/* Sub-load breakdown table */}
                  {state.operationalData.subLoadProfileStats &&
                    state.operationalData.subLoadProfileStats.subLoads.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-white/5">
                              <th className="text-left px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                                Sub-load name
                              </th>
                              <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                                Peak kW
                              </th>
                              <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                                Avg kW
                              </th>
                              <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                                Load factor
                              </th>
                              <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                                % of total
                              </th>
                              <th className="text-right px-2 py-1.5 border border-white/10 font-semibold text-gray-300">
                                Est. kWh/yr
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.operationalData.subLoadProfileStats.subLoads.map((sl) => (
                              <tr key={sl.id} className="hover:bg-white/5">
                                <td className="px-2 py-1 border border-white/10 text-gray-200">
                                  {sl.subLoadName}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                  {sl.peakDemandKw?.toFixed(1) ?? '—'}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                  {sl.averageDemandKw?.toFixed(1) ?? '—'}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                  {sl.loadFactor ? `${(sl.loadFactor * 100).toFixed(1)}%` : '—'}
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-blue-700 font-medium">
                                  {sl.percentOfTotalLoad?.toFixed(1) ?? '—'}%
                                </td>
                                <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                  {sl.estimatedAnnualKwh?.toLocaleString() ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-indigo-50 font-semibold text-xs">
                              <td className="px-2 py-1.5 border border-white/10 text-gray-200">
                                Coverage
                              </td>
                              <td
                                colSpan={5}
                                className="px-2 py-1.5 border border-white/10 text-gray-200"
                              >
                                {state.operationalData.subLoadProfileStats.coveragePercent?.toFixed(
                                  1
                                ) ?? '—'}
                                % of total load accounted for
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Data quality note (optional)
                    </label>
                    <input
                      type="text"
                      value={state.operationalData.subLoadProfileStats?.dataQualityNote ?? ''}
                      onChange={(e) =>
                        dispatch({ type: 'UPDATE_SUBLOAD_PROFILE_NOTE', payload: e.target.value })
                      }
                      className="w-full rounded border border-white/20 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="e.g. HVAC sub-circuit data not available for this period"
                    />
                  </div>
                </div>
              </div>

              {/* 6D: DG Generation Records */}
              {state.dgSets.length > 0 && (
                <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                  <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                    <Flame size={18} className="text-orange-600" />
                    <div>
                      <h3 className="font-semibold text-gray-100">DG generation records</h3>
                      <p className="text-xs text-gray-400">
                        Monthly fuel and generation logs for each DG set
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDgEntryMode('manual')}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${dgEntryMode === 'manual' ? 'bg-orange-100 text-orange-700' : 'text-gray-400 hover:bg-white/10'}`}
                      >
                        Manual entry
                      </button>
                      <button
                        type="button"
                        onClick={() => setDgEntryMode('upload')}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${dgEntryMode === 'upload' ? 'bg-orange-100 text-orange-700' : 'text-gray-400 hover:bg-white/10'}`}
                      >
                        File upload
                      </button>
                    </div>
                  </div>
                  <div className="p-5 space-y-5">
                    {dgEntryMode === 'upload' ? (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-400">
                          Upload a file with columns:{' '}
                          <strong>
                            DG ID, Month (YYYY-MM), Runtime hours, Fuel consumed (L), Energy
                            generated (kWh)
                          </strong>
                          . Uploading replaces records for the same DG + month; other records are
                          preserved.
                        </p>
                        <label
                          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${uploadingDGGen ? 'border-orange-300 bg-orange-50' : 'border-white/20 hover:border-orange-400 hover:bg-orange-50'}`}
                        >
                          {uploadingDGGen ? (
                            <RefreshCw size={24} className="text-orange-500 animate-spin mb-2" />
                          ) : (
                            <Upload size={24} className="text-gray-400 mb-2" />
                          )}
                          <span className="text-sm text-gray-300 font-medium">
                            {uploadingDGGen
                              ? 'Processing file…'
                              : 'Click to upload DG generation log'}
                          </span>
                          <span className="text-xs text-gray-400 mt-1">
                            XLS, XLSX, CSV · max 25 MB
                          </span>
                          <input
                            type="file"
                            accept=".xls,.xlsx,.csv"
                            className="hidden"
                            disabled={uploadingDGGen || !state.electricalSubmissionId}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !state.electricalSubmissionId) return;
                              setUploadingDGGen(true);
                              try {
                                const res = await electricalOperationalApi.uploadDGGeneration(
                                  state.electricalSubmissionId,
                                  file
                                );
                                dispatch({
                                  type: 'IMPORT_DG_GENERATION_RECORDS',
                                  payload: res.data.data as IDGGenerationRecord[],
                                });
                                showToast({
                                  type: 'success',
                                  message: 'DG generation records imported successfully',
                                });
                              } catch {
                                showToast({
                                  type: 'error',
                                  message: 'Failed to import DG generation records',
                                });
                              } finally {
                                setUploadingDGGen(false);
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>
                    ) : (
                      /* Manual entry: per-DG table */
                      <div className="space-y-6">
                        {state.dgSets.map((dg) => {
                          const recs = state.operationalData.dgGenerationRecords.filter(
                            (r) => r.dgId === dg.dgId
                          );
                          return (
                            <div
                              key={dg.id}
                              className="border border-white/10 rounded-lg overflow-hidden"
                            >
                              <div className="bg-orange-50 px-4 py-2 flex items-center justify-between">
                                <span className="text-sm font-semibold text-orange-800">
                                  {dg.dgId} — {dg.capacityKva} kVA
                                </span>
                                <span className="text-xs text-orange-600">
                                  {recs.length} month{recs.length !== 1 ? 's' : ''} of data
                                </span>
                              </div>
                              <div className="p-3 space-y-3">
                                {recs.length > 0 && (
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-white/5">
                                        <th className="text-left px-2 py-1 border border-white/10 font-semibold text-gray-300">
                                          Month
                                        </th>
                                        <th className="text-right px-2 py-1 border border-white/10 font-semibold text-gray-300">
                                          Runtime h
                                        </th>
                                        <th className="text-right px-2 py-1 border border-white/10 font-semibold text-gray-300">
                                          Fuel L
                                        </th>
                                        <th className="text-right px-2 py-1 border border-white/10 font-semibold text-gray-300">
                                          kWh gen
                                        </th>
                                        <th className="px-2 py-1 border border-white/10"></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {[...recs]
                                        .sort((a, b) => a.month.localeCompare(b.month))
                                        .map((rec) => (
                                          <tr key={rec.id} className="hover:bg-white/5">
                                            <td className="px-2 py-1 border border-white/10 text-gray-200">
                                              {rec.month}
                                            </td>
                                            <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                              {rec.totalRuntimeHours ?? '—'}
                                            </td>
                                            <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                              {rec.totalFuelConsumptionL ?? '—'}
                                            </td>
                                            <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                              {rec.totalKwhGenerated ?? '—'}
                                            </td>
                                            <td className="px-2 py-1 border border-white/10 text-center">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  dispatch({
                                                    type: 'REMOVE_DG_GENERATION_RECORD',
                                                    payload: rec.id,
                                                  })
                                                }
                                                className="text-red-500 hover:text-red-700"
                                              >
                                                <X size={12} />
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="bg-orange-50 text-xs font-semibold">
                                        <td className="px-2 py-1 border border-white/10 text-gray-200">
                                          Total / Avg
                                        </td>
                                        <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                          {recs
                                            .reduce((s, r) => s + (r.totalRuntimeHours ?? 0), 0)
                                            .toFixed(0)}{' '}
                                          h
                                        </td>
                                        <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                          {recs
                                            .reduce((s, r) => s + (r.totalFuelConsumptionL ?? 0), 0)
                                            .toFixed(0)}{' '}
                                          L
                                        </td>
                                        <td className="px-2 py-1 border border-white/10 text-right text-gray-200">
                                          {recs
                                            .reduce((s, r) => s + (r.totalKwhGenerated ?? 0), 0)
                                            .toFixed(0)}{' '}
                                          kWh
                                        </td>
                                        <td className="border border-white/10" />
                                      </tr>
                                    </tfoot>
                                  </table>
                                )}
                                {/* Add record form */}
                                <AddDGRecordForm
                                  dgId={dg.dgId}
                                  onAdd={(rec) =>
                                    dispatch({ type: 'ADD_DG_GENERATION_RECORD', payload: rec })
                                  }
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ─────────────── SECTION 7: RENEWABLE ENERGY SYSTEMS ─────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['renewable'] = el;
              }}
              id="renewable"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">Renewable energy systems</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Record current plant generation, solar and wind resource data, PV siting, battery
                  storage planning, and renewable feasibility assessments.
                </p>
              </div>

              {/* Renewable status banner */}
              {(() => {
                const solarPlants = state.plantGenerationMonthly.filter((r) =>
                  r.technology.startsWith('solar')
                );
                const totalGenKwh = solarPlants.reduce((s, r) => s + (r.totalKwhGenerated ?? 0), 0);
                const potentialMwh = state.renewableAssessment.reduce(
                  (s, a) => s + (a.approxAnnualGenerationPotentialMwh ?? 0),
                  0
                );
                const hasSolarCap = !!state.energyData.solarCapacityKw;
                if (!hasSolarCap && totalGenKwh === 0 && potentialMwh === 0) return null;
                return (
                  <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
                    {hasSolarCap && (
                      <p className="text-sm text-green-800">
                        <span className="font-semibold">Installed capacity (Phase 1):</span>{' '}
                        {state.energyData.solarCapacityKw} kW solar
                      </p>
                    )}
                    {totalGenKwh > 0 ? (
                      <p className="text-sm text-green-800 flex items-center gap-1">
                        <CheckCircle2 size={14} className="text-green-600" />
                        Measured generation:{' '}
                        <span className="font-semibold">
                          {totalGenKwh.toLocaleString()} kWh
                        </span>{' '}
                        from plant logs
                        <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                          Primary source
                        </span>
                      </p>
                    ) : state.solarResourceMonthly.length > 0 ? (
                      <p className="text-sm text-amber-700">
                        Using GHI-derived estimate for solar offset — upload plant generation log
                        for more accuracy.
                      </p>
                    ) : null}
                    {potentialMwh > 0 && (
                      <p className="text-sm text-green-700">
                        Renewable potential from assessment:{' '}
                        <span className="font-semibold">{potentialMwh.toFixed(1)} MWh/year</span>{' '}
                        across{' '}
                        {
                          state.renewableAssessment.filter(
                            (a) => a.approxAnnualGenerationPotentialMwh
                          ).length
                        }{' '}
                        technologies
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* 7A: Plant generation log */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                  <Sun size={18} className="text-yellow-500" />
                  <div>
                    <h3 className="font-semibold text-gray-100">Renewable plant generation log</h3>
                    <p className="text-xs text-gray-400">
                      Register each plant and enter monthly generation data. Actual measured
                      generation is the PRIMARY carbon offset source.
                    </p>
                  </div>
                  {state.plantGenerationMonthly.length > 0 && (
                    <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {state.plantGenerationMonthly.length} records
                    </span>
                  )}
                </div>
                <div className="p-5 space-y-5">
                  {/* Register a new plant */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-xs font-semibold text-yellow-800 mb-3">Register a plant</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Plant ID</label>
                        <input
                          type="text"
                          placeholder="e.g. PV-ROOF-01"
                          value={newPlantDraft.plantId}
                          onChange={(e) =>
                            setNewPlantDraft((d) => ({ ...d, plantId: e.target.value }))
                          }
                          className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Technology</label>
                        <select
                          value={newPlantDraft.technology}
                          onChange={(e) =>
                            setNewPlantDraft((d) => ({ ...d, technology: e.target.value }))
                          }
                          className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400 bg-black/40 backdrop-blur-md"
                        >
                          <option value="solar_pv_rooftop">Solar PV Rooftop</option>
                          <option value="solar_pv_ground">Solar PV Ground</option>
                          <option value="wind_turbine">Wind Turbine</option>
                          <option value="biomass">Biomass</option>
                          <option value="small_hydro">Small Hydro</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Capacity (kWp)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="e.g. 50"
                          value={newPlantDraft.capacityKwp}
                          onChange={(e) =>
                            setNewPlantDraft((d) => ({ ...d, capacityKwp: e.target.value }))
                          }
                          className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (!newPlantDraft.plantId.trim() || !newPlantDraft.capacityKwp) return;
                            const pid = newPlantDraft.plantId.trim();
                            // Store registration meta so the header shows before first month is added
                            setRegisteredPlantMeta((m) => ({
                              ...m,
                              [pid]: {
                                technology: newPlantDraft.technology,
                                capacityKwp: parseFloat(newPlantDraft.capacityKwp),
                              },
                            }));
                            // Pre-initialise the per-plant month draft
                            setNewPlantMonthDraft((d) => ({
                              ...d,
                              [pid]: d[pid] ?? {
                                month: '',
                                kwhGenerated: '',
                                perfRatio: '',
                                outageCount: '',
                              },
                            }));
                            setNewPlantDraft({
                              plantId: '',
                              technology: 'solar_pv_rooftop',
                              capacityKwp: '',
                            });
                          }}
                          disabled={!newPlantDraft.plantId.trim() || !newPlantDraft.capacityKwp}
                          className="w-full text-xs bg-yellow-500 hover:bg-yellow-600 disabled:opacity-40 text-white rounded px-3 py-1.5 font-medium transition-colors"
                        >
                          + Register plant
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Per-plant monthly data entry */}
                  {(() => {
                    const plantIds = [
                      ...new Set([
                        ...Object.keys(newPlantMonthDraft),
                        ...state.plantGenerationMonthly.map((r) => r.plantId),
                      ]),
                    ];
                    if (plantIds.length === 0) return null;
                    return (
                      <div className="space-y-4">
                        {plantIds.map((plantId) => {
                          const recs = state.plantGenerationMonthly.filter(
                            (r) => r.plantId === plantId
                          );
                          const totalKwh = recs.reduce((s, r) => s + (r.totalKwhGenerated ?? 0), 0);
                          const prRecs = recs.filter((r) => r.avgPerformanceRatio != null);
                          const avgPR = prRecs.length
                            ? prRecs.reduce((s, r) => s + (r.avgPerformanceRatio ?? 0), 0) /
                              prRecs.length
                            : null;
                          const prColor =
                            avgPR === null
                              ? 'text-gray-400'
                              : avgPR >= 80
                                ? 'text-green-700'
                                : avgPR >= 70
                                  ? 'text-amber-700'
                                  : 'text-red-700';
                          const firstRec = recs[0];
                          const monthDraft = newPlantMonthDraft[plantId] ?? {
                            month: '',
                            kwhGenerated: '',
                            perfRatio: '',
                            outageCount: '',
                          };

                          return (
                            <div
                              key={plantId}
                              className="border border-white/10 rounded-lg overflow-hidden"
                            >
                              {/* Plant header */}
                              <div className="bg-yellow-50 px-4 py-2 flex items-center justify-between">
                                <span className="text-sm font-semibold text-yellow-800">
                                  {plantId}
                                  {(() => {
                                    const tech =
                                      firstRec?.technology ??
                                      registeredPlantMeta[plantId]?.technology;
                                    const cap =
                                      firstRec?.capacityKwp ??
                                      registeredPlantMeta[plantId]?.capacityKwp;
                                    return tech ? ` — ${tech.replace(/_/g, ' ')} · ${cap} kWp` : '';
                                  })()}
                                </span>
                                <span className="text-xs text-yellow-600">
                                  {recs.length} months · {totalKwh.toLocaleString()} kWh total
                                </span>
                              </div>

                              {avgPR !== null && (
                                <div className={`px-4 py-1 text-xs ${prColor}`}>
                                  Avg performance ratio: {avgPR.toFixed(1)}% —{' '}
                                  {avgPR >= 80
                                    ? 'Good performance'
                                    : avgPR >= 70
                                      ? 'Moderate — check for soiling or shading'
                                      : 'Poor — maintenance recommended'}
                                </div>
                              )}

                              {/* Monthly records table */}
                              {recs.length > 0 && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-white/5 text-gray-300">
                                        <th className="text-left px-3 py-1.5 border-b border-white/10">
                                          Month
                                        </th>
                                        <th className="text-right px-3 py-1.5 border-b border-white/10">
                                          kWh Generated
                                        </th>
                                        <th className="text-right px-3 py-1.5 border-b border-white/10">
                                          Perf. Ratio (%)
                                        </th>
                                        <th className="text-right px-3 py-1.5 border-b border-white/10">
                                          Outages
                                        </th>
                                        <th className="px-3 py-1.5 border-b border-white/10"></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {recs.map((r) => (
                                        <tr
                                          key={`${r.plantId}-${r.month}`}
                                          className="hover:bg-white/5"
                                        >
                                          <td className="px-3 py-1.5 border-b border-white/5 text-gray-200">
                                            {r.month}
                                          </td>
                                          <td className="px-3 py-1.5 border-b border-white/5 text-right font-medium text-gray-100">
                                            {r.totalKwhGenerated?.toLocaleString() ?? '—'}
                                          </td>
                                          <td className="px-3 py-1.5 border-b border-white/5 text-right text-gray-200">
                                            {r.avgPerformanceRatio ?? '—'}
                                          </td>
                                          <td className="px-3 py-1.5 border-b border-white/5 text-right text-gray-200">
                                            {r.outageCount ?? '—'}
                                          </td>
                                          <td className="px-3 py-1.5 border-b border-white/5 text-center">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                dispatch({
                                                  type: 'REMOVE_PLANT_GENERATION_RECORD',
                                                  payload: {
                                                    plantId: r.plantId,
                                                    monthIndex: r.monthIndex,
                                                    year: r.year,
                                                  },
                                                })
                                              }
                                              className="text-red-400 hover:text-red-600 text-xs"
                                            >
                                              ×
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    {recs.length > 0 && (
                                      <tfoot>
                                        <tr className="bg-yellow-50 font-semibold text-xs">
                                          <td className="px-3 py-1.5 text-yellow-800">
                                            Annual total
                                          </td>
                                          <td className="px-3 py-1.5 text-right text-yellow-800">
                                            {totalKwh.toLocaleString()} kWh
                                          </td>
                                          <td
                                            colSpan={3}
                                            className="px-3 py-1.5 text-right text-yellow-700"
                                          >
                                            ≈ {((totalKwh * 0.716) / 1000).toFixed(2)} tCO₂e offset
                                          </td>
                                        </tr>
                                      </tfoot>
                                    )}
                                  </table>
                                </div>
                              )}

                              {/* Add monthly record inline form */}
                              <div className="px-4 py-3 bg-white/5 border-t border-white/5">
                                <p className="text-xs text-gray-400 mb-2 font-medium">
                                  Add monthly record
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                      Month
                                    </label>
                                    <input
                                      type="month"
                                      value={monthDraft.month}
                                      onChange={(e) =>
                                        setNewPlantMonthDraft((d) => ({
                                          ...d,
                                          [plantId]: { ...d[plantId], month: e.target.value },
                                        }))
                                      }
                                      className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                      kWh Generated
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      placeholder="e.g. 4200"
                                      value={monthDraft.kwhGenerated}
                                      onChange={(e) =>
                                        setNewPlantMonthDraft((d) => ({
                                          ...d,
                                          [plantId]: {
                                            ...d[plantId],
                                            kwhGenerated: e.target.value,
                                          },
                                        }))
                                      }
                                      className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                      Perf. Ratio % <span className="text-gray-300">(opt)</span>
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                      placeholder="e.g. 80"
                                      value={monthDraft.perfRatio}
                                      onChange={(e) =>
                                        setNewPlantMonthDraft((d) => ({
                                          ...d,
                                          [plantId]: { ...d[plantId], perfRatio: e.target.value },
                                        }))
                                      }
                                      className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                      Outages <span className="text-gray-300">(opt)</span>
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      placeholder="0"
                                      value={monthDraft.outageCount}
                                      onChange={(e) =>
                                        setNewPlantMonthDraft((d) => ({
                                          ...d,
                                          [plantId]: { ...d[plantId], outageCount: e.target.value },
                                        }))
                                      }
                                      className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!monthDraft.month || !monthDraft.kwhGenerated) return;
                                        const [yearStr, moStr] = monthDraft.month.split('-');
                                        const year = parseInt(yearStr, 10);
                                        const monthIndex = parseInt(moStr, 10);
                                        const monthLabel = new Date(
                                          year,
                                          monthIndex - 1,
                                          1
                                        ).toLocaleDateString('en-IN', {
                                          month: 'long',
                                          year: 'numeric',
                                        });
                                        // Find plant info from existing records, or registered meta
                                        const existing = state.plantGenerationMonthly.find(
                                          (r) => r.plantId === plantId
                                        );
                                        const meta = registeredPlantMeta[plantId];
                                        const technology = (existing?.technology ??
                                          meta?.technology ??
                                          'solar_pv_rooftop') as import('@shared/types/submission.types').RenewableTechnology;
                                        const capacityKwp =
                                          existing?.capacityKwp ?? meta?.capacityKwp ?? 0;
                                        dispatch({
                                          type: 'ADD_PLANT_GENERATION_RECORD',
                                          payload: {
                                            plantId,
                                            technology,
                                            capacityKwp,
                                            month: monthLabel,
                                            monthIndex,
                                            year,
                                            totalKwhGenerated: parseFloat(monthDraft.kwhGenerated),
                                            avgPerformanceRatio: monthDraft.perfRatio
                                              ? parseFloat(monthDraft.perfRatio)
                                              : undefined,
                                            outageCount: monthDraft.outageCount
                                              ? parseInt(monthDraft.outageCount, 10)
                                              : undefined,
                                          },
                                        });
                                        setNewPlantMonthDraft((d) => ({
                                          ...d,
                                          [plantId]: {
                                            month: '',
                                            kwhGenerated: '',
                                            perfRatio: '',
                                            outageCount: '',
                                          },
                                        }));
                                      }}
                                      disabled={!monthDraft.month || !monthDraft.kwhGenerated}
                                      className="w-full text-xs bg-yellow-500 hover:bg-yellow-600 disabled:opacity-40 text-white rounded px-3 py-1.5 font-medium transition-colors"
                                    >
                                      + Add month
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 7B: Solar resource data */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                  <Sun size={18} className="text-orange-500" />
                  <div>
                    <h3 className="font-semibold text-gray-100">Solar resource measurements</h3>
                    <p className="text-xs text-gray-400">
                      Monthly irradiance averages from pyranometer or weather station. Used for
                      GHI-derived solar offset when no plant log is available.
                    </p>
                  </div>
                  {state.solarResourceMonthly.length > 0 && (
                    <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                      {state.solarResourceMonthly.length} months
                    </span>
                  )}
                </div>
                <div className="p-5 space-y-4">
                  {/* Inline add-month form */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Month</label>
                      <input
                        type="month"
                        value={newSolarMonthDraft.month}
                        onChange={(e) =>
                          setNewSolarMonthDraft((d) => ({ ...d, month: e.target.value }))
                        }
                        className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-black/40 backdrop-blur-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Avg GHI (W/m²)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="e.g. 520"
                        value={newSolarMonthDraft.avgGhiWm2}
                        onChange={(e) =>
                          setNewSolarMonthDraft((d) => ({ ...d, avgGhiWm2: e.target.value }))
                        }
                        className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Peak Sun Hrs <span className="text-gray-400">(opt)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="kWh/m²"
                        value={newSolarMonthDraft.peakSunHours}
                        onChange={(e) =>
                          setNewSolarMonthDraft((d) => ({ ...d, peakSunHours: e.target.value }))
                        }
                        className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Module Temp °C <span className="text-gray-400">(opt)</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="e.g. 45"
                        value={newSolarMonthDraft.avgModuleTempC}
                        onChange={(e) =>
                          setNewSolarMonthDraft((d) => ({ ...d, avgModuleTempC: e.target.value }))
                        }
                        className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newSolarMonthDraft.month || !newSolarMonthDraft.avgGhiWm2) return;
                          const [yearStr, moStr] = newSolarMonthDraft.month.split('-');
                          const year = parseInt(yearStr, 10);
                          const monthIndex = parseInt(moStr, 10);
                          const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
                            monthIndex - 1
                          ];
                          const avgGhi = parseFloat(newSolarMonthDraft.avgGhiWm2);
                          const peakSunHours = newSolarMonthDraft.peakSunHours
                            ? parseFloat(newSolarMonthDraft.peakSunHours)
                            : (avgGhi / 1000) * daysInMonth;
                          const monthLabel = new Date(year, monthIndex - 1, 1).toLocaleDateString(
                            'en-IN',
                            { month: 'long', year: 'numeric' }
                          );
                          dispatch({
                            type: 'ADD_SOLAR_RESOURCE_MONTH',
                            payload: {
                              month: monthLabel,
                              monthIndex,
                              year,
                              avgGhiWm2: avgGhi,
                              peakSunHours,
                              avgModuleTempC: newSolarMonthDraft.avgModuleTempC
                                ? parseFloat(newSolarMonthDraft.avgModuleTempC)
                                : undefined,
                            },
                          });
                          setNewSolarMonthDraft({
                            month: '',
                            avgGhiWm2: '',
                            peakSunHours: '',
                            avgModuleTempC: '',
                          });
                        }}
                        disabled={!newSolarMonthDraft.month || !newSolarMonthDraft.avgGhiWm2}
                        className="w-full text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded px-3 py-1.5 font-medium transition-colors"
                      >
                        + Add month
                      </button>
                    </div>
                  </div>

                  {/* Records table */}
                  {state.solarResourceMonthly.length > 0 && (
                    <div className="space-y-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-orange-50 text-gray-300">
                              <th className="text-left px-3 py-1.5 border-b border-white/10">
                                Month
                              </th>
                              <th className="text-right px-3 py-1.5 border-b border-white/10">
                                Avg GHI (W/m²)
                              </th>
                              <th className="text-right px-3 py-1.5 border-b border-white/10">
                                Peak Sun Hrs (kWh/m²)
                              </th>
                              <th className="text-right px-3 py-1.5 border-b border-white/10">
                                Module Temp (°C)
                              </th>
                              <th className="px-3 py-1.5 border-b border-white/10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.solarResourceMonthly.map((m) => (
                              <tr
                                key={`${m.year}-${m.monthIndex}`}
                                className="hover:bg-white/5 border-b border-white/5"
                              >
                                <td className="px-3 py-1.5 text-gray-200">{m.month}</td>
                                <td className="px-3 py-1.5 text-right text-gray-200">
                                  {m.avgGhiWm2 ?? '—'}
                                </td>
                                <td className="px-3 py-1.5 text-right font-medium text-gray-100">
                                  {m.peakSunHours?.toFixed(2) ?? '—'}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-200">
                                  {m.avgModuleTempC ?? '—'}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      dispatch({
                                        type: 'REMOVE_SOLAR_RESOURCE_MONTH',
                                        payload: { monthIndex: m.monthIndex, year: m.year },
                                      })
                                    }
                                    className="text-red-400 hover:text-red-600 text-xs"
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {state.energyData.solarCapacityKw && (
                        <div className="text-xs text-orange-700 bg-orange-50 rounded p-2">
                          Based on measured GHI + {state.energyData.solarCapacityKw} kWp capacity +
                          PR 80%: est.{' '}
                          <strong>
                            {Math.round(
                              state.solarResourceMonthly.reduce((s, m) => {
                                const psh =
                                  m.peakSunHours ??
                                  ((m.avgGhiWm2 ?? 0) / 1000) *
                                    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
                                      m.monthIndex - 1
                                    ];
                                return s + psh * (state.energyData.solarCapacityKw ?? 0) * 0.8;
                              }, 0)
                            ).toLocaleString()}{' '}
                            kWh/year
                          </strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 7C: Wind resource data */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                  <Wind size={18} className="text-blue-500" />
                  <div>
                    <h3 className="font-semibold text-gray-100">Wind resource measurements</h3>
                    <p className="text-xs text-gray-400">
                      Monthly wind speed averages from anemometer or met mast. For wind energy
                      potential assessment.
                    </p>
                  </div>
                  {state.windResourceMonthly.length > 0 && (
                    <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {state.windResourceMonthly.length} months
                    </span>
                  )}
                </div>
                <div className="p-5 space-y-4">
                  {/* Inline add-month form */}
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Month</label>
                      <input
                        type="month"
                        value={newWindMonthDraft.month}
                        onChange={(e) =>
                          setNewWindMonthDraft((d) => ({ ...d, month: e.target.value }))
                        }
                        className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-black/40 backdrop-blur-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Avg Wind (m/s)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 4.5"
                        value={newWindMonthDraft.avgWindSpeedMs}
                        onChange={(e) =>
                          setNewWindMonthDraft((d) => ({ ...d, avgWindSpeedMs: e.target.value }))
                        }
                        className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Max Wind (m/s) <span className="text-gray-400">(opt)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 12"
                        value={newWindMonthDraft.maxWindSpeedMs}
                        onChange={(e) =>
                          setNewWindMonthDraft((d) => ({ ...d, maxWindSpeedMs: e.target.value }))
                        }
                        className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Direction ° <span className="text-gray-400">(opt)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="360"
                        step="1"
                        placeholder="e.g. 225"
                        value={newWindMonthDraft.avgDirectionDeg}
                        onChange={(e) =>
                          setNewWindMonthDraft((d) => ({ ...d, avgDirectionDeg: e.target.value }))
                        }
                        className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Mast Ht (m) <span className="text-gray-400">(opt)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="e.g. 30"
                        value={newWindMonthDraft.mastHeightM}
                        onChange={(e) =>
                          setNewWindMonthDraft((d) => ({ ...d, mastHeightM: e.target.value }))
                        }
                        className="w-full text-xs border border-white/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newWindMonthDraft.month || !newWindMonthDraft.avgWindSpeedMs) return;
                          const [yearStr, moStr] = newWindMonthDraft.month.split('-');
                          const year = parseInt(yearStr, 10);
                          const monthIndex = parseInt(moStr, 10);
                          const monthLabel = new Date(year, monthIndex - 1, 1).toLocaleDateString(
                            'en-IN',
                            { month: 'long', year: 'numeric' }
                          );
                          dispatch({
                            type: 'ADD_WIND_RESOURCE_MONTH',
                            payload: {
                              month: monthLabel,
                              monthIndex,
                              year,
                              avgWindSpeedMs: parseFloat(newWindMonthDraft.avgWindSpeedMs),
                              maxWindSpeedMs: newWindMonthDraft.maxWindSpeedMs
                                ? parseFloat(newWindMonthDraft.maxWindSpeedMs)
                                : undefined,
                              dominantDirectionDeg: newWindMonthDraft.avgDirectionDeg
                                ? parseFloat(newWindMonthDraft.avgDirectionDeg)
                                : undefined,
                              mastHeightM: newWindMonthDraft.mastHeightM
                                ? parseFloat(newWindMonthDraft.mastHeightM)
                                : undefined,
                            },
                          });
                          setNewWindMonthDraft({
                            month: '',
                            avgWindSpeedMs: '',
                            maxWindSpeedMs: '',
                            avgDirectionDeg: '',
                            mastHeightM: '',
                          });
                        }}
                        disabled={!newWindMonthDraft.month || !newWindMonthDraft.avgWindSpeedMs}
                        className="w-full text-xs bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded px-3 py-1.5 font-medium transition-colors"
                      >
                        + Add month
                      </button>
                    </div>
                  </div>

                  {/* Records table */}
                  {state.windResourceMonthly.length > 0 && (
                    <div className="space-y-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-blue-50 text-gray-300">
                              <th className="text-left px-3 py-1.5 border-b border-white/10">
                                Month
                              </th>
                              <th className="text-right px-3 py-1.5 border-b border-white/10">
                                Avg Wind (m/s)
                              </th>
                              <th className="text-right px-3 py-1.5 border-b border-white/10">
                                Max Wind (m/s)
                              </th>
                              <th className="text-right px-3 py-1.5 border-b border-white/10">
                                Direction (°)
                              </th>
                              <th className="text-right px-3 py-1.5 border-b border-white/10">
                                Mast Ht (m)
                              </th>
                              <th className="px-3 py-1.5 border-b border-white/10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.windResourceMonthly.map((m) => {
                              const avgSpeed = m.avgWindSpeedMs ?? 0;
                              const classColor =
                                avgSpeed < 4
                                  ? 'text-gray-400'
                                  : avgSpeed < 5.5
                                    ? 'text-blue-600'
                                    : avgSpeed < 7.5
                                      ? 'text-amber-700'
                                      : 'text-green-700';
                              return (
                                <tr
                                  key={`${m.year}-${m.monthIndex}`}
                                  className="hover:bg-white/5 border-b border-white/5"
                                >
                                  <td className="px-3 py-1.5 text-gray-200">{m.month}</td>
                                  <td
                                    className={`px-3 py-1.5 text-right font-medium ${classColor}`}
                                  >
                                    {m.avgWindSpeedMs ?? '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-gray-200">
                                    {m.maxWindSpeedMs ?? '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-gray-200">
                                    {m.dominantDirectionDeg?.toFixed(0) ?? '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-gray-200">
                                    {m.mastHeightM ?? '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        dispatch({
                                          type: 'REMOVE_WIND_RESOURCE_MONTH',
                                          payload: { monthIndex: m.monthIndex, year: m.year },
                                        })
                                      }
                                      className="text-red-400 hover:text-red-600 text-xs"
                                    >
                                      ×
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {(() => {
                        const avg =
                          state.windResourceMonthly.reduce(
                            (s, m) => s + (m.avgWindSpeedMs ?? 0),
                            0
                          ) / Math.max(state.windResourceMonthly.length, 1);
                        const msg =
                          avg < 4
                            ? 'Low wind resource — wind turbines unlikely to be viable'
                            : avg < 5.5
                              ? 'Moderate resource — small turbines may be feasible'
                              : avg < 7.5
                                ? 'Good resource — wind turbines potentially viable'
                                : 'Excellent resource — strong wind energy potential';
                        const color =
                          avg < 4
                            ? 'text-gray-300 bg-white/5'
                            : avg < 5.5
                              ? 'text-blue-700 bg-blue-50'
                              : avg < 7.5
                                ? 'text-amber-700 bg-amber-50'
                                : 'text-green-700 bg-green-50';
                        return (
                          <p className={`text-xs rounded p-2 ${color}`}>
                            Annual avg: <strong>{avg.toFixed(2)} m/s</strong> — {msg}
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* 7D: PV Siting Survey */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                  <Sun size={18} className="text-amber-500" />
                  <div>
                    <h3 className="font-semibold text-gray-100">PV siting survey</h3>
                    <p className="text-xs text-gray-400">
                      Record each potential installation area assessed for solar panel placement.
                    </p>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  {state.pvSiting.map((rec) => {
                    const isExpanded = state.expandedCards.includes(`pv-${rec.id}`);
                    const estCap = (rec.availableAreaM2 ?? 0) * 0.15;
                    const estYield = estCap * 1200 * (1 - (rec.shadingPercent ?? 0) / 100) * 0.8;
                    const estCo2 = (estYield * 0.716) / 1000;
                    return (
                      <div
                        key={rec.id}
                        className="border border-amber-200 rounded-xl overflow-hidden bg-amber-50/30"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: `pv-${rec.id}` })
                          }
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-50 transition-colors"
                        >
                          <span className="font-medium text-white text-sm min-w-[120px]">
                            {rec.parcelRoofId || 'New siting record'}
                          </span>
                          <span className="text-xs text-gray-400 flex-1">
                            {rec.availableAreaM2 ? `${rec.availableAreaM2} m²` : ''}{' '}
                            {rec.tiltDeg !== undefined ? `· Tilt ${rec.tiltDeg}°` : ''}{' '}
                            {rec.shadingPercent !== undefined
                              ? `· Shading ${rec.shadingPercent}%`
                              : ''}
                          </span>
                          {rec.availableAreaM2 > 0 && (
                            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              Est. {estCap.toFixed(1)} kWp
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch({ type: 'REMOVE_PV_SITING', payload: rec.id });
                            }}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-gray-400" />
                          ) : (
                            <ChevronRight size={16} className="text-gray-400" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-amber-100 bg-black/40 backdrop-blur-md">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                              <div className="space-y-3">
                                <Field>
                                  <Label required>Parcel / Roof ID</Label>
                                  <TextInput
                                    value={rec.parcelRoofId}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_PV_SITING',
                                        payload: { id: rec.id, updates: { parcelRoofId: v } },
                                      })
                                    }
                                    placeholder="Main Roof, Parking Lot A, Lab Block Terrace"
                                  />
                                </Field>
                                <Field>
                                  <Label required>Available area (m²)</Label>
                                  <NumberInput
                                    value={rec.availableAreaM2}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_PV_SITING',
                                        payload: {
                                          id: rec.id,
                                          updates: {
                                            availableAreaM2: v ?? 0,
                                            estimatedCapacityKwp: (v ?? 0) * 0.15,
                                          },
                                        },
                                      })
                                    }
                                    min={0}
                                    placeholder="0"
                                  />
                                  {(rec.availableAreaM2 ?? 0) > 0 && (
                                    <Helper>
                                      Est. capacity:{' '}
                                      {((rec.availableAreaM2 ?? 0) * 0.15).toFixed(1)} kWp
                                    </Helper>
                                  )}
                                </Field>
                                <Field>
                                  <Label>Roof type</Label>
                                  <select
                                    value={rec.roofType ?? ''}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_PV_SITING',
                                        payload: {
                                          id: rec.id,
                                          updates: {
                                            roofType: (e.target.value as RoofType) || undefined,
                                          },
                                        },
                                      })
                                    }
                                    className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                  >
                                    <option value="">— select —</option>
                                    <option value="flat_rcc">Flat RCC</option>
                                    <option value="sloped_tile">Sloped tile</option>
                                    <option value="metal_sheet">Metal sheet</option>
                                    <option value="ground_mounted">Ground mounted</option>
                                    <option value="carport">Carport</option>
                                    <option value="other">Other</option>
                                  </select>
                                </Field>
                                <Field>
                                  <Label>Structural load limit (kg/m²)</Label>
                                  <NumberInput
                                    value={rec.structuralLimitKgM2}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_PV_SITING',
                                        payload: {
                                          id: rec.id,
                                          updates: { structuralLimitKgM2: v },
                                        },
                                      })
                                    }
                                    min={0}
                                    placeholder="e.g. 30"
                                  />
                                  <Helper>Typical PV panels: 15–25 kg/m²</Helper>
                                </Field>
                                <Field>
                                  <Label>Tilt angle (°)</Label>
                                  <div className="flex items-center gap-2">
                                    <NumberInput
                                      value={rec.tiltDeg}
                                      onChange={(v) =>
                                        dispatch({
                                          type: 'UPDATE_PV_SITING',
                                          payload: { id: rec.id, updates: { tiltDeg: v } },
                                        })
                                      }
                                      min={0}
                                      max={90}
                                      placeholder="0–90"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        dispatch({
                                          type: 'UPDATE_PV_SITING',
                                          payload: { id: rec.id, updates: { tiltDeg: 22 } },
                                        })
                                      }
                                      className="text-xs whitespace-nowrap text-green-700 hover:text-green-800 font-medium border border-green-300 px-2 py-1.5 rounded"
                                    >
                                      Use 22° (Varanasi)
                                    </button>
                                  </div>
                                  <Helper>Optimal for Varanasi (25°N): ~20–25°</Helper>
                                </Field>
                              </div>
                              <div className="space-y-3">
                                <Field>
                                  <Label>Panel orientation (° azimuth)</Label>
                                  <div className="flex items-center gap-2">
                                    <NumberInput
                                      value={rec.orientationDeg}
                                      onChange={(v) =>
                                        dispatch({
                                          type: 'UPDATE_PV_SITING',
                                          payload: { id: rec.id, updates: { orientationDeg: v } },
                                        })
                                      }
                                      min={0}
                                      max={360}
                                      placeholder="0–360"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        dispatch({
                                          type: 'UPDATE_PV_SITING',
                                          payload: { id: rec.id, updates: { orientationDeg: 180 } },
                                        })
                                      }
                                      className="text-xs whitespace-nowrap text-green-700 hover:text-green-800 font-medium border border-green-300 px-2 py-1.5 rounded"
                                    >
                                      South (180°)
                                    </button>
                                  </div>
                                  <Helper>180° = due South (optimal in India)</Helper>
                                </Field>
                                <Field>
                                  <Label>Shading loss (%)</Label>
                                  <NumberInput
                                    value={rec.shadingPercent}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_PV_SITING',
                                        payload: { id: rec.id, updates: { shadingPercent: v } },
                                      })
                                    }
                                    min={0}
                                    max={100}
                                    placeholder="0–100"
                                  />
                                  <Helper>
                                    Estimated shading from trees, parapet, adjacent buildings
                                  </Helper>
                                </Field>
                                <Field>
                                  <Label>Distance to nearest switchboard (m)</Label>
                                  <NumberInput
                                    value={rec.distanceToInterconnectionM}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_PV_SITING',
                                        payload: {
                                          id: rec.id,
                                          updates: { distanceToInterconnectionM: v },
                                        },
                                      })
                                    }
                                    min={0}
                                    placeholder="metres"
                                  />
                                </Field>
                                <Field>
                                  <Label>Remarks</Label>
                                  <TextInput
                                    value={rec.remarks ?? ''}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_PV_SITING',
                                        payload: { id: rec.id, updates: { remarks: v } },
                                      })
                                    }
                                    maxLength={200}
                                  />
                                </Field>
                                {(rec.availableAreaM2 ?? 0) > 0 && (
                                  <div className="bg-amber-50 rounded-lg p-3 space-y-0.5 text-xs text-amber-800">
                                    <p className="font-semibold">Derived estimates</p>
                                    <p>Capacity: {estCap.toFixed(1)} kWp</p>
                                    <p>
                                      Annual yield: ~{Math.round(estYield).toLocaleString()}{' '}
                                      kWh/year
                                    </p>
                                    <p>Carbon offset: ~{estCo2.toFixed(2)} tCO₂e/year</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      const newId = uid();
                      dispatch({
                        type: 'ADD_PV_SITING',
                        payload: { id: newId, parcelRoofId: '', availableAreaM2: 0 },
                      });
                      dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: `pv-${newId}` });
                    }}
                    className="flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium"
                  >
                    <Plus size={16} /> Add siting record
                  </button>

                  {state.pvSiting.length > 0 && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                      <p className="font-semibold text-amber-800 mb-1">PV siting summary</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-700">
                        <span>Total surveyed area:</span>
                        <span className="font-medium">
                          {state.pvSiting
                            .reduce((s, r) => s + (r.availableAreaM2 ?? 0), 0)
                            .toLocaleString()}{' '}
                          m²
                        </span>
                        <span>Total potential capacity:</span>
                        <span className="font-medium">
                          {state.pvSiting
                            .reduce((s, r) => s + (r.availableAreaM2 ?? 0) * 0.15, 0)
                            .toFixed(1)}{' '}
                          kWp
                        </span>
                        <span>Annual yield potential:</span>
                        <span className="font-medium">
                          {Math.round(
                            state.pvSiting.reduce((s, r) => {
                              const cap = (r.availableAreaM2 ?? 0) * 0.15;
                              return s + cap * 1200 * (1 - (r.shadingPercent ?? 0) / 100) * 0.8;
                            }, 0)
                          ).toLocaleString()}{' '}
                          kWh/year
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 7E: Battery Storage Planning */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                  <Zap size={18} className="text-purple-600" />
                  <div>
                    <h3 className="font-semibold text-gray-100">Battery storage systems (BESS)</h3>
                    <p className="text-xs text-gray-400">
                      Record planned or existing battery energy storage systems.
                    </p>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  {state.batteryStorage.map((rec) => {
                    const isExpanded = state.expandedCards.includes(`bess-${rec.id}`);
                    return (
                      <div
                        key={rec.id}
                        className="border border-purple-200 rounded-xl overflow-hidden bg-purple-50/30"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: `bess-${rec.id}` })
                          }
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-purple-50 transition-colors"
                        >
                          <span className="font-medium text-white text-sm min-w-[100px]">
                            {rec.batteryId || 'New BESS record'}
                          </span>
                          <span className="text-xs text-gray-400 flex-1">
                            {rec.application?.replace(/_/g, ' ') ?? ''}{' '}
                            {rec.targetAutonomyH !== undefined
                              ? `· ${rec.targetAutonomyH}h autonomy`
                              : ''}{' '}
                            {rec.maxDischargeKw !== undefined ? `· ${rec.maxDischargeKw} kW` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch({ type: 'REMOVE_BATTERY_STORAGE', payload: rec.id });
                            }}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-gray-400" />
                          ) : (
                            <ChevronRight size={16} className="text-gray-400" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-purple-100 bg-black/40 backdrop-blur-md">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                              <div className="space-y-3">
                                <Field>
                                  <Label required>Battery ID</Label>
                                  <TextInput
                                    value={rec.batteryId}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_BATTERY_STORAGE',
                                        payload: { id: rec.id, updates: { batteryId: v } },
                                      })
                                    }
                                    placeholder="BESS-01, Solar-Storage-Lab"
                                  />
                                </Field>
                                <Field>
                                  <Label>Application</Label>
                                  <select
                                    value={rec.application ?? ''}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_BATTERY_STORAGE',
                                        payload: {
                                          id: rec.id,
                                          updates: {
                                            application:
                                              (e.target.value as BatteryApplication) || undefined,
                                          },
                                        },
                                      })
                                    }
                                    className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                  >
                                    <option value="">— select —</option>
                                    <option value="solar_storage">Solar storage</option>
                                    <option value="backup_power">Backup power</option>
                                    <option value="peak_shaving">Peak shaving</option>
                                    <option value="grid_support">Grid support</option>
                                    <option value="ev_charging">EV charging</option>
                                    <option value="other">Other</option>
                                  </select>
                                </Field>
                                <Field>
                                  <Label>Target autonomy (hours)</Label>
                                  <div className="flex items-center gap-2">
                                    <NumberInput
                                      value={rec.targetAutonomyH}
                                      onChange={(v) =>
                                        dispatch({
                                          type: 'UPDATE_BATTERY_STORAGE',
                                          payload: { id: rec.id, updates: { targetAutonomyH: v } },
                                        })
                                      }
                                      min={0}
                                      step={0.5}
                                      placeholder="hours"
                                    />
                                    {[1, 2, 4, 8].map((h) => (
                                      <button
                                        key={h}
                                        type="button"
                                        onClick={() =>
                                          dispatch({
                                            type: 'UPDATE_BATTERY_STORAGE',
                                            payload: {
                                              id: rec.id,
                                              updates: { targetAutonomyH: h },
                                            },
                                          })
                                        }
                                        className="text-xs text-purple-700 border border-purple-300 px-1.5 py-1 rounded hover:bg-purple-50"
                                      >
                                        {h}h
                                      </button>
                                    ))}
                                  </div>
                                </Field>
                                <Field>
                                  <Label>Max discharge rate (kW)</Label>
                                  <NumberInput
                                    value={rec.maxDischargeKw}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_BATTERY_STORAGE',
                                        payload: { id: rec.id, updates: { maxDischargeKw: v } },
                                      })
                                    }
                                    min={0}
                                    placeholder="kW"
                                  />
                                </Field>
                              </div>
                              <div className="space-y-3">
                                <Field>
                                  <Label>Footprint (m²)</Label>
                                  <NumberInput
                                    value={rec.footprintM2}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_BATTERY_STORAGE',
                                        payload: { id: rec.id, updates: { footprintM2: v } },
                                      })
                                    }
                                    min={0}
                                    placeholder="floor area"
                                  />
                                </Field>
                                <Field>
                                  <Label>Fire code constraints</Label>
                                  <TextInput
                                    value={rec.fireCodeConstraints ?? ''}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_BATTERY_STORAGE',
                                        payload: {
                                          id: rec.id,
                                          updates: { fireCodeConstraints: v },
                                        },
                                      })
                                    }
                                    placeholder="Fire suppression required, 2h fire-rated room"
                                  />
                                </Field>
                                <Field>
                                  <Label>Preferred interconnection point</Label>
                                  <TextInput
                                    value={rec.preferredInterconnectionPoint ?? ''}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_BATTERY_STORAGE',
                                        payload: {
                                          id: rec.id,
                                          updates: { preferredInterconnectionPoint: v },
                                        },
                                      })
                                    }
                                    placeholder="Main LT panel, Solar inverter DC side"
                                  />
                                </Field>
                                <Field>
                                  <Label>Remarks</Label>
                                  <TextInput
                                    value={rec.remarks ?? ''}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_BATTERY_STORAGE',
                                        payload: { id: rec.id, updates: { remarks: v } },
                                      })
                                    }
                                  />
                                </Field>
                                {rec.maxDischargeKw && rec.targetAutonomyH && (
                                  <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-800 space-y-0.5">
                                    <p className="font-semibold">Sizing estimate</p>
                                    <p>
                                      Required capacity:{' '}
                                      <strong>
                                        {(rec.maxDischargeKw * rec.targetAutonomyH).toFixed(1)} kWh
                                      </strong>
                                    </p>
                                    <p>
                                      At 90% DoD:{' '}
                                      <strong>
                                        {((rec.maxDischargeKw * rec.targetAutonomyH) / 0.9).toFixed(
                                          1
                                        )}{' '}
                                        kWh nameplate
                                      </strong>
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      const newId = uid();
                      dispatch({
                        type: 'ADD_BATTERY_STORAGE',
                        payload: { id: newId, batteryId: '' },
                      });
                      dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: `bess-${newId}` });
                    }}
                    className="flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium"
                  >
                    <Plus size={16} /> Add battery storage system
                  </button>
                </div>
              </div>

              {/* 7F: Renewable Feasibility Assessment */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                  <BarChart3 size={18} className="text-green-600" />
                  <div>
                    <h3 className="font-semibold text-gray-100">
                      Renewable energy feasibility assessment
                    </h3>
                    <p className="text-xs text-gray-400">
                      Feasibility analysis per technology. Informs campus energy planning and future
                      investment.
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPrepopulateModal(true)}
                      className="text-xs text-green-700 border border-green-300 px-3 py-1 rounded-full hover:bg-green-50"
                    >
                      Add standard assessments
                    </button>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-xs text-gray-400">
                    Enter technologies assessed for this building. Assessment data informs planning
                    but is not used in current carbon calculation (unless no generation data is
                    available for solar).
                  </p>

                  {state.renewableAssessment.map((rec) => {
                    const isExpanded = state.expandedCards.includes(`assess-${rec.id}`);
                    const accentMap: Record<string, string> = {
                      solar_pv_rooftop: 'border-yellow-300 bg-yellow-50/30',
                      solar_pv_ground: 'border-yellow-300 bg-yellow-50/30',
                      wind_turbine: 'border-blue-300 bg-blue-50/30',
                      geothermal: 'border-teal-300 bg-teal-50/30',
                      biomass: 'border-green-300 bg-green-50/30',
                    };
                    const accent = accentMap[rec.energySource] ?? 'border-white/20 bg-white/5/30';
                    const co2Offset =
                      ((rec.approxAnnualGenerationPotentialMwh ?? 0) * 1000 * 0.716) / 1000;
                    const sourceLabel: Record<string, string> = {
                      solar_pv_rooftop: 'Solar PV (Rooftop)',
                      solar_pv_ground: 'Solar PV (Ground)',
                      wind_turbine: 'Wind Turbine',
                      geothermal: 'Geothermal',
                      biomass: 'Biomass',
                      small_hydro: 'Small Hydro',
                      other: 'Other',
                    };
                    return (
                      <div key={rec.id} className={`border rounded-xl overflow-hidden ${accent}`}>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: `assess-${rec.id}` })
                          }
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/40 backdrop-blur-md/50 transition-colors"
                        >
                          <span className="font-medium text-white text-sm min-w-[150px]">
                            {sourceLabel[rec.energySource] ?? rec.energySource}
                          </span>
                          <span className="text-xs text-gray-400 flex-1">
                            {rec.estimatedInstallationCapacityKw
                              ? `${rec.estimatedInstallationCapacityKw} kW`
                              : ''}{' '}
                            {rec.approxAnnualGenerationPotentialMwh
                              ? `· ${rec.approxAnnualGenerationPotentialMwh} MWh/yr`
                              : ''}{' '}
                            {rec.estimatedCapexLakhs ? `· ₹${rec.estimatedCapexLakhs}L CAPEX` : ''}
                          </span>
                          {co2Offset > 0 && (
                            <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              −{co2Offset.toFixed(1)} tCO₂e/yr potential
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch({ type: 'REMOVE_RENEWABLE_ASSESSMENT', payload: rec.id });
                            }}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-gray-400" />
                          ) : (
                            <ChevronRight size={16} className="text-gray-400" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-white/5 bg-black/40 backdrop-blur-md">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                              {/* Group A: Site characteristics */}
                              <div className="space-y-3">
                                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                                  Site characteristics
                                </p>
                                <Field>
                                  <Label>Energy source</Label>
                                  <select
                                    value={rec.energySource}
                                    onChange={(e) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: {
                                            energySource: e.target.value as AssessedEnergySource,
                                          },
                                        },
                                      })
                                    }
                                    className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                  >
                                    <option value="solar_pv_rooftop">Solar PV (Rooftop)</option>
                                    <option value="solar_pv_ground">Solar PV (Ground)</option>
                                    <option value="wind_turbine">Wind Turbine</option>
                                    <option value="geothermal">Geothermal</option>
                                    <option value="biomass">Biomass</option>
                                    <option value="small_hydro">Small Hydro</option>
                                    <option value="other">Other</option>
                                  </select>
                                </Field>
                                <Field>
                                  <Label>Available land area (m²)</Label>
                                  <NumberInput
                                    value={rec.availableLandAreaM2}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: { availableLandAreaM2: v },
                                        },
                                      })
                                    }
                                    min={0}
                                  />
                                </Field>
                                <Field>
                                  <Label>Available roof area (m²)</Label>
                                  <NumberInput
                                    value={rec.availableRoofAreaM2}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: { availableRoofAreaM2: v },
                                        },
                                      })
                                    }
                                    min={0}
                                  />
                                </Field>
                                <Field>
                                  <Label>Max permissible height (m)</Label>
                                  <NumberInput
                                    value={rec.maxPermissibleHeightM}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: { maxPermissibleHeightM: v },
                                        },
                                      })
                                    }
                                    min={0}
                                  />
                                </Field>
                                <Field>
                                  <div className="flex items-center justify-between">
                                    <Label>Shading issues</Label>
                                    <Toggle
                                      checked={rec.shadingIssues ?? false}
                                      onChange={(v) =>
                                        dispatch({
                                          type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                          payload: { id: rec.id, updates: { shadingIssues: v } },
                                        })
                                      }
                                    />
                                  </div>
                                  {rec.shadingIssues && (
                                    <TextInput
                                      value={rec.shadingDetails ?? ''}
                                      onChange={(v) =>
                                        dispatch({
                                          type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                          payload: { id: rec.id, updates: { shadingDetails: v } },
                                        })
                                      }
                                      placeholder="Details of shading issues"
                                    />
                                  )}
                                </Field>
                              </div>

                              {/* Group B: Resource & feasibility */}
                              <div className="space-y-3">
                                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                                  Resource & feasibility
                                </p>
                                <Field>
                                  <Label>Avg annual resource availability</Label>
                                  <TextInput
                                    value={rec.avgAnnualResourceAvailability ?? ''}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: { avgAnnualResourceAvailability: v },
                                        },
                                      })
                                    }
                                    placeholder="5.2 kWh/m²/day or 5.8 m/s at 50m hub"
                                  />
                                </Field>
                                <Field>
                                  <Label>Est. installation capacity (kW)</Label>
                                  <NumberInput
                                    value={rec.estimatedInstallationCapacityKw}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: { estimatedInstallationCapacityKw: v },
                                        },
                                      })
                                    }
                                    min={0}
                                    placeholder="kW"
                                  />
                                </Field>
                                <Field>
                                  <Label>Annual generation potential (MWh)</Label>
                                  <NumberInput
                                    value={rec.approxAnnualGenerationPotentialMwh}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: { approxAnnualGenerationPotentialMwh: v },
                                        },
                                      })
                                    }
                                    min={0}
                                    placeholder="MWh/year"
                                  />
                                  {(rec.approxAnnualGenerationPotentialMwh ?? 0) > 0 && (
                                    <Helper>
                                      ≈ −{co2Offset.toFixed(2)} tCO₂e/year carbon offset potential
                                    </Helper>
                                  )}
                                </Field>
                                <Field>
                                  <Label>Estimated CAPEX (₹ Lakhs)</Label>
                                  <NumberInput
                                    value={rec.estimatedCapexLakhs}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: { estimatedCapexLakhs: v },
                                        },
                                      })
                                    }
                                    min={0}
                                  />
                                </Field>
                                <Field>
                                  <Label>Expected payback (years)</Label>
                                  <NumberInput
                                    value={rec.expectedPaybackYears}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: { expectedPaybackYears: v },
                                        },
                                      })
                                    }
                                    min={0}
                                    step={0.5}
                                  />
                                </Field>
                                <Field>
                                  <Label>Policy/approval constraints</Label>
                                  <TextInput
                                    value={rec.policyApprovalConstraints ?? ''}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: {
                                          id: rec.id,
                                          updates: { policyApprovalConstraints: v },
                                        },
                                      })
                                    }
                                    placeholder="Forest clearance, defence height restriction…"
                                    maxLength={300}
                                  />
                                </Field>
                                <Field>
                                  <Label>Remarks</Label>
                                  <TextInput
                                    value={rec.remarks ?? ''}
                                    onChange={(v) =>
                                      dispatch({
                                        type: 'UPDATE_RENEWABLE_ASSESSMENT',
                                        payload: { id: rec.id, updates: { remarks: v } },
                                      })
                                    }
                                    maxLength={300}
                                  />
                                </Field>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      const newId = uid();
                      dispatch({
                        type: 'ADD_RENEWABLE_ASSESSMENT',
                        payload: { id: newId, energySource: 'solar_pv_rooftop' },
                      });
                      dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: `assess-${newId}` });
                    }}
                    className="flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium"
                  >
                    <Plus size={16} /> Add technology assessment
                  </button>

                  {/* Renewable potential summary */}
                  {state.renewableAssessment.filter((a) => a.approxAnnualGenerationPotentialMwh)
                    .length > 0 &&
                    (() => {
                      const assessed = state.renewableAssessment.filter(
                        (a) => a.approxAnnualGenerationPotentialMwh
                      );
                      const totalMwh = assessed.reduce(
                        (s, a) => s + (a.approxAnnualGenerationPotentialMwh ?? 0),
                        0
                      );
                      const totalKw = assessed.reduce(
                        (s, a) => s + (a.estimatedInstallationCapacityKw ?? 0),
                        0
                      );
                      const totalCo2 = (totalMwh * 1000 * 0.716) / 1000;
                      const sourceLabel: Record<string, string> = {
                        solar_pv_rooftop: 'Solar PV (Rooftop)',
                        solar_pv_ground: 'Solar PV (Ground)',
                        wind_turbine: 'Wind Turbine',
                        geothermal: 'Geothermal',
                        biomass: 'Biomass',
                        small_hydro: 'Small Hydro',
                        other: 'Other',
                      };
                      return (
                        <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-5">
                          <h4 className="font-semibold text-green-900 mb-3">
                            Renewable potential for this building
                          </h4>
                          <table className="w-full text-sm mb-3">
                            <thead>
                              <tr className="text-xs text-gray-400 border-b border-green-200">
                                <th className="text-left py-1.5">Technology</th>
                                <th className="text-right py-1.5">Capacity (kW)</th>
                                <th className="text-right py-1.5">Annual (MWh)</th>
                                <th className="text-right py-1.5">CAPEX (₹L)</th>
                                <th className="text-right py-1.5">CO₂ offset (tCO₂e/yr)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assessed.map((a) => (
                                <tr key={a.id} className="border-b border-green-100 last:border-0">
                                  <td className="py-1.5 text-gray-100 font-medium">
                                    {sourceLabel[a.energySource] ?? a.energySource}
                                  </td>
                                  <td className="py-1.5 text-right text-gray-200">
                                    {a.estimatedInstallationCapacityKw?.toLocaleString() ?? '—'}
                                  </td>
                                  <td className="py-1.5 text-right text-gray-200">
                                    {a.approxAnnualGenerationPotentialMwh?.toLocaleString() ?? '—'}
                                  </td>
                                  <td className="py-1.5 text-right text-gray-200">
                                    {a.estimatedCapexLakhs ?? '—'}
                                  </td>
                                  <td className="py-1.5 text-right text-green-700 font-medium">
                                    −
                                    {(
                                      ((a.approxAnnualGenerationPotentialMwh ?? 0) * 1000 * 0.716) /
                                      1000
                                    ).toFixed(1)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="font-semibold text-green-900">
                                <td className="pt-2">Total potential</td>
                                <td className="pt-2 text-right">{totalKw.toLocaleString()} kW</td>
                                <td className="pt-2 text-right">{totalMwh.toLocaleString()} MWh</td>
                                <td className="pt-2 text-right">—</td>
                                <td className="pt-2 text-right text-green-700">
                                  −{totalCo2.toFixed(1)} tCO₂e/yr
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      );
                    })()}
                </div>
              </div>
            </section>

            {/* ─────────────── SECTION 8: BILLING ANALYTICS & POWER QUALITY ─────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['billing-analytics'] = el;
              }}
              id="billing-analytics"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Billing analytics & power quality
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  These records are for financial analysis and power quality monitoring. They do not
                  affect the carbon calculation but are essential for campus energy management and
                  help cross-check the utility bill data from Section 6.
                </p>
                <div className="mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300">
                  <Info size={12} className="inline mr-1" />
                  Data in this section links to your utility bills (Section 6). Consumer numbers
                  should match what you entered there.
                </div>
              </div>

              {/* ── 8A: Tariff schedule (5.1) ── */}
              <div className="mb-8">
                <h3 className="text-base font-semibold text-gray-100 mb-1">Tariff schedule</h3>
                <p className="text-xs text-gray-400 mb-3">
                  Record the utility's billing rate structure. This enables cost analysis alongside
                  the carbon calculation.
                </p>

                {state.tariffSchedules.map((ts) => {
                  const isExpanded = state.expandedCards.includes(ts.id);
                  return (
                    <div
                      key={ts.id}
                      className="border border-white/10 rounded-xl overflow-hidden bg-black/40 backdrop-blur-md mb-3"
                    >
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: ts.id })}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                      >
                        <span className="font-medium text-white text-sm min-w-[120px]">
                          {ts.consumerNumber || 'New tariff'}
                        </span>
                        <span className="text-xs text-gray-400">{ts.tariffCode || '—'}</span>
                        {ts.energyChargePerKwh && (
                          <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            ₹{ts.energyChargePerKwh}/kWh
                          </span>
                        )}
                        {ts.hasTodPricing && (
                          <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                            TOD
                          </span>
                        )}
                        {ts.effectiveFrom && (
                          <span className="text-xs text-gray-400 ml-auto">{ts.effectiveFrom}</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'REMOVE_TARIFF_SCHEDULE', payload: ts.id });
                          }}
                          className="text-red-400 hover:text-red-600 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                        {isExpanded ? (
                          <ChevronDown size={16} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={16} className="text-gray-400" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-white/5 bg-white/5 space-y-4 pt-4">
                          {/* Group A — Identity */}
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                              Identity
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <Field>
                                <Label required>Consumer number</Label>
                                <TextInput
                                  value={ts.consumerNumber}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { consumerNumber: v } },
                                    })
                                  }
                                  placeholder="Should match utility bills"
                                />
                              </Field>
                              <Field>
                                <Label required>Tariff code</Label>
                                <TextInput
                                  value={ts.tariffCode}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { tariffCode: v } },
                                    })
                                  }
                                  placeholder="HT-1, LT-2, MSME, Industrial-II"
                                />
                              </Field>
                              <Field>
                                <Label>Effective from</Label>
                                <TextInput
                                  value={ts.effectiveFrom ?? ''}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { effectiveFrom: v } },
                                    })
                                  }
                                  placeholder="April 2024"
                                />
                              </Field>
                            </div>
                          </div>

                          {/* Group B — Energy charges */}
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                              Energy charges
                            </p>
                            <div className="mb-3 flex items-center gap-3">
                              <Label>Time-of-Day (TOD) tariff?</Label>
                              <Toggle
                                checked={ts.hasTodPricing}
                                onChange={(v) =>
                                  dispatch({
                                    type: 'UPDATE_TARIFF_SCHEDULE',
                                    payload: { id: ts.id, updates: { hasTodPricing: v } },
                                  })
                                }
                              />
                            </div>
                            {!ts.hasTodPricing ? (
                              <Field>
                                <Label>Energy charge (₹/kWh)</Label>
                                <NumberInput
                                  value={ts.energyChargePerKwh}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { energyChargePerKwh: v } },
                                    })
                                  }
                                  min={0}
                                  step={0.01}
                                />
                              </Field>
                            ) : (
                              <div>
                                <p className="text-xs text-gray-400 mb-2">
                                  Define time-of-day pricing blocks (must cover full 24 hours)
                                </p>
                                {ts.todBlocks.map((block, bi) => (
                                  <div key={bi} className="flex gap-2 items-center mb-2">
                                    <input
                                      type="text"
                                      value={block.name}
                                      onChange={(e) => {
                                        const blocks = ts.todBlocks.map((b, i) =>
                                          i === bi ? { ...b, name: e.target.value } : b
                                        );
                                        dispatch({
                                          type: 'UPDATE_TARIFF_SCHEDULE',
                                          payload: { id: ts.id, updates: { todBlocks: blocks } },
                                        });
                                      }}
                                      placeholder="Peak"
                                      className="w-20 rounded border border-white/20 px-2 py-1 text-xs"
                                    />
                                    <input
                                      type="time"
                                      value={block.startTime}
                                      onChange={(e) => {
                                        const blocks = ts.todBlocks.map((b, i) =>
                                          i === bi ? { ...b, startTime: e.target.value } : b
                                        );
                                        dispatch({
                                          type: 'UPDATE_TARIFF_SCHEDULE',
                                          payload: { id: ts.id, updates: { todBlocks: blocks } },
                                        });
                                      }}
                                      className="rounded border border-white/20 px-2 py-1 text-xs"
                                    />
                                    <span className="text-xs text-gray-400">to</span>
                                    <input
                                      type="time"
                                      value={block.endTime}
                                      onChange={(e) => {
                                        const blocks = ts.todBlocks.map((b, i) =>
                                          i === bi ? { ...b, endTime: e.target.value } : b
                                        );
                                        dispatch({
                                          type: 'UPDATE_TARIFF_SCHEDULE',
                                          payload: { id: ts.id, updates: { todBlocks: blocks } },
                                        });
                                      }}
                                      className="rounded border border-white/20 px-2 py-1 text-xs"
                                    />
                                    <input
                                      type="number"
                                      value={block.ratePerKwh}
                                      onChange={(e) => {
                                        const blocks = ts.todBlocks.map((b, i) =>
                                          i === bi
                                            ? { ...b, ratePerKwh: parseFloat(e.target.value) || 0 }
                                            : b
                                        );
                                        dispatch({
                                          type: 'UPDATE_TARIFF_SCHEDULE',
                                          payload: { id: ts.id, updates: { todBlocks: blocks } },
                                        });
                                      }}
                                      placeholder="₹/kWh"
                                      step={0.01}
                                      className="w-20 rounded border border-white/20 px-2 py-1 text-xs"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const blocks = ts.todBlocks.filter((_, i) => i !== bi);
                                        dispatch({
                                          type: 'UPDATE_TARIFF_SCHEDULE',
                                          payload: { id: ts.id, updates: { todBlocks: blocks } },
                                        });
                                      }}
                                      className="text-red-400 hover:text-red-600"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newBlock: ITodBlock = {
                                      name: 'Block',
                                      startTime: '00:00',
                                      endTime: '06:00',
                                      ratePerKwh: 0,
                                    };
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: {
                                        id: ts.id,
                                        updates: { todBlocks: [...ts.todBlocks, newBlock] },
                                      },
                                    });
                                  }}
                                  className="flex items-center gap-1 text-xs text-green-700 font-medium mt-1"
                                >
                                  <Plus size={12} /> Add TOD block
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Group C — Demand & PF */}
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                              Demand & power factor
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field>
                                <Label>Demand charge (₹/kVA/month)</Label>
                                <NumberInput
                                  value={ts.demandChargePerKva}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { demandChargePerKva: v } },
                                    })
                                  }
                                  min={0}
                                  step={0.01}
                                />
                              </Field>
                              <Field>
                                <Label>PF incentive threshold</Label>
                                <NumberInput
                                  value={ts.pfIncentiveThreshold}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { pfIncentiveThreshold: v } },
                                    })
                                  }
                                  min={0.8}
                                  max={1}
                                  step={0.01}
                                />
                                <Helper>PF above this earns discount. Typical: 0.95</Helper>
                              </Field>
                              <Field>
                                <Label>PF penalty threshold</Label>
                                <NumberInput
                                  value={ts.pfPenaltyThreshold}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { pfPenaltyThreshold: v } },
                                    })
                                  }
                                  min={0.8}
                                  max={1}
                                  step={0.01}
                                />
                                <Helper>PF below this incurs surcharge. Typical: 0.90</Helper>
                              </Field>
                              <Field>
                                <Label>PF incentive rate (%)</Label>
                                <NumberInput
                                  value={ts.pfIncentiveRatePercent}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: {
                                        id: ts.id,
                                        updates: { pfIncentiveRatePercent: v },
                                      },
                                    })
                                  }
                                  min={0}
                                  step={0.1}
                                />
                              </Field>
                              <Field>
                                <Label>PF penalty rate (%)</Label>
                                <NumberInput
                                  value={ts.pfPenaltyRatePercent}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { pfPenaltyRatePercent: v } },
                                    })
                                  }
                                  min={0}
                                  step={0.1}
                                />
                              </Field>
                              <Field>
                                <Label>Surcharges & taxes (%)</Label>
                                <NumberInput
                                  value={ts.surchargesAndTaxesPercent}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: {
                                        id: ts.id,
                                        updates: { surchargesAndTaxesPercent: v },
                                      },
                                    })
                                  }
                                  min={0}
                                  step={0.1}
                                />
                              </Field>
                              <Field className="md:col-span-2">
                                <Label>Surcharges description</Label>
                                <TextInput
                                  value={ts.surchargesDescription ?? ''}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { surchargesDescription: v } },
                                    })
                                  }
                                  placeholder="Electricity duty 5%, wheeling charges, FSA"
                                  maxLength={200}
                                />
                              </Field>
                              <Field className="md:col-span-2">
                                <Label>Remarks</Label>
                                <TextInput
                                  value={ts.remarks ?? ''}
                                  onChange={(v) =>
                                    dispatch({
                                      type: 'UPDATE_TARIFF_SCHEDULE',
                                      payload: { id: ts.id, updates: { remarks: v } },
                                    })
                                  }
                                  maxLength={300}
                                />
                              </Field>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    const newTs: ITariffSchedule = {
                      id: uid(),
                      consumerNumber: '',
                      tariffCode: '',
                      hasTodPricing: false,
                      todBlocks: [],
                    };
                    dispatch({ type: 'ADD_TARIFF_SCHEDULE', payload: newTs });
                    dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: newTs.id });
                  }}
                  className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800 font-medium mt-2"
                >
                  <Plus size={14} /> Add tariff schedule
                </button>
              </div>

              {/* ── 8B: Contracted max demand vs actual (5.2) ── */}
              <div className="mb-8">
                <h3 className="text-base font-semibold text-gray-100 mb-1">
                  Contracted demand vs actual demand
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Track how actual demand compares to your contracted maximum demand (CMD) each
                  month. Over-drawing CMD incurs penalties. Under-utilising CMD wastes contracted
                  capacity charges.
                </p>

                {state.cmdVsActual.length > 0 && (
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-gray-400 text-[10px] uppercase tracking-wide">
                          <th className="px-2 py-1.5 text-left">Consumer No.</th>
                          <th className="px-2 py-1.5 text-left">Month</th>
                          <th className="px-2 py-1.5 text-center">CMD (kVA)</th>
                          <th className="px-2 py-1.5 text-center">Billed MD (kVA)</th>
                          <th className="px-2 py-1.5 text-center">Interval Peak (kVA)</th>
                          <th className="px-2 py-1.5 text-center">Utilisation %</th>
                          <th className="px-2 py-1.5 text-center">Status</th>
                          <th className="px-2 py-1.5 text-left">Remarks</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {state.cmdVsActual.map((rec) => {
                          const util =
                            rec.billedMdKva && rec.contractedMdKva
                              ? (rec.billedMdKva / rec.contractedMdKva) * 100
                              : null;
                          const exceeded =
                            rec.billedMdKva &&
                            rec.contractedMdKva &&
                            rec.billedMdKva > rec.contractedMdKva;
                          const statusChip =
                            util === null
                              ? null
                              : exceeded
                                ? { label: 'CMD exceeded', cls: 'bg-red-100 text-red-700' }
                                : util > 95
                                  ? { label: 'Near limit', cls: 'bg-red-100 text-red-700' }
                                  : util > 85
                                    ? { label: 'Good', cls: 'bg-amber-100 text-amber-700' }
                                    : util > 70
                                      ? { label: 'Optimal', cls: 'bg-green-100 text-green-700' }
                                      : util > 50
                                        ? {
                                            label: 'Under-utilised',
                                            cls: 'bg-amber-100 text-amber-700',
                                          }
                                        : {
                                            label: 'Significantly under',
                                            cls: 'bg-red-100 text-red-700',
                                          };
                          return (
                            <tr key={rec.id} className="hover:bg-white/5">
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={rec.consumerNumber}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_CMD_RECORD',
                                      payload: {
                                        id: rec.id,
                                        updates: { consumerNumber: e.target.value },
                                      },
                                    })
                                  }
                                  className="w-24 rounded border border-white/10 px-1.5 py-0.5 text-xs"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={rec.month}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_CMD_RECORD',
                                      payload: { id: rec.id, updates: { month: e.target.value } },
                                    })
                                  }
                                  className="w-28 rounded border border-white/10 px-1.5 py-0.5 text-xs"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  value={rec.contractedMdKva || ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_CMD_RECORD',
                                      payload: {
                                        id: rec.id,
                                        updates: {
                                          contractedMdKva: parseFloat(e.target.value) || 0,
                                        },
                                      },
                                    })
                                  }
                                  className="w-20 rounded border border-white/10 px-1.5 py-0.5 text-xs text-center"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  value={rec.billedMdKva ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_CMD_RECORD',
                                      payload: {
                                        id: rec.id,
                                        updates: {
                                          billedMdKva: parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  className={cn(
                                    'w-20 rounded border px-1.5 py-0.5 text-xs text-center',
                                    exceeded ? 'border-red-400' : 'border-white/10'
                                  )}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  value={rec.intervalPeakKva ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_CMD_RECORD',
                                      payload: {
                                        id: rec.id,
                                        updates: {
                                          intervalPeakKva: parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  className="w-20 rounded border border-white/10 px-1.5 py-0.5 text-xs text-center"
                                />
                              </td>
                              <td className="px-2 py-1 text-center text-gray-300">
                                {util !== null ? `${util.toFixed(1)}%` : '—'}
                              </td>
                              <td className="px-2 py-1 text-center">
                                {statusChip && (
                                  <span
                                    className={cn(
                                      'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                                      statusChip.cls
                                    )}
                                  >
                                    {statusChip.label}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={rec.remarks ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_CMD_RECORD',
                                      payload: { id: rec.id, updates: { remarks: e.target.value } },
                                    })
                                  }
                                  className="w-28 rounded border border-white/10 px-1.5 py-0.5 text-xs"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    dispatch({ type: 'REMOVE_CMD_RECORD', payload: rec.id })
                                  }
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <X size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'ADD_CMD_RECORD',
                        payload: {
                          id: uid(),
                          consumerNumber: '',
                          month: '',
                          monthIndex: 1,
                          year: new Date().getFullYear(),
                          contractedMdKva: 0,
                        },
                      })
                    }
                    className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800 font-medium"
                  >
                    <Plus size={14} /> Add month
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const months = Array.from({ length: 12 }, (_, i) => {
                        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                        return {
                          month: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
                          monthIndex: d.getMonth() + 1,
                          year: d.getFullYear(),
                        };
                      });
                      dispatch({
                        type: 'BULK_ADD_CMD_MONTHS',
                        payload: months.map(({ month, monthIndex, year }) => ({
                          id: uid(),
                          consumerNumber: '',
                          month,
                          monthIndex,
                          year,
                          contractedMdKva: 0,
                        })),
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Add 12 months
                  </button>
                </div>

                {/* CMD analysis summary */}
                {cmdAnalysis && (
                  <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm">
                    <p className="font-medium text-purple-900 mb-2">CMD analysis</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-purple-800">
                      <span>
                        Average CMD utilisation:{' '}
                        <strong>{cmdAnalysis.avgUtilisation.toFixed(1)}%</strong>
                      </span>
                      <span>
                        Peak billed demand:{' '}
                        <strong>{cmdAnalysis.maxBilledMd.toLocaleString()} kVA</strong>
                      </span>
                      {cmdAnalysis.monthsExceeding > 0 && (
                        <span className="text-red-700 font-medium">
                          ⚠ Months exceeding CMD: {cmdAnalysis.monthsExceeding}
                        </span>
                      )}
                      {cmdAnalysis.monthsBelow60 > 0 && (
                        <span className="text-amber-700">
                          Months below 60%: {cmdAnalysis.monthsBelow60}
                        </span>
                      )}
                    </div>
                    {cmdAnalysis.avgUtilisation < 70 && (
                      <div className="mt-2 text-xs text-purple-700 bg-purple-100 rounded-lg p-2">
                        Your average demand utilisation is {cmdAnalysis.avgUtilisation.toFixed(1)}%.
                        Consider reducing your contracted demand to lower monthly demand charges.
                        Contact your utility to revise the CMD.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── 8C: Power factor trend (5.3) ── */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-100 mb-1">Power factor trend</h3>
                <p className="text-xs text-gray-400 mb-3">
                  Monthly PF tracking shows whether power factor correction equipment (capacitor
                  banks) is working effectively. Sustained PF {'>'} 0.95 earns utility incentives.
                </p>

                {state.pfTrend.length > 0 && (
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-gray-400 text-[10px] uppercase tracking-wide">
                          <th className="px-2 py-1.5 text-left">Consumer No.</th>
                          <th className="px-2 py-1.5 text-left">Month</th>
                          <th className="px-2 py-1.5 text-center">Avg PF</th>
                          <th className="px-2 py-1.5 text-center">Min PF</th>
                          <th className="px-2 py-1.5 text-center">Penalty/Incentive (₹)</th>
                          <th className="px-2 py-1.5 text-center">Status</th>
                          <th className="px-2 py-1.5 text-left">Remarks</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {state.pfTrend.map((rec) => {
                          const pf = rec.averagePf;
                          const pfStatus =
                            pf >= PF_THRESHOLDS.good
                              ? {
                                  label: 'Good — incentive zone',
                                  cls: 'bg-green-100 text-green-700',
                                }
                              : pf >= PF_THRESHOLDS.acceptable
                                ? { label: 'Acceptable', cls: 'bg-amber-100 text-amber-700' }
                                : { label: 'Poor — penalty zone', cls: 'bg-red-100 text-red-700' };
                          return (
                            <tr key={rec.id} className="hover:bg-white/5">
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={rec.consumerNumber}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_PF_RECORD',
                                      payload: {
                                        id: rec.id,
                                        updates: { consumerNumber: e.target.value },
                                      },
                                    })
                                  }
                                  className="w-24 rounded border border-white/10 px-1.5 py-0.5 text-xs"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={rec.month}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_PF_RECORD',
                                      payload: { id: rec.id, updates: { month: e.target.value } },
                                    })
                                  }
                                  className="w-28 rounded border border-white/10 px-1.5 py-0.5 text-xs"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  value={rec.averagePf || ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_PF_RECORD',
                                      payload: {
                                        id: rec.id,
                                        updates: { averagePf: parseFloat(e.target.value) || 0 },
                                      },
                                    })
                                  }
                                  min={0.7}
                                  max={1}
                                  step={0.001}
                                  className="w-20 rounded border border-white/10 px-1.5 py-0.5 text-xs text-center"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  value={rec.minimumPf ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_PF_RECORD',
                                      payload: {
                                        id: rec.id,
                                        updates: {
                                          minimumPf: parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  min={0.7}
                                  max={1}
                                  step={0.001}
                                  className="w-20 rounded border border-white/10 px-1.5 py-0.5 text-xs text-center"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  value={rec.penaltyOrIncentiveRs ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_PF_RECORD',
                                      payload: {
                                        id: rec.id,
                                        updates: {
                                          penaltyOrIncentiveRs:
                                            parseFloat(e.target.value) || undefined,
                                        },
                                      },
                                    })
                                  }
                                  step={1}
                                  className={cn(
                                    'w-28 rounded border px-1.5 py-0.5 text-xs text-center',
                                    (rec.penaltyOrIncentiveRs ?? 0) > 0
                                      ? 'text-red-700 border-red-300'
                                      : (rec.penaltyOrIncentiveRs ?? 0) < 0
                                        ? 'text-green-700 border-green-300'
                                        : 'border-white/10'
                                  )}
                                />
                              </td>
                              <td className="px-2 py-1 text-center">
                                {pf > 0 && (
                                  <span
                                    className={cn(
                                      'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                                      pfStatus.cls
                                    )}
                                  >
                                    {pfStatus.label}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={rec.remarks ?? ''}
                                  onChange={(e) =>
                                    dispatch({
                                      type: 'UPDATE_PF_RECORD',
                                      payload: { id: rec.id, updates: { remarks: e.target.value } },
                                    })
                                  }
                                  className="w-28 rounded border border-white/10 px-1.5 py-0.5 text-xs"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    dispatch({ type: 'REMOVE_PF_RECORD', payload: rec.id })
                                  }
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <X size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'ADD_PF_RECORD',
                        payload: {
                          id: uid(),
                          consumerNumber: '',
                          month: '',
                          monthIndex: 1,
                          year: new Date().getFullYear(),
                          averagePf: 0,
                        },
                      })
                    }
                    className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800 font-medium"
                  >
                    <Plus size={14} /> Add month
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const months = Array.from({ length: 12 }, (_, i) => {
                        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                        return {
                          month: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
                          monthIndex: d.getMonth() + 1,
                          year: d.getFullYear(),
                        };
                      });
                      dispatch({
                        type: 'BULK_ADD_PF_MONTHS',
                        payload: months.map(({ month, monthIndex, year }) => ({
                          id: uid(),
                          consumerNumber: '',
                          month,
                          monthIndex,
                          year,
                          averagePf: 0,
                        })),
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Add 12 months
                  </button>
                </div>

                {/* PF trend analysis summary */}
                {pfAnalysis && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">Avg PF</p>
                        <p
                          className={cn(
                            'text-lg font-bold',
                            pfAnalysis.avgPf >= 0.95
                              ? 'text-green-700'
                              : pfAnalysis.avgPf >= 0.9
                                ? 'text-amber-700'
                                : 'text-red-700'
                          )}
                        >
                          {pfAnalysis.avgPf.toFixed(3)}
                        </p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">Annual PF penalty</p>
                        <p className="text-lg font-bold text-red-700">
                          ₹{pfAnalysis.annualPenalty.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">Annual PF incentive</p>
                        <p className="text-lg font-bold text-green-700">
                          ₹{pfAnalysis.annualIncentive.toLocaleString()}
                        </p>
                      </div>
                      <div
                        className={cn(
                          'rounded-lg p-3 text-center',
                          pfAnalysis.netImpact > 0 ? 'bg-red-50' : 'bg-green-50'
                        )}
                      >
                        <p className="text-xs text-gray-400">Net PF impact</p>
                        <p
                          className={cn(
                            'text-lg font-bold',
                            pfAnalysis.netImpact > 0 ? 'text-red-700' : 'text-green-700'
                          )}
                        >
                          {pfAnalysis.netImpact > 0 ? '+' : ''}₹
                          {pfAnalysis.netImpact.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-300 space-y-0.5">
                      <p>
                        Months in penalty zone:{' '}
                        <strong className="text-red-700">{pfAnalysis.monthsInPenalty}</strong> of{' '}
                        {state.pfTrend.filter((r) => r.averagePf).length}
                      </p>
                      <p>
                        Months earning incentive:{' '}
                        <strong className="text-green-700">{pfAnalysis.monthsIncentive}</strong>
                      </p>
                      {pfAnalysis.trend > 0.01 && (
                        <p className="text-green-700">
                          ↑ PF has improved by {pfAnalysis.trend.toFixed(3)} — correction equipment
                          working
                        </p>
                      )}
                    </div>
                    {/* Capacitor bank cross-check */}
                    {state.capacitorBanks.some((b) => b.averageMeteredPf) &&
                      pfAnalysis.avgPf > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                          <p className="font-medium text-amber-800 mb-1">
                            Capacitor bank cross-check
                          </p>
                          {(() => {
                            const avgCapPf =
                              state.capacitorBanks
                                .filter((b) => b.averageMeteredPf)
                                .reduce((s, b) => s + (b.averageMeteredPf ?? 0), 0) /
                              state.capacitorBanks.filter((b) => b.averageMeteredPf).length;
                            const diff = avgCapPf - pfAnalysis.avgPf;
                            return (
                              <p
                                className={cn(
                                  'text-amber-700',
                                  diff > 0.05 ? 'text-amber-800 font-medium' : ''
                                )}
                              >
                                Capacitor banks metered avg PF: {avgCapPf.toFixed(3)} | Trend avg:{' '}
                                {pfAnalysis.avgPf.toFixed(3)}
                                {diff > 0.05
                                  ? ' — Capacitor banks may not be operating optimally. Check control settings.'
                                  : ' — Consistent'}
                              </p>
                            );
                          })()}
                        </div>
                      )}
                  </div>
                )}
              </div>
            </section>

            {/* ── SECTION: GRID EMISSION FACTORS (Phase 6) ─────────────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['grid-emission-factors'] = el;
              }}
              id="grid-emission-factors"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">Grid emission factors</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Enter the actual grid emission factor for your utility supply. This directly
                  determines the accuracy of your Scope 2 carbon calculation. Leaving this empty
                  uses the national CEA average of 0.716 kgCO₂/kWh.
                </p>
              </div>

              {/* Current EF banner */}
              <div
                className={cn(
                  'rounded-xl p-4 mb-5 border',
                  effectiveGridEf.source !== 'default'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                )}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  Current emission factor in use
                </p>
                <p
                  className={cn(
                    'text-lg font-bold',
                    effectiveGridEf.source !== 'default' ? 'text-green-700' : 'text-amber-700'
                  )}
                >
                  {effectiveGridEf.gross.toFixed(3)} kgCO₂/kWh
                  {effectiveGridEf.source !== 'default'
                    ? ` (user-entered — year ${effectiveGridEf.source.replace('user_', '')})`
                    : ' (CEA 2023 national average — default)'}
                </p>
                {effectiveGridEf.tdLoss > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    T&D loss applied: {effectiveGridEf.tdLoss}% gross-up (net{' '}
                    {effectiveGridEf.ef.toFixed(3)} → gross {effectiveGridEf.gross.toFixed(3)})
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Carbon calculation updates automatically when you change this.
                </p>
              </div>

              {/* EF records table */}
              <div className="space-y-3 mb-4">
                {state.gridEmissionFactors.map((ef) => {
                  const gross =
                    (ef.tdLossPercent ?? 0) > 0
                      ? ef.emissionFactorKgCo2PerKwhr / (1 - (ef.tdLossPercent ?? 0) / 100)
                      : ef.emissionFactorKgCo2PerKwhr;
                  const ceaVal = CEA_EMISSION_FACTORS_BY_YEAR[ef.year];
                  const diffPct = ceaVal
                    ? Math.abs(((ef.emissionFactorKgCo2PerKwhr - ceaVal) / ceaVal) * 100)
                    : 0;
                  return (
                    <div key={ef.id} className="border border-white/10 rounded-xl p-4 bg-black/40 backdrop-blur-md">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Consumer number
                          </label>
                          <input
                            type="text"
                            value={ef.consumerNumber}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_GRID_EF',
                                payload: { id: ef.id, updates: { consumerNumber: e.target.value } },
                              })
                            }
                            className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder="e.g. UP123456"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Year
                          </label>
                          <select
                            value={ef.year}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_GRID_EF',
                                payload: { id: ef.id, updates: { year: +e.target.value } },
                              })
                            }
                            className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
                          >
                            {Array.from({ length: 8 }, (_, i) => 2019 + i).map((yr) => (
                              <option key={yr} value={yr}>
                                {yr}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Source
                          </label>
                          <select
                            value={ef.source}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_GRID_EF',
                                payload: {
                                  id: ef.id,
                                  updates: { source: e.target.value as EmissionFactorSource },
                                },
                              })
                            }
                            className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
                          >
                            <option value="cea_published">CEA published</option>
                            <option value="state_discom">State DISCOM</option>
                            <option value="iea">IEA</option>
                            <option value="ipcc">IPCC</option>
                            <option value="measured">Measured</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Emission factor (kgCO₂/kWh)
                            <span className="ml-1 text-blue-500 font-normal">
                              ← primary carbon input
                            </span>
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              max="2"
                              value={ef.emissionFactorKgCo2PerKwhr || ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_GRID_EF',
                                  payload: {
                                    id: ef.id,
                                    updates: { emissionFactorKgCo2PerKwhr: +e.target.value },
                                  },
                                })
                              }
                              className="flex-1 border-l-4 border-l-blue-400 border border-white/20 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g. 0.716"
                            />
                            {CEA_EMISSION_FACTORS_BY_YEAR[ef.year] && (
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({
                                    type: 'UPDATE_GRID_EF',
                                    payload: {
                                      id: ef.id,
                                      updates: {
                                        emissionFactorKgCo2PerKwhr:
                                          CEA_EMISSION_FACTORS_BY_YEAR[ef.year],
                                        source: 'cea_published',
                                      },
                                    },
                                  })
                                }
                                className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap border border-blue-200 rounded px-2"
                              >
                                CEA {ef.year}: {CEA_EMISSION_FACTORS_BY_YEAR[ef.year]}
                              </button>
                            )}
                          </div>
                          {diffPct > 10 && (
                            <p className="text-xs text-amber-600 mt-1">
                              Differs from CEA {ef.year} published value ({ceaVal?.toFixed(3)}) by{' '}
                              {diffPct.toFixed(0)}%. Please verify.
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            T&D loss (%)
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="50"
                              value={ef.tdLossPercent ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_GRID_EF',
                                  payload: {
                                    id: ef.id,
                                    updates: { tdLossPercent: +e.target.value },
                                  },
                                })
                              }
                              className="flex-1 border border-white/20 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
                              placeholder="e.g. 20"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                dispatch({
                                  type: 'UPDATE_GRID_EF',
                                  payload: { id: ef.id, updates: { tdLossPercent: 20 } },
                                })
                              }
                              className="text-xs text-gray-400 hover:text-gray-200 border border-white/10 rounded px-2 whitespace-nowrap"
                            >
                              UP avg (20%)
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            India range: 15–25%. UP historical: ~18–22%.
                          </p>
                          {(ef.tdLossPercent ?? 0) > 35 && (
                            <p className="text-xs text-amber-600 mt-1">
                              T&D loss of {ef.tdLossPercent}% is unusually high (India avg: 18–22%).
                              Please verify.
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Gross EF (after T&D)
                          </label>
                          <div className="flex items-center h-9 px-3 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 font-mono">
                            {gross.toFixed(4)} kgCO₂/kWh
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {ef.emissionFactorKgCo2PerKwhr} / (1 − {ef.tdLossPercent ?? 0}/100)
                          </p>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Remarks
                          </label>
                          <input
                            type="text"
                            maxLength={200}
                            value={ef.remarks ?? ''}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_GRID_EF',
                                payload: { id: ef.id, updates: { remarks: e.target.value } },
                              })
                            }
                            className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                            placeholder="Source publication, report number, or notes"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end mt-2">
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'REMOVE_GRID_EF', payload: ef.id })}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'ADD_GRID_EF',
                    payload: {
                      id: uid(),
                      consumerNumber: '',
                      year: new Date().getFullYear(),
                      source: 'cea_published',
                      emissionFactorKgCo2PerKwhr: 0,
                    },
                  })
                }
                className="flex items-center gap-2 text-sm text-green-600 hover:text-green-800 border border-dashed border-green-300 rounded-lg px-4 py-2 hover:bg-green-50"
              >
                <Plus size={14} /> Add year
              </button>

              {/* CEA reference table */}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                  Show CEA reference values
                </summary>
                <div className="mt-3 border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">
                          Year
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">
                          EF (kgCO₂/kWh)
                        </th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(CEA_EMISSION_FACTORS_BY_YEAR)
                        .sort(([a], [b]) => +b - +a)
                        .map(([yr, val]) => (
                          <tr key={yr} className="hover:bg-white/5">
                            <td className="px-4 py-2 text-gray-100">
                              {yr}
                              {yr === '2023' ? ' (current default)' : ''}
                            </td>
                            <td className="px-4 py-2 font-mono text-gray-200">{val.toFixed(3)}</td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({
                                    type: 'ADD_GRID_EF',
                                    payload: {
                                      id: uid(),
                                      consumerNumber: '',
                                      year: +yr,
                                      source: 'cea_published',
                                      emissionFactorKgCo2PerKwhr: val,
                                    },
                                  })
                                }
                                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-0.5"
                              >
                                Use this value
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            {/* ── SECTION: AUTOMATION & SCADA / SMART METERS (Phases 7.2 & 8) ───── */}
            <section
              ref={(el) => {
                sectionRefs.current['automation-scada'] = el;
              }}
              id="automation-scada"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Automation, SCADA & smart metering
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Record automation systems and smart meter deployment plans. These improve energy
                  visibility but do not directly affect carbon calculations.
                </p>
              </div>

              {/* 7.2 SCADA Systems */}
              <div className="mb-8">
                <h3 className="text-base font-medium text-gray-100 mb-1">SCADA / BMS systems</h3>
                <p className="text-xs text-gray-400 mb-3">
                  Record automation, SCADA, and Building Management Systems. SCADA/BMS typically
                  achieves 10–20% energy savings.
                </p>
                <div className="space-y-3 mb-3">
                  {state.scadaSystems.map((sc) => (
                    <div key={sc.id} className="border border-white/10 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: `scada-${sc.id}` })
                        }
                        className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 text-sm text-left"
                      >
                        <span className="font-medium text-gray-100">
                          {sc.systemName || 'Unnamed system'}
                          {sc.protocol && (
                            <span className="ml-2 text-xs text-gray-400">
                              {SCADA_PROTOCOL_LABELS[sc.protocol] ?? sc.protocol}
                            </span>
                          )}
                          {sc.pointsCount && (
                            <span className="ml-2 text-xs text-gray-400">{sc.pointsCount} pts</span>
                          )}
                          {sc.estimatedEnergySavingsPercent && (
                            <span className="ml-2 text-xs text-teal-600">
                              Est. {sc.estimatedEnergySavingsPercent}% saving
                            </span>
                          )}
                        </span>
                        {state.expandedCards.includes(`scada-${sc.id}`) ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                      {state.expandedCards.includes(`scada-${sc.id}`) && (
                        <div className="p-4 grid grid-cols-2 gap-3">
                          <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              System name *
                            </label>
                            <input
                              type="text"
                              value={sc.systemName}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_SCADA',
                                  payload: { id: sc.id, updates: { systemName: e.target.value } },
                                })
                              }
                              className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                              placeholder="BMS Central, Pump Control SCADA"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Protocol
                            </label>
                            <select
                              value={sc.protocol ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_SCADA',
                                  payload: {
                                    id: sc.id,
                                    updates: {
                                      protocol: (e.target.value as ScadaProtocol) || undefined,
                                    },
                                  },
                                })
                              }
                              className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                            >
                              <option value="">— select —</option>
                              {Object.entries(SCADA_PROTOCOL_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Data points count
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={sc.pointsCount ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_SCADA',
                                  payload: { id: sc.id, updates: { pointsCount: +e.target.value } },
                                })
                              }
                              className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                              placeholder="e.g. 250"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Data rate / logging interval
                            </label>
                            <input
                              type="text"
                              value={sc.dataRate ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_SCADA',
                                  payload: { id: sc.id, updates: { dataRate: e.target.value } },
                                })
                              }
                              className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                              placeholder="1 min, 15 min, real-time"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Year installed
                            </label>
                            <input
                              type="number"
                              min="2000"
                              max="2030"
                              value={sc.yearInstalled ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_SCADA',
                                  payload: {
                                    id: sc.id,
                                    updates: { yearInstalled: +e.target.value },
                                  },
                                })
                              }
                              className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Est. energy savings (%)
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="50"
                              value={sc.estimatedEnergySavingsPercent ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_SCADA',
                                  payload: {
                                    id: sc.id,
                                    updates: { estimatedEnergySavingsPercent: +e.target.value },
                                  },
                                })
                              }
                              className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                              placeholder="Typical: 10–20"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Integrations
                            </label>
                            <input
                              type="text"
                              maxLength={200}
                              value={sc.integrations ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_SCADA',
                                  payload: { id: sc.id, updates: { integrations: e.target.value } },
                                })
                              }
                              className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                              placeholder="Utility smart meter, DG control panel, solar inverter, BMS"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Remarks
                            </label>
                            <input
                              type="text"
                              maxLength={200}
                              value={sc.remarks ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_SCADA',
                                  payload: { id: sc.id, updates: { remarks: e.target.value } },
                                })
                              }
                              className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                            />
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => dispatch({ type: 'REMOVE_SCADA', payload: sc.id })}
                              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                            >
                              <Trash2 size={12} /> Remove system
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: 'ADD_SCADA', payload: { id: uid(), systemName: '' } })
                  }
                  className="flex items-center gap-2 text-sm text-green-600 hover:text-green-800 border border-dashed border-green-300 rounded-lg px-4 py-2 hover:bg-green-50"
                >
                  <Plus size={14} /> Add SCADA / BMS system
                </button>

                {/* SCADA savings summary */}
                {state.scadaSystems.some((s) => (s.estimatedEnergySavingsPercent ?? 0) > 0) && (
                  <div className="mt-4 bg-teal-50 border border-teal-200 rounded-xl p-4">
                    <p className="text-sm font-medium text-teal-800">
                      Total reported automation energy savings:{' '}
                      {(
                        state.scadaSystems.reduce(
                          (s, sc) => s + (sc.estimatedEnergySavingsPercent ?? 0),
                          0
                        ) /
                        Math.max(
                          state.scadaSystems.filter((sc) => sc.estimatedEnergySavingsPercent)
                            .length,
                          1
                        )
                      ).toFixed(1)}
                      % (average across systems)
                    </p>
                  </div>
                )}
              </div>

              {/* 8: Smart meter deployment plan */}
              <div>
                <h3 className="text-base font-medium text-gray-100 mb-1">
                  Smart meter deployment plan
                </h3>
                <p className="text-xs text-gray-400 mb-2">
                  Record planned or existing smart meters. Smart meters enable the 15-min load
                  profile data that the Operational section requires.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-3 text-xs text-blue-700">
                  Smart meters are the enabling infrastructure for the load profile data (Section
                  6B). This records your metering plan for reference.
                </div>
                <div className="space-y-2 mb-3">
                  {state.smartMeterPlan.map((mp) => (
                    <div
                      key={mp.id}
                      className="grid grid-cols-2 gap-2 sm:grid-cols-4 border border-white/10 rounded-xl p-3 bg-black/40 backdrop-blur-md text-sm"
                    >
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Meter point *</label>
                        <input
                          type="text"
                          value={mp.meterPoint}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_SMART_METER',
                              payload: { id: mp.id, updates: { meterPoint: e.target.value } },
                            })
                          }
                          className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                          placeholder="Main 11kV incomer"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Voltage level</label>
                        <select
                          value={mp.voltageLevel}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_SMART_METER',
                              payload: {
                                id: mp.id,
                                updates: { voltageLevel: e.target.value as MeterVoltageLevel },
                              },
                            })
                          }
                          className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                        >
                          {Object.entries(METER_VOLTAGE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Interval (min)</label>
                        <div className="flex gap-1 flex-wrap">
                          {[1, 5, 15, 30, 60].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() =>
                                dispatch({
                                  type: 'UPDATE_SMART_METER',
                                  payload: { id: mp.id, updates: { intervalMinutes: n } },
                                })
                              }
                              className={cn(
                                'px-2 py-0.5 rounded text-xs border',
                                mp.intervalMinutes === n
                                  ? 'bg-green-100 border-green-400 text-green-700'
                                  : 'border-white/20 text-gray-300'
                              )}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Communication</label>
                        <select
                          value={mp.communicationType ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_SMART_METER',
                              payload: {
                                id: mp.id,
                                updates: {
                                  communicationType:
                                    (e.target.value as MeterCommunicationType) || undefined,
                                },
                              },
                            })
                          }
                          className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                        >
                          <option value="">—</option>
                          {Object.entries(METER_COMM_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <label className="block text-xs text-gray-400 mb-1">CT/PT class</label>
                        <input
                          type="text"
                          value={mp.ctPtClass ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_SMART_METER',
                              payload: { id: mp.id, updates: { ctPtClass: e.target.value } },
                            })
                          }
                          className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                          placeholder="Class 0.5S, 5VA"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'REMOVE_SMART_METER', payload: mp.id })}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'ADD_SMART_METER',
                      payload: {
                        id: uid(),
                        meterPoint: '',
                        voltageLevel: 'mv_11kv',
                        intervalMinutes: 15,
                      },
                    })
                  }
                  className="flex items-center gap-2 text-sm text-green-600 hover:text-green-800 border border-dashed border-green-300 rounded-lg px-4 py-2 hover:bg-green-50"
                >
                  <Plus size={14} /> Add meter point
                </button>

                {/* Metering coverage summary */}
                {state.smartMeterPlan.length > 0 && (
                  <div className="mt-3 bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-gray-300">
                    <p className="font-medium">
                      {state.smartMeterPlan.length} meter point(s) planned / installed
                    </p>
                    {(() => {
                      const intervals = state.smartMeterPlan
                        .map((m) => m.intervalMinutes)
                        .filter(Boolean) as number[];
                      const finest = Math.min(...intervals);
                      return finest < Infinity ? <p>Finest interval: {finest} min</p> : null;
                    })()}
                    {!state.smartMeterPlan.some((m) => m.intervalMinutes === 15) &&
                      !state.operationalData.hasLoadProfileData && (
                        <p className="text-amber-600 mt-1">
                          No 15-min interval meters planned. Without smart meters, load profile data
                          will need to be manually compiled.
                        </p>
                      )}
                  </div>
                )}
              </div>
            </section>

            {/* ── SECTION: EV INFRASTRUCTURE & VEHICLE FLEET (Phase 9) ─────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['ev-vehicles'] = el;
              }}
              id="ev-vehicles"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">
                  EV infrastructure & vehicle fleet
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Electric vehicle infrastructure adds to electricity demand (Scope 2). Vehicle
                  fleet fuel consumption is a direct Scope 1 emission source.
                </p>
                <div className="flex gap-2 mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                    Scope 2: EV charging electricity
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                    Scope 1: Vehicle fleet fuel
                  </span>
                </div>
              </div>

              {/* 9.1 EV Charging */}
              <div className="mb-8">
                <h3 className="text-base font-medium text-gray-100 mb-1">
                  EV charging infrastructure
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Record installed or planned EV Supply Equipment (EVSE). EV charging load is added
                  to your electricity consumption and Scope 2 emissions.
                </p>
                <div className="space-y-3 mb-3">
                  {state.evChargers.map((ev) => {
                    const calcMonthlyKwh =
                      ev.ratingKw && ev.quantity
                        ? ev.ratingKw *
                          ev.quantity *
                          (ev.diversityFactor ?? 0.4) *
                          (ev.operatingHoursPerDay ?? 8) *
                          30
                        : 0;
                    const actualMonthly = ev.monthlyKwhConsumption ?? 0;
                    const usedMonthly = actualMonthly > 0 ? actualMonthly : calcMonthlyKwh;
                    const annualKwh = usedMonthly * 12;
                    const tco2e = (annualKwh * effectiveGridEf.gross) / 1000;

                    return (
                      <div
                        key={ev.id}
                        className="border border-white/10 rounded-xl overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: `ev-${ev.id}` })
                          }
                          className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 text-sm text-left"
                        >
                          <span className="font-medium text-gray-100">
                            {ev.evseId || 'EVSE'}
                            {ev.connectorType && (
                              <span className="ml-2 text-xs text-gray-400">
                                {EV_CONNECTOR_LABELS[ev.connectorType] ?? ev.connectorType}
                              </span>
                            )}
                            {ev.ratingKw && ev.quantity && (
                              <span className="ml-2 text-xs text-gray-400">
                                {ev.ratingKw} kW × {ev.quantity}
                              </span>
                            )}
                            {usedMonthly > 0 && (
                              <span className="ml-2 text-xs text-blue-600">
                                {usedMonthly.toFixed(0)} kWh/mo
                              </span>
                            )}
                          </span>
                          {state.expandedCards.includes(`ev-${ev.id}`) ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </button>
                        {state.expandedCards.includes(`ev-${ev.id}`) && (
                          <div className="p-4 grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                EVSE ID *
                              </label>
                              <input
                                type="text"
                                value={ev.evseId}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_EV_CHARGER',
                                    payload: { id: ev.id, updates: { evseId: e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                                placeholder="EVSE-01, EV-Parking-A"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Connector type
                              </label>
                              <select
                                value={ev.connectorType}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_EV_CHARGER',
                                    payload: {
                                      id: ev.id,
                                      updates: { connectorType: e.target.value as EvConnectorType },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                              >
                                {Object.entries(EV_CONNECTOR_LABELS).map(([v, l]) => (
                                  <option key={v} value={v}>
                                    {l}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Rating (kW) *
                              </label>
                              <div className="flex gap-1 flex-wrap mb-1">
                                {[3.3, 7.4, 22, 50, 150].map((kw) => (
                                  <button
                                    key={kw}
                                    type="button"
                                    onClick={() =>
                                      dispatch({
                                        type: 'UPDATE_EV_CHARGER',
                                        payload: { id: ev.id, updates: { ratingKw: kw } },
                                      })
                                    }
                                    className={cn(
                                      'px-2 py-0.5 rounded text-xs border',
                                      ev.ratingKw === kw
                                        ? 'bg-blue-100 border-blue-400 text-blue-700'
                                        : 'border-white/20 text-gray-300'
                                    )}
                                  >
                                    {kw}
                                  </button>
                                ))}
                              </div>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={ev.ratingKw || ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_EV_CHARGER',
                                    payload: { id: ev.id, updates: { ratingKw: +e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                                placeholder="kW"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Quantity *
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={ev.quantity || ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_EV_CHARGER',
                                    payload: { id: ev.id, updates: { quantity: +e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Diversity factor: {((ev.diversityFactor ?? 0.4) * 100).toFixed(0)}%
                                simultaneous utilisation
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={ev.diversityFactor ?? 0.4}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_EV_CHARGER',
                                    payload: {
                                      id: ev.id,
                                      updates: { diversityFactor: +e.target.value },
                                    },
                                  })
                                }
                                className="w-full"
                              />
                              <p className="text-xs text-gray-400">Campus typical: 0.3–0.5</p>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Operating hours/day
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="24"
                                step="0.5"
                                value={ev.operatingHoursPerDay ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_EV_CHARGER',
                                    payload: {
                                      id: ev.id,
                                      updates: { operatingHoursPerDay: +e.target.value },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                                placeholder="8"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Monthly kWh consumption (actual metered)
                                <span className="ml-1 text-green-600 text-xs">
                                  (overrides calculated)
                                </span>
                              </label>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={ev.monthlyKwhConsumption ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_EV_CHARGER',
                                    payload: {
                                      id: ev.id,
                                      updates: {
                                        monthlyKwhConsumption: +e.target.value || undefined,
                                      },
                                    },
                                  })
                                }
                                className="w-full border-l-4 border-l-green-400 border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                                placeholder="If sub-metered, enter actual monthly kWh"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Interconnection point
                              </label>
                              <input
                                type="text"
                                value={ev.interconnectionPoint ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_EV_CHARGER',
                                    payload: {
                                      id: ev.id,
                                      updates: { interconnectionPoint: e.target.value },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded-lg px-3 py-1.5 text-sm"
                                placeholder="MDB-Parking, LT panel sub-feeder 4"
                              />
                            </div>
                            <div className="col-span-2 bg-blue-50 rounded-lg p-3 text-xs">
                              {actualMonthly > 0 ? (
                                <p className="text-blue-700 font-medium">
                                  Using actual meter: {actualMonthly.toLocaleString()} kWh/month ={' '}
                                  {annualKwh.toLocaleString()} kWh/year
                                </p>
                              ) : (
                                <p className="text-gray-300">
                                  Estimated: {calcMonthlyKwh.toFixed(0)} kWh/month ={' '}
                                  {(calcMonthlyKwh * 12).toFixed(0)} kWh/year
                                  {calcMonthlyKwh === 0 && ' (enter kW and qty to calculate)'}
                                </p>
                              )}
                              <p className="text-blue-800 font-medium mt-1">
                                Scope 2 emissions: {tco2e.toFixed(2)} tCO₂e/year
                              </p>
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({ type: 'REMOVE_EV_CHARGER', payload: ev.id })
                                }
                                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                              >
                                <Trash2 size={12} /> Remove
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'ADD_EV_CHARGER',
                      payload: {
                        id: uid(),
                        evseId: `EVSE-${String(state.evChargers.length + 1).padStart(2, '0')}`,
                        connectorType: 'type2_ac',
                        ratingKw: 7.4,
                        quantity: 1,
                      },
                    })
                  }
                  className="flex items-center gap-2 text-sm text-green-600 hover:text-green-800 border border-dashed border-green-300 rounded-lg px-4 py-2 hover:bg-green-50"
                >
                  <Plus size={14} /> Add EV charger
                </button>

                {/* EV charging summary */}
                {state.evChargers.length > 0 && evChargingTotals.annualKwh > 0 && (
                  <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
                    <p className="font-medium text-blue-800 mb-2">EV charging summary</p>
                    <div className="space-y-1 text-blue-700">
                      <p>
                        Total capacity:{' '}
                        {state.evChargers
                          .reduce((s, e) => s + e.ratingKw * e.quantity, 0)
                          .toFixed(1)}{' '}
                        kW (at full utilisation)
                      </p>
                      <p>
                        Annual EV charging:{' '}
                        {evChargingTotals.annualKwh.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}{' '}
                        kWh/year
                      </p>
                      <p className="font-semibold">
                        Scope 2 carbon from EV charging: {evChargingTotals.tco2e.toFixed(2)}{' '}
                        tCO₂e/year
                      </p>
                      <p className="text-xs text-blue-500">
                        Additional to building's existing electricity consumption.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 9.2 Vehicle fleet */}
              <div>
                <h3 className="text-base font-medium text-gray-100 mb-1">
                  Vehicle fleet & fuel use
                </h3>
                <p className="text-xs text-gray-400 mb-2">
                  Fuel consumed by campus vehicles is a direct Scope 1 emission. Enter consumption
                  by vehicle type. EVs reduce these emissions to zero.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-3 text-xs text-amber-700">
                  Pre-populated with common vehicle categories. Remove any not applicable to this
                  building / division.
                </div>

                {/* Vehicle table */}
                <div className="overflow-x-auto">
                  <div className="space-y-2 min-w-[600px]">
                    {state.vehicleFuelRecords.map((v) => {
                      const annDiesel =
                        v.annualDieselLitres ??
                        (v.monthlyDieselLitres ? v.monthlyDieselLitres * 12 : 0);
                      const annKer =
                        v.annualKeroseneLitres ??
                        (v.monthlyKeroseneLitres ? v.monthlyKeroseneLitres * 12 : 0);
                      const dEF = v.dieselEmissionFactorKgCo2PerL ?? 2.68;
                      const kEF = v.keroseneEmissionFactorKgCo2PerL ?? 2.54;
                      const rowTco2e = (annDiesel * dEF + annKer * kEF) / 1000;
                      const pctEv = v.totalQuantity
                        ? Math.round(((v.qtyEvs ?? 0) / v.totalQuantity) * 100)
                        : 0;

                      return (
                        <div
                          key={v.id}
                          className="border border-white/10 rounded-xl p-3 bg-black/40 backdrop-blur-md grid grid-cols-4 gap-2 text-xs"
                        >
                          <div className="col-span-4 sm:col-span-1">
                            <label className="block text-gray-400 mb-1">Vehicle type</label>
                            <select
                              value={v.vehicleType}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_VEHICLE_RECORD',
                                  payload: {
                                    id: v.id,
                                    updates: { vehicleType: e.target.value as VehicleType },
                                  },
                                })
                              }
                              className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                            >
                              {Object.entries(VEHICLE_TYPE_LABELS).map(([val, lbl]) => (
                                <option key={val} value={val}>
                                  {lbl}
                                </option>
                              ))}
                            </select>
                            {v.vehicleType === 'other' && (
                              <input
                                type="text"
                                value={v.customLabel ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_VEHICLE_RECORD',
                                    payload: { id: v.id, updates: { customLabel: e.target.value } },
                                  })
                                }
                                className="w-full mt-1 border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="Custom label"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-1">Total qty</label>
                            <input
                              type="number"
                              min="0"
                              value={v.totalQuantity ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_VEHICLE_RECORD',
                                  payload: {
                                    id: v.id,
                                    updates: { totalQuantity: +e.target.value },
                                  },
                                })
                              }
                              className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-1">EVs ({pctEv}%)</label>
                            <input
                              type="number"
                              min="0"
                              value={v.qtyEvs ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_VEHICLE_RECORD',
                                  payload: { id: v.id, updates: { qtyEvs: +e.target.value } },
                                })
                              }
                              className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-1">Monthly diesel (L)</label>
                            <input
                              type="number"
                              min="0"
                              value={v.monthlyDieselLitres ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_VEHICLE_RECORD',
                                  payload: {
                                    id: v.id,
                                    updates: { monthlyDieselLitres: +e.target.value || undefined },
                                  },
                                })
                              }
                              className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-1">Annual diesel (L)</label>
                            <input
                              type="number"
                              min="0"
                              value={v.annualDieselLitres ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_VEHICLE_RECORD',
                                  payload: {
                                    id: v.id,
                                    updates: { annualDieselLitres: +e.target.value || undefined },
                                  },
                                })
                              }
                              className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                              placeholder={
                                v.monthlyDieselLitres
                                  ? `= ${(v.monthlyDieselLitres * 12).toLocaleString()} L`
                                  : ''
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-1">Monthly kerosene (L)</label>
                            <input
                              type="number"
                              min="0"
                              value={v.monthlyKeroseneLitres ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_VEHICLE_RECORD',
                                  payload: {
                                    id: v.id,
                                    updates: {
                                      monthlyKeroseneLitres: +e.target.value || undefined,
                                    },
                                  },
                                })
                              }
                              className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-1">Annual kerosene (L)</label>
                            <input
                              type="number"
                              min="0"
                              value={v.annualKeroseneLitres ?? ''}
                              onChange={(e) =>
                                dispatch({
                                  type: 'UPDATE_VEHICLE_RECORD',
                                  payload: {
                                    id: v.id,
                                    updates: { annualKeroseneLitres: +e.target.value || undefined },
                                  },
                                })
                              }
                              className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-1">
                              Annual CO₂e
                              <span className="ml-1 text-red-500 font-medium">(Scope 1)</span>
                            </label>
                            <div className="flex items-center h-6 px-2 bg-red-50 border border-red-200 rounded text-xs font-mono text-red-700">
                              {rowTco2e > 0 ? `${rowTco2e.toFixed(2)} tCO₂e` : '—'}
                            </div>
                          </div>
                          <div className="col-span-4 grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-gray-400 mb-1">
                                Diesel EF (kgCO₂/L)
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                value={v.dieselEmissionFactorKgCo2PerL ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_VEHICLE_RECORD',
                                    payload: {
                                      id: v.id,
                                      updates: {
                                        dieselEmissionFactorKgCo2PerL: +e.target.value || undefined,
                                      },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder={`IPCC default: ${VEHICLE_FUEL_EMISSION_FACTORS.diesel}`}
                              />
                            </div>
                            <div>
                              <label className="block text-gray-400 mb-1">EV upgrade target</label>
                              <input
                                type="text"
                                value={v.plannedUpgradeDate ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_VEHICLE_RECORD',
                                    payload: {
                                      id: v.id,
                                      updates: { plannedUpgradeDate: e.target.value },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="April 2027"
                              />
                            </div>
                          </div>
                          <div className="col-span-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                dispatch({ type: 'REMOVE_VEHICLE_RECORD', payload: v.id })
                              }
                              className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                            >
                              <Trash2 size={11} /> Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'ADD_VEHICLE_RECORD',
                      payload: { id: uid(), vehicleType: 'other' },
                    })
                  }
                  className="mt-3 flex items-center gap-2 text-sm text-green-600 hover:text-green-800 border border-dashed border-green-300 rounded-lg px-4 py-2 hover:bg-green-50"
                >
                  <Plus size={14} /> Add vehicle type
                </button>

                {/* Vehicle fleet summary */}
                {vehicleFleetTotals.totalTco2e > 0 && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-semibold text-red-900 mb-2">
                          Current fleet emissions (Scope 1)
                        </p>
                        <div className="space-y-1 text-sm text-red-700">
                          <p>
                            Diesel: {vehicleFleetTotals.totalDieselL.toLocaleString()} L/year →{' '}
                            {vehicleFleetTotals.tco2eDiesel.toFixed(2)} tCO₂e
                          </p>
                          {vehicleFleetTotals.totalKerL > 0 && (
                            <p>
                              Kerosene: {vehicleFleetTotals.totalKerL.toLocaleString()} L/year →{' '}
                              {vehicleFleetTotals.tco2eKer.toFixed(2)} tCO₂e
                            </p>
                          )}
                          <p className="font-semibold text-red-800 border-t border-red-200 pt-1 mt-1">
                            Total: {vehicleFleetTotals.totalTco2e.toFixed(2)} tCO₂e/year
                          </p>
                          {vehicleFleetTotals.annualCostRs > 0 && (
                            <p className="text-xs text-red-600">
                              Annual fuel cost: ₹
                              {(vehicleFleetTotals.annualCostRs / 100000).toFixed(1)} Lakhs
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-green-800 mb-2">
                          If fully electrified
                        </p>
                        <div className="space-y-1 text-sm text-green-700">
                          <p>Scope 1 transport emissions: 0.0 tCO₂e/year</p>
                          <p className="font-semibold">
                            Net benefit: −{vehicleFleetTotals.totalTco2e.toFixed(2)} tCO₂e/year
                          </p>
                          {vehicleFleetTotals.annualCostRs > 0 && (
                            <p className="text-xs">
                              Annual fuel cost saved: ₹
                              {(vehicleFleetTotals.annualCostRs / 100000).toFixed(1)} Lakhs
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 bg-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                      Vehicle fleet emissions are classified as Scope 1 (direct combustion) and are
                      included in this building's carbon footprint as they are operated on or by
                      this campus unit.
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── SECTION: REFRIGERANTS & FIRE EXTINGUISHERS (Phase 10) ─── */}
            <section
              ref={(el) => {
                sectionRefs.current['refrigerants-fire'] = el;
              }}
              id="refrigerants-fire"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Refrigerants &amp; fire extinguishers
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Refrigerant leakage and CO₂ fire extinguisher discharge are Scope 1 emission
                  sources. Refrigerant leakage is often the largest hidden emission in large
                  buildings.
                </p>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 mt-2">
                  Scope 1: Direct emissions
                </span>
              </div>

              {/* Sub-tab bar */}
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden mb-5">
                {(
                  [
                    { key: 'refrigerants', label: 'Refrigerants' },
                    { key: 'fire', label: 'Fire extinguishers' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setPhase10SubTab(tab.key)}
                    className={cn(
                      'px-5 py-2 text-sm font-medium transition-colors',
                      phase10SubTab === tab.key
                        ? 'bg-iitbhu text-white'
                        : 'bg-black/40 backdrop-blur-md text-gray-300 hover:bg-white/5'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── REFRIGERANTS ── */}
              {phase10SubTab === 'refrigerants' && (
                <div>
                  <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 mb-4">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                    <span>
                      <strong>Annual top-up weight</strong> is the most accurate input — weigh
                      refrigerant added during servicing. If unavailable, enter the full refrigerant
                      charge and an estimated annual leakage rate (default 5%).
                    </span>
                  </div>

                  <div className="space-y-3 mb-3">
                    {state.refrigerantRecords.map((rec) => (
                      <div
                        key={rec.id}
                        className="border border-white/10 rounded-xl overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'TOGGLE_CARD_EXPAND', payload: `ref-${rec.id}` })
                          }
                          className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 text-sm text-left"
                        >
                          <span className="font-medium text-gray-100">
                            {rec.equipmentName || 'Refrigerant system'}
                            {rec.refrigerantType && (
                              <span className="ml-2 text-xs text-gray-400">
                                {rec.refrigerantType}
                              </span>
                            )}
                            {rec.annualTopUpKg != null && (
                              <span className="ml-2 text-xs text-red-600">
                                {rec.annualTopUpKg} kg/yr top-up
                              </span>
                            )}
                          </span>
                          {state.expandedCards.includes(`ref-${rec.id}`) ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </button>
                        {state.expandedCards.includes(`ref-${rec.id}`) && (
                          <div className="p-4 grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Equipment name *
                              </label>
                              <input
                                type="text"
                                value={rec.equipmentName}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_REFRIGERANT_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { equipmentName: e.target.value },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="e.g. Split AC Block A, Chiller Unit 1"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Refrigerant type *
                              </label>
                              <select
                                value={rec.refrigerantType}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_REFRIGERANT_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: {
                                        refrigerantType: e.target
                                          .value as IRefrigerantRecord['refrigerantType'],
                                      },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                              >
                                {(['R22', 'R407C', 'R134A', 'R410A', 'R404A', 'R32'] as const).map(
                                  (r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Annual top-up (kg) — preferred
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={rec.annualTopUpKg ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_REFRIGERANT_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { annualTopUpKg: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="kg added per year"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Installation charge (kg)
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={rec.installationChargeKg ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_REFRIGERANT_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: {
                                        installationChargeKg: +e.target.value || undefined,
                                      },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="Total charge at install"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Annual leakage rate (%) — if no top-up data
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={rec.annualLeakageRatePercent ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_REFRIGERANT_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: {
                                        annualLeakageRatePercent: +e.target.value || undefined,
                                      },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="Default: 5%"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Notes
                              </label>
                              <input
                                type="text"
                                value={rec.notes ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_REFRIGERANT_RECORD',
                                    payload: { id: rec.id, updates: { notes: e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="Optional notes"
                              />
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({ type: 'REMOVE_REFRIGERANT_RECORD', payload: rec.id })
                                }
                                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                              >
                                <Trash2 size={11} /> Remove
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'ADD_REFRIGERANT_RECORD',
                        payload: { id: uid(), equipmentName: '', refrigerantType: 'R410A' },
                      })
                    }
                    className="mt-3 flex items-center gap-2 text-sm text-red-600 hover:text-red-800 border border-dashed border-red-300 rounded-lg px-4 py-2 hover:bg-red-50"
                  >
                    <Plus size={14} /> Add refrigerant system
                  </button>
                </div>
              )}

              {/* ── FIRE EXTINGUISHERS ── */}
              {phase10SubTab === 'fire' && (
                <div>
                  <p className="text-xs text-gray-400 mb-3">
                    CO₂ fire extinguishers discharge carbon dioxide during testing and accidental
                    activation. Enter the charge per unit and estimated annual discharge percentage
                    (typically 5% for routine testing losses).
                  </p>

                  <div className="space-y-3 mb-3">
                    {state.fireExtinguisherRecords.map((rec) => {
                      const dischKg =
                        ((rec.co2ChargeKg ?? 0) *
                          (rec.count ?? 1) *
                          (rec.annualDischargePercent ?? 5)) /
                        100;
                      return (
                        <div key={rec.id} className="border border-white/10 rounded-xl p-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Location (optional)
                              </label>
                              <input
                                type="text"
                                value={rec.location ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_FIRE_EXT_RECORD',
                                    payload: { id: rec.id, updates: { location: e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="e.g. Block A corridor, Server room"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                CO₂ charge per unit (kg)
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={rec.co2ChargeKg ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_FIRE_EXT_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { co2ChargeKg: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="e.g. 4.5"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Count
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={rec.count ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_FIRE_EXT_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { count: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="Number of units"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Annual discharge % (default 5%)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={rec.annualDischargePercent ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_FIRE_EXT_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: {
                                        annualDischargePercent: +e.target.value || undefined,
                                      },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="5"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Est. annual CO₂ discharged
                              </label>
                              <div className="flex items-center h-6 px-2 bg-red-50 border border-red-200 rounded text-xs font-mono text-red-700">
                                {dischKg > 0 ? `${dischKg.toFixed(2)} kg CO₂/yr` : '—'}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Notes
                              </label>
                              <input
                                type="text"
                                value={rec.notes ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_FIRE_EXT_RECORD',
                                    payload: { id: rec.id, updates: { notes: e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="Optional notes"
                              />
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({ type: 'REMOVE_FIRE_EXT_RECORD', payload: rec.id })
                                }
                                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                              >
                                <Trash2 size={11} /> Remove
                              </button>
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
                        type: 'ADD_FIRE_EXT_RECORD',
                        payload: { id: uid() },
                      })
                    }
                    className="mt-3 flex items-center gap-2 text-sm text-red-600 hover:text-red-800 border border-dashed border-red-300 rounded-lg px-4 py-2 hover:bg-red-50"
                  >
                    <Plus size={14} /> Add record
                  </button>

                  {/* Live total preview */}
                  {state.fireExtinguisherRecords.length > 0 &&
                    (() => {
                      const totalKg = state.fireExtinguisherRecords.reduce((s, r) => {
                        return (
                          s +
                          ((r.co2ChargeKg ?? 0) *
                            (r.count ?? 1) *
                            (r.annualDischargePercent ?? 5)) /
                            100
                        );
                      }, 0);
                      if (totalKg <= 0) return null;
                      return (
                        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
                          <p className="text-sm font-semibold text-red-900">
                            Total annual CO₂ discharge (Scope 1)
                          </p>
                          <p className="text-2xl font-bold text-red-700 mt-1">
                            {totalKg.toFixed(2)} kg CO₂/yr
                          </p>
                          <p className="text-xs text-red-500 mt-1">
                            = {(totalKg / 1000).toFixed(4)} tCO₂e/yr across{' '}
                            {state.fireExtinguisherRecords.length} record(s)
                          </p>
                        </div>
                      );
                    })()}
                </div>
              )}
            </section>

            {/* ── SECTION: SCOPE 3 ACTIVITIES (Phase 11) ──────────────── */}
            <section
              ref={(el) => {
                sectionRefs.current['scope3-activities'] = el;
              }}
              id="scope3-activities"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">Scope 3 activities</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Employee/student commute, business air travel, and equipment procurement are Scope
                  3 emission sources. All inputs are optional — absence is treated as zero.
                </p>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 mt-2">
                  Scope 3: Indirect value-chain emissions
                </span>
              </div>

              {/* Sub-tab bar */}
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden mb-5">
                {(
                  [
                    { key: 'commute', label: 'Commute' },
                    { key: 'air_travel', label: 'Air travel' },
                    { key: 'equipment', label: 'Office/lab equipment' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setPhase11SubTab(tab.key)}
                    className={cn(
                      'px-5 py-2 text-sm font-medium transition-colors',
                      phase11SubTab === tab.key
                        ? 'bg-iitbhu text-white'
                        : 'bg-black/40 backdrop-blur-md text-gray-300 hover:bg-white/5'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── COMMUTE ── */}
              {phase11SubTab === 'commute' && (
                <div>
                  <p className="text-xs text-gray-400 mb-4">
                    EF: 0.15 kgCO₂e/km (DEFRA) · Formula: commuters × 2 × distance × days/yr × EF
                  </p>
                  <div className="space-y-3 mb-3">
                    {(state.scope3Activities.commuteRecords ?? []).map((rec) => {
                      const tco2e =
                        ((rec.numberOfCommuters ?? 0) *
                          2 *
                          (rec.averageOnewayDistanceKm ?? 0) *
                          (rec.commuteDaysPerYear ?? 0) *
                          0.15) /
                        1000;
                      return (
                        <div key={rec.id} className="border border-white/10 rounded-xl p-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Mode of transport
                              </label>
                              <select
                                value={rec.modeOfTransport}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_COMMUTE_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: {
                                        modeOfTransport: e.target
                                          .value as ICommuteRecord['modeOfTransport'],
                                      },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                              >
                                {(
                                  [
                                    'bus',
                                    'train',
                                    'two_wheeler',
                                    'car',
                                    'cycle',
                                    'walking',
                                    'other',
                                  ] as const
                                ).map((m) => (
                                  <option key={m} value={m}>
                                    {m.replace('_', ' ')}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Avg one-way distance (km)
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={rec.averageOnewayDistanceKm ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_COMMUTE_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: {
                                        averageOnewayDistanceKm: +e.target.value || undefined,
                                      },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="km"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Commute days / year
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={365}
                                value={rec.commuteDaysPerYear ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_COMMUTE_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { commuteDaysPerYear: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="e.g. 240"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Number of commuters
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={rec.numberOfCommuters ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_COMMUTE_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { numberOfCommuters: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="headcount"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Est. annual CO₂e
                              </label>
                              <div className="flex items-center h-6 px-2 bg-purple-50 border border-purple-200 rounded text-xs font-mono text-purple-700">
                                {tco2e > 0 ? `${tco2e.toFixed(3)} tCO₂e/yr` : '—'}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Notes
                              </label>
                              <input
                                type="text"
                                value={rec.notes ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_COMMUTE_RECORD',
                                    payload: { id: rec.id, updates: { notes: e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="Optional notes"
                              />
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({ type: 'REMOVE_COMMUTE_RECORD', payload: rec.id })
                                }
                                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                              >
                                <Trash2 size={11} /> Remove
                              </button>
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
                        type: 'ADD_COMMUTE_RECORD',
                        payload: {
                          id: uid(),
                          modeOfTransport: 'bus',
                          purpose: '',
                        } as ICommuteRecord,
                      })
                    }
                    className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 border border-dashed border-purple-300 rounded-lg px-4 py-2 hover:bg-purple-50"
                  >
                    <Plus size={14} /> Add commute group
                  </button>

                  {/* Commute total */}
                  {(() => {
                    const totalTco2e = (state.scope3Activities.commuteRecords ?? []).reduce(
                      (s, r) => {
                        return (
                          s +
                          ((r.numberOfCommuters ?? 0) *
                            2 *
                            (r.averageOnewayDistanceKm ?? 0) *
                            (r.commuteDaysPerYear ?? 0) *
                            0.15) /
                            1000
                        );
                      },
                      0
                    );
                    if (totalTco2e <= 0) return null;
                    return (
                      <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
                        <p className="text-sm font-semibold text-purple-900">
                          Total commute emissions
                        </p>
                        <p className="text-2xl font-bold text-purple-700 mt-1">
                          {totalTco2e.toFixed(3)} tCO₂e/yr
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── AIR TRAVEL ── */}
              {phase11SubTab === 'air_travel' && (
                <div>
                  <p className="text-xs text-gray-400 mb-4">
                    EF: 0.20 kgCO₂e/passenger-km (ICAO) · Enter total passenger-km directly, or trip
                    count × distance.
                  </p>
                  <div className="space-y-3 mb-3">
                    {(state.scope3Activities.airTravelRecords ?? []).map((rec) => {
                      const legs = rec.isRoundTrip ? 2 : 1;
                      const passengerKm =
                        (rec.totalPassengerKm ?? 0) > 0
                          ? rec.totalPassengerKm!
                          : (rec.numberOfTrips ?? 0) * (rec.averageDistanceKmPerTrip ?? 0) * legs;
                      const tco2e = (passengerKm * 0.2) / 1000;
                      return (
                        <div key={rec.id} className="border border-white/10 rounded-xl p-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Purpose
                              </label>
                              <input
                                type="text"
                                value={rec.purpose}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_AIR_TRAVEL_RECORD',
                                    payload: { id: rec.id, updates: { purpose: e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="e.g. Conference travel, Research visit"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Total passenger-km{' '}
                                <span className="text-gray-400">(preferred)</span>
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={rec.totalPassengerKm ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_AIR_TRAVEL_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { totalPassengerKm: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="passenger-km"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Trip count <span className="text-gray-400">(alt)</span>
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={rec.numberOfTrips ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_AIR_TRAVEL_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { numberOfTrips: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="trips"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Avg distance/trip (km)
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={rec.averageDistanceKmPerTrip ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_AIR_TRAVEL_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: {
                                        averageDistanceKmPerTrip: +e.target.value || undefined,
                                      },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="km"
                              />
                            </div>
                            <div className="flex items-center gap-2 col-span-1">
                              <input
                                type="checkbox"
                                id={`rt-${rec.id}`}
                                checked={rec.isRoundTrip ?? false}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_AIR_TRAVEL_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { isRoundTrip: e.target.checked },
                                    },
                                  })
                                }
                                className="w-4 h-4 rounded"
                              />
                              <label htmlFor={`rt-${rec.id}`} className="text-xs text-gray-300">
                                Round trip
                              </label>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Est. annual CO₂e
                              </label>
                              <div className="flex items-center h-6 px-2 bg-purple-50 border border-purple-200 rounded text-xs font-mono text-purple-700">
                                {tco2e > 0 ? `${tco2e.toFixed(3)} tCO₂e` : '—'}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Notes
                              </label>
                              <input
                                type="text"
                                value={rec.notes ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_AIR_TRAVEL_RECORD',
                                    payload: { id: rec.id, updates: { notes: e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="Optional notes"
                              />
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({ type: 'REMOVE_AIR_TRAVEL_RECORD', payload: rec.id })
                                }
                                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                              >
                                <Trash2 size={11} /> Remove
                              </button>
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
                        type: 'ADD_AIR_TRAVEL_RECORD',
                        payload: { id: uid(), purpose: '' } as IAirTravelRecord,
                      })
                    }
                    className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 border border-dashed border-purple-300 rounded-lg px-4 py-2 hover:bg-purple-50"
                  >
                    <Plus size={14} /> Add air travel record
                  </button>
                </div>
              )}

              {/* ── OFFICE / LAB EQUIPMENT ── */}
              {phase11SubTab === 'equipment' && (
                <div>
                  <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 mb-4">
                    <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
                    <span>
                      EF: 0.246 kgCO₂e / 2022 USD (spend-based, Annexure 8). Use 2022 USD values or
                      enter INR — it will be converted at ₹83/USD (2022 rate). For more precision,
                      contact your accounts office for USD-equivalent spend.
                    </span>
                  </div>
                  <div className="space-y-3 mb-3">
                    {(state.scope3Activities.officeEquipmentRecords ?? []).map((rec) => {
                      const usd =
                        (rec.totalSpend2022USD ?? 0) > 0
                          ? rec.totalSpend2022USD!
                          : (rec.totalSpendINR ?? 0) / 83;
                      const tco2e = (usd * 0.246) / 1000;
                      return (
                        <div key={rec.id} className="border border-white/10 rounded-xl p-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Description
                              </label>
                              <input
                                type="text"
                                value={rec.description}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_OFFICE_EQ_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { description: e.target.value },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="e.g. Lab equipment procurement, Laptop replacement"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Spend (2022 USD) <span className="text-gray-400">preferred</span>
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={rec.totalSpend2022USD ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_OFFICE_EQ_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { totalSpend2022USD: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="USD"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Spend (INR) <span className="text-gray-400">÷83 → USD</span>
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={rec.totalSpendINR ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_OFFICE_EQ_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { totalSpendINR: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="₹"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Year
                              </label>
                              <input
                                type="number"
                                min={2000}
                                max={2030}
                                value={rec.year ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_OFFICE_EQ_RECORD',
                                    payload: {
                                      id: rec.id,
                                      updates: { year: +e.target.value || undefined },
                                    },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="e.g. 2024"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Est. CO₂e
                              </label>
                              <div className="flex items-center h-6 px-2 bg-purple-50 border border-purple-200 rounded text-xs font-mono text-purple-700">
                                {tco2e > 0 ? `${tco2e.toFixed(3)} tCO₂e` : '—'}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Notes
                              </label>
                              <input
                                type="text"
                                value={rec.notes ?? ''}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'UPDATE_OFFICE_EQ_RECORD',
                                    payload: { id: rec.id, updates: { notes: e.target.value } },
                                  })
                                }
                                className="w-full border border-white/20 rounded px-2 py-1 text-xs"
                                placeholder="Optional notes"
                              />
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({ type: 'REMOVE_OFFICE_EQ_RECORD', payload: rec.id })
                                }
                                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                              >
                                <Trash2 size={11} /> Remove
                              </button>
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
                        type: 'ADD_OFFICE_EQ_RECORD',
                        payload: { id: uid(), description: '' } as IOfficeEquipmentRecord,
                      })
                    }
                    className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 border border-dashed border-purple-300 rounded-lg px-4 py-2 hover:bg-purple-50"
                  >
                    <Plus size={14} /> Add procurement record
                  </button>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>

      {/* Pre-populate modal */}
      {showPrepopulateModal && (
        <Modal
          isOpen={showPrepopulateModal}
          onClose={() => setShowPrepopulateModal(false)}
          title="Add standard technology assessments"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Select technologies to add empty assessment records for:
            </p>
            <div className="space-y-2">
              {(
                [
                  ['solar_pv_rooftop', 'Solar PV (Rooftop)'],
                  ['solar_pv_ground', 'Solar PV (Ground)'],
                  ['wind_turbine', 'Wind Turbine'],
                  ['geothermal', 'Geothermal'],
                  ['biomass', 'Biomass'],
                  ['small_hydro', 'Small Hydro'],
                ] as [AssessedEnergySource, string][]
              ).map(([tech, label]) => (
                <label
                  key={tech}
                  className="flex items-center gap-3 cursor-pointer hover:bg-white/5 rounded p-2"
                >
                  <input
                    type="checkbox"
                    checked={prepopulateSelected.has(tech)}
                    onChange={(e) => {
                      const next = new Set(prepopulateSelected);
                      if (e.target.checked) next.add(tech);
                      else next.delete(tech);
                      setPrepopulateSelected(next);
                    }}
                    className="w-4 h-4 rounded text-green-600"
                  />
                  <span className="text-sm text-gray-100">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPrepopulateModal(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-white/10 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatch({
                    type: 'PREPOPULATE_ASSESSMENT_TECHNOLOGIES',
                    payload: Array.from(prepopulateSelected),
                  });
                  setShowPrepopulateModal(false);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg"
              >
                Add selected
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Submit modal ─────────────────────────────────────────────────────── */}
      {showSubmitModal && (
        <Modal
          isOpen={showSubmitModal}
          onClose={() => setShowSubmitModal(false)}
          title="Submit electrical data"
        >
          <div className="space-y-4">
            {/* Completeness score */}
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className={cn(
                    'h-2 rounded-full',
                    (state.validationResult?.completenessScore ?? 0) >= 70
                      ? 'bg-green-500'
                      : 'bg-amber-400'
                  )}
                  style={{ width: `${state.validationResult?.completenessScore ?? 0}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-200">
                {state.validationResult?.completenessScore ?? 0}% complete
              </span>
            </div>

            {/* Warnings */}
            {(state.validationResult?.warnings ?? []).length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-200">Warnings (non-blocking):</p>
                {state.validationResult!.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
                  >
                    <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">{w}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 size={16} className="text-green-600" />
                <p className="text-sm text-green-800">No warnings — data looks complete!</p>
              </div>
            )}

            <p className="text-sm text-gray-400">
              Submitting sends this section for admin review. You can still edit until it's
              verified.
            </p>

            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowSubmitModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit}>
                <Send size={14} /> Confirm submit
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
