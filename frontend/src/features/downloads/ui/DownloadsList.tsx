import type { DownloadJob } from '../downloads.types';
import { useDownloads } from '../queries/useDownloads';

const CONTAINER_STYLE: React.CSSProperties = {
  background: 'var(--paper-surface)',
  border: '1px solid var(--paper-border)',
  boxShadow: '3px 3px 0 var(--paper-border-bold)',
  padding: '24px',
};

const HEADING_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontSize: '16px',
  margin: '0 0 16px',
};

const percent = (job: DownloadJob): number =>
  job.total_bytes > 0 ? Math.min(100, Math.round((job.bytes_downloaded / job.total_bytes) * 100)) : 0;

const STATUS_COLOR: Record<DownloadJob['status'], string> = {
  queued: 'var(--paper-muted)',
  downloading: 'var(--paper-muted)',
  completed: 'var(--paper-safe)',
  failed: 'var(--paper-danger)',
};

const DownloadRow = ({ job }: { job: DownloadJob }) => (
  <div style={{ marginBottom: '14px', fontFamily: 'var(--font-ui)', fontSize: '13px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{job.name || job.url}</span>
      <span style={{ color: STATUS_COLOR[job.status], fontFamily: 'var(--font-data)', fontSize: '11px' }}>
        {job.status === 'downloading' && job.total_bytes > 0 ? `${percent(job)}%` : job.status}
      </span>
    </div>
    {(job.status === 'downloading' || job.status === 'queued') && (
      <div
        role="progressbar"
        aria-valuenow={percent(job)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: '6px', background: 'var(--paper-border)', borderRadius: '3px', marginTop: '5px', overflow: 'hidden' }}
      >
        <div style={{ height: '6px', width: `${percent(job)}%`, background: 'var(--paper-safe)', borderRadius: '3px' }} />
      </div>
    )}
    {job.status === 'failed' && job.error && (
      <div style={{ color: 'var(--paper-danger)', fontSize: '12px', marginTop: '4px' }}>{job.error}</div>
    )}
  </div>
);

export const DownloadsList = () => {
  const { data, isLoading, isError } = useDownloads();

  return (
    <div style={CONTAINER_STYLE}>
      <h2 style={HEADING_STYLE}>Downloads</h2>
      {isLoading && <div style={{ color: 'var(--paper-muted)', fontSize: '13px' }}>Loading…</div>}
      {isError && <div style={{ color: 'var(--paper-danger)', fontSize: '13px' }}>Couldn&apos;t load downloads.</div>}
      {data?.length === 0 && <div style={{ color: 'var(--paper-dim)', fontSize: '13px' }}>No downloads yet.</div>}
      {data?.map(job => <DownloadRow key={job.id} job={job} />)}
    </div>
  );
};
