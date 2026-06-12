import { useState } from 'react';
import type { TreemapNode } from 'recharts';
import { ResponsiveContainer, Treemap } from 'recharts';

import { formatBytes } from '@/shared/lib/formatBytes';
import { useThemeTokens } from '@/shared/theme/useThemeTokens';
import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';

import type { UsageChild } from '../space-map.types';
import { useDirectoryUsage } from '../queries/useDirectoryUsage';

interface Crumb {
  id: number | undefined;
  name: string;
}

const TOKEN_NAMES = ['--accent', '--accent-2', '--warn', '--safe', '--danger', '--muted'] as const;

const SpaceMapSkeleton = () => (
  <GlassCard role="status" aria-label="Loading space map" className="p-6">
    <div className="skeleton w-28 h-3 mb-4" />
    <div className="skeleton h-44" />
  </GlassCard>
);

export const SpaceMapWidget = () => {
  const [stack, setStack] = useState<Crumb[]>([{ id: undefined, name: 'Root' }]);
  const current = stack[stack.length - 1];
  const { data, isLoading, isError, refetch } = useDirectoryUsage(current.id);
  const tokens = useThemeTokens(TOKEN_NAMES);

  const handleCrumb = (index: number) => {
    setStack(prev => prev.slice(0, index + 1));
  };

  const header = (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-ui text-sm font-semibold tracking-wide text-ink m-0">Space map</h2>
      <nav aria-label="Space map path" className="flex items-center gap-1 min-w-0">
        {stack.map((crumb, i) => {
          const isLast = i === stack.length - 1;
          return (
            <span key={`${crumb.id ?? 'root'}-${i}`} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span className="font-data text-[10px] text-dim">›</span>}
              {isLast ? (
                <span className="font-data text-xs font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap">
                  {crumb.name}
                </span>
              ) : (
                <button type="button" onClick={() => handleCrumb(i)} className="breadcrumb-link bg-transparent border-none p-0">
                  {crumb.name}
                </button>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );

  if (isLoading) return <SpaceMapSkeleton />;

  if (isError || !data) {
    // When drilling into a subdirectory the user needs the breadcrumb to escape
    // back to a working level rather than being stuck retrying the same path.
    if (stack.length > 1) {
      return (
        <GlassCard className="p-6">
          {header}
          <p className="font-ui text-sm text-danger m-0">Failed to load space map. Is the API running?</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 px-4 py-1.5 rounded-full border border-glass bg-surface-hi font-ui text-xs font-semibold text-ink hover:text-accent transition-colors cursor-pointer"
          >
            Retry
          </button>
        </GlassCard>
      );
    }
    return <WidgetError message="Failed to load space map. Is the API running?" onRetry={() => refetch()} />;
  }

  const palette = [
    tokens['--accent'],
    tokens['--accent-2'],
    tokens['--warn'],
    tokens['--safe'],
    tokens['--danger'],
    tokens['--muted'],
  ];

  const handleDrill = (child: UsageChild) => {
    if (!child.is_dir) return;
    setStack(prev => [...prev, { id: child.id, name: child.name }]);
  };

  const treemapData = data.children.map((c, i) => ({
    ...c,
    size: c.total_bytes,
    fill: palette[i % palette.length],
  }));

  // recharts v3 onClick on Treemap passes a TreemapNode; the original data
  // fields are spread onto it via [k: string]: unknown so we can read id/is_dir
  // from the node directly after a safe type assertion.
  const handleTreemapClick = (node: TreemapNode) => {
    const id = node['id'] as number | undefined;
    const is_dir = node['is_dir'] as boolean | undefined;
    if (typeof id === 'number' && is_dir) {
      const name = node.name ?? '';
      setStack(prev => [...prev, { id, name }]);
    }
  };

  return (
    <GlassCard className="p-6">
      {header}

      {data.children.length === 0 ? (
        <div className="font-ui text-[13px] text-muted py-8 text-center">Empty directory.</div>
      ) : (
        <>
          <div className="h-44 mb-3" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapData}
                dataKey="size"
                nameKey="name"
                stroke="transparent"
                isAnimationActive={false}
                onClick={handleTreemapClick}
              />
            </ResponsiveContainer>
          </div>

          {/* Accessible mirror of the treemap: jsdom-testable, screen-reader friendly, tap-friendly. */}
          <div data-testid="space-map-legend" className="flex flex-col">
            {data.children.map((child, i) => (
              <button
                key={child.id}
                type="button"
                disabled={!child.is_dir}
                onClick={() => handleDrill(child)}
                className={
                  'flex items-center gap-2 w-full px-1 py-2 min-h-11 bg-transparent cursor-pointer text-left disabled:cursor-default hover:bg-surface-hi transition-colors ' +
                  (i > 0 ? 'border-0 border-t border-solid border-glass' : 'border-none')
                }
              >
                <span aria-hidden className="w-3 h-3 rounded shrink-0" style={{ background: palette[i % palette.length] }} />
                <span className="font-ui text-[13px] text-ink flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {child.name}
                </span>
                <span className="font-data text-xs text-muted shrink-0">{formatBytes(child.total_bytes)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
};
