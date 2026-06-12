import { ArrowDown, ArrowUp } from 'lucide-react';

import type { SortKey, SortState } from '../lib/sortEntries';

interface SortHeaderProps {
  sort: SortState;
  onChange: (sort: SortState) => void;
}

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'modified', label: 'Modified' },
];

export const SortHeader = ({ sort, onChange }: SortHeaderProps) => (
  <div className="flex gap-1.5" role="group" aria-label="Sort files">
    {COLUMNS.map(({ key, label }) => {
      const isActive = sort.key === key;
      const next: SortState = isActive
        ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' };
      return (
        <button
          key={key}
          type="button"
          aria-sort={isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
          onClick={() => onChange(next)}
          className={
            'flex items-center gap-1 px-3 py-1.5 min-h-8 rounded-full border font-ui text-xs font-semibold cursor-pointer transition-colors ' +
            (isActive
              ? 'bg-surface-hi text-accent border-glass'
              : 'bg-transparent text-muted border-transparent hover:text-ink')
          }
        >
          {label}
          {isActive && (sort.dir === 'asc' ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)}
        </button>
      );
    })}
  </div>
);
