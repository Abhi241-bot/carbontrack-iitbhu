import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CHART_COLORS, TREATMENT_COLORS } from '@/constants/chartColors';
import NoDataOverlay from './NoDataOverlay';

interface WastewaterByType {
  type: string;
  liquidWasteCO2ePerYear: number;
  treatmentDistribution: {
    unmanaged_septic: number;
    municipal_stp: number;
    campus_stp: number;
  };
}

interface Props {
  solidWasteCO2e: number;
  liquidWasteCO2e: number;
  wastewaterByType: WastewaterByType[];
}

const TREATMENT_LABELS: Record<string, string> = {
  unmanaged_septic: 'Unmanaged Septic',
  municipal_stp: 'Municipal STP',
  campus_stp: 'Campus STP',
};

const TYPE_LABELS: Record<string, string> = {
  academic: 'Academic',
  hostel: 'Hostel',
  lab: 'Lab',
  administrative: 'Admin',
  residential: 'Residential',
  commercial: 'Commercial',
  infrastructure: 'Infra',
};

function SolidLiquidTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg shadow-md p-3 text-sm">
      <p className="font-semibold text-white mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-gray-300">
          {p.name}: {p.value.toFixed(3)} tCO₂e/yr
        </p>
      ))}
    </div>
  );
}

export default function WastewaterBar({
  solidWasteCO2e,
  liquidWasteCO2e,
  wastewaterByType,
}: Props) {
  const hasData = solidWasteCO2e > 0 || liquidWasteCO2e > 0;
  if (!hasData) return <NoDataOverlay />;

  const splitData = [
    { name: 'Solid Waste', value: solidWasteCO2e, fill: CHART_COLORS.embodied },
    { name: 'Liquid Waste', value: liquidWasteCO2e, fill: CHART_COLORS.scope2 },
  ];

  const treatmentData = wastewaterByType
    .filter((t) => t.liquidWasteCO2ePerYear > 0)
    .map((t) => ({
      type: TYPE_LABELS[t.type] ?? t.type,
      ...t.treatmentDistribution,
    }));

  return (
    <div className="space-y-6">
      {/* Solid vs Liquid split */}
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
          Solid vs Liquid Waste Carbon (tCO₂e/yr)
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={splitData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: '#6B7280' }}
              width={80}
            />
            <Tooltip content={<SolidLiquidTooltip />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {splitData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Treatment distribution by type */}
      {treatmentData.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Treatment Method by Building Type (building count)
          </p>
          <ResponsiveContainer width="100%" height={Math.max(120, treatmentData.length * 36)}>
            <BarChart data={treatmentData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="type"
                tick={{ fontSize: 10, fill: '#6B7280' }}
                width={56}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value} building${value !== 1 ? 's' : ''}`,
                  TREATMENT_LABELS[name] ?? name,
                ]}
              />
              <Bar
                dataKey="unmanaged_septic"
                stackId="a"
                name="unmanaged_septic"
                fill={TREATMENT_COLORS.unmanaged_septic}
              />
              <Bar
                dataKey="municipal_stp"
                stackId="a"
                name="municipal_stp"
                fill={TREATMENT_COLORS.municipal_stp}
              />
              <Bar
                dataKey="campus_stp"
                stackId="a"
                name="campus_stp"
                fill={TREATMENT_COLORS.campus_stp}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2">
            {Object.entries(TREATMENT_LABELS).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5 text-[11px] text-gray-300">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: TREATMENT_COLORS[key] }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 italic">
        Buildings using Campus STP emit ~88% less wastewater carbon than unmanaged septic systems.
      </p>
    </div>
  );
}
