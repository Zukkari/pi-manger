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

const BAR_COLORS: Record<BarState, string> = {
  safe:   'var(--paper-accent)',
  warn:   'var(--paper-warn)',
  danger: 'var(--paper-danger)',
};

export const DiskUsageBar = ({ data }: DiskUsageBarProps) => {
  const { path, total_bytes, used_bytes, free_bytes, used_percent } = data;
  const roundedPercent = Math.round(used_percent);
  const barState = getBarState(used_percent);

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--paper-border)',
      boxShadow: '3px 3px 0 var(--paper-border-bold)',
      padding: '24px',
      width: '100%',
    }}>
      {/* Hero row: percentage + path */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '88px',
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: 'var(--paper-text)',
          }}>
            {roundedPercent}%
          </div>
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: '11px',
            color: 'var(--paper-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginTop: '2px',
          }}>
            used
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--paper-muted)' }}>
            {path}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '8px', background: 'rgba(0,0,0,0.08)', marginBottom: '16px' }}>
        <div
          role="progressbar"
          aria-valuenow={roundedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-state={barState}
          style={{
            height: '100%',
            width: `${used_percent}%`,
            background: BAR_COLORS[barState],
            transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '1px',
        background: 'var(--paper-border)',
        border: '1px solid var(--paper-border)',
      }}>
        {([
          { label: 'Used',  value: formatBytes(used_bytes),  testId: 'stat-used'  },
          { label: 'Free',  value: formatBytes(free_bytes),  testId: 'stat-free'  },
          { label: 'Total', value: formatBytes(total_bytes), testId: 'stat-total' },
        ] as const).map(({ label, value, testId }) => (
          <div key={label} style={{ background: 'var(--paper-surface)', padding: '12px' }}>
            <div style={{
              fontFamily: 'var(--font-data)',
              fontSize: '8px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--paper-muted)',
              marginBottom: '3px',
            }}>
              {label}
            </div>
            <div
              data-testid={testId}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--paper-text)',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
