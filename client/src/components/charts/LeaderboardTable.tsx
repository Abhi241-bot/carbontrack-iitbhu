import { useState } from 'react';

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
  selectedIds?: string[];
}

type SortKey = 'rank' | 'embodiedCarbon' | 'operationalCarbon' | 'intensityPerSqm' | 'totalCarbon';

const MEDAL_COLORS = ['#D97706', '#9CA3AF', '#B45309'];

const TYPE_BADGE: Record<string, string> = {
  academic: 'bg-teal-100 text-teal-700',
  hostel: 'bg-green-100 text-green-700',
  lab: 'bg-violet-100 text-violet-700',
  administrative: 'bg-white/10 text-gray-200',
  residential: 'bg-purple-100 text-purple-700',
  commercial: 'bg-amber-100 text-amber-700',
  infrastructure: 'bg-slate-100 text-slate-700',
};

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-400">{score.toFixed(0)}%</span>
    </div>
  );
}

export default function LeaderboardTable({ data, onBuildingClick, selectedIds = [] }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function sortArrow(key: SortKey) {
    if (key !== sortKey) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortKey as keyof LeaderboardEntry] as number;
    const bVal = b[sortKey as keyof LeaderboardEntry] as number;
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 text-xs text-gray-400 uppercase tracking-wide">
            <th
              className="pb-2 text-left cursor-pointer hover:text-gray-200 select-none w-10 pl-2"
              onClick={() => handleSort('rank')}
            >
              #{sortArrow('rank')}
            </th>
            <th className="pb-2 text-left">Building</th>
            <th className="pb-2 text-left hidden sm:table-cell">Type</th>
            <th
              className="pb-2 text-right hidden md:table-cell cursor-pointer hover:text-gray-200 select-none"
              onClick={() => handleSort('embodiedCarbon')}
            >
              Embodied{sortArrow('embodiedCarbon')}
            </th>
            <th
              className="pb-2 text-right hidden md:table-cell cursor-pointer hover:text-gray-200 select-none"
              onClick={() => handleSort('operationalCarbon')}
            >
              Operational{sortArrow('operationalCarbon')}
            </th>
            <th
              className="pb-2 text-right cursor-pointer hover:text-gray-200 select-none"
              onClick={() => handleSort('totalCarbon')}
            >
              Total{sortArrow('totalCarbon')}
            </th>
            <th
              className="pb-2 text-right cursor-pointer hover:text-gray-200 select-none hidden sm:table-cell"
              onClick={() => handleSort('intensityPerSqm')}
            >
              Intensity{sortArrow('intensityPerSqm')}
            </th>
            <th className="pb-2 text-left pl-3 hidden lg:table-cell">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => {
            const isSelected = selectedIds.includes(b.buildingId);
            return (
              <tr
                key={b.buildingId}
                onClick={() => onBuildingClick(b.buildingId)}
                className={`border-b border-gray-50 cursor-pointer hover:bg-white/5 transition-colors ${
                  isSelected ? 'border-l-2' : ''
                }`}
                style={isSelected ? { borderLeftColor: '#8B1A1A' } : undefined}
              >
                <td className="py-2.5 pl-2 font-medium text-center">
                  {b.rank <= 3 ? (
                    <span
                      className="inline-flex items-center justify-center h-6 w-6 rounded-full text-white text-xs font-bold"
                      style={{ background: MEDAL_COLORS[b.rank - 1] }}
                    >
                      {b.rank}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">{b.rank}</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 font-medium text-white max-w-[160px] truncate">
                  {b.name}
                </td>
                <td className="py-2.5 hidden sm:table-cell">
                  <span
                    className={`capitalize text-xs px-2 py-0.5 rounded-full ${
                      TYPE_BADGE[b.type] ?? 'bg-white/10 text-gray-300'
                    }`}
                  >
                    {b.type}
                  </span>
                </td>
                <td className="py-2.5 text-right text-gray-200 hidden md:table-cell pr-3">
                  {b.embodiedCarbon.toFixed(1)}
                </td>
                <td className="py-2.5 text-right text-gray-200 hidden md:table-cell pr-3">
                  {b.operationalCarbon.toFixed(1)}
                </td>
                <td className="py-2.5 text-right font-medium text-white pr-3">
                  {b.totalCarbon.toFixed(1)}
                </td>
                <td className="py-2.5 text-right text-gray-300 hidden sm:table-cell pr-3">
                  {b.intensityPerSqm > 0 ? b.intensityPerSqm.toFixed(4) : '—'}
                </td>
                <td className="py-2.5 pl-3 hidden lg:table-cell">
                  <ConfidenceBar score={b.confidenceScore} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
