import { CheckSquare, CornerLeftUp, FileText, Folder, MoreHorizontal, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { FileEntry } from '../files.types';

const formatFileSize = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${bytes} B`;
};

const formatDate = (unixSec: number): string =>
  new Date(unixSec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const IconBox = ({ isDir }: { isDir: boolean }) => (
  <div
    className={
      'w-7 h-7 rounded-lg border border-glass flex items-center justify-center shrink-0 ' +
      (isDir ? 'bg-surface-hi text-accent' : 'bg-transparent text-muted')
    }
  >
    {isDir ? <Folder size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
  </div>
);

type ParentRowProps = { isParent: true; onParentClick: () => void; entry?: never; onClick?: never; onDelete?: never; index?: number; isLast?: never };
type EntryRowProps = { isParent?: false; entry: FileEntry; onClick: (entry: FileEntry) => void; onParentClick?: never; onDelete: (entry: FileEntry) => void; index?: number; isLast?: boolean; selectable?: boolean; selected?: boolean; onToggleSelect?: (entry: FileEntry) => void };

type FileRowProps = ParentRowProps | EntryRowProps;

export const FileRow = ({ isParent, index, ...rest }: FileRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    // Use pointerdown rather than mousedown: Firefox for Android fires pointer events
    // natively on the touched element, whereas its synthetic mouse events are delayed and
    // can mis-target, closing the menu before the "Delete" item's click is delivered.
    const handleClickOutside = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const rowDelay = { animationDelay: `${(index ?? 0) * 50}ms` };

  if (isParent) {
    const { onParentClick } = rest as ParentRowProps;
    const rowClass = 'group row-enter flex items-center gap-3 px-3.5 py-2.5 min-h-11 transition-colors hover:bg-surface-hi';
    return (
      <button
        type="button"
        onClick={onParentClick}
        aria-label="Go to parent directory"
        className={`${rowClass} w-full cursor-pointer text-left bg-transparent border-none`}
        style={rowDelay}
      >
        <div className="w-7 h-7 rounded-lg border border-glass flex items-center justify-center shrink-0 bg-surface-hi text-muted">
          <CornerLeftUp size={14} aria-hidden />
        </div>
        <span className="font-ui text-sm text-muted">..</span>
      </button>
    );
  }

  const { entry, onClick, onDelete, isLast, selectable, selected, onToggleSelect } = rest as EntryRowProps;

  const rowClass =
    'group row-enter flex items-center gap-3 px-3.5 py-2.5 min-h-11 transition-colors hover:bg-surface-hi' +
    (selected ? ' bg-surface-hi' : '');

  const nameAndMeta = (
    <div className="flex-1 min-w-0">
      <div className="font-ui text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap">
        {entry.name}
      </div>
    </div>
  );

  return (
    <div className={rowClass} style={rowDelay}>
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${entry.name}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(entry); }}
          className="w-11 h-11 -ml-2 flex items-center justify-center bg-transparent border-none cursor-pointer text-muted shrink-0"
        >
          {selected ? <CheckSquare size={18} className="text-accent" aria-hidden /> : <Square size={18} aria-hidden />}
        </button>
      )}

      {selectable ? (
        <button
          type="button"
          onClick={() => onToggleSelect?.(entry)}
          className="flex items-center gap-3 flex-1 min-w-0 bg-transparent border-none cursor-pointer text-left p-0"
        >
          <IconBox isDir={entry.is_dir} />
          {nameAndMeta}
        </button>
      ) : entry.is_dir ? (
        <button
          type="button"
          onClick={() => onClick(entry)}
          className="flex items-center gap-3 flex-1 min-w-0 bg-transparent border-none cursor-pointer text-left p-0"
        >
          <IconBox isDir />
          {nameAndMeta}
        </button>
      ) : (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <IconBox isDir={false} />
          {nameAndMeta}
        </div>
      )}

      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="font-data text-xs font-medium text-muted">
          {entry.is_dir ? '—' : formatFileSize(entry.size)}
        </span>
        <span className="font-data text-[10px] text-dim">{formatDate(entry.modified_at)}</span>
      </div>

      {!selectable && (
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            className="row-menu-btn w-7 h-7 flex items-center justify-center bg-transparent border-none cursor-pointer text-muted opacity-25 group-hover:opacity-100 transition-opacity"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label="File actions"
              className={
                'absolute right-0 z-10 min-w-[130px] glass-card overflow-hidden ' +
                (isLast ? 'bottom-full' : 'top-full')
              }
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { onDelete(entry); setMenuOpen(false); }}
                className="w-full text-left px-3.5 py-2.5 bg-transparent border-none cursor-pointer font-ui text-[13px] text-danger flex items-center gap-2 hover:bg-surface-hi transition-colors"
              >
                <Trash2 size={13} aria-hidden />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
