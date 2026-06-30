import { useState } from 'react';

interface BuildingTypeData {
  type: string;
  embodiedCarbon: number;
  operationalCarbon: number;
  totalCarbon: number;
}

interface Props {
  data: BuildingTypeData[];
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const MAROON = '#8B1A1A';
const FOREST = '#1a3c2e';

export default function EmbodiedOperationalSplit({ data }: Props) {
  const [hoveredType, setHoveredType] = useState<string | null>(null);

  const sorted = [...data]
    .filter((d) => d.totalCarbon > 0)
    .sort((a, b) => b.totalCarbon - a.totalCarbon);

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-gray-400">
        No carbon data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((d) => {
        const embodiedPct = d.totalCarbon > 0 ? (d.embodiedCarbon / d.totalCarbon) * 100 : 50;
        const opPct = 100 - embodiedPct;
        const isHovered = hoveredType === d.type;

        return (
          <div
            key={d.type}
            className="flex items-center gap-3"
            onMouseEnter={() => setHoveredType(d.type)}
            onMouseLeave={() => setHoveredType(null)}
          >
            <span className="w-24 text-xs text-gray-600 truncate flex-shrink-0">
              {capitalize(d.type)}
            </span>
            <div className="flex-1 flex h-8 rounded overflow-hidden relative cursor-default">
              <div
                className="flex items-center justify-center text-white transition-all"
                style={{ width: `${embodiedPct}%`, background: MAROON, minWidth: 4 }}
              >
                {embodiedPct > 15 && (
                  <span className="text-[10px] font-medium">{embodiedPct.toFixed(0)}%</span>
                )}
              </div>
              <div
                className="flex items-center justify-center text-white transition-all"
                style={{ width: `${opPct}%`, background: FOREST, minWidth: 4 }}
              >
                {opPct > 15 && <span className="text-[10px] font-medium">{opPct.toFixed(0)}%</span>}
              </div>
              {isHovered && (
                <div className="absolute inset-0 bg-black/5 flex items-center justify-center">
                  <div className="bg-white border border-gray-200 rounded shadow-md px-2 py-1 text-[10px] text-gray-700 whitespace-nowrap">
                    E: {d.embodiedCarbon.toFixed(1)} | O: {d.operationalCarbon.toFixed(1)} tCO₂e
                  </div>
                </div>
              )}
            </div>
            <span className="w-16 text-xs text-gray-500 text-right flex-shrink-0">
              {d.totalCarbon.toFixed(1)} t
            </span>
          </div>
        );
      })}
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: MAROON }} />
          Embodied
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FOREST }} />
          Operational
        </span>
      </div>
    </div>
  );
}
