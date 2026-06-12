import { useState } from 'react';

import { AddDownloadSheet } from './AddDownloadSheet';

export const AddDownloadButton = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Add download"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          border: 'none',
          background: 'var(--paper-accent)',
          color: '#fff',
          fontSize: '28px',
          lineHeight: '52px',
          cursor: 'pointer',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
          zIndex: 40,
        }}
      >
        +
      </button>
      {open && <AddDownloadSheet onClose={() => setOpen(false)} />}
    </>
  );
};
