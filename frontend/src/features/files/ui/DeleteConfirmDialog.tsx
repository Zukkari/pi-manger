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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(0,0,0,0.55)',
      }}
      onClick={!isPending ? onCancel : undefined}
    >
      <div
        style={{
          background: 'var(--paper-surface-hi)',
          border: '1px solid var(--paper-border-bold)',
          boxShadow: '6px 6px 0 rgba(0,0,0,0.15)',
          padding: '24px',
          width: '100%',
          maxWidth: '320px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '20px',
          letterSpacing: '0.06em',
          color: 'var(--paper-danger)',
          marginBottom: '8px',
          textTransform: 'uppercase',
        }}>
          Delete file?
        </h2>
        <p style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '13px',
          color: 'var(--paper-muted)',
          lineHeight: 1.6,
          marginBottom: '20px',
        }}>
          <strong style={{ color: 'var(--paper-text)', fontWeight: 500 }}>{entry.name}</strong>
          {' '}will be permanently removed. This cannot be undone.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: 'var(--paper-danger)',
              border: 'none',
              color: 'white',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.88 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isPending && (
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: 'white',
                animation: 'spin 0.6s linear infinite',
                display: 'inline-block',
              }} />
            )}
            Delete
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontFamily: 'var(--font-ui)',
              fontSize: '13px',
              fontWeight: 500,
              background: 'transparent',
              border: '2px solid var(--paper-border-bold)',
              color: 'var(--paper-text)',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
