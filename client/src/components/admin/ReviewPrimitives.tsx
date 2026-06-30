import { ReactNode, useState } from 'react';

// Single labelled key-value row.
// Shows "not entered" in gray when value is absent.
// highlight=true adds a blue tint for carbon-critical fields.
export const DataField = ({
  label,
  value,
  unit,
  source,
  highlight = false,
}: {
  label: string;
  value?: string | number | boolean | null;
  unit?: string;
  source?: 'measured' | 'estimated' | 'calculated';
  highlight?: boolean;
}) => {
  const isEmpty = value === undefined || value === null || value === '';

  const display = isEmpty
    ? null
    : typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : typeof value === 'number'
        ? value.toLocaleString('en-IN', { maximumFractionDigits: 3 })
        : String(value);

  const sourcePill = source && !isEmpty && (
    <span
      className={`ml-2 px-1.5 py-0.5 rounded text-xs font-normal ${
        source === 'measured'
          ? 'bg-green-100 text-green-700'
          : source === 'estimated'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-gray-100 text-gray-500'
      }`}
    >
      {source}
    </span>
  );

  return (
    <div
      className={`flex items-center justify-between py-2.5 border-b border-gray-50
                     ${highlight && !isEmpty ? 'bg-blue-50/60 -mx-4 px-4 rounded' : ''}`}
    >
      <span className="text-sm text-gray-500 mr-4 flex-shrink-0">{label}</span>
      {isEmpty ? (
        <span className="text-xs text-gray-300 italic">not entered</span>
      ) : (
        <div className="flex items-center text-sm font-medium text-gray-900 text-right">
          {display}
          {unit && <span className="text-gray-400 ml-1 font-normal text-xs">{unit}</span>}
          {sourcePill}
        </div>
      )}
    </div>
  );
};

// Groups related DataFields under a heading.
// collapsible=true lets the admin fold away sub-sections.
export const DataSection = ({
  title,
  children,
  count,
  collapsible = false,
}: {
  title: string;
  children: ReactNode;
  count?: number;
  collapsible?: boolean;
}) => {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-6">
      <button
        className="flex items-center gap-2 mb-2.5 w-full text-left"
        onClick={() => collapsible && setOpen((o) => !o)}
        type="button"
      >
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {count !== undefined && (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            {count} record{count !== 1 ? 's' : ''}
          </span>
        )}
        {collapsible && <span className="ml-auto text-gray-400 text-xs">{open ? '▲' : '▼'}</span>}
      </button>
      {(!collapsible || open) && <div>{children}</div>}
    </div>
  );
};

// Container for one item in an array (a transformer, DG set, landfill site, etc.)
export const RecordCard = ({
  title,
  subtitle,
  children,
  sourceBadge,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  sourceBadge?: 'measured' | 'estimated';
}) => (
  <div className="border border-gray-100 rounded-xl p-4 mb-3 bg-white">
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
      </div>
      {sourceBadge && (
        <span
          className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
            sourceBadge === 'measured'
              ? 'bg-green-100 text-green-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          {sourceBadge}
        </span>
      )}
    </div>
    {children}
  </div>
);

// 12-month parameter grid used for quality matrices.
// Cells turn red when value exceeds the optional limitValue.
export const MonthlyMatrix = ({
  label,
  unit,
  monthlyValues,
  limitValue,
}: {
  label: string;
  unit?: string;
  monthlyValues: Record<string, string | number | undefined>;
  limitValue?: number;
}) => {
  const MONTHS = [
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
  const KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {unit && <span className="text-xs text-gray-400">({unit})</span>}
        {limitValue !== undefined && (
          <span className="text-xs text-gray-400">limit ≤{limitValue}</span>
        )}
      </div>
      <div className="grid grid-cols-12 gap-0.5">
        {MONTHS.map((m, i) => {
          const raw = monthlyValues[KEYS[i]];
          const num = raw !== undefined ? parseFloat(String(raw)) : NaN;
          const exceeded = limitValue !== undefined && !isNaN(num) && num > limitValue;
          return (
            <div key={m} className={`text-center ${exceeded ? 'bg-red-50 rounded' : ''}`}>
              <div className="text-xs text-gray-400">{m}</div>
              <div
                className={`text-xs font-medium mt-0.5 ${
                  exceeded
                    ? 'text-red-600'
                    : raw !== undefined && raw !== ''
                      ? 'text-gray-900'
                      : 'text-gray-300'
                }`}
              >
                {raw !== undefined && raw !== '' ? String(raw) : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Shown when an array section has no records.
export const EmptyState = ({ message }: { message: string }) => (
  <div className="text-sm text-gray-400 py-4 text-center italic">{message}</div>
);

// Small badge marking a field as carbon-calculation input.
export const CarbonCriticalBadge = () => (
  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
    ★ Carbon input
  </span>
);
