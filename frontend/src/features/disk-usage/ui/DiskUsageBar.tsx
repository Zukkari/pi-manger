import { GlassCard } from '@/shared/ui/GlassCard';

import type { DiskUsageBarProps } from './DiskUsageBar.types';

const formatBytes = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
};

type BarState = 'safe' | 'warn' | 'danger';

const getBarState = (percent: number): BarState => {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warn';
  return 'safe';
};

const BAR_FILLS: Record<BarState, string> = {
  safe:   'linear-gradient(90deg, var(--accent), var(--accent-2))',
  warn:   'var(--warn)',
  danger: 'var(--danger)',
};

export const DiskUsageBar = ({ data }: DiskUsageBarProps) => {
  const { path, total_bytes, used_bytes, free_bytes, used_percent } = data;
  const roundedPercent = Math.round(used_percent);
  const barState = getBarState(used_percent);

  return (
    <GlassCard className="p-6 w-full">
      {/* Hero row: percentage + path */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="font-data text-7xl leading-none tracking-tight text-ink">
            {roundedPercent}%
          </div>
          <div className="font-data text-[11px] uppercase tracking-widest text-muted mt-1">
            used
          </div>
        </div>
        <div className="font-data text-[11px] text-muted text-right">{path}</div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full mb-4 overflow-hidden" style={{ background: 'var(--track)' }}>
        <div
          role="progressbar"
          aria-valuenow={roundedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-state={barState}
          className="h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{ width: `${used_percent}%`, background: BAR_FILLS[barState] }}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { label: 'Used',  value: formatBytes(used_bytes),  testId: 'stat-used'  },
          { label: 'Free',  value: formatBytes(free_bytes),  testId: 'stat-free'  },
          { label: 'Total', value: formatBytes(total_bytes), testId: 'stat-total' },
        ] as const).map(({ label, value, testId }) => (
          <div key={label} className="rounded-xl border border-glass bg-surface-hi p-3">
            <div className="font-data text-[8px] uppercase tracking-widest text-muted mb-1">
              {label}
            </div>
            <div data-testid={testId} className="font-data text-sm font-medium text-ink">
              {value}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
