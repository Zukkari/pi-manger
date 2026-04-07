import { useDiskUsage } from '../queries/useDiskUsage';

import { DiskUsageBar } from './DiskUsageBar';

const DiskUsageSkeleton = () => (
  <div
    role="status"
    aria-label="Loading disk usage"
    style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--paper-border)',
      boxShadow: '3px 3px 0 var(--paper-border-bold)',
      padding: '24px',
    }}
  >
    {/* Percentage placeholder */}
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
      <div>
        <div className="paper-skeleton" style={{ width: '120px', height: '72px', marginBottom: '8px' }} />
        <div className="paper-skeleton" style={{ width: '40px', height: '10px' }} />
      </div>
      <div className="paper-skeleton" style={{ width: '80px', height: '14px' }} />
    </div>
    {/* Bar placeholder */}
    <div className="paper-skeleton" style={{ height: '8px', marginBottom: '16px' }} />
    {/* Stats placeholder */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'var(--paper-border)' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: 'var(--paper-surface)', padding: '12px' }}>
          <div className="paper-skeleton" style={{ width: '30px', height: '8px', marginBottom: '6px' }} />
          <div className="paper-skeleton" style={{ width: '60px', height: '14px' }} />
        </div>
      ))}
    </div>
  </div>
);

export const DiskUsageWidget = () => {
  const { data, isLoading, isError } = useDiskUsage();

  if (isLoading) return <DiskUsageSkeleton />;

  if (isError || !data) {
    return (
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--paper-border)',
        boxShadow: '3px 3px 0 var(--paper-border-bold)',
        padding: '24px',
        fontFamily: 'var(--font-ui)',
        fontSize: '13px',
        color: 'var(--paper-danger)',
      }}>
        Failed to load disk usage. Is the API running?
      </div>
    );
  }

  return <DiskUsageBar data={data} />;
};
