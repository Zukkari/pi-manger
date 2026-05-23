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

const SLICE_COLORS = ['#c0392b', '#d97706', '#16a34a', '#6b5e45', '#a0522d', '#8b7355'];
const OTHER_COLOR = '#c8b898';

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
            contentStyle={{
              background: 'var(--paper-surface)',
              border: '1px solid rgba(0,0,0,0.20)',
              boxShadow: '3px 3px 0 rgba(0,0,0,0.20)',
              borderRadius: 0,
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              color: 'var(--paper-text)',
              padding: '8px 12px',
            }}
            itemStyle={{ color: 'var(--paper-text)' }}
            labelStyle={{ color: 'var(--paper-muted)', fontFamily: 'var(--font-data)', fontSize: 11 }}
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
