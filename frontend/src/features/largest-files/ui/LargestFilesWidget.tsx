import { useState } from 'react';

import type { TopFilesEntry } from '../largest-files.types';
import { useLargestFiles } from '../queries/useLargestFiles';

import { LargestFilesBreadcrumb, type BreadcrumbCrumb } from './LargestFilesBreadcrumb';
import { LargestFilesPie } from './LargestFilesPie';

const CONTAINER_STYLE: React.CSSProperties = {
  background: 'var(--paper-surface)',
  border: '1px solid var(--paper-border)',
  boxShadow: '3px 3px 0 var(--paper-border-bold)',
  padding: '24px',
};

const MESSAGE_STYLE: React.CSSProperties = {
  ...CONTAINER_STYLE,
  fontFamily: 'var(--font-ui)',
  fontSize: '13px',
};

const LargestFilesSkeleton = () => (
  <div role="status" aria-label="Loading largest files" style={CONTAINER_STYLE}>
    <div className="paper-skeleton" style={{ width: '50%', height: '14px', marginBottom: '20px' }} />
    <div className="paper-skeleton" style={{ width: '240px', height: '240px', borderRadius: '50%', margin: '0 auto' }} />
  </div>
);

export const LargestFilesWidget = () => {
  const [path, setPath] = useState<BreadcrumbCrumb[]>([]);
  const currentParentId = path.length === 0 ? null : path[path.length - 1].id;
  const { data, isLoading, isError } = useLargestFiles(currentParentId);

  if (isLoading) return <LargestFilesSkeleton />;

  if (isError || !data) {
    return (
      <div style={{ ...MESSAGE_STYLE, color: 'var(--paper-danger)' }}>
        Couldn&apos;t load directory sizes. Is the API running?
      </div>
    );
  }

  const handleEntryClick = (entry: TopFilesEntry) => {
    if (entry.is_dir) {
      setPath(prev => [...prev, { id: entry.id, name: entry.name }]);
    }
  };

  const handleCrumbClick = (index: number) => {
    setPath(prev => (index < 0 ? [] : prev.slice(0, index + 1)));
  };

  const isEmpty = data.entries.length === 0 && data.other_bytes === 0;
  const isAllZero = !isEmpty && data.total_bytes === 0;

  return (
    <div style={CONTAINER_STYLE}>
      <LargestFilesBreadcrumb path={path} onCrumbClick={handleCrumbClick} />

      {isEmpty && <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--paper-border-bold)' }}>No files to display</div>}
      {isAllZero && <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--paper-border-bold)' }}>No files in this folder</div>}

      {!isEmpty && !isAllZero && (
        <LargestFilesPie
          entries={data.entries}
          otherBytes={data.other_bytes}
          totalBytes={data.total_bytes}
          onEntryClick={handleEntryClick}
        />
      )}

      {/* Hidden, keyboard-accessible click targets that mirror each slice.
          Recharts SVG slices are not reliably clickable from jsdom, and these
          buttons also serve as accessible alternatives for keyboard users. */}
      <div style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        {data.entries.map(entry => (
          <button
            key={entry.id}
            type="button"
            data-testid={`largest-files-slice-${entry.id}`}
            onClick={() => handleEntryClick(entry)}
          >
            {entry.name}
          </button>
        ))}
        {data.other_bytes > 0 && (
          <button type="button" data-testid="largest-files-slice-other" onClick={() => undefined}>
            Other
          </button>
        )}
      </div>
    </div>
  );
};
