import { createPortal } from 'react-dom';

import type { FileEntry } from '../files.types';

interface DeleteConfirmDialogProps {
  entry: FileEntry;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmDialog = ({ entry, isPending, onConfirm, onCancel }: DeleteConfirmDialogProps) => {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={!isPending ? onCancel : undefined}
      />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-80 max-w-full mx-4">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Delete {entry.name}?
        </h2>
        <p className="text-sm text-gray-500 mb-5">This cannot be undone.</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
          >
            {isPending && (
              <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
            )}
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
