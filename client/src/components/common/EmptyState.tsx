import { LucideIcon } from 'lucide-react';
import Button from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ title, description, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
          <Icon className="h-7 w-7 text-gray-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-white">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      {action && (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
