import { useState } from 'react';

interface MonthData {
  month: string;
  count: number;
  cumulative: number;
}

interface Props {
  data: MonthData[];
}

function cellColor(count: number): string {
  if (count === 0) return 'bg-white/10';
  if (count <= 2) return 'bg-green-200';
  if (count <= 5) return 'bg-green-400';
  return 'bg-green-600';
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export default function SubmissionHeatmap({ data }: Props) {
  const [tooltip, setTooltip] = useState<{
    label: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  // data is last 18 months — build a 2-row heatmap (each row = 12 months of a year)
  // Determine year range from the data
  interface CellData {
    label: string;
    count: number;
    monthIdx: number;
    year: number;
  }

  const cells: CellData[] = data.map((d) => {
    const parts = d.month.split(' ');
    const mon = MONTH_ABBR.indexOf(parts[0]);
    const yr = parseInt(parts[1] ?? '0');
    return { label: d.month, count: d.count, monthIdx: mon, year: yr };
  });

  const years = [...new Set(cells.map((c) => c.year))].sort();

  return (
    <div>
      <div className="overflow-x-auto">
        {/* Month header */}
        <div className="flex gap-1 ml-8 mb-1">
          {MONTH_ABBR.map((m) => (
            <div key={m} className="w-7 text-[9px] text-gray-400 text-center flex-shrink-0">
              {m}
            </div>
          ))}
        </div>
        {/* Rows */}
        {years.map((yr) => (
          <div key={yr} className="flex items-center gap-1 mb-1">
            <span className="w-8 text-[9px] text-gray-400 text-right flex-shrink-0 pr-1">{yr}</span>
            {MONTH_ABBR.map((_, mi) => {
              const cell = cells.find((c) => c.year === yr && c.monthIdx === mi);
              const count = cell?.count ?? 0;
              const label = cell?.label ?? `${MONTH_ABBR[mi]} ${yr}`;
              return (
                <div
                  key={mi}
                  className={`w-7 h-7 rounded-sm flex-shrink-0 cursor-default transition-opacity hover:opacity-80 ${cellColor(count)}`}
                  onMouseEnter={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setTooltip({ label, count, x: rect.left, y: rect.top });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-3 text-[10px] text-gray-400">
        <span>Less</span>
        <div className="w-4 h-4 rounded-sm bg-white/10" />
        <div className="w-4 h-4 rounded-sm bg-green-200" />
        <div className="w-4 h-4 rounded-sm bg-green-400" />
        <div className="w-4 h-4 rounded-sm bg-green-600" />
        <span>More</span>
      </div>
      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded pointer-events-none"
          style={{ left: tooltip.x + 8, top: tooltip.y - 32 }}
        >
          {tooltip.label}: {tooltip.count} submission{tooltip.count !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
