import { FileText, Folder } from 'lucide-react';

import { GlassCard } from '@/shared/ui/GlassCard';

import type { FileEntry } from '../files.types';

interface SearchResultsListProps {
  results: FileEntry[];
  onNavigate: (parentId: number | undefined) => void;
}

const containingPath = (entry: FileEntry): string =>
  entry.path.slice(0, entry.path.length - entry.name.length - 1) || '/';

const formatResultSize = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${bytes} B`;
};

export const SearchResultsList = ({ results, onNavigate }: SearchResultsListProps) => {
  if (results.length === 0) {
    return (
      <GlassCard className="px-6 py-12 text-center">
        <div className="font-ui text-base font-semibold tracking-wide text-muted mb-1.5">
          No matches
        </div>
        <div className="font-ui text-[13px] text-muted">
          Try a different search term.
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-hidden">
      {results.map((entry, i) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onNavigate(entry.is_dir ? entry.id : entry.parent_id ?? undefined)}
          className={
            'flex items-center gap-3 w-full px-3.5 py-2.5 min-h-11 bg-transparent cursor-pointer text-left hover:bg-surface-hi transition-colors ' +
            (i > 0 ? 'border-0 border-t border-solid border-glass' : 'border-none')
          }
        >
          <div
            className={
              'w-7 h-7 rounded-lg border border-glass flex items-center justify-center shrink-0 ' +
              (entry.is_dir ? 'bg-surface-hi text-accent' : 'bg-transparent text-muted')
            }
          >
            {entry.is_dir ? <Folder size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-ui text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap">
              {entry.name}
            </div>
            <div className="font-data text-[10px] text-muted overflow-hidden text-ellipsis whitespace-nowrap">
              {containingPath(entry)}
            </div>
          </div>
          <span className="font-data text-xs font-medium text-muted shrink-0">
            {entry.is_dir ? '—' : formatResultSize(entry.size)}
          </span>
        </button>
      ))}
    </GlassCard>
  );
};
