import React from 'react';
import { RotateCcw } from 'lucide-react';
import Skeleton from '@/components/common/Skeleton';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  chartKey?: string;
  dataUpdatedAt?: number;
  onRefresh?: () => void;
}

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `Updated ${hours}h ago`;
}

export default function ChartCard({
  title,
  subtitle,
  action,
  children,
  isLoading = false,
  isEmpty = false,
  dataUpdatedAt,
  onRefresh,
}: ChartCardProps) {
  return (
    <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-start justify-between px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-white/5">
        <div className="min-w-0 flex-1 pr-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white text-sm sm:text-base leading-tight truncate">
              {title}
            </h3>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="flex-shrink-0 text-gray-400 hover:text-gray-300 transition-colors"
                title="Refresh data"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{subtitle}</p>}
          {dataUpdatedAt && (
            <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(dataUpdatedAt)}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      <div className="p-3 sm:p-5">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-sm text-gray-400">No data available</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
