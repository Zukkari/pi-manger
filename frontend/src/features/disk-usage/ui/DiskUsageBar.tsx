import type { DiskUsageBarProps } from './DiskUsageBar.types';

const formatBytes = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
};

const getBarColor = (percent: number): string => {
  if (percent >= 90) return 'bg-red-400';
  if (percent >= 70) return 'bg-amber-400';
  return 'bg-blue-500';
};

const DiskUsageBar = ({ data }: DiskUsageBarProps) => {
  const { path, total_bytes, used_bytes, free_bytes, used_percent } = data;
  const barColor = getBarColor(used_percent);
  const roundedPercent = Math.round(used_percent);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-0.5">
            Storage
          </p>
          <p className="text-sm text-gray-500 font-mono">{path}</p>
        </div>
        <span className="text-2xl font-semibold text-gray-800 tabular-nums">
          {roundedPercent}%
        </span>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mb-4">
        <div
          role="progressbar"
          aria-valuenow={roundedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${used_percent}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-400">
        <span>{formatBytes(used_bytes)} used</span>
        <span>{formatBytes(free_bytes)} free</span>
        <span>{formatBytes(total_bytes)} total</span>
      </div>
    </div>
  );
};

export default DiskUsageBar;
