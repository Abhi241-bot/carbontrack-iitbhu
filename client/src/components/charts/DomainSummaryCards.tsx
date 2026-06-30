import { Zap, Package, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import ApplianceDonut from './ApplianceDonut';
import WasteStreamDonut from './WasteStreamDonut';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';

interface ByTypeRow {
  type: string;
  embodiedCarbon: number;
  operationalCarbon: number;
  totalCarbon: number;
  avgIntensityPerSqm: number;
  wasteCO2e: number;
  wasteCarbonPerYear: number;
  solidWasteCO2e: number;
  liquidWasteCO2e: number;
  woodKg: number;
  steelFurnitureKg: number;
  plasticKg: number;
  glassKg: number;
}

interface ApplianceCategory {
  category: string;
  estimatedKwh: number;
  estimatedCO2: number;
  percentage: number;
}

interface WasteStream {
  disposalMethod: string;
  avgFractionPercent: number;
}

interface SolidWasteByType {
  type: string;
  solidWasteCO2ePerYear: number;
  wasteStreams: WasteStream[];
}

interface DomainBreakdown {
  byBuildingType: ByTypeRow[];
  byScope: {
    scope1: number;
    scope2: number;
    scope3: number;
    total: number;
    solarAdoptionCount?: number;
  };
  byApplianceCategory: ApplianceCategory[];
  embodiedVsOperational: {
    embodiedTotal: number;
    operationalTotal: number;
    embodiedPercent: number;
    operationalPercent: number;
  };
}

interface WasteBreakdown {
  solidWasteByType: SolidWasteByType[];
  campusTotals: { totalWasteCO2eYear: number; solidWasteCO2e: number; liquidWasteCO2e: number };
}

interface Props {
  domainBreakdown: DomainBreakdown;
  wasteBreakdown: WasteBreakdown;
  filteredTypes: string[];
  isLoading: boolean;
}

const MATERIAL_COLORS: Record<string, string> = {
  wood: '#92400E',
  steel: '#475569',
  plastic: '#7C3AED',
  glass: '#0E7490',
};

function DomainCard({
  icon,
  iconColor,
  title,
  primaryStat,
  primaryUnit,
  secondaryStats,
  chart,
  isLoading,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  primaryStat: string;
  primaryUnit: string;
  secondaryStats: Array<{ label: string; value: string }>;
  chart: React.ReactNode;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm animate-pulse">
        <div className="h-6 bg-gray-100 rounded w-1/3 mb-4" />
        <div className="h-12 bg-gray-100 rounded mb-4" />
        <div className="h-40 bg-gray-50 rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center h-8 w-8 rounded-lg text-white flex-shrink-0"
          style={{ background: iconColor }}
        >
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>

      <div>
        <span className="text-3xl font-bold text-gray-900">{primaryStat}</span>
        <span className="text-sm text-gray-500 ml-1.5">{primaryUnit}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {secondaryStats.map((s) => (
          <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex-1">{chart}</div>
    </div>
  );
}

export default function DomainSummaryCards({
  domainBreakdown,
  wasteBreakdown,
  filteredTypes,
  isLoading,
}: Props) {
  const filteredByType = useMemo(
    () => domainBreakdown.byBuildingType.filter((t) => filteredTypes.includes(t.type)),
    [domainBreakdown.byBuildingType, filteredTypes]
  );

  // Energy stats
  const totalOperational = filteredByType.reduce((s, t) => s + t.operationalCarbon, 0);
  const totalEmbodied = filteredByType.reduce((s, t) => s + t.embodiedCarbon, 0);
  const totalCampusCarbon = totalOperational + totalEmbodied;
  const energyPercent =
    totalCampusCarbon > 0 ? ((totalOperational / totalCampusCarbon) * 100).toFixed(0) : '0';
  const totalKwh = domainBreakdown.byApplianceCategory.reduce((s, c) => s + c.estimatedKwh, 0);

  // Materials stats
  const materialsPercent =
    totalCampusCarbon > 0 ? ((totalEmbodied / totalCampusCarbon) * 100).toFixed(0) : '0';
  const totalArea = filteredByType.reduce((t, row) => {
    const area = row.avgIntensityPerSqm > 0 ? row.totalCarbon / row.avgIntensityPerSqm : 0;
    return t + area;
  }, 0);

  const campusEmbodiedPerSqm = totalArea > 0 ? (totalEmbodied / totalArea).toFixed(3) : '—';

  const materialBreakdown = useMemo(() => {
    const totals = filteredByType.reduce(
      (acc, t) => ({
        wood: acc.wood + t.woodKg,
        steel: acc.steel + t.steelFurnitureKg,
        plastic: acc.plastic + t.plasticKg,
        glass: acc.glass + t.glassKg,
      }),
      { wood: 0, steel: 0, plastic: 0, glass: 0 }
    );
    return [
      { name: 'Wood', value: totals.wood, key: 'wood' },
      { name: 'Steel', value: totals.steel, key: 'steel' },
      { name: 'Plastic', value: totals.plastic, key: 'plastic' },
      { name: 'Glass', value: totals.glass, key: 'glass' },
    ].filter((m) => m.value > 0);
  }, [filteredByType]);

  // Waste stats
  const filteredWaste = useMemo(
    () => wasteBreakdown.solidWasteByType.filter((t) => filteredTypes.includes(t.type)),
    [wasteBreakdown.solidWasteByType, filteredTypes]
  );

  const totalWasteCO2e = filteredWaste.reduce((s, t) => s + t.solidWasteCO2ePerYear, 0);
  const wastePercent =
    totalCampusCarbon > 0
      ? ((wasteBreakdown.campusTotals.totalWasteCO2eYear / totalCampusCarbon) * 100).toFixed(0)
      : '0';

  const campusWasteStreams = useMemo(() => {
    if (filteredWaste.length === 0) return [];
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
        return {
          disposalMethod: method,
          avgFractionPercent: parseFloat(weighted.toFixed(1)),
        };
      })
      .filter((s) => s.avgFractionPercent > 0);
  }, [filteredWaste]);

  const dominantStream =
    campusWasteStreams.length > 0
      ? [...campusWasteStreams].sort((a, b) => b.avgFractionPercent - a.avgFractionPercent)[0]
      : null;

  const METHOD_SHORT: Record<string, string> = {
    unmanaged_dump: 'Unmanaged dump',
    managed_landfill: 'Landfill',
    composting: 'Composting',
    recycling: 'Recycling',
    open_burning: 'Open burning',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Energy Card */}
      <DomainCard
        icon={<Zap size={16} />}
        iconColor="#1a3c2e"
        title="Energy Emissions"
        primaryStat={totalOperational.toFixed(1)}
        primaryUnit="tCO₂e/yr"
        secondaryStats={[
          { label: 'Est. electricity', value: `${(totalKwh / 1000).toFixed(0)}k kWh` },
          { label: '% of footprint', value: `${energyPercent}%` },
        ]}
        chart={<ApplianceDonut data={domainBreakdown.byApplianceCategory} />}
        isLoading={isLoading}
      />

      {/* Materials Card */}
      <DomainCard
        icon={<Package size={16} />}
        iconColor="#8B1A1A"
        title="Embodied Carbon (Materials)"
        primaryStat={totalEmbodied.toFixed(1)}
        primaryUnit="tCO₂e one-time"
        secondaryStats={[
          { label: 'Avg per m²', value: `${campusEmbodiedPerSqm} tCO₂e` },
          { label: '% of footprint', value: `${materialsPercent}%` },
        ]}
        chart={
          materialBreakdown.length > 0 ? (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">
                Furniture material breakdown (kg)
              </p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart
                  data={materialBreakdown}
                  layout="vertical"
                  margin={{ left: 4, right: 16 }}
                >
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#9CA3AF' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#6B7280' }}
                    width={44}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {materialBreakdown.map((entry) => (
                      <Cell key={entry.key} fill={MATERIAL_COLORS[entry.key] ?? '#9CA3AF'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic mt-2">
              Structural materials (concrete, steel, glass) dominate embodied carbon. Detailed
              furniture data will appear once buildings submit material inventories.
            </p>
          )
        }
        isLoading={isLoading}
      />

      {/* Waste Card */}
      <DomainCard
        icon={<Trash2 size={16} />}
        iconColor="#D97706"
        title="Waste Emissions"
        primaryStat={wasteBreakdown.campusTotals.totalWasteCO2eYear.toFixed(3)}
        primaryUnit="tCO₂e/yr"
        secondaryStats={[
          {
            label: 'Solid waste CO₂e',
            value: `${wasteBreakdown.campusTotals.solidWasteCO2e.toFixed(3)} t`,
          },
          {
            label: 'Dominant stream',
            value: dominantStream
              ? (METHOD_SHORT[dominantStream.disposalMethod] ?? dominantStream.disposalMethod)
              : '—',
          },
        ]}
        chart={<WasteStreamDonut data={campusWasteStreams} />}
        isLoading={isLoading}
      />
    </div>
  );
}
