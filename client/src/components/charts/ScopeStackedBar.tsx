import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '@/constants/chartColors';
import CustomTooltip from './CustomTooltip';
import NoDataOverlay from './NoDataOverlay';

interface ScopeData {
  type: string;
  scope1: number;
  scope2: number;
  scope3: number;
}

interface Props {
  data: ScopeData[];
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tickFormatter(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(1);
}

export default function ScopeStackedBar({ data }: Props) {
  const hasData = data.some((d) => d.scope1 > 0 || d.scope2 > 0 || d.scope3 > 0);
  if (!hasData) return <NoDataOverlay />;

  const chartData = data.map((d) => ({
    name: capitalize(d.type),
    'Scope 1': d.scope1,
    'Scope 2': d.scope2,
    'Scope 3': d.scope3,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFormatter} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#e5e7eb" />
          <Bar dataKey="Scope 1" stackId="a" fill={CHART_COLORS.scope1} maxBarSize={32} />
          <Bar dataKey="Scope 2" stackId="a" fill={CHART_COLORS.scope2} maxBarSize={32} />
          <Bar
            dataKey="Scope 3"
            stackId="a"
            fill={CHART_COLORS.scope3}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-4 mt-2 text-xs text-gray-300">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: CHART_COLORS.scope1 }}
          />
          Scope 1 — Direct (diesel)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: CHART_COLORS.scope2 }}
          />
          Scope 2 — Indirect (electricity)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: CHART_COLORS.scope3 }}
          />
          Scope 3 — Materials
        </span>
      </div>
    </div>
  );
}
