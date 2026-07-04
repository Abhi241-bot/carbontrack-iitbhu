import { useReducer, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import {
  Route,
  Lightbulb,
  Leaf,
  Droplets,
  Bus,
  Plane,
  ShoppingBag,
  Plus,
  Trash2,
  Save,
  Send,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import { campusApi } from '@/features/campus/campusApi';
import {
  campusEntryReducer,
  initialCampusEntryState,
  DEFAULT_VEGETATION_CATEGORIES,
  CampusEntryState,
} from '@/features/campus/campusEntryReducer';
import {
  IRoadSegment,
  IVegetationCategory,
  IWaterBody,
  RoadSurfaceType,
} from '@shared/types/submission.types';

// ── Client-side carbon estimation constants ───────────────────────────────────

// Lane-km EF: 29 tCO₂/lane/km/yr (construction, amortised 50yr) + 6 maintenance = 35
const ROAD_LANE_KM_EF = 35; // tCO₂/lane/km/yr

const VEG_SEQ_CLIENT: Record<string, { perTree?: number; perAcre?: number }> = {
  native_trees: { perTree: 22 },
  ornamental_trees: { perTree: 15 },
  shrubs_grassland: { perAcre: 800 },
  agroforestry: { perTree: 18 },
  arboriculture: { perTree: 25 },
  custom: { perTree: 18, perAcre: 500 },
};

const COMMUTATION_EF = 0.15; // kg CO₂e/km
const AIR_TRAVEL_EF = 0.2; // kg CO₂e/passenger-km
const PURCHASED_GOODS_EF = 0.246; // tCO₂e/USD (2022 EEIO)
const INR_TO_USD = 83;

// ── Surface type config ───────────────────────────────────────────────────────

const SURFACE_OPTIONS: Array<{
  value: RoadSurfaceType;
  label: string;
  impact: string;
  color: string;
}> = [
  {
    value: 'paved_concrete',
    label: 'Concrete',
    impact: 'Highest carbon',
    color: 'bg-red-100 border-red-400 text-red-800',
  },
  {
    value: 'paved_asphalt',
    label: 'Asphalt',
    impact: 'Medium carbon',
    color: 'bg-amber-100 border-amber-400 text-amber-800',
  },
  {
    value: 'paved_brick',
    label: 'Brick/Stone',
    impact: 'Medium carbon',
    color: 'bg-amber-50 border-amber-300 text-amber-700',
  },
  {
    value: 'unpaved_gravel',
    label: 'Gravel',
    impact: 'Low carbon',
    color: 'bg-green-100 border-green-400 text-green-800',
  },
  {
    value: 'unpaved_dirt',
    label: 'Unpaved/Dirt',
    impact: 'Minimal carbon',
    color: 'bg-green-50 border-green-300 text-green-700',
  },
  {
    value: 'mixed',
    label: 'Mixed',
    impact: 'Varies',
    color: 'bg-white/10 border-gray-400 text-gray-200',
  },
  { value: 'other', label: 'Other', impact: '', color: 'bg-white/5 border-white/20 text-gray-300' },
];

const LIGHT_TYPE_DEFAULTS: Record<string, number> = {
  led: 70,
  sodium_vapour: 250,
  cfl: 85,
  metal_halide: 150,
};

// ── Section wrapper ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-iitbhu" />
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
        </div>
        {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ── Road segment card ─────────────────────────────────────────────────────────

function RoadSegmentCard({
  segment,
  onChange,
  onRemove,
}: {
  segment: IRoadSegment;
  onChange: (patch: Partial<IRoadSegment>) => void;
  onRemove: () => void;
}) {
  const area = (segment.lengthM ?? 0) * (segment.widthM ?? 0);
  const laneKm = (segment.lengthKm ?? (segment.lengthM ?? 0) / 1000) * (segment.lanes ?? 2);
  const annualCo2 = laneKm * ROAD_LANE_KM_EF;

  return (
    <div className="border border-white/10 rounded-xl p-4 space-y-3 bg-white/5">
      {/* Header row */}
      <div className="flex items-start gap-2">
        <input
          type="text"
          value={segment.roadName}
          onChange={(e) => onChange({ roadName: e.target.value })}
          placeholder="e.g. Main avenue, Service lane, Footpath to library"
          maxLength={100}
          className="flex-1 px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
        />
        <button
          onClick={onRemove}
          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
          title="Remove segment"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Length (m)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={segment.lengthM || ''}
            onChange={(e) => onChange({ lengthM: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Width (m)</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={segment.widthM || ''}
            onChange={(e) => onChange({ widthM: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Lanes</label>
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={segment.lanes ?? 2}
            onChange={(e) => onChange({ lanes: parseInt(e.target.value) || 2 })}
            className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Area (m²)</label>
          <input
            type="number"
            readOnly
            value={area > 0 ? area.toFixed(0) : ''}
            className="w-full px-3 py-2 border border-white/5 rounded-lg text-sm bg-white/10 text-gray-400"
          />
        </div>
      </div>

      {annualCo2 > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          ~{annualCo2.toFixed(1)} tCO₂e/yr ({laneKm.toFixed(2)} lane-km × {ROAD_LANE_KM_EF} EF)
        </p>
      )}

      {/* Surface type chips */}
      <div>
        <label className="text-xs text-gray-400 block mb-2">Surface type</label>
        <div className="flex flex-wrap gap-2">
          {SURFACE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ surfaceType: opt.value })}
              className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                segment.surfaceType === opt.value
                  ? opt.color + ' ring-2 ring-offset-1 ring-current'
                  : 'bg-black/40 backdrop-blur-md border-white/10 text-gray-400 hover:border-gray-400'
              }`}
            >
              {opt.label}
              {opt.impact && <span className="ml-1 opacity-70">· {opt.impact}</span>}
            </button>
          ))}
        </div>
        {segment.surfaceType === 'other' && (
          <input
            type="text"
            value={segment.surfaceTypeOther ?? ''}
            onChange={(e) => onChange({ surfaceTypeOther: e.target.value })}
            placeholder="Describe surface type"
            className="mt-2 w-full px-3 py-1.5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
          />
        )}
      </div>

      {/* Remarks */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">Remarks (optional)</label>
        <input
          type="text"
          value={segment.remarks ?? ''}
          onChange={(e) => onChange({ remarks: e.target.value })}
          className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
        />
      </div>
    </div>
  );
}

// ── Vegetation category card ──────────────────────────────────────────────────

function VegetationCard({
  category,
  isDefault,
  onChange,
  onRemove,
}: {
  category: IVegetationCategory;
  isDefault: boolean;
  onChange: (patch: Partial<IVegetationCategory>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useReducer((s: boolean) => !s, true);
  const isShrubs = category.categoryType === 'shrubs_grassland';
  const rates = VEG_SEQ_CLIENT[category.categoryType] ?? VEG_SEQ_CLIENT.custom;

  const seqKg =
    (category.numberOfTrees ?? 0) * (rates.perTree ?? 0) +
    (category.areaAcres ?? 0) * (rates.perAcre ?? 0);

  const CATEGORY_LABELS: Record<string, string> = {
    native_trees: 'Native trees',
    ornamental_trees: 'Ornamental trees',
    shrubs_grassland: 'Shrubs & grassland',
    agroforestry: 'Agroforestry',
    arboriculture: 'Arboriculture',
    custom: category.customCategoryLabel || 'Custom',
  };

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={setOpen}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Leaf size={14} className="text-green-600" />
          <span className="text-sm font-medium text-gray-100">
            {CATEGORY_LABELS[category.categoryType] ?? 'Custom'}
          </span>
          {category.definitionScope && (
            <span className="text-xs text-gray-400 italic">{category.definitionScope}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isDefault && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-red-400 hover:text-red-600 p-1"
            >
              <Trash2 size={12} />
            </button>
          )}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {open && (
        <div className="p-4 space-y-3">
          {category.categoryType === 'custom' && (
            <input
              type="text"
              value={category.customCategoryLabel ?? ''}
              onChange={(e) => onChange({ customCategoryLabel: e.target.value })}
              placeholder="Category name (e.g. Bamboo grove)"
              className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            {!isShrubs && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">No. of trees</label>
                <input
                  type="number"
                  min={0}
                  value={category.numberOfTrees ?? ''}
                  onChange={(e) =>
                    onChange({ numberOfTrees: parseInt(e.target.value) || undefined })
                  }
                  className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
                />
              </div>
            )}
            {isShrubs && (
              <p className="text-xs text-gray-400 col-span-2 italic">
                Tree count not applicable for shrubs and grassland
              </p>
            )}
            <div className={isShrubs ? 'col-span-2' : ''}>
              <label className="text-xs text-gray-400 block mb-1">Area covered (acres)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={category.areaAcres ?? ''}
                onChange={(e) => onChange({ areaAcres: parseFloat(e.target.value) || undefined })}
                className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
              />
            </div>
          </div>
          <input
            type="text"
            value={category.remarks ?? ''}
            onChange={(e) => onChange({ remarks: e.target.value })}
            placeholder="Remarks (optional)"
            className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
          />
          {seqKg > 0 && (
            <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
              Estimated sequestration: ~{seqKg.toFixed(0)} kg CO₂/year
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Water body card ───────────────────────────────────────────────────────────

function WaterBodyCard({
  waterBody,
  onChange,
  onRemove,
}: {
  waterBody: IWaterBody;
  onChange: (patch: Partial<IWaterBody>) => void;
  onRemove: () => void;
}) {
  const isLinear = waterBody.category === 'canal' || waterBody.category === 'river';

  return (
    <div className="border border-white/10 rounded-xl p-4 space-y-3 bg-white/5">
      <div className="flex gap-2">
        <input
          type="text"
          value={waterBody.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={
            waterBody.category === 'canal' ? 'e.g. North campus canal' : 'e.g. Main lake'
          }
          required
          className="flex-1 px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
        />
        <button
          onClick={onRemove}
          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {isLinear ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Length (m)</label>
            <input
              type="number"
              min={0}
              value={waterBody.lengthM ?? ''}
              onChange={(e) => onChange({ lengthM: parseFloat(e.target.value) || undefined })}
              className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Width (m)</label>
            <input
              type="number"
              min={0}
              value={waterBody.widthM ?? ''}
              onChange={(e) => onChange({ widthM: parseFloat(e.target.value) || undefined })}
              className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="text-xs text-gray-400 block mb-1">Surface area (acres)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={waterBody.surfaceAreaAcres ?? ''}
            onChange={(e) =>
              onChange({ surfaceAreaAcres: parseFloat(e.target.value) || undefined })
            }
            className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
          />
          <p className="text-xs text-gray-400 mt-1">
            Length and width not applicable — enter surface area
          </p>
        </div>
      )}
      <input
        type="text"
        value={waterBody.remarks ?? ''}
        onChange={(e) => onChange({ remarks: e.target.value })}
        placeholder="Remarks (optional)"
        className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
      />
    </div>
  );
}

// ── Numeric input helper ──────────────────────────────────────────────────────

function NumField({
  label,
  hint,
  value,
  onChange,
  min = 0,
  step = 1,
  unit,
}: {
  label: string;
  hint?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          step={step}
          value={value ?? ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || undefined)}
          className="flex-1 px-3 py-2 border border-white/10 rounded-lg text-sm bg-black/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-iitbhu"
        />
        {unit && <span className="text-xs text-gray-400 flex-shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CampusEntry() {
  const { campusSlug } = useParams<{ campusSlug: string }>();
  const slug = campusSlug ?? 'iitbhu';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(campusEntryReducer, initialCampusEntryState);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing draft on mount
  const { data: campusDraft } = useQuery({
    queryKey: ['campus', slug, 'infrastructure-draft'],
    queryFn: async () => {
      const res = await campusApi.getInfrastructureDraft(slug);
      const record = res.data?.data;
      if (record) {
        // New model uses infrastructureData.roads / vegetation / waterBodies
        const roadsData = record.infrastructureData?.roads ?? record.data?.roads ?? {};
        const vegData = record.infrastructureData?.vegetation ?? record.data?.vegetation ?? {};
        const wbData = record.infrastructureData?.waterBodies ?? record.data?.waterBodies ?? {};
        const vegCategories: IVegetationCategory[] = vegData.categories ?? [];
        // Merge server categories into defaults (match by id)
        const merged = DEFAULT_VEGETATION_CATEGORIES.map((def) => {
          const fromServer = vegCategories.find((c: IVegetationCategory) => c.id === def.id);
          return fromServer ? { ...def, ...fromServer } : def;
        });
        // Append any custom categories that aren't in defaults
        const customCats = vegCategories.filter(
          (c: IVegetationCategory) => !DEFAULT_VEGETATION_CATEGORIES.find((d) => d.id === c.id)
        );
        const commData = record.infrastructureData?.commutation ?? record.data?.commutation;
        const atData = record.infrastructureData?.airTravel ?? record.data?.airTravel;
        const pgData = record.infrastructureData?.purchasedGoods ?? record.data?.purchasedGoods;
        dispatch({
          type: 'LOAD_FROM_SERVER',
          state: {
            totalCampusAreaAcres: record.totalAreaAcres ?? record.totalCampusAreaAcres,
            roadsData: {
              segments: roadsData.segments ?? [],
              hasStreetLighting: roadsData.hasStreetLighting ?? false,
              streetLightCount: roadsData.streetLightCount,
              streetLightType: roadsData.streetLightType,
              streetLightWattsEach: roadsData.streetLightWattsEach,
              streetLightHoursPerDay: roadsData.streetLightHoursPerDay,
              streetLightingRemarks: roadsData.streetLightingRemarks,
            },
            vegetationData: {
              categories: [...merged, ...customCats],
              hasHeritageTrees: vegData.hasHeritageTrees ?? false,
              heritageTreeCount: vegData.heritageTreeCount,
              heritageTreeRemarks: vegData.heritageTreeRemarks,
            },
            waterBodiesData: {
              waterBodies: wbData.waterBodies ?? [],
              hasPerennialWaterBody: wbData.hasPerennialWaterBody ?? false,
              waterManagementRemarks: wbData.waterManagementRemarks,
            },
            commutationData: commData ?? {},
            airTravelData: atData ?? {},
            purchasedGoodsData: pgData ?? {},
          },
        });
      }
      return record;
    },
    staleTime: Infinity,
    enabled: !!slug,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (s: CampusEntryState) =>
      campusApi.updateInfrastructureDraft(slug, {
        roads: {
          segments: s.roadsData.segments,
          hasStreetLighting: s.roadsData.hasStreetLighting,
          streetLightCount: s.roadsData.streetLightCount,
          streetLightType: s.roadsData.streetLightType as
            | 'sodium_vapour'
            | 'led'
            | 'cfl'
            | 'metal_halide'
            | 'mixed'
            | 'other'
            | undefined,
          streetLightWattsEach: s.roadsData.streetLightWattsEach,
          streetLightHoursPerDay: s.roadsData.streetLightHoursPerDay,
          streetLightingRemarks: s.roadsData.streetLightingRemarks,
        },
        vegetation: {
          categories: s.vegetationData.categories,
          hasHeritageTrees: s.vegetationData.hasHeritageTrees,
          heritageTreeCount: s.vegetationData.heritageTreeCount,
          heritageTreeRemarks: s.vegetationData.heritageTreeRemarks,
        },
        waterBodies: {
          waterBodies: s.waterBodiesData.waterBodies,
          hasPerennialWaterBody: s.waterBodiesData.hasPerennialWaterBody,
          waterManagementRemarks: s.waterBodiesData.waterManagementRemarks,
        },
        commutation: Object.keys(s.commutationData).length > 0 ? s.commutationData : undefined,
        airTravel: Object.keys(s.airTravelData).length > 0 ? s.airTravelData : undefined,
        purchasedGoods:
          Object.keys(s.purchasedGoodsData).length > 0 ? s.purchasedGoodsData : undefined,
        totalAreaAcres: s.totalCampusAreaAcres,
      }),
    onSuccess: () => dispatch({ type: 'SET_LAST_SAVED', date: new Date() }),
    onError: () => dispatch({ type: 'SET_SAVING', value: false }),
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: () => campusApi.submitInfrastructure(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', slug] });
      navigate(`/campus/${slug}`);
    },
  });

  // Auto-save every 30 seconds when dirty
  const triggerSave = useCallback(() => {
    dispatch({ type: 'SET_SAVING', value: true });
    saveMutation.mutate(state);
  }, [state, saveMutation]);

  useEffect(() => {
    if (!state.isDirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => triggerSave(), 30_000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [state.isDirty, triggerSave]);

  // ── Live carbon estimates ──────────────────────────────────────────────────
  const liveEstimates = useMemo(() => {
    // Roads — lane-km EF model (35 tCO₂/lane/km/yr)
    let roadsAnnual = 0;
    for (const seg of state.roadsData.segments) {
      const lkm = (seg.lengthKm ?? (seg.lengthM ?? 0) / 1000) * (seg.lanes ?? 2);
      roadsAnnual += lkm * ROAD_LANE_KM_EF;
    }

    let lightingAnnual = 0;
    const r = state.roadsData;
    if (r.hasStreetLighting && r.streetLightCount && r.streetLightWattsEach) {
      const hours = r.streetLightHoursPerDay ?? 10;
      lightingAnnual = ((r.streetLightCount * r.streetLightWattsEach * hours * 365) / 1000) * 0.716;
    }

    let vegSeqKg = 0;
    for (const cat of state.vegetationData.categories) {
      const rates = VEG_SEQ_CLIENT[cat.categoryType] ?? VEG_SEQ_CLIENT.custom;
      if (cat.numberOfTrees && rates.perTree) vegSeqKg += cat.numberOfTrees * rates.perTree;
      if (cat.areaAcres && rates.perAcre) vegSeqKg += cat.areaAcres * rates.perAcre;
    }

    const c = state.commutationData;
    let commutation = 0;
    if (c.noOccupants && c.avgDailyDistanceKm && c.workingDaysPerYear) {
      commutation =
        (c.noOccupants * c.avgDailyDistanceKm * c.workingDaysPerYear * COMMUTATION_EF) / 1000;
    }

    const at = state.airTravelData;
    let airTravel = 0;
    if (at.totalPassengerKm) {
      airTravel = (at.totalPassengerKm * AIR_TRAVEL_EF) / 1000;
    } else if (at.noTravellers && at.avgDistancePerPersonKm) {
      airTravel = (at.noTravellers * at.avgDistancePerPersonKm * AIR_TRAVEL_EF) / 1000;
    }

    const pg = state.purchasedGoodsData;
    let purchasedGoods = 0;
    if (pg.totalSpend2022USD) {
      purchasedGoods = pg.totalSpend2022USD * PURCHASED_GOODS_EF;
    } else if (pg.totalSpendINR) {
      purchasedGoods = (pg.totalSpendINR / INR_TO_USD) * PURCHASED_GOODS_EF;
    } else if (pg.totalPopulation && pg.costPerPersonINR) {
      purchasedGoods =
        ((pg.totalPopulation * pg.costPerPersonINR) / INR_TO_USD) * PURCHASED_GOODS_EF;
    }

    const totalTrees = state.vegetationData.categories.reduce(
      (a, c) => a + (c.numberOfTrees ?? 0),
      0
    );
    const totalPavedAreaM2 = state.roadsData.segments
      .filter((s) => s.isPaved)
      .reduce((a, s) => a + (s.lengthM ?? 0) * (s.widthM ?? 0), 0);

    const vegSeqTco2e = vegSeqKg / 1000;
    const netAnnual =
      roadsAnnual + lightingAnnual / 1000 - vegSeqTco2e + commutation + airTravel + purchasedGoods;

    return {
      roadsAnnualTco2e: roadsAnnual.toFixed(2),
      lightingAnnualTco2e: (lightingAnnual / 1000).toFixed(2),
      vegSeqTco2ePerYear: (-vegSeqTco2e).toFixed(2),
      commutationTco2e: commutation.toFixed(2),
      airTravelTco2e: airTravel.toFixed(2),
      purchasedGoodsTco2e: purchasedGoods.toFixed(2),
      netAnnualTco2e: netAnnual.toFixed(2),
      totalPavedAreaM2,
      totalTrees,
      totalRoadLength: state.roadsData.segments.reduce((a, s) => a + (s.lengthM ?? 0), 0),
      totalRoadArea: state.roadsData.segments.reduce(
        (a, s) => a + (s.lengthM ?? 0) * (s.widthM ?? 0),
        0
      ),
      totalVegArea: state.vegetationData.categories.reduce((a, c) => a + (c.areaAcres ?? 0), 0),
      totalWaterArea: state.waterBodiesData.waterBodies.reduce((a, w) => {
        if (w.surfaceAreaAcres) return a + w.surfaceAreaAcres;
        if (w.lengthM && w.widthM) return a + (w.lengthM * w.widthM) / 4047;
        return a;
      }, 0),
    };
  }, [
    state.roadsData,
    state.vegetationData,
    state.waterBodiesData,
    state.commutationData,
    state.airTravelData,
    state.purchasedGoodsData,
  ]);

  const netIsNegative = parseFloat(liveEstimates.netAnnualTco2e) <= 0;
  const defaultVegIds = DEFAULT_VEGETATION_CATEGORIES.map((c) => c.id);

  return (
    <PageWrapper title="Campus Infrastructure Entry">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-6">
          {/* ── MAIN CONTENT ───────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Total campus area */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-5">
              <label className="text-sm font-medium text-gray-200 block mb-1">
                Total campus area (acres)
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Total land area of {campusDraft?.name ?? slug} campus in acres
              </p>
              <input
                type="number"
                min={0}
                step={0.1}
                value={state.totalCampusAreaAcres ?? ''}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_TOTAL_AREA',
                    value: parseFloat(e.target.value) || undefined,
                  })
                }
                className="w-full max-w-xs px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
              />
            </div>

            {/* ── SECTION 1: ROAD INFRASTRUCTURE ─────────────────────────── */}
            <SectionCard
              icon={Route}
              title="Road infrastructure"
              subtitle="Enter each distinct road type or segment on campus. The system calculates embodied carbon from road construction materials."
            >
              <div className="space-y-4">
                {state.roadsData.segments.map((seg) => (
                  <RoadSegmentCard
                    key={seg.id}
                    segment={seg}
                    onChange={(patch) =>
                      dispatch({ type: 'UPDATE_ROAD_SEGMENT', id: seg.id, patch })
                    }
                    onRemove={() => dispatch({ type: 'REMOVE_ROAD_SEGMENT', id: seg.id })}
                  />
                ))}

                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'ADD_ROAD_SEGMENT',
                      segment: {
                        id: nanoid(),
                        roadName: '',
                        lengthM: 0,
                        widthM: 0,
                        surfaceType: 'paved_concrete',
                        isPaved: true,
                        areaM2: 0,
                      },
                    })
                  }
                  className="w-full py-2.5 border-2 border-dashed border-white/10 rounded-xl text-sm text-gray-400 hover:border-iitbhu hover:text-iitbhu transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Add road segment
                </button>

                {/* Road summary */}
                {state.roadsData.segments.length > 0 && (
                  <div className="bg-white/5 rounded-xl p-4 space-y-1">
                    <p className="text-xs font-medium text-gray-300 mb-2">Running totals</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <span className="text-gray-400">Total road length</span>
                      <span className="font-medium">
                        {liveEstimates.totalRoadLength.toFixed(0)} m
                      </span>
                      <span className="text-gray-400">Total road area</span>
                      <span className="font-medium">
                        {liveEstimates.totalRoadArea.toFixed(0)} m²
                      </span>
                      <span className="text-gray-400">Paved area</span>
                      <span className="font-medium">
                        {liveEstimates.totalPavedAreaM2.toFixed(0)} m²
                      </span>
                      <span className="text-gray-400">Estimated road embodied carbon</span>
                      <span className="font-semibold text-red-700">
                        {liveEstimates.roadsEmbodiedTco2e} tCO₂e
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── SECTION 2: STREET LIGHTING ──────────────────────────────── */}
            <SectionCard icon={Lightbulb} title="Street lighting">
              <div className="space-y-4">
                {/* Toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    role="switch"
                    aria-checked={state.roadsData.hasStreetLighting}
                    onClick={() =>
                      dispatch({
                        type: 'UPDATE_ROAD_LIGHTING',
                        patch: { hasStreetLighting: !state.roadsData.hasStreetLighting },
                      })
                    }
                    className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer ${
                      state.roadsData.hasStreetLighting ? 'bg-iitbhu' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-black/40 backdrop-blur-md rounded-full shadow transition-transform ${
                        state.roadsData.hasStreetLighting ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-200">
                    Does this campus have street lighting?
                  </span>
                </label>

                {state.roadsData.hasStreetLighting && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">
                          Number of street lights
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={state.roadsData.streetLightCount ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_ROAD_LIGHTING',
                              patch: { streetLightCount: parseInt(e.target.value) || undefined },
                            })
                          }
                          className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Light type</label>
                        <select
                          value={state.roadsData.streetLightType ?? ''}
                          onChange={(e) => {
                            const lightType = e.target.value;
                            const defaultWatts = LIGHT_TYPE_DEFAULTS[lightType];
                            dispatch({
                              type: 'UPDATE_ROAD_LIGHTING',
                              patch: {
                                streetLightType: lightType,
                                ...(defaultWatts ? { streetLightWattsEach: defaultWatts } : {}),
                              },
                            });
                          }}
                          className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
                        >
                          <option value="">Select type…</option>
                          <option value="sodium_vapour">Sodium vapour (traditional orange)</option>
                          <option value="led">LED — energy efficient</option>
                          <option value="cfl">CFL — compact fluorescent</option>
                          <option value="metal_halide">Metal halide</option>
                          <option value="mixed">Mixed / unknown</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">
                          Power per light (W)
                        </label>
                        <p className="text-xs text-gray-400 mb-1">
                          LED 40–100W · Sodium vapour 150–400W
                        </p>
                        <input
                          type="number"
                          min={0}
                          max={2000}
                          step={1}
                          value={state.roadsData.streetLightWattsEach ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_ROAD_LIGHTING',
                              patch: {
                                streetLightWattsEach: parseInt(e.target.value) || undefined,
                              },
                            })
                          }
                          className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">
                          Hours per day: {state.roadsData.streetLightHoursPerDay ?? 10}h
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={24}
                          step={0.5}
                          value={state.roadsData.streetLightHoursPerDay ?? 10}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_ROAD_LIGHTING',
                              patch: { streetLightHoursPerDay: parseFloat(e.target.value) },
                            })
                          }
                          className="w-full"
                        />
                      </div>
                    </div>

                    {/* Lighting preview */}
                    {state.roadsData.streetLightCount && state.roadsData.streetLightWattsEach && (
                      <div className="bg-amber-50 rounded-xl p-4 text-sm space-y-1">
                        <p className="font-medium text-amber-800">Street lighting estimate</p>
                        {(() => {
                          const hours = state.roadsData.streetLightHoursPerDay ?? 10;
                          const annualKwh =
                            (state.roadsData.streetLightCount! *
                              state.roadsData.streetLightWattsEach! *
                              hours *
                              365) /
                            1000;
                          const annualCO2 = (annualKwh * 0.716) / 1000;
                          return (
                            <>
                              <p className="text-amber-700">
                                Annual electricity: {annualKwh.toFixed(0).toLocaleString()} kWh/year
                              </p>
                              <p className="text-amber-700 font-semibold">
                                Annual carbon: {annualCO2.toFixed(2)} tCO₂e/year
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Remarks (optional)</label>
                      <input
                        type="text"
                        value={state.roadsData.streetLightingRemarks ?? ''}
                        maxLength={200}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_ROAD_LIGHTING',
                            patch: { streetLightingRemarks: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
                      />
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── SECTION 3: VEGETATION ───────────────────────────────────── */}
            <SectionCard
              icon={Leaf}
              title="Vegetation & plantation"
              subtitle="Trees and green cover contribute to carbon sequestration — they absorb CO₂ from the atmosphere."
            >
              <div className="space-y-4">
                {state.vegetationData.categories.map((cat) => (
                  <VegetationCard
                    key={cat.id}
                    category={cat}
                    isDefault={defaultVegIds.includes(cat.id)}
                    onChange={(patch) =>
                      dispatch({ type: 'UPDATE_VEGETATION_CATEGORY', id: cat.id, patch })
                    }
                    onRemove={() => dispatch({ type: 'REMOVE_VEGETATION_CATEGORY', id: cat.id })}
                  />
                ))}

                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'ADD_VEGETATION_CATEGORY',
                      category: {
                        id: `veg-custom-${nanoid(6)}`,
                        categoryType: 'custom',
                        customCategoryLabel: '',
                      },
                    })
                  }
                  className="w-full py-2.5 border-2 border-dashed border-green-200 rounded-xl text-sm text-green-600 hover:border-green-400 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Add custom plantation category
                </button>

                {/* Heritage trees toggle */}
                <div className="pt-2 border-t border-white/5 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      role="switch"
                      aria-checked={state.vegetationData.hasHeritageTrees}
                      onClick={() =>
                        dispatch({
                          type: 'UPDATE_VEGETATION_META',
                          patch: { hasHeritageTrees: !state.vegetationData.hasHeritageTrees },
                        })
                      }
                      className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer ${
                        state.vegetationData.hasHeritageTrees ? 'bg-iitbhu' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 bg-black/40 backdrop-blur-md rounded-full shadow transition-transform ${
                          state.vegetationData.hasHeritageTrees ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-200">
                      Does the campus have heritage trees?
                    </span>
                  </label>
                  {state.vegetationData.hasHeritageTrees && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">
                          Number of heritage trees
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={state.vegetationData.heritageTreeCount ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_VEGETATION_META',
                              patch: { heritageTreeCount: parseInt(e.target.value) || undefined },
                            })
                          }
                          className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Remarks</label>
                        <input
                          type="text"
                          value={state.vegetationData.heritageTreeRemarks ?? ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_VEGETATION_META',
                              patch: { heritageTreeRemarks: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Vegetation summary */}
                {(liveEstimates.totalTrees > 0 || liveEstimates.totalVegArea > 0) && (
                  <div className="bg-green-50 rounded-xl p-4 space-y-1">
                    <p className="text-xs font-medium text-green-700 mb-2">Vegetation summary</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <span className="text-green-600">Total trees</span>
                      <span className="font-medium text-green-800">
                        {liveEstimates.totalTrees.toLocaleString()}
                      </span>
                      <span className="text-green-600">Total green area</span>
                      <span className="font-medium text-green-800">
                        {liveEstimates.totalVegArea.toFixed(1)} acres
                      </span>
                      <span className="text-green-600">Est. annual sequestration</span>
                      <span className="font-semibold text-green-800">
                        {liveEstimates.vegSeqTco2ePerYear} tCO₂e/yr
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── SECTION 4: WATER BODIES ─────────────────────────────────── */}
            <SectionCard
              icon={Droplets}
              title="Water bodies"
              subtitle="Water bodies are recorded for campus sustainability reporting. They do not directly affect the carbon calculation at this stage."
            >
              <div className="space-y-5">
                {/* Canals */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-3">Canals</h3>
                  <div className="space-y-3">
                    {state.waterBodiesData.waterBodies
                      .filter((w) => w.category === 'canal')
                      .map((w) => (
                        <WaterBodyCard
                          key={w.id}
                          waterBody={w}
                          onChange={(patch) =>
                            dispatch({ type: 'UPDATE_WATER_BODY', id: w.id, patch })
                          }
                          onRemove={() => dispatch({ type: 'REMOVE_WATER_BODY', id: w.id })}
                        />
                      ))}
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'ADD_WATER_BODY',
                          waterBody: { id: nanoid(), category: 'canal', name: '' },
                        })
                      }
                      className="w-full py-2 border-2 border-dashed border-blue-200 rounded-xl text-sm text-blue-600 hover:border-blue-400 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus size={14} /> Add another canal
                    </button>
                  </div>
                </div>

                {/* Lakes / Ponds */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-3">Lakes and ponds</h3>
                  <div className="space-y-3">
                    {state.waterBodiesData.waterBodies
                      .filter((w) => w.category === 'lake_pond')
                      .map((w) => (
                        <WaterBodyCard
                          key={w.id}
                          waterBody={w}
                          onChange={(patch) =>
                            dispatch({ type: 'UPDATE_WATER_BODY', id: w.id, patch })
                          }
                          onRemove={() => dispatch({ type: 'REMOVE_WATER_BODY', id: w.id })}
                        />
                      ))}
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'ADD_WATER_BODY',
                          waterBody: { id: nanoid(), category: 'lake_pond', name: '' },
                        })
                      }
                      className="w-full py-2 border-2 border-dashed border-blue-200 rounded-xl text-sm text-blue-600 hover:border-blue-400 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus size={14} /> Add another lake/pond
                    </button>
                  </div>
                </div>

                {/* Other water bodies */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-3">Other water bodies</h3>
                  <div className="space-y-3">
                    {state.waterBodiesData.waterBodies
                      .filter((w) => w.category !== 'canal' && w.category !== 'lake_pond')
                      .map((w) => (
                        <WaterBodyCard
                          key={w.id}
                          waterBody={w}
                          onChange={(patch) =>
                            dispatch({ type: 'UPDATE_WATER_BODY', id: w.id, patch })
                          }
                          onRemove={() => dispatch({ type: 'REMOVE_WATER_BODY', id: w.id })}
                        />
                      ))}
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'ADD_WATER_BODY',
                          waterBody: {
                            id: nanoid(),
                            category: 'other',
                            name: '',
                            customCategoryLabel: '',
                          },
                        })
                      }
                      className="w-full py-2 border-2 border-dashed border-white/10 rounded-xl text-sm text-gray-400 hover:border-gray-400 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus size={14} /> Add other water body type
                    </button>
                  </div>
                </div>

                {/* Water summary */}
                {state.waterBodiesData.waterBodies.length > 0 && (
                  <div className="bg-blue-50 rounded-xl p-4 space-y-1">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <span className="text-blue-600">Total water area</span>
                      <span className="font-medium text-blue-800">
                        {liveEstimates.totalWaterArea.toFixed(1)} acres
                      </span>
                      <span className="text-blue-600">Canals</span>
                      <span className="font-medium text-blue-800">
                        {
                          state.waterBodiesData.waterBodies.filter((w) => w.category === 'canal')
                            .length
                        }
                      </span>
                      <span className="text-blue-600">Lakes / Ponds</span>
                      <span className="font-medium text-blue-800">
                        {
                          state.waterBodiesData.waterBodies.filter(
                            (w) => w.category === 'lake_pond'
                          ).length
                        }
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── SECTION 5: COMMUTATION ─────────────────────────────────── */}
            <SectionCard
              icon={Bus}
              title="Commutation (Scope 3)"
              subtitle="Daily travel by students, staff and faculty to and from campus. Uses 0.15 kg CO₂e/km average emission factor."
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <NumField
                    label="Total commuting occupants"
                    hint="Students + staff who travel to campus regularly"
                    value={state.commutationData.noOccupants}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_COMMUTATION', patch: { noOccupants: v } })
                    }
                    unit="persons"
                  />
                  <NumField
                    label="Avg. daily distance (km)"
                    hint="One-way commute distance per person"
                    value={state.commutationData.avgDailyDistanceKm}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_COMMUTATION', patch: { avgDailyDistanceKm: v } })
                    }
                    step={0.1}
                    unit="km"
                  />
                  <NumField
                    label="Working days per year"
                    hint="Days per year they commute (e.g. 250)"
                    value={state.commutationData.workingDaysPerYear}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_COMMUTATION', patch: { workingDaysPerYear: v } })
                    }
                    unit="days"
                  />
                </div>
                {parseFloat(liveEstimates.commutationTco2e) > 0 && (
                  <div className="bg-orange-50 rounded-xl p-4 text-sm">
                    <p className="font-medium text-orange-800">Commutation estimate</p>
                    <p className="text-orange-700 mt-1">
                      Annual carbon:{' '}
                      <span className="font-semibold">
                        {liveEstimates.commutationTco2e} tCO₂e/yr
                      </span>
                    </p>
                    <p className="text-xs text-orange-500 mt-0.5">
                      Scope 3 · EF: {COMMUTATION_EF} kg CO₂e/km
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── SECTION 6: AIR TRAVEL ───────────────────────────────────── */}
            <SectionCard
              icon={Plane}
              title="Air travel (Scope 3)"
              subtitle="Official air travel by campus staff, researchers and students. Uses 0.20 kg CO₂e/passenger-km."
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <NumField
                    label="No. of air travellers"
                    hint="People who travel by air for campus business per year"
                    value={state.airTravelData.noTravellers}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_AIR_TRAVEL', patch: { noTravellers: v } })
                    }
                    unit="persons"
                  />
                  <NumField
                    label="Total passenger-km"
                    hint="If known: total passenger-km for all flights (overrides per-person)"
                    value={state.airTravelData.totalPassengerKm}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_AIR_TRAVEL', patch: { totalPassengerKm: v } })
                    }
                    step={100}
                    unit="km"
                  />
                  <NumField
                    label="Avg. distance per person (km)"
                    hint="Average total flight distance per traveller per year"
                    value={state.airTravelData.avgDistancePerPersonKm}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_AIR_TRAVEL', patch: { avgDistancePerPersonKm: v } })
                    }
                    step={100}
                    unit="km"
                  />
                </div>
                {parseFloat(liveEstimates.airTravelTco2e) > 0 && (
                  <div className="bg-sky-50 rounded-xl p-4 text-sm">
                    <p className="font-medium text-sky-800">Air travel estimate</p>
                    <p className="text-sky-700 mt-1">
                      Annual carbon:{' '}
                      <span className="font-semibold">{liveEstimates.airTravelTco2e} tCO₂e/yr</span>
                    </p>
                    <p className="text-xs text-sky-500 mt-0.5">
                      Scope 3 · EF: {AIR_TRAVEL_EF} kg CO₂e/passenger-km
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── SECTION 7: PURCHASED GOODS ──────────────────────────────── */}
            <SectionCard
              icon={ShoppingBag}
              title="Purchased goods & services (Scope 3)"
              subtitle="Carbon footprint of goods and services procured by the campus, calculated using the EEIO method (0.246 tCO₂e/USD)."
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumField
                    label="Total annual procurement spend (INR)"
                    hint="Total spend on goods and services per year (INR)"
                    value={state.purchasedGoodsData.totalSpendINR}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_PURCHASED_GOODS', patch: { totalSpendINR: v } })
                    }
                    step={10000}
                    unit="₹"
                  />
                  <NumField
                    label="Or: spend already in 2022 USD"
                    hint="Use this if you already have the USD value"
                    value={state.purchasedGoodsData.totalSpend2022USD}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_PURCHASED_GOODS', patch: { totalSpend2022USD: v } })
                    }
                    step={1000}
                    unit="USD"
                  />
                  <NumField
                    label="Or: campus population"
                    hint="For per-capita estimation (used only if no total spend given)"
                    value={state.purchasedGoodsData.totalPopulation}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_PURCHASED_GOODS', patch: { totalPopulation: v } })
                    }
                    unit="persons"
                  />
                  <NumField
                    label="Cost per person (INR/yr)"
                    hint="Avg. procurement spend per occupant per year"
                    value={state.purchasedGoodsData.costPerPersonINR}
                    onChange={(v) =>
                      dispatch({ type: 'UPDATE_PURCHASED_GOODS', patch: { costPerPersonINR: v } })
                    }
                    step={1000}
                    unit="₹/person"
                  />
                </div>
                {parseFloat(liveEstimates.purchasedGoodsTco2e) > 0 && (
                  <div className="bg-violet-50 rounded-xl p-4 text-sm">
                    <p className="font-medium text-violet-800">Purchased goods estimate</p>
                    <p className="text-violet-700 mt-1">
                      Annual carbon:{' '}
                      <span className="font-semibold">
                        {liveEstimates.purchasedGoodsTco2e} tCO₂e/yr
                      </span>
                    </p>
                    <p className="text-xs text-violet-500 mt-0.5">
                      Scope 3 · EEIO EF: {PURCHASED_GOODS_EF} tCO₂e/USD · INR rate: {INR_TO_USD}
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── CAMPUS CARBON PREVIEW ───────────────────────────────────── */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-200 mb-4">Campus carbon estimate</h2>
              <div className="space-y-0">
                {[
                  {
                    label: 'Road infrastructure (annual)',
                    value: `+${liveEstimates.roadsAnnualTco2e}`,
                    unit: 'tCO₂e/yr',
                    color: 'text-gray-200',
                    scope: '1',
                  },
                  {
                    label: 'Road lighting (annual)',
                    value: `+${liveEstimates.lightingAnnualTco2e}`,
                    unit: 'tCO₂e/yr',
                    color: 'text-amber-700',
                    scope: '2',
                  },
                  {
                    label: 'Commutation',
                    value: `+${liveEstimates.commutationTco2e}`,
                    unit: 'tCO₂e/yr',
                    color: 'text-orange-700',
                    scope: '3',
                  },
                  {
                    label: 'Air travel',
                    value: `+${liveEstimates.airTravelTco2e}`,
                    unit: 'tCO₂e/yr',
                    color: 'text-sky-700',
                    scope: '3',
                  },
                  {
                    label: 'Purchased goods & services',
                    value: `+${liveEstimates.purchasedGoodsTco2e}`,
                    unit: 'tCO₂e/yr',
                    color: 'text-violet-700',
                    scope: '3',
                  },
                  {
                    label: 'Vegetation sequestration',
                    value: liveEstimates.vegSeqTco2ePerYear,
                    unit: 'tCO₂e/yr',
                    color: 'text-green-700',
                    scope: null,
                  },
                ].map(({ label, value, unit, color, scope }) => (
                  <div
                    key={label}
                    className="flex justify-between items-center text-sm py-1.5 border-b border-white/5 last:border-0"
                  >
                    <span className="text-gray-400 flex items-center gap-1.5">
                      {scope && (
                        <span className="text-xs bg-gray-200 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                          S{scope}
                        </span>
                      )}
                      {label}
                    </span>
                    <span className={`font-semibold ${color}`}>
                      {value} <span className="text-xs text-gray-400">{unit}</span>
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center text-sm pt-3 mt-1 border-t-2 border-white/20">
                  <span className="font-semibold text-gray-200">Net campus carbon (annual)</span>
                  <span
                    className={`font-bold text-base ${netIsNegative ? 'text-green-700' : 'text-amber-700'}`}
                  >
                    {liveEstimates.netAnnualTco2e}{' '}
                    <span className="text-xs font-normal text-gray-400">tCO₂e/yr</span>
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Building-level carbon is calculated separately and shown on the main dashboard.
              </p>
            </div>

            {/* Validation result */}
            {state.validationResult && state.validationResult.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <p className="text-sm font-medium text-amber-700">Validation warnings</p>
                </div>
                <ul className="space-y-1">
                  {state.validationResult.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-amber-600 flex items-start gap-1.5">
                      <span className="mt-0.5">•</span> {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
          <div className="w-72 flex-shrink-0 hidden lg:block">
            <div className="sticky top-20 space-y-4">
              {/* Campus identity */}
              <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4">
                <p className="text-sm font-bold text-gray-100">{campusDraft?.name ?? slug}</p>
                <span className="inline-block mt-1 text-xs bg-iitbhu/10 text-iitbhu px-2 py-0.5 rounded-full">
                  campus data
                </span>
              </div>

              {/* Save status */}
              <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Save status</span>
                  {state.isDirty && !state.isSaving && (
                    <span className="text-xs text-amber-600">Unsaved changes</span>
                  )}
                  {state.isSaving && <span className="text-xs text-gray-400">Saving…</span>}
                  {!state.isDirty && state.lastSavedAt && (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle size={10} />
                      Saved
                    </div>
                  )}
                </div>

                {/* Completeness bar */}
                {(() => {
                  const hasRoads = state.roadsData.segments.length > 0 ? 1 : 0;
                  const hasVeg =
                    liveEstimates.totalTrees > 0 || liveEstimates.totalVegArea > 0 ? 1 : 0;
                  const hasWater = state.waterBodiesData.waterBodies.length > 0 ? 1 : 0;
                  const hasCommutation = parseFloat(liveEstimates.commutationTco2e) > 0 ? 1 : 0;
                  const hasAir = parseFloat(liveEstimates.airTravelTco2e) > 0 ? 1 : 0;
                  const hasGoods = parseFloat(liveEstimates.purchasedGoodsTco2e) > 0 ? 1 : 0;
                  const score = Math.round(
                    ((hasRoads + hasVeg + hasWater + hasCommutation + hasAir + hasGoods) / 6) * 100
                  );
                  return (
                    <div className="my-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Completeness</span>
                        <span>{score}%</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div
                          className="bg-iitbhu h-2 rounded-full transition-all"
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Navigation contents */}
                <div className="space-y-1 mt-3">
                  {[
                    { label: 'Road infrastructure', count: state.roadsData.segments.length },
                    { label: 'Road lighting', count: state.roadsData.hasStreetLighting ? 1 : 0 },
                    {
                      label: 'Vegetation',
                      count: state.vegetationData.categories.filter(
                        (c) => c.numberOfTrees || c.areaAcres
                      ).length,
                    },
                    { label: 'Water bodies', count: state.waterBodiesData.waterBodies.length },
                    {
                      label: 'Commutation',
                      count: parseFloat(liveEstimates.commutationTco2e) > 0 ? 1 : 0,
                    },
                    {
                      label: 'Air travel',
                      count: parseFloat(liveEstimates.airTravelTco2e) > 0 ? 1 : 0,
                    },
                    {
                      label: 'Purchased goods',
                      count: parseFloat(liveEstimates.purchasedGoodsTco2e) > 0 ? 1 : 0,
                    },
                  ].map(({ label, count }) => (
                    <div key={label} className="flex justify-between text-xs py-1">
                      <span className="text-gray-300">{label}</span>
                      <span className={count > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                        {count > 0 ? '✓' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <button
                onClick={triggerSave}
                disabled={!state.isDirty || state.isSaving}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-medium border border-white/10 text-gray-200 py-2.5 rounded-xl hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                <Save size={14} />
                {state.isSaving ? 'Saving…' : 'Save draft'}
              </button>

              <button
                onClick={() => triggerSave()}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-medium border border-white/10 text-gray-200 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
              >
                Save now
              </button>

              <button
                onClick={async () => {
                  if (state.isDirty) {
                    dispatch({ type: 'SET_SAVING', value: true });
                    await saveMutation.mutateAsync(state);
                  }
                  submitMutation.mutate();
                }}
                disabled={submitMutation.isPending || state.isSaving}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-iitbhu text-white py-2.5 rounded-xl hover:bg-iitbhu-dark transition-colors disabled:opacity-50"
              >
                <Send size={14} />
                {submitMutation.isPending ? 'Submitting…' : 'Submit for review'}
              </button>

              {submitMutation.isError && (
                <p className="text-xs text-red-600 text-center">
                  Submission failed. Please try again.
                </p>
              )}

              {state.lastSavedAt && (
                <p className="text-xs text-gray-400 text-center">
                  Last saved{' '}
                  {state.lastSavedAt.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
