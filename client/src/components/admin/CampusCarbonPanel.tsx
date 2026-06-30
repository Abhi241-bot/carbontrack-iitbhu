import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campusApi } from '@/features/campus/campusApi';
import { RefreshCw, AlertTriangle } from 'lucide-react';

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return n.toFixed(decimals);
}

function TitleRow({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 border-b border-gray-50 ${highlight ? 'bg-blue-50/30' : ''}`}
    >
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-blue-700' : 'text-gray-800'}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-gray-400">{unit}</span>}
      </span>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: 1 | 2 | 3 }) {
  const styles: Record<number, string> = {
    1: 'bg-red-100 text-red-700',
    2: 'bg-amber-100 text-amber-700',
    3: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${styles[scope]}`}>S{scope}</span>
  );
}

function RoadsTable({ carbonResults }: { carbonResults: any }) {
  const bd = carbonResults?.breakdown;
  if (!bd) return null;

  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Road infrastructure
      </h4>
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">
          <span>Source</span>
          <span>tCO₂e/yr</span>
        </div>
        {bd.roadConstruction != null && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600 flex items-center gap-2">
              <ScopeBadge scope={1} /> Road construction (amortised)
            </span>
            <span className="text-sm font-semibold text-gray-800">{fmt(bd.roadConstruction)}</span>
          </div>
        )}
        {bd.roadLighting != null && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600 flex items-center gap-2">
              <ScopeBadge scope={2} /> Road lighting (electricity)
            </span>
            <span className="text-sm font-semibold text-amber-700">{fmt(bd.roadLighting)}</span>
          </div>
        )}
        {(carbonResults.roadsEmbodiedCarbon != null ||
          carbonResults.roadLightingCarbonPerYear != null) && (
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700">Roads subtotal</span>
            <span className="text-sm font-bold text-gray-800">
              {fmt((bd.roadConstruction ?? 0) + (bd.roadLighting ?? 0))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function VegetationTable({ carbonResults }: { carbonResults: any }) {
  const bd = carbonResults?.breakdown;
  if (bd?.vegetation == null) return null;

  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Vegetation sequestration
      </h4>
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-green-50">
          <span className="text-sm text-gray-600">Annual sequestration</span>
          <span className="text-sm font-bold text-green-700">{fmt(bd.vegetation)} tCO₂e/yr</span>
        </div>
      </div>
    </div>
  );
}

function Scope3Table({ carbonResults }: { carbonResults: any }) {
  const bd = carbonResults?.breakdown;
  if (!bd) return null;

  const rows = [
    {
      key: 'commutation',
      label: 'Commutation',
      val: bd.commutation ?? carbonResults.commutationCarbonPerYear,
    },
    {
      key: 'airTravel',
      label: 'Air travel',
      val: bd.airTravel ?? carbonResults.airTravelCarbonPerYear,
    },
    {
      key: 'purchasedGoods',
      label: 'Purchased goods & services',
      val: bd.purchasedGoods ?? carbonResults.purchasedGoodsCarbonPerYear,
    },
  ].filter((r) => r.val != null);

  if (rows.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Scope 3 activities
      </h4>
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">
          <span>Source</span>
          <span>tCO₂e/yr</span>
        </div>
        {rows.map(({ key, label, val }) => (
          <div
            key={key}
            className="flex items-center justify-between px-4 py-2 border-b border-gray-50"
          >
            <span className="text-sm text-gray-600 flex items-center gap-2">
              <ScopeBadge scope={3} /> {label}
            </span>
            <span className="text-sm font-semibold text-blue-700">{fmt(val)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">Scope 3 subtotal</span>
          <span className="text-sm font-bold text-blue-800">
            {fmt(rows.reduce((a, r) => a + (r.val ?? 0), 0))}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CampusCarbonPanel({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [recalcError, setRecalcError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['campus', slug, 'carbon'],
    queryFn: async () => {
      const res = await campusApi.getCampusCarbon(slug);
      return res.data?.data ?? null;
    },
    staleTime: 60_000,
  });

  const recalcMutation = useMutation({
    mutationFn: () => campusApi.recalculateCampusCarbon(slug),
    onSuccess: () => {
      setRecalcError(null);
      qc.invalidateQueries({ queryKey: ['campus', slug, 'carbon'] });
    },
    onError: (err: any) => {
      setRecalcError(err?.response?.data?.message ?? 'Recalculation failed');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data?.dataAvailable) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle size={24} className="text-gray-400 mb-3" />
        <p className="text-sm font-medium text-gray-600">No carbon data available</p>
        <p className="text-xs text-gray-400 mt-1">
          Infrastructure must be submitted and verified before carbon results are available.
        </p>
      </div>
    );
  }

  const cr = data.carbonResults;
  const netPerYear = cr?.netCampusCarbonPerYear ?? 0;
  const netIsNeg = netPerYear <= 0;

  return (
    <div className="space-y-1">
      {/* Net summary card */}
      <div
        className={`rounded-xl p-5 border ${netIsNeg ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-xs font-medium ${netIsNeg ? 'text-green-600' : 'text-amber-600'}`}>
              Net campus carbon (annual)
            </p>
            <p
              className={`text-3xl font-bold mt-1 ${netIsNeg ? 'text-green-700' : 'text-amber-700'}`}
            >
              {fmt(netPerYear)} <span className="text-base font-normal">tCO₂e/yr</span>
            </p>
          </div>
          <button
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={recalcMutation.isPending ? 'animate-spin' : ''} />
            Recalculate
          </button>
        </div>
        {data.calculatedAt && (
          <p className="text-xs text-gray-400 mt-2">
            Last calculated: {new Date(data.calculatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {recalcError && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={14} />
          {recalcError}
        </div>
      )}

      {/* Key figures */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mt-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Summary
        </h4>
        <TitleRow
          label="Road construction (amortised)"
          value={fmt(cr?.roadsEmbodiedCarbon)}
          unit="tCO₂e (total)"
        />
        <TitleRow
          label="Road lighting"
          value={fmt(cr?.roadLightingCarbonPerYear)}
          unit="tCO₂e/yr"
        />
        {cr?.commutationCarbonPerYear != null && (
          <TitleRow label="Commutation" value={fmt(cr.commutationCarbonPerYear)} unit="tCO₂e/yr" />
        )}
        {cr?.airTravelCarbonPerYear != null && (
          <TitleRow label="Air travel" value={fmt(cr.airTravelCarbonPerYear)} unit="tCO₂e/yr" />
        )}
        {cr?.purchasedGoodsCarbonPerYear != null && (
          <TitleRow
            label="Purchased goods"
            value={fmt(cr.purchasedGoodsCarbonPerYear)}
            unit="tCO₂e/yr"
          />
        )}
        <TitleRow
          label="Vegetation sequestration"
          value={fmt(cr?.vegetationSequestrationPerYear)}
          unit="tCO₂e/yr"
        />
        <TitleRow
          label="Net annual"
          value={fmt(cr?.netCampusCarbonPerYear)}
          unit="tCO₂e/yr"
          highlight
        />
      </div>

      {/* Breakdown tables */}
      <RoadsTable carbonResults={cr} />
      <VegetationTable carbonResults={cr} />
      <Scope3Table carbonResults={cr} />

      {/* Confidence */}
      {cr?.confidenceScore != null && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mt-2 flex items-center justify-between">
          <span className="text-xs text-gray-500">Data confidence score</span>
          <span
            className={`text-xs font-semibold ${
              cr.confidenceScore >= 0.8
                ? 'text-green-700'
                : cr.confidenceScore >= 0.5
                  ? 'text-amber-700'
                  : 'text-red-600'
            }`}
          >
            {Math.round(cr.confidenceScore * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
