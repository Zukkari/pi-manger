import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';

import { useDiskUsage } from '../queries/useDiskUsage';

import { DiskUsageBar } from './DiskUsageBar';

const DiskUsageSkeleton = () => (
  <GlassCard role="status" aria-label="Loading disk usage" className="p-6">
    {/* Percentage placeholder */}
    <div className="flex justify-between mb-5">
      <div>
        <div className="skeleton w-[120px] h-[72px] mb-2" />
        <div className="skeleton w-10 h-2.5" />
      </div>
      <div className="skeleton w-20 h-3.5" />
    </div>
    {/* Bar placeholder */}
    <div className="skeleton h-2 mb-4" />
    {/* Stats placeholder */}
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-xl border border-glass bg-surface-hi p-3">
          <div className="skeleton w-8 h-2 mb-1.5" />
          <div className="skeleton w-14 h-3.5" />
        </div>
      ))}
    </div>
  </GlassCard>
);

export const DiskUsageWidget = () => {
  const { data, isLoading, isError, refetch } = useDiskUsage();

  if (isLoading) return <DiskUsageSkeleton />;

  if (isError || !data) {
    return (
      <WidgetError
        message="Failed to load disk usage. Is the API running?"
        onRetry={() => refetch()}
      />
    );
  }

  return <DiskUsageBar data={data} />;
};
