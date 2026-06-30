import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_COLORS } from '@/constants/chartColors';
import CustomTooltip from './CustomTooltip';
import NoDataOverlay from './NoDataOverlay';

interface BuildingTypeData {
  type: string;
  embodiedCarbon: number;
  operationalCarbon: number;
  buildingCount: number;
}

interface Props {
  data: BuildingTypeData[];
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tickFormatter(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(1);
}

export default function BuildingTypeBar({ data }: Props) {
  const chartData = data.map((d) => ({
    name: capitalize(d.type),
    Embodied: d.embodiedCarbon,
    Operational: d.operationalCarbon,
  }));

  const hasData = data.some((d) => d.embodiedCarbon > 0 || d.operationalCarbon > 0);
  if (!hasData) return <NoDataOverlay />;

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFormatter} />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="Embodied"
            fill={CHART_COLORS.embodied}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
          <Bar
            dataKey="Operational"
            fill={CHART_COLORS.operational}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-6 mt-2 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: CHART_COLORS.embodied }}
          />
          Embodied
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: CHART_COLORS.operational }}
          />
          Operational
        </span>
      </div>
    </div>
  );
}
