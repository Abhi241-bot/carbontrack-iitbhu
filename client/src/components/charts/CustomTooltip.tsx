interface TooltipPayloadEntry {
  color?: string;
  name?: string;
  value?: number;
  dataKey?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  formatter?: (value: number, name: string) => string;
  unit?: string;
}

export default function CustomTooltip({
  active,
  payload,
  label,
  formatter,
  unit = 'tCO\u2082e',
}: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg shadow-md p-3 text-sm max-w-xs">
      {label && <p className="text-gray-400 text-xs mb-2 font-medium">{label}</p>}
      {payload.map((entry, i) => {
        const name = entry.name ?? entry.dataKey ?? '';
        const value = entry.value ?? 0;
        const display = formatter ? formatter(value, name) : `${value.toFixed(2)} ${unit}`;
        return (
          <div key={i} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
              style={{ background: entry.color ?? '#9CA3AF' }}
            />
            <span className="text-gray-300 flex-1">{name}</span>
            <span className="font-medium text-white">{display}</span>
          </div>
        );
      })}
    </div>
  );
}
