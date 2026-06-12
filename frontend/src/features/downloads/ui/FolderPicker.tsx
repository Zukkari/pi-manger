import { ChevronLeft, ChevronRight, Folder, X } from 'lucide-react';
import { useState } from 'react';

import { useFolders } from '../queries/useFolders';

interface Crumb {
  id: number;
  name: string;
}

interface FolderPickerProps {
  onSelect: (relativePath: string) => void;
  onClose: () => void;
}

const joinPath = (crumbs: Crumb[], extra?: string): string => {
  const parts = crumbs.map(c => c.name);
  const trimmed = extra?.trim();
  if (trimmed) parts.push(trimmed);
  return parts.join('/');
};

export const FolderPicker = ({ onSelect, onClose }: FolderPickerProps) => {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const currentParentId = crumbs.length === 0 ? undefined : crumbs[crumbs.length - 1].id;
  const { data, isLoading, isError } = useFolders(currentParentId);

  const relativePath = joinPath(crumbs);

  return (
    <div className="font-ui text-ink">
      <div className="flex justify-between items-center mb-3">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => setCrumbs(prev => prev.slice(0, -1))}
          disabled={crumbs.length === 0}
          className="bg-transparent border-none cursor-pointer text-muted hover:text-ink disabled:opacity-40 transition-colors flex items-center gap-1 font-ui text-sm"
        >
          <ChevronLeft size={14} aria-hidden />
          Back
        </button>
        <span className="font-data text-[11px] text-muted">/{relativePath}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="bg-transparent border-none cursor-pointer text-muted hover:text-ink transition-colors"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {isLoading && <div className="p-5 text-muted">Loading…</div>}
      {isError && <div className="p-5 text-danger">Couldn&apos;t load folders.</div>}

      {data?.map(folder => (
        <button
          key={folder.id}
          type="button"
          className="flex justify-between items-center w-full px-2 py-2.5 bg-transparent border-b border-glass font-data text-[13px] text-ink cursor-pointer hover:bg-surface-hi transition-colors"
          onClick={() => setCrumbs(prev => [...prev, { id: folder.id, name: folder.name }])}
        >
          <span className="flex items-center gap-2">
            <Folder size={14} className="text-accent" aria-hidden />
            {folder.name}
          </span>
          <ChevronRight size={14} aria-hidden />
        </button>
      ))}
      {data?.length === 0 && !isLoading && (
        <div className="px-2 py-4 text-muted text-[13px]">No subfolders here.</div>
      )}

      <div className="mt-4 border-t border-dashed border-glass pt-3">
        <input
          value={newFolder}
          onChange={e => setNewFolder(e.target.value)}
          placeholder="New subfolder name…"
          className="w-full box-border px-3 py-2.5 rounded-xl border border-glass bg-surface-hi font-ui text-sm text-ink mb-2.5 outline-none focus:border-accent transition-colors"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSelect(joinPath(crumbs, newFolder.trim()))}
            disabled={newFolder.trim() === ''}
            className="flex-1 py-2.5 rounded-full border border-glass bg-surface-hi text-ink font-ui text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:text-accent transition-colors"
          >
            Create &amp; use
          </button>
          <button
            type="button"
            onClick={() => onSelect(relativePath)}
            className="flex-1 py-2.5 rounded-full border-none text-white font-ui text-sm cursor-pointer hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
};
