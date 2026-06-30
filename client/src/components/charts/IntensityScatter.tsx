import { useNavigate } from 'react-router-dom';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { BUILDING_TYPE_COLORS } from '@/constants/chartColors';
import NoDataOverlay from './NoDataOverlay';

interface ScatterPoint {
  id: string;
  name: string;
  type: string;
  totalArea: number;
  totalCarbon: number;
  intensityPerSqm: number;
  operationalCarbon: number;
  embodiedCarbon: number;
}

interface Props {
  data: ScatterPoint[];
  selectedIds?: string[];
  campusAvgIntensity?: number;
}

function ScatterTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ScatterPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-sm"
      style={{ zIndex: 40 }}
    >
      <p className="font-semibold text-gray-900 mb-1">{d.name}</p>
      <p className="text-gray-600 text-xs capitalize">{d.type}</p>
      <p className="text-gray-600 text-xs mt-1">Area: {d.totalArea.toLocaleString()} m²</p>
      <p className="text-gray-600 text-xs">Total carbon: {d.totalCarbon.toFixed(2)} tCO₂e</p>
      <p className="text-gray-600 text-xs font-medium">
        Intensity: {d.intensityPerSqm.toFixed(4)} tCO₂e/m²
      </p>
    </div>
  );
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: ScatterPoint;
  selectedIds?: string[];
}

function CustomDot({ cx = 0, cy = 0, payload, selectedIds = [] }: DotProps) {
  if (!payload) return null;
  const color = BUILDING_TYPE_COLORS[payload.type] ?? '#9CA3AF';
  const isSelected = selectedIds.includes(payload.id);
  // Size represents total carbon — sqrt scaling for perceptual correctness
  const r = Math.min(6 + Math.sqrt(payload.totalCarbon) * 1.2, 24);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isSelected ? r + 3 : r}
      fill={color}
      fillOpacity={isSelected ? 1 : 0.7}
      stroke={isSelected ? '#fff' : color}
      strokeWidth={isSelected ? 2 : 1}
      strokeOpacity={0.4}
    />
  );
}

export default function IntensityScatter({ data, selectedIds = [], campusAvgIntensity }: Props) {
  const navigate = useNavigate();

  if (!data.length) return <NoDataOverlay />;

  const avgIntensity =
    campusAvgIntensity !== undefined
      ? campusAvgIntensity
      : data.reduce((s, d) => s + d.intensityPerSqm, 0) / data.length;

  const aboveAvgCount = data.filter((d) => d.intensityPerSqm > avgIntensity).length;

  return (
    <div>
      {avgIntensity > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          <span className="font-semibold text-[#8B1A1A]">
            {aboveAvgCount} building{aboveAvgCount !== 1 ? 's' : ''}
          </span>{' '}
          above campus average intensity ({avgIntensity.toFixed(4)} tCO₂e/m²). Bubble size = total
          carbon. Click any bubble to view building detail.
        </p>
      )}
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 28, left: 8 }}>
          <XAxis
            dataKey="totalArea"
            type="number"
            name="Floor area"
            label={{
              value: 'Floor area (m²)',
              position: 'insideBottom',
              offset: -14,
              fontSize: 11,
              fill: '#6B7280',
            }}
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <YAxis
            dataKey="intensityPerSqm"
            type="number"
            name="Carbon intensity"
            label={{
              value: 'Intensity (tCO₂e/m²)',
              angle: -90,
              position: 'insideLeft',
              offset: 12,
              fontSize: 11,
              fill: '#6B7280',
            }}
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            tickFormatter={(v: number) => v.toFixed(3)}
          />
          <Tooltip content={<ScatterTooltipContent />} />
          {avgIntensity > 0 && (
            <ReferenceLine
              y={avgIntensity}
              stroke="#8B1A1A"
              strokeDasharray="5 3"
              label={{ value: 'Campus avg', position: 'right', fontSize: 10, fill: '#8B1A1A' }}
            />
          )}
          <Scatter
            data={data}
            shape={(props: DotProps) => <CustomDot {...props} selectedIds={selectedIds} />}
            onClick={(d: ScatterPoint) => navigate(`/buildings/${d.id}`)}
            style={{ cursor: 'pointer' }}
          />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-3 mt-1">
        {Object.entries(BUILDING_TYPE_COLORS).map(([type, color]) => {
          const hasData = data.some((d) => d.type === type);
          if (!hasData) return null;
          return (
            <span key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: color }}
              />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
