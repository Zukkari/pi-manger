import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';

import type { FileEntry } from '../files.types';
import { useFiles } from '../queries/useFiles';
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

export const FileBrowserWidget = () => {
  const { parent_id } = useSearch({ from: '/files' });
  const navigate = useNavigate();

  const [stack, setStack] = useState<BreadcrumbEntry[]>([{ id: undefined, name: 'Root' }]);

  const { data, isLoading, isError } = useFiles(parent_id);

  useEffect(() => {
    if (parent_id !== undefined || !data || data.length === 0) return;
    // Scanner stores MANAGED_DIR itself as the sole root entry — auto-enter it
    if (data.length === 1 && data[0].is_dir) {
      const root = data[0];
      setStack([{ id: root.id, name: root.name }]);
      navigate({ to: '/files', search: { parent_id: root.id } });
    }
  }, [data, parent_id]);

  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-sm text-red-500">
        Failed to load files. Is the API running?
      </div>
    );
  }

  // Derive breadcrumb on refresh (stack still has initial placeholder)
  const effectiveStack: BreadcrumbEntry[] = (() => {
    if (stack.length > 1 || stack[0].id !== undefined) return stack;
    if (parent_id === undefined) return stack;
    // refreshed mid-tree — infer folder name from children
    const inferred = deriveFolderName(data);
    return inferred
      ? [{ id: undefined, name: 'Root' }, { id: parent_id, name: inferred }]
      : [];
  })();

  const handleNavigateInto = (entry: FileEntry) => {
    setStack(prev => [...prev, { id: entry.id, name: entry.name }]);
    navigate({ to: '/files', search: { parent_id: entry.id } });
  };

  const handleNavigateUp = () => {
    if (effectiveStack.length === 0) {
      setStack([{ id: undefined, name: 'Root' }]);
      navigate({ to: '/files', search: { parent_id: undefined } });
      return;
    }
    const newStack = effectiveStack.slice(0, -1);
    setStack(newStack.length > 0 ? newStack : [{ id: undefined, name: 'Root' }]);
    const parent = newStack[newStack.length - 1];
    if (!parent || parent.id === undefined) {
      navigate({ to: '/files', search: { parent_id: undefined } });
    } else {
      navigate({ to: '/files', search: { parent_id: parent.id } });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1 flex-wrap">
        {effectiveStack.map((crumb, i) => {
          const isLast = i === effectiveStack.length - 1;
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300 text-xs">›</span>}
              {i === 0 && !isLast ? (
                <Link
                  to="/files"
                  search={{ parent_id: crumb.id }}
                  onClick={() => setStack([{ id: crumb.id, name: crumb.name }])}
                  className="text-xs font-medium text-blue-500 hover:underline"
                >
                  {crumb.name}
                </Link>
              ) : (
                <span className={`text-xs ${isLast ? 'font-semibold text-gray-900' : 'font-medium text-blue-500'}`}>
                  {crumb.name}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {/* File list */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {(effectiveStack.length > 1 || (stack[0].id === undefined && parent_id !== undefined)) && (
          <>
            <FileRow isParent onParentClick={handleNavigateUp} />
            <div className="border-t border-gray-50" />
          </>
        )}
        {data.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">Empty directory</p>
        )}
        {data.map((entry, i) => (
          <Fragment key={entry.id}>
            {i > 0 && <div className="border-t border-gray-50 mx-4" />}
            <FileRow entry={entry} onClick={handleNavigateInto} />
          </Fragment>
        ))}
      </div>
    </div>
  );
};
