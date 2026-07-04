import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { APPLIANCE_COLORS } from '@/constants/chartColors';
import NoDataOverlay from './NoDataOverlay';

interface ApplianceData {
  category: string;
  estimatedKwh: number;
  estimatedCO2: number;
  percentage: number;
}

interface Props {
  data: ApplianceData[];
}

const CATEGORY_LABELS: Record<string, string> = {
  lighting: 'Lighting',
  cooling: 'Cooling',
  computing: 'Computing',
  labEquipment: 'Lab Equipment',
  misc: 'Misc',
};

function ApplianceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ApplianceData }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg shadow-md p-3 text-sm">
      <p className="font-semibold text-white mb-1">
        {CATEGORY_LABELS[d.category] ?? d.category}
      </p>
      <p className="text-gray-300">Est. kWh: {d.estimatedKwh.toFixed(0)}</p>
      <p className="text-gray-300">Est. CO₂: {d.estimatedCO2.toFixed(3)} tCO₂e</p>
      <p className="text-gray-300">{d.percentage}%</p>
    </div>
  );
}

export default function ApplianceDonut({ data }: Props) {
  const total = data.reduce((s, d) => s + d.estimatedCO2, 0);
  const hasData = total > 0;
  if (!hasData) return <NoDataOverlay />;

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="estimatedCO2"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
            >
              {data.map((entry) => (
                <Cell key={entry.category} fill={APPLIANCE_COLORS[entry.category] ?? '#9CA3AF'} />
              ))}
            </Pie>
            <Tooltip content={<ApplianceTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-white">{total.toFixed(1)}</span>
          <span className="text-[10px] text-gray-400">tCO₂e</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {data.map((d) => (
          <span key={d.category} className="flex items-center gap-1.5 text-xs text-gray-300">
            <span
              className="inline-block h-2 w-2 rounded-full flex-shrink-0"
              style={{ background: APPLIANCE_COLORS[d.category] ?? '#9CA3AF' }}
            />
            {CATEGORY_LABELS[d.category] ?? d.category} ({d.percentage}%)
          </span>
        ))}
      </div>
    </div>
  );
}
