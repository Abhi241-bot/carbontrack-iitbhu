interface LeaderboardEntry {
  rank: number;
  buildingId: string;
  name: string;
  type: string;
  totalCarbon: number;
  embodiedCarbon: number;
  operationalCarbon: number;
  intensityPerSqm: number;
  confidenceScore: number;
  submissionStatus: string;
}

interface Props {
  data: LeaderboardEntry[];
  onBuildingClick: (id: string) => void;
}

const MEDAL_COLORS = ['#D97706', '#9CA3AF', '#B45309'];

const TYPE_BADGE: Record<string, string> = {
  academic: 'bg-teal-100 text-teal-700',
  hostel: 'bg-green-100 text-green-700',
  lab: 'bg-violet-100 text-violet-700',
  administrative: 'bg-gray-100 text-gray-700',
  residential: 'bg-purple-100 text-purple-700',
  commercial: 'bg-amber-100 text-amber-700',
  infrastructure: 'bg-slate-100 text-slate-700',
};

function RankBadge({ rank, type }: { rank: number; type: 'emitter' | 'efficient' }) {
  const color =
    rank <= 3
      ? type === 'emitter'
        ? ['#DC2626', '#F87171', '#FCA5A5'][rank - 1]
        : MEDAL_COLORS[rank - 1]
      : undefined;

  if (color) {
    return (
      <span
        className="inline-flex items-center justify-center h-6 w-6 rounded-full text-white text-xs font-bold flex-shrink-0"
        style={{ background: color }}
      >
        {rank}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center h-6 w-6 text-gray-400 text-xs flex-shrink-0">
      {rank}
    </span>
  );
}

function BuildingRow({
  entry,
  rank,
  type,
  metric,
  metricLabel,
  onBuildingClick,
}: {
  entry: LeaderboardEntry;
  rank: number;
  type: 'emitter' | 'efficient';
  metric: number;
  metricLabel: string;
  onBuildingClick: (id: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={() => onBuildingClick(entry.buildingId)}
    >
      <RankBadge rank={rank} type={type} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{entry.name}</p>
        <span
          className={`inline-block capitalize text-[10px] px-1.5 py-0.5 rounded-full mt-0.5 ${
            TYPE_BADGE[entry.type] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {entry.type}
        </span>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-gray-900">{metric.toFixed(metric < 1 ? 4 : 1)}</p>
        <p className="text-[10px] text-gray-400">{metricLabel}</p>
      </div>
    </div>
  );
}

export default function DualLeaderboard({ data, onBuildingClick }: Props) {
  if (!data.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">No verified building data available.</p>
    );
  }

  const topEmitters = [...data].sort((a, b) => b.totalCarbon - a.totalCarbon).slice(0, 5);

  const mostEfficient = [...data]
    .filter((b) => b.intensityPerSqm > 0)
    .sort((a, b) => a.intensityPerSqm - b.intensityPerSqm)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Emitters */}
        <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <h3 className="text-sm font-semibold text-gray-700">Highest Total Emitters</h3>
            <span className="text-[10px] text-gray-400 ml-auto">total tCO₂e</span>
          </div>
          <div className="space-y-0.5">
            {topEmitters.map((entry, i) => (
              <BuildingRow
                key={entry.buildingId}
                entry={entry}
                rank={i + 1}
                type="emitter"
                metric={entry.totalCarbon}
                metricLabel="tCO₂e"
                onBuildingClick={onBuildingClick}
              />
            ))}
          </div>
        </div>

        {/* Most Efficient */}
        <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <h3 className="text-sm font-semibold text-gray-700">Most Carbon Efficient</h3>
            <span className="text-[10px] text-gray-400 ml-auto">tCO₂e/m²</span>
          </div>
          <div className="space-y-0.5">
            {mostEfficient.map((entry, i) => (
              <BuildingRow
                key={entry.buildingId}
                entry={entry}
                rank={i + 1}
                type="efficient"
                metric={entry.intensityPerSqm}
                metricLabel="tCO₂e/m²"
                onBuildingClick={onBuildingClick}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center italic">
        A large building can emit a lot overall but still be efficient per m² — intensity is what
        matters for benchmarking.
      </p>
    </div>
  );
}
