interface ProgressBarProps {
  value: number;
  color?: 'brand' | 'green' | 'amber' | 'red';
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const colorClasses: Record<NonNullable<ProgressBarProps['color']>, string> = {
  brand: 'bg-iitbhu',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

const heightClasses: Record<NonNullable<ProgressBarProps['size']>, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
};

export default function ProgressBar({
  value,
  color = 'brand',
  showLabel = false,
  size = 'md',
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-end mb-1">
          <span className="text-xs text-gray-600">{clamped}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full ${heightClasses[size]}`}>
        <div
          className={`${colorClasses[color]} ${heightClasses[size]} rounded-full transition-all duration-500`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
