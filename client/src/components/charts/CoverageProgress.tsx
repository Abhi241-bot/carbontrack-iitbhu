import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface CoveragePoint {
  month: string;
  covered: number;
  total: number;
  percent: number;
}

interface Props {
  data: CoveragePoint[];
}

const MAROON = '#8B1A1A';
const FOREST = '#1a3c2e';
const CIRCUMFERENCE = 2 * Math.PI * 54;

export default function CoverageProgress({ data }: Props) {
  const latest = data[data.length - 1] ?? { percent: 0, covered: 0, total: 0 };
  const pct = Math.min(latest.percent, 100);
  const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progress ring */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: 140, height: 140 }}
      >
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="54" fill="none" stroke="#f3f4f6" strokeWidth="12" />
          <circle
            cx="70"
            cy="70"
            r="54"
            fill="none"
            stroke={MAROON}
            strokeWidth="12"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 70 70)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold text-white">{pct.toFixed(0)}%</span>
          <span className="text-[10px] text-gray-400 leading-tight">
            {latest.covered}/{latest.total}
            <br />
            buildings
          </span>
        </div>
      </div>

      {/* Trend sparkline */}
      {data.length > 2 && (
        <div className="w-full">
          <p className="text-[10px] text-gray-400 text-center mb-1">Coverage growth</p>
          <ResponsiveContainer width="100%" height={64}>
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <Area
                type="monotone"
                dataKey="percent"
                stroke={FOREST}
                fill={FOREST}
                fillOpacity={0.2}
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
