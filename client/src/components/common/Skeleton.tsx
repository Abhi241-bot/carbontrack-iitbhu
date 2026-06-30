interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const roundedClasses: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

export default function Skeleton({ className = '', width, height, rounded }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${rounded ? roundedClasses[rounded] : ''} ${className}`}
      style={{ width, height }}
    />
  );
}
