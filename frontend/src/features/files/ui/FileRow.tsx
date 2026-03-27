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

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
      stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
      stroke="#aeaeb2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="14 2 14 8 20 8" stroke="#aeaeb2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <polyline points="15 18 9 12 15 6" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type FileRowProps =
  | { isParent: true; onParentClick: () => void; entry?: never; onClick?: never }
  | { isParent?: false; entry: FileEntry; onClick: (entry: FileEntry) => void; onParentClick?: never };

export const FileRow = ({ isParent, entry, onClick, onParentClick }: FileRowProps) => {
  if (isParent) {
    return (
      <button
        type="button"
        onClick={onParentClick}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <BackIcon />
        </div>
        <span className="text-sm text-gray-400">..</span>
      </button>
    );
  }

  const isDir = entry.is_dir;

  return (
    <button
      type="button"
      onClick={isDir ? () => onClick(entry) : undefined}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
        isDir ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        isDir ? 'bg-blue-50' : 'bg-gray-100'
      }`}>
        {isDir ? <FolderIcon /> : <FileIcon />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{entry.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{isDir ? '—' : formatFileSize(entry.size)}</p>
      </div>
      {isDir && (
        <span className="text-gray-300 text-base shrink-0">›</span>
      )}
    </button>
  );
};
