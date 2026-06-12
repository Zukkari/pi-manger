import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { GlassCard } from '@/shared/ui/GlassCard';

import type { FileEntry } from '../files.types';

interface DeleteConfirmDialogProps {
  entry: FileEntry;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmDialog = ({ entry, isPending, onConfirm, onCancel }: DeleteConfirmDialogProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/55"
      onClick={!isPending ? onCancel : undefined}
    >
      <GlassCard className="p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <h2 className="font-ui text-lg font-semibold text-danger mb-2">Delete file?</h2>
        <p className="font-ui text-[13px] text-muted leading-relaxed mb-5">
          <strong className="text-ink font-medium">{entry.name}</strong>
          {' '}will be permanently removed. This cannot be undone.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="w-full px-4 py-2.5 rounded-full font-ui text-sm font-semibold bg-danger text-white border-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            {isPending && (
              <span className="spinner inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white" />
            )}
            Delete
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="w-full px-4 py-2.5 rounded-full font-ui text-[13px] font-medium bg-transparent border border-glass text-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:bg-surface-hi transition-colors"
          >
            Cancel
          </button>
        </div>
      </GlassCard>
    </div>,
    document.body,
  );
};
