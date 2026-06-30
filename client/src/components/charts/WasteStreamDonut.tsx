import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { WASTE_STREAM_COLORS } from '@/constants/chartColors';
import NoDataOverlay from './NoDataOverlay';

interface WasteStream {
  disposalMethod: string;
  avgFractionPercent: number;
}

interface Props {
  data: WasteStream[];
  title?: string;
}

const METHOD_LABELS: Record<string, string> = {
  unmanaged_dump: 'Unmanaged Dump',
  managed_landfill: 'Managed Landfill',
  composting: 'Composting',
  recycling: 'Recycling',
  open_burning: 'Open Burning',
};

function WasteTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: WasteStream }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1">
        {METHOD_LABELS[d.disposalMethod] ?? d.disposalMethod}
      </p>
      <p className="text-gray-600">{d.avgFractionPercent.toFixed(1)}% of solid waste</p>
    </div>
  );
}

export default function WasteStreamDonut({ data }: Props) {
  const hasData = data.length > 0 && data.some((d) => d.avgFractionPercent > 0);
  if (!hasData) return <NoDataOverlay />;

  const dominant = [...data].sort((a, b) => b.avgFractionPercent - a.avgFractionPercent)[0];

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="avgFractionPercent"
              nameKey="disposalMethod"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.disposalMethod}
                  fill={WASTE_STREAM_COLORS[entry.disposalMethod] ?? '#9CA3AF'}
                />
              ))}
            </Pie>
            <Tooltip content={<WasteTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight px-4">
            {METHOD_LABELS[dominant.disposalMethod] ?? dominant.disposalMethod}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5">dominant</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {data.map((d) => (
          <span key={d.disposalMethod} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="inline-block h-2 w-2 rounded-full flex-shrink-0"
              style={{ background: WASTE_STREAM_COLORS[d.disposalMethod] ?? '#9CA3AF' }}
            />
            {METHOD_LABELS[d.disposalMethod] ?? d.disposalMethod} ({d.avgFractionPercent.toFixed(0)}
            %)
          </span>
        ))}
      </div>
    </div>
  );
}
