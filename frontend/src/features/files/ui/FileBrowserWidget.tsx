import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

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

  // Derive breadcrumb name on refresh (stack only has Root)
  const isInsideFolder = parent_id !== undefined;
  const effectiveStack: BreadcrumbEntry[] = (() => {
    if (!isInsideFolder) return stack;
    if (stack.length > 1) return stack;
    // refreshed mid-tree — infer folder name from children
    const inferred = deriveFolderName(data);
    return inferred
      ? [{ id: undefined, name: 'Root' }, { id: parent_id, name: inferred }]
      : [{ id: undefined, name: 'Root' }];
  })();

  const handleNavigateInto = (entry: FileEntry) => {
    setStack(prev => [...prev, { id: entry.id, name: entry.name }]);
    navigate({ to: '/files', search: { parent_id: entry.id } });
  };

  const handleNavigateUp = () => {
    const newStack = effectiveStack.slice(0, -1);
    setStack(newStack);
    const parent = newStack[newStack.length - 1];
    if (parent.id === undefined) {
      navigate({ to: '/files', search: {} });
    } else {
      navigate({ to: '/files', search: { parent_id: parent.id } });
    }
  };

  const handleBreadcrumbRoot = () => {
    setStack([{ id: undefined, name: 'Root' }]);
    navigate({ to: '/files', search: {} });
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
                <button
                  type="button"
                  onClick={handleBreadcrumbRoot}
                  className="text-xs font-medium text-blue-500 hover:underline"
                >
                  {crumb.name}
                </button>
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
        {isInsideFolder && (
          <>
            <FileRow isParent onParentClick={handleNavigateUp} />
            <div className="border-t border-gray-50" />
          </>
        )}
        {data.length === 0 && !isInsideFolder && (
          <p className="text-sm text-gray-400 text-center py-10">Empty directory</p>
        )}
        {data.map((entry, i) => (
          <span key={entry.id}>
            {i > 0 && <div className="border-t border-gray-50 mx-4" />}
            <FileRow entry={entry} onClick={handleNavigateInto} />
          </span>
        ))}
      </div>
    </div>
  );
};
