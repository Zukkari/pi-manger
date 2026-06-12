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

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  padding: '10px 8px',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid var(--paper-border)',
  fontFamily: 'var(--font-data)',
  fontSize: '13px',
  color: 'var(--paper-text)',
  cursor: 'pointer',
};

export const FolderPicker = ({ onSelect, onClose }: FolderPickerProps) => {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const currentParentId = crumbs.length === 0 ? undefined : crumbs[crumbs.length - 1].id;
  const { data, isLoading, isError } = useFolders(currentParentId);

  const relativePath = joinPath(crumbs);

  return (
    <div style={{ fontFamily: 'var(--font-ui)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <button
          type="button"
          aria-label="Go back"
          onClick={() => setCrumbs(prev => prev.slice(0, -1))}
          disabled={crumbs.length === 0}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--paper-muted)' }}
        >
          ◂ Back
        </button>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--paper-muted)' }}>
          /{relativePath}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--paper-muted)' }}
        >
          ✕
        </button>
      </div>

      {isLoading && <div style={{ padding: '20px', color: 'var(--paper-muted)' }}>Loading…</div>}
      {isError && <div style={{ padding: '20px', color: 'var(--paper-danger)' }}>Couldn&apos;t load folders.</div>}

      {data?.map(folder => (
        <button
          key={folder.id}
          type="button"
          style={ROW_STYLE}
          onClick={() => setCrumbs(prev => [...prev, { id: folder.id, name: folder.name }])}
        >
          <span>📁 {folder.name}</span>
          <span>▸</span>
        </button>
      ))}
      {data?.length === 0 && !isLoading && (
        <div style={{ padding: '16px 8px', color: 'var(--paper-dim)', fontSize: '13px' }}>No subfolders here.</div>
      )}

      <div style={{ marginTop: '16px', borderTop: '1px dashed var(--paper-border)', paddingTop: '12px' }}>
        <input
          value={newFolder}
          onChange={e => setNewFolder(e.target.value)}
          placeholder="New subfolder name…"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 11px',
            border: '1px solid var(--paper-border)',
            borderRadius: '8px',
            marginBottom: '10px',
            fontFamily: 'var(--font-ui)',
          }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => onSelect(joinPath(crumbs, newFolder.trim()))}
            disabled={newFolder.trim() === ''}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--paper-border-bold)', background: 'var(--paper-surface)', cursor: 'pointer' }}
          >
            Create &amp; use
          </button>
          <button
            type="button"
            onClick={() => onSelect(relativePath)}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: 'var(--paper-accent)', color: '#fff', cursor: 'pointer' }}
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
};
