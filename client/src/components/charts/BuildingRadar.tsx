import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { RADAR_PALETTE } from '@/constants/chartColors';

interface BuildingData {
  id: string;
  name: string;
  embodiedCarbon: number;
  operationalCarbon: number;
  scope1: number;
  scope2: number;
  scope3: number;
  intensityPerSqm: number;
}

interface CampusAverages {
  embodiedCarbon: number;
  operationalCarbon: number;
  scope1: number;
  scope2: number;
  scope3: number;
  intensityPerSqm: number;
}

interface Props {
  buildings: BuildingData[];
  campusAverages: CampusAverages;
}

const METRICS = [
  { key: 'embodiedCarbon', label: 'Embodied' },
  { key: 'operationalCarbon', label: 'Operational' },
  { key: 'scope1', label: 'Scope 1' },
  { key: 'scope2', label: 'Scope 2' },
  { key: 'scope3', label: 'Scope 3' },
  { key: 'intensityPerSqm', label: 'Intensity/sqm' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

function normalize(buildings: BuildingData[], averages: CampusAverages) {
  const maxes: Record<MetricKey, number> = {
    embodiedCarbon: 0,
    operationalCarbon: 0,
    scope1: 0,
    scope2: 0,
    scope3: 0,
    intensityPerSqm: 0,
  };

  for (const b of [...buildings, averages]) {
    for (const m of METRICS) {
      const val = b[m.key] ?? 0;
      if (val > maxes[m.key]) maxes[m.key] = val;
    }
  }

  function normalizeRow(row: Record<string, number>) {
    return Object.fromEntries(
      METRICS.map((m) => {
        const max = maxes[m.key];
        const val = (row[m.key] ?? 0) as number;
        return [m.label, max > 0 ? parseFloat(((val / max) * 100).toFixed(1)) : 0];
      })
    );
  }

  const buildingRows = buildings.map((b) => ({
    ...normalizeRow(b as unknown as Record<string, number>),
    _id: b.id,
    _name: b.name,
  }));

  const avgRow = {
    ...normalizeRow(averages as unknown as Record<string, number>),
    _id: 'campus-avg',
    _name: 'Campus Average',
  };

  return { buildingRows, avgRow };
}

export default function BuildingRadar({ buildings, campusAverages }: Props) {
  if (buildings.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400 text-center px-4">
        Add at least one more building to compare
      </div>
    );
  }

  const { buildingRows, avgRow } = normalize(buildings, campusAverages);

  const radarData = METRICS.map((m) => {
    const row: Record<string, string | number> = { metric: m.label };
    for (const b of buildingRows) {
      row[b._name as string] = (b[m.label] ?? 0) as number;
    }
    row['Campus Average'] = avgRow[m.label] ?? 0;
    return row;
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={380}>
        <RadarChart data={radarData} margin={{ top: 16, right: 32, bottom: 16, left: 32 }}>
          <PolarGrid stroke="#f0f0f0" />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#374151' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickCount={5} />
          {buildingRows.map((b, i) => (
            <Radar
              key={b._id as string}
              name={b._name as string}
              dataKey={b._name as string}
              stroke={RADAR_PALETTE[i % RADAR_PALETTE.length]}
              fill={RADAR_PALETTE[i % RADAR_PALETTE.length]}
              fillOpacity={0.1}
              strokeWidth={2}
            />
          ))}
          <Radar
            name="Campus Average"
            dataKey="Campus Average"
            stroke="#9CA3AF"
            fill="transparent"
            strokeDasharray="5 3"
            strokeWidth={1.5}
          />
          <Tooltip formatter={(value: number) => [`${value.toFixed(1)} (normalised)`, '']} />
          <Legend
            formatter={(value: string) => (value.length > 20 ? value.slice(0, 20) + '…' : value)}
            wrapperStyle={{ fontSize: 11 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
