import { formatBytes } from '@/shared/lib/formatBytes';
import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';

import { useFileTypes } from '../queries/useFileTypes';

const CATEGORY_COLORS: Record<string, string> = {
  video: 'var(--accent)',
  audio: 'var(--accent-2)',
  image: 'var(--warn)',
  archive: 'var(--safe)',
  document: 'var(--danger)',
  other: 'var(--muted)',
};

const categoryColor = (category: string): string => CATEGORY_COLORS[category] ?? 'var(--muted)';

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const FileTypesSkeleton = () => (
  <GlassCard role="status" aria-label="Loading file types" className="p-6">
    <div className="skeleton w-24 h-3 mb-4" />
    <div className="skeleton h-3.5 rounded-full mb-4" />
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="skeleton h-4 w-2/3" />
      ))}
    </div>
  </GlassCard>
);

export const FileTypesWidget = () => {
  const { data, isLoading, isError, refetch } = useFileTypes();

  if (isLoading) return <FileTypesSkeleton />;
  if (isError || !data) {
    return <WidgetError message="Failed to load file types. Is the API running?" onRetry={() => refetch()} />;
  }

  return (
    <GlassCard className="p-6">
      <h2 className="font-ui text-sm font-semibold tracking-wide text-ink m-0 mb-4">By file type</h2>

      {data.total_bytes === 0 ? (
        <div className="font-ui text-[13px] text-muted py-4 text-center">No files yet.</div>
      ) : (
        <>
          <div data-testid="file-types-bar" className="flex h-3.5 rounded-full overflow-hidden mb-4">
            {data.categories.map(cat => (
              <div
                key={cat.category}
                style={{
                  width: `${(cat.total_bytes / data.total_bytes) * 100}%`,
                  background: categoryColor(cat.category),
                }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {data.categories.map(cat => (
              <div key={cat.category} className="flex items-center gap-2">
                <span aria-hidden className="w-3 h-3 rounded shrink-0" style={{ background: categoryColor(cat.category) }} />
                <span className="font-ui text-[13px] font-medium text-ink">{capitalize(cat.category)}</span>
                <span className="font-data text-[11px] text-dim flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {cat.extensions.map(e => e.extension).join(', ')}
                </span>
                <span className="font-data text-xs text-muted shrink-0">{formatBytes(cat.total_bytes)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
};
