import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { CHART_COLORS } from '@/constants/chartColors';
import CustomTooltip from './CustomTooltip';

interface TimelinePoint {
  month: string;
  embodied: number;
  operational: number;
  cumulative: number;
}

interface Props {
  data: TimelinePoint[];
}

export default function CarbonTimeline({ data }: Props) {
  if (data.length < 3) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400 text-center">
        More data needed for trend analysis
      </div>
    );
  }

  // Show every 3rd label if > 9 months
  const showEvery = data.length > 9 ? 3 : 1;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={showEvery - 1} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="embodied"
          name="Embodied"
          stroke={CHART_COLORS.embodied}
          fill={CHART_COLORS.embodied}
          fillOpacity={0.1}
          strokeWidth={0}
        />
        <Area
          type="monotone"
          dataKey="operational"
          name="Operational"
          stroke={CHART_COLORS.operational}
          fill={CHART_COLORS.operational}
          fillOpacity={0.1}
          strokeWidth={0}
        />
        <Line
          type="monotone"
          dataKey="embodied"
          name="Embodied (cumulative)"
          stroke={CHART_COLORS.embodied}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="operational"
          name="Operational (cumulative)"
          stroke={CHART_COLORS.operational}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
