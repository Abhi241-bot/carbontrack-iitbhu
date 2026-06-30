import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Legend,
} from 'recharts';
import { BUILDING_TYPE_COLORS, CHART_COLORS } from '@/constants/chartColors';
import NoDataOverlay from './NoDataOverlay';

interface TypeIntensityData {
  type: string;
  avgIntensityPerSqm: number;
  energyCO2ePerSqm: number;
  wasteCO2ePerSqm: number;
}

interface Props {
  data: TypeIntensityData[];
  campusAvgIntensity?: number;
}

const TYPE_LABELS: Record<string, string> = {
  academic: 'Academic',
  hostel: 'Hostel',
  lab: 'Lab',
  administrative: 'Admin',
  residential: 'Residential',
  commercial: 'Commercial',
  infrastructure: 'Infra',
};

function IntensityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-sm min-w-[180px]">
      <p className="font-semibold text-gray-900 mb-2 capitalize">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name === 'energyCO2ePerSqm' ? 'Energy' : 'Waste'}
          </span>
          <span>{p.value.toFixed(4)} tCO₂e/m²</span>
        </div>
      ))}
      <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between font-medium text-gray-900">
        <span>Total intensity</span>
        <span>{total.toFixed(4)} tCO₂e/m²</span>
      </div>
    </div>
  );
}

export default function BuildingTypeIntensity({ data, campusAvgIntensity }: Props) {
  if (!data.length) return <NoDataOverlay />;

  const labRow = data.find((t) => t.type === 'lab');
  const hostelRow = data.find((t) => t.type === 'hostel');
  const insight =
    labRow && hostelRow && hostelRow.avgIntensityPerSqm > 0
      ? `Labs emit ${(labRow.avgIntensityPerSqm / hostelRow.avgIntensityPerSqm).toFixed(1)}× more carbon per m² than hostels, driven by energy-intensive equipment.`
      : null;

  const chartData = data.map((d) => ({
    ...d,
    label: TYPE_LABELS[d.type] ?? d.type,
  }));

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 44)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#6B7280' }}
            tickFormatter={(v: number) => v.toFixed(3)}
            label={{
              value: 'tCO₂e/m²',
              position: 'insideRight',
              offset: -4,
              fontSize: 10,
              fill: '#9CA3AF',
            }}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 11, fill: '#6B7280' }}
            width={70}
          />
          <Tooltip content={<IntensityTooltip />} />
          <Legend
            formatter={(value) => (
              <span className="text-xs text-gray-600">
                {value === 'energyCO2ePerSqm' ? 'Energy intensity' : 'Waste intensity'}
              </span>
            )}
          />
          {campusAvgIntensity !== undefined && campusAvgIntensity > 0 && (
            <ReferenceLine
              x={campusAvgIntensity}
              stroke="#8B1A1A"
              strokeDasharray="4 4"
              label={{
                value: 'Campus avg',
                position: 'top',
                fontSize: 10,
                fill: '#8B1A1A',
              }}
            />
          )}
          <Bar
            dataKey="energyCO2ePerSqm"
            name="energyCO2ePerSqm"
            stackId="a"
            fill={CHART_COLORS.operational}
            radius={[0, 0, 0, 0]}
            maxBarSize={28}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.type}
                fill={BUILDING_TYPE_COLORS[entry.type] ?? CHART_COLORS.operational}
              />
            ))}
          </Bar>
          <Bar
            dataKey="wasteCO2ePerSqm"
            name="wasteCO2ePerSqm"
            stackId="a"
            fill={CHART_COLORS.commercial}
            radius={[0, 4, 4, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
      {insight && (
        <p className="text-xs text-gray-500 italic border-l-2 border-violet-400 pl-3">{insight}</p>
      )}
    </div>
  );
}
