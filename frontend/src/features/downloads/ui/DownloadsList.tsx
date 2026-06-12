import { GlassCard } from '@/shared/ui/GlassCard';

import type { DownloadJob } from '../downloads.types';
import { useDownloads } from '../queries/useDownloads';

const percent = (job: DownloadJob): number =>
  job.total_bytes > 0 ? Math.min(100, Math.round((job.bytes_downloaded / job.total_bytes) * 100)) : 0;

const STATUS_CLASS: Record<DownloadJob['status'], string> = {
  queued: 'text-muted',
  downloading: 'text-muted',
  completed: 'text-safe',
  failed: 'text-danger',
};

const DownloadRow = ({ job }: { job: DownloadJob }) => (
  <div className="mb-3.5 font-ui text-[13px] text-ink">
    <div className="flex justify-between">
      <span className="overflow-hidden text-ellipsis whitespace-nowrap mr-3">{job.name || job.url}</span>
      {/* Show a percentage only when the server sent a Content-Length; otherwise
          fall back to the status word (the bar still renders, at 0% width). */}
      <span className={`font-data text-[11px] shrink-0 ${STATUS_CLASS[job.status]}`}>
        {job.status === 'downloading' && job.total_bytes > 0 ? `${percent(job)}%` : job.status}
      </span>
    </div>
    {(job.status === 'downloading' || job.status === 'queued') && (
      <div
        role="progressbar"
        aria-valuenow={percent(job)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 rounded-full mt-1.5 overflow-hidden"
        style={{ background: 'var(--track)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${percent(job)}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }}
        />
      </div>
    )}
    {job.status === 'failed' && job.error && (
      <div className="text-danger text-xs mt-1">{job.error}</div>
    )}
  </div>
);

export const DownloadsList = () => {
  const { data, isLoading, isError } = useDownloads();

  return (
    <GlassCard className="p-6">
      <h2 className="font-ui text-sm font-semibold tracking-wide text-ink m-0 mb-4">Downloads</h2>
      {isLoading && <div className="text-muted text-[13px]">Loading…</div>}
      {isError && <div className="text-danger text-[13px]">Couldn&apos;t load downloads.</div>}
      {data?.length === 0 && <div className="text-muted text-[13px]">No downloads yet.</div>}
      {data?.map(job => <DownloadRow key={job.id} job={job} />)}
    </GlassCard>
  );
};
