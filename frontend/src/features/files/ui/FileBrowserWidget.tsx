import type { CSSProperties } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';

import type { FileEntry } from '../files.types';
import { useDeleteFile } from '../queries/useDeleteFile';
import { useFiles } from '../queries/useFiles';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { FileRow } from './FileRow';

interface BreadcrumbEntry {
  id: number | undefined;
  name: string;
}

const deriveFolderName = (children: FileEntry[]): string | undefined => {
  if (children.length === 0) return undefined;
  const parts = children[0].path.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
};

const FileSkeleton = () => (
  <div
    role="status"
    aria-label="Loading files"
    style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--paper-border)',
      boxShadow: '3px 3px 0 var(--paper-border-bold)',
    }}
  >
    {[0, 1, 2, 3].map(i => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderBottom: '1px solid var(--paper-border)' }}>
        <div className="paper-skeleton" style={{ width: '28px', height: '28px', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div className="paper-skeleton" style={{ width: '50%', height: '10px' }} />
          <div className="paper-skeleton" style={{ width: '30%', height: '8px' }} />
        </div>
        <div className="paper-skeleton" style={{ width: '48px', height: '28px', flexShrink: 0 }} />
      </div>
    ))}
  </div>
);

const sectionLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '11px',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: 'var(--paper-muted)',
  marginBottom: '10px',
};

export const FileBrowserWidget = () => {
  const { parent_id } = useSearch({ from: '/files' });
  const navigate = useNavigate();

  const [rootName, setRootName] = useState('Root');
  const [stack, setStack] = useState<BreadcrumbEntry[]>([{ id: undefined, name: 'Root' }]);
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null);

  const { data, isLoading, isError } = useFiles(parent_id);
  const { mutate: deleteFile, isPending: isDeleting } = useDeleteFile(parent_id);

  useEffect(() => {
    if (parent_id !== undefined) return;
    const name = data && data.length > 0 ? deriveFolderName(data) : undefined;
    if (name) setRootName(name);
    setStack([{ id: undefined, name: name ?? rootName }]);
  }, [parent_id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <FileSkeleton />;

  if (isError || !data) {
    return (
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--paper-border)',
        boxShadow: '3px 3px 0 var(--paper-border-bold)',
        padding: '24px',
        fontFamily: 'var(--font-ui)',
        fontSize: '13px',
        color: 'var(--paper-danger)',
      }}>
        Failed to load files. Is the API running?
      </div>
    );
  }

  const isInsideFolder = parent_id !== undefined;

  const effectiveStack: BreadcrumbEntry[] = (() => {
    if (!isInsideFolder) return stack;
    if (stack.length > 1) return stack;
    const inferred = deriveFolderName(data);
    return inferred
      ? [{ id: undefined, name: rootName }, { id: parent_id, name: inferred }]
      : [];
  })();

  const handleNavigateInto = (entry: FileEntry) => {
    setStack(prev => [...prev, { id: entry.id, name: entry.name }]);
    navigate({ to: '/files', search: { parent_id: entry.id } });
  };

  const handleNavigateUp = () => {
    if (effectiveStack.length === 0) {
      setStack([{ id: undefined, name: rootName }]);
      navigate({ to: '/files', search: { parent_id: undefined } });
      return;
    }
    const newStack = effectiveStack.slice(0, -1);
    setStack(newStack.length > 0 ? newStack : [{ id: undefined, name: rootName }]);
    const parent = newStack[newStack.length - 1];
    if (!parent || parent.id === undefined) {
      navigate({ to: '/files', search: { parent_id: undefined } });
    } else {
      navigate({ to: '/files', search: { parent_id: parent.id } });
    }
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    deleteFile(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={sectionLabelStyle}>Files</div>

      <nav aria-label="breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' as const }}>
        {effectiveStack.map((crumb, i) => {
          const isLast = i === effectiveStack.length - 1;
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {i > 0 && (
                <span style={{ fontFamily: 'var(--font-data)', fontSize: '10px', color: 'var(--paper-dim)' }}>›</span>
              )}
              {i === 0 && !isLast ? (
                <Link
                  to="/files"
                  search={{ parent_id: undefined }}
                  onClick={() => setStack([{ id: undefined, name: rootName }])}
                  style={{ fontFamily: 'var(--font-data)', fontSize: '12px', color: 'var(--paper-accent)', textDecoration: 'none' }}
                >
                  {crumb.name}
                </Link>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: '12px',
                  color: isLast ? 'var(--paper-text)' : 'var(--paper-accent)',
                  fontWeight: isLast ? 500 : 400,
                }}>
                  {crumb.name}
                </span>
              )}
            </span>
          );
        })}
        {effectiveStack.length > 0 && (
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '10px', color: 'var(--paper-dim)', marginLeft: 'auto' }}>
            {data.length} {data.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </nav>

      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--paper-border)',
        boxShadow: '3px 3px 0 var(--paper-border-bold)',
        overflow: 'hidden',
      }}>
        {isInsideFolder && <FileRow isParent onParentClick={handleNavigateUp} />}

        {data.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              letterSpacing: '0.08em',
              color: 'var(--paper-muted)',
              marginBottom: '6px',
            }}>
              Empty Directory
            </div>
            <div style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '13px',
              color: 'var(--paper-dim)',
            }}>
              No files found in this location.
            </div>
          </div>
        )}

        {data.map((entry, i) => (
          <Fragment key={entry.id}>
            {i > 0 && <div style={{ borderTop: '1px solid var(--paper-border)' }} />}
            <FileRow
              entry={entry}
              onClick={handleNavigateInto}
              onDelete={setPendingDelete}
            />
          </Fragment>
        ))}
      </div>

      {pendingDelete && (
        <DeleteConfirmDialog
          entry={pendingDelete}
          isPending={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};
