import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

import type { TopFilesEntry } from '../largest-files.types';

interface LargestFilesPieProps {
  entries: TopFilesEntry[];
  otherBytes: number;
  totalBytes: number;
  onEntryClick: (entry: TopFilesEntry) => void;
}

interface SliceDatum {
  key: string;
  name: string;
  size_bytes: number;
  entry: TopFilesEntry | null;
}

const SLICE_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
const OTHER_COLOR = '#94a3b8';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(2)} ${units[i]}`;
};

export const LargestFilesPie = ({ entries, otherBytes, totalBytes, onEntryClick }: LargestFilesPieProps) => {
  const data: SliceDatum[] = entries.map(e => ({
    key: `entry-${e.id}`,
    name: e.name,
    size_bytes: e.size_bytes,
    entry: e,
  }));
  if (otherBytes > 0) {
    data.push({ key: 'other', name: 'Other', size_bytes: otherBytes, entry: null });
  }

  const handleClick = (datum: SliceDatum) => {
    if (datum.entry && datum.entry.is_dir) {
      onEntryClick(datum.entry);
    }
  };

  return (
    <div style={{ width: '100%', height: 320 }} role="img" aria-label="Largest files breakdown">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="size_bytes"
            nameKey="name"
            innerRadius={50}
            outerRadius={120}
            paddingAngle={1}
          >
            {data.map((datum, idx) => (
              <Cell
                key={datum.key}
                fill={datum.entry ? SLICE_COLORS[idx % SLICE_COLORS.length] : OTHER_COLOR}
                cursor={datum.entry && datum.entry.is_dir ? 'pointer' : 'default'}
                onClick={() => handleClick(datum)}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: ValueType | undefined, name: NameType | undefined) => {
              const bytes = typeof value === 'number' ? value : 0;
              return [
                `${formatBytes(bytes)} (${totalBytes > 0 ? ((bytes / totalBytes) * 100).toFixed(1) : '0'}%)`,
                name ?? '',
              ];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
