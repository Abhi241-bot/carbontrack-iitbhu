import { BuildingType } from '@shared/types/building.types';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'building-type';

interface BadgeProps {
  variant?: BadgeVariant;
  label: string;
  buildingType?: BuildingType;
  className?: string;
}

const variantClasses: Record<Exclude<BadgeVariant, 'building-type'>, string> = {
  default: 'bg-white/10 text-gray-200',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

const buildingTypeClasses: Record<BuildingType, string> = {
  [BuildingType.ACADEMIC]: 'bg-blue-100 text-blue-700',
  [BuildingType.HOSTEL]: 'bg-green-100 text-green-700',
  [BuildingType.LAB]: 'bg-orange-100 text-orange-700',
  [BuildingType.ADMINISTRATIVE]: 'bg-white/10 text-gray-200',
  [BuildingType.RESIDENTIAL]: 'bg-purple-100 text-purple-700',
  [BuildingType.COMMERCIAL]: 'bg-yellow-100 text-yellow-700',
  [BuildingType.INFRASTRUCTURE]: 'bg-slate-100 text-slate-700',
};

export default function Badge({ variant = 'default', label, buildingType, className = '' }: BadgeProps) {
  const classes =
    variant === 'building-type' && buildingType
      ? buildingTypeClasses[buildingType]
      : variantClasses[variant as Exclude<BadgeVariant, 'building-type'>];

  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${classes} ${className}`}>
      {label}
    </span>
  );
}
