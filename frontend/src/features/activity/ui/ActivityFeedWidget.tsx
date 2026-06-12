import { FilePlus2, FileX2, TrendingDown, TrendingUp } from 'lucide-react';

import { formatBytes } from '@/shared/lib/formatBytes';
import { formatRelativeTime } from '@/shared/lib/formatRelativeTime';
import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';

import type { ChangeType, FileChange } from '../activity.types';
import { useChanges } from '../queries/useChanges';

const TYPE_STYLE: Record<ChangeType, { icon: typeof FilePlus2; className: string }> = {
  added:   { icon: FilePlus2,    className: 'text-safe' },
  removed: { icon: FileX2,       className: 'text-danger' },
  grown:   { icon: TrendingUp,   className: 'text-warn' },
  shrunk:  { icon: TrendingDown, className: 'text-muted' },
};

const FALLBACK_STYLE = { icon: FilePlus2, className: 'text-muted' };

const ActivitySkeleton = () => (
  <GlassCard role="status" aria-label="Loading recent changes" className="p-6">
    <div className="skeleton w-32 h-3 mb-4" />
    {[0, 1, 2].map(i => (
      <div key={i} className="skeleton h-4 mb-2.5" />
    ))}
  </GlassCard>
);

const ChangeRow = ({ change }: { change: FileChange }) => {
  const { icon: Icon, className } = TYPE_STYLE[change.change_type] ?? FALLBACK_STYLE;
  return (
    <div data-change-type={change.change_type} className="flex items-center gap-2.5 py-2 min-h-11">
      <Icon size={14} className={`${className} shrink-0`} aria-hidden />
      <span className="font-data text-xs text-ink flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={change.path}>
        {change.path}
      </span>
      <span className="font-data text-[11px] text-muted shrink-0">{formatBytes(Math.abs(change.bytes_delta))}</span>
      <span className="font-data text-[10px] text-dim shrink-0 w-14 text-right">{formatRelativeTime(change.detected_at)}</span>
    </div>
  );
};

export const ActivityFeedWidget = () => {
  const { data, isLoading, isError, refetch } = useChanges();

  if (isLoading) return <ActivitySkeleton />;
  if (isError || !data) {
    return <WidgetError message="Failed to load recent changes. Is the API running?" onRetry={() => refetch()} />;
  }

  return (
    <GlassCard className="p-6">
      <h2 className="font-ui text-sm font-semibold tracking-wide text-ink m-0 mb-2">Recent changes</h2>
      {data.length === 0 ? (
        <div className="font-ui text-[13px] text-muted py-4 text-center">No recent changes.</div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--glass-border)]">
          {data.map(change => (
            <ChangeRow key={change.id} change={change} />
          ))}
        </div>
      )}
    </GlassCard>
  );
};
