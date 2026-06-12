import { Plus } from 'lucide-react';
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
        className="fixed right-5 bottom-5 z-40 w-13 h-13 rounded-full border-none cursor-pointer text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
      >
        <Plus size={24} aria-hidden />
      </button>
      {open && <AddDownloadSheet onClose={() => setOpen(false)} />}
    </>
  );
};
