interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'white' | 'brand' | 'gray';
}

const sizeClasses: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-10 h-10',
};

const colorClasses: Record<NonNullable<SpinnerProps['color']>, string> = {
  white: 'border-white border-t-transparent',
  brand: 'border-iitbhu border-t-transparent',
  gray: 'border-gray-400 border-t-transparent',
};

export default function Spinner({ size = 'md', color = 'brand' }: SpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full border-2 ${sizeClasses[size]} ${colorClasses[color]}`}
      role="status"
      aria-label="Loading"
    />
  );
}
