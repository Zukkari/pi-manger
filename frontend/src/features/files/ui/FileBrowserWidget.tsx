import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';

import { useDebouncedValue } from '@/shared/lib/useDebouncedValue';
import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';

import type { FileEntry } from '../files.types';
import { DEFAULT_SORT, sortEntries } from '../lib/sortEntries';
import type { SortState } from '../lib/sortEntries';
import { useBulkDeleteFiles } from '../queries/useBulkDeleteFiles';
import { useDeleteFile } from '../queries/useDeleteFile';
import { useFileSearch } from '../queries/useFileSearch';
import { useFiles } from '../queries/useFiles';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { FileRow } from './FileRow';
import { FileSearchBar } from './FileSearchBar';
import { SearchResultsList } from './SearchResultsList';
import { SelectionBar } from './SelectionBar';
import { SortHeader } from './SortHeader';

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
  <GlassCard role="status" aria-label="Loading files" className="overflow-hidden">
    {[0, 1, 2, 3].map(i => (
      <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-glass">
        <div className="skeleton w-7 h-7 shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="skeleton h-2.5 w-1/2" />
          <div className="skeleton h-2 w-[30%]" />
        </div>
      </div>
    ))}
  </GlassCard>
);

export const FileBrowserWidget = () => {
  const { parent_id } = useSearch({ from: '/files' });
  const navigate = useNavigate();

  const [rootName, setRootName] = useState('Root');
  const [stack, setStack] = useState<BreadcrumbEntry[]>([{ id: undefined, name: 'Root' }]);
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const debouncedQuery = useDebouncedValue(searchInput, 300);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const { data, isLoading, isError, refetch } = useFiles(parent_id);
  const { mutate: deleteFile, isPending: isDeleting } = useDeleteFile(parent_id);
  const bulkDelete = useBulkDeleteFiles(parent_id);
  const search = useFileSearch(debouncedQuery);
  const isSearching = debouncedQuery.trim().length >= 2;

  useEffect(() => {
    if (parent_id !== undefined) return;
    const name = data && data.length > 0 ? deriveFolderName(data) : undefined;
    if (name) setRootName(name);
    setStack([{ id: undefined, name: name ?? rootName }]);
  // rootName intentionally omitted: the effect should only run when the URL
  // param changes or fresh data arrives, not on every rootName state update.
  }, [parent_id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <FileSkeleton />;

  if (isError || !data) {
    return <WidgetError message="Failed to load files. Is the API running?" onRetry={() => refetch()} />;
  }

  const sortedData = sortEntries(data, sort);

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

  const handleSearchNavigate = (parentId: number | undefined) => {
    setSearchInput('');
    navigate({ to: '/files', search: { parent_id: parentId } });
  };

  const handleToggleSelect = (entry: FileEntry) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        next.add(entry.id);
      }
      return next;
    });
  };

  const handleBulkDelete = () => {
    bulkDelete.mutate([...selectedIds], {
      onSuccess: ({ failedIds }) => {
        setBulkConfirmOpen(false);
        if (failedIds.length === 0) {
          setSelecting(false);
          setSelectedIds(new Set());
          setBulkError(null);
          return;
        }
        setSelectedIds(new Set(failedIds));
        setBulkError(`Failed to delete ${failedIds.length} item${failedIds.length === 1 ? '' : 's'}.`);
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="font-data text-[11px] uppercase tracking-[0.2em] text-muted mb-2.5">Files</div>

      <FileSearchBar value={searchInput} onChange={setSearchInput} />

      {isSearching ? (
        <>
          {search.isLoading && <FileSkeleton />}
          {search.isError && (
            <WidgetError message="Search failed. Is the API running?" onRetry={() => search.refetch()} />
          )}
          {!search.isLoading && !search.isError && (
            <SearchResultsList results={search.data ?? []} onNavigate={handleSearchNavigate} />
          )}
        </>
      ) : (
        <>
          <nav aria-label="breadcrumb" className="flex items-center gap-1 flex-wrap">
            {effectiveStack.map((crumb, i) => {
              const isLast = i === effectiveStack.length - 1;
              return (
                <span key={crumb.id ?? `root-${i}`} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className="font-data text-[10px] text-dim">›</span>
                  )}
                  {i === 0 && !isLast ? (
                    <Link
                      to="/files"
                      search={{ parent_id: undefined }}
                      onClick={() => setStack([{ id: undefined, name: rootName }])}
                      className="breadcrumb-link"
                    >
                      {crumb.name}
                    </Link>
                  ) : i > 0 && !isLast ? (
                    <Link
                      to="/files"
                      search={{ parent_id: crumb.id }}
                      onClick={() => setStack(prev => prev.slice(0, i + 1))}
                      className="breadcrumb-link"
                    >
                      {crumb.name}
                    </Link>
                  ) : (
                    <span className="font-data text-xs font-medium text-ink">
                      {crumb.name}
                    </span>
                  )}
                </span>
              );
            })}
            {effectiveStack.length > 0 && (
              <span className="font-data text-[10px] text-dim ml-auto">
                {data.length} {data.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <SortHeader sort={sort} onChange={setSort} />
            <button
              type="button"
              aria-pressed={selecting}
              onClick={() => { setSelecting(s => !s); setSelectedIds(new Set()); setBulkError(null); }}
              className={
                'px-3 py-1.5 min-h-8 rounded-full border font-ui text-xs font-semibold cursor-pointer transition-colors ' +
                (selecting ? 'bg-surface-hi text-accent border-glass' : 'bg-transparent text-muted border-transparent hover:text-ink')
              }
            >
              Select
            </button>
          </div>

          {selecting && (
            <>
              <SelectionBar
                count={selectedIds.size}
                onDelete={() => setBulkConfirmOpen(true)}
                onCancel={() => { setSelecting(false); setSelectedIds(new Set()); setBulkError(null); }}
              />
              {bulkError && (
                <div className="font-ui text-[13px] text-danger">{bulkError}</div>
              )}
            </>
          )}

          <GlassCard className="overflow-hidden">
            {isInsideFolder && (
              <>
                <FileRow isParent onParentClick={handleNavigateUp} />
                {data.length > 0 && <div className="border-t border-glass" />}
              </>
            )}

            {data.length === 0 && (
              <div className="px-6 py-12 text-center">
                <div className="font-ui text-base font-semibold tracking-wide text-muted mb-1.5">
                  Empty directory
                </div>
                <div className="font-ui text-[13px] text-muted">
                  No files found in this location.
                </div>
              </div>
            )}

            {sortedData.map((entry, i) => (
              <Fragment key={entry.id}>
                {i > 0 && <div className="border-t border-glass" />}
                <FileRow
                  entry={entry}
                  index={i}
                  isLast={i === sortedData.length - 1}
                  onClick={handleNavigateInto}
                  onDelete={setPendingDelete}
                  selectable={selecting}
                  selected={selectedIds.has(entry.id)}
                  onToggleSelect={handleToggleSelect}
                />
              </Fragment>
            ))}
          </GlassCard>
        </>
      )}

      {pendingDelete && (
        <DeleteConfirmDialog
          title="Delete file?"
          description={
            <>
              <strong className="text-ink font-medium">{pendingDelete.name}</strong>
              {' '}will be permanently removed. This cannot be undone.
            </>
          }
          isPending={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {bulkConfirmOpen && (
        <DeleteConfirmDialog
          title={`Delete ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}?`}
          description="The selected items will be permanently removed. This cannot be undone."
          isPending={bulkDelete.isPending}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkConfirmOpen(false)}
        />
      )}
    </div>
  );
};
