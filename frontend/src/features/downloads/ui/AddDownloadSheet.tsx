import { X } from 'lucide-react';
import { useState } from 'react';

import { useCreateDownload } from '../queries/useCreateDownload';

import { FolderPicker } from './FolderPicker';

interface AddDownloadSheetProps {
  onClose: () => void;
}

const FIELD_CLASS =
  'w-full box-border px-3 py-2.5 rounded-xl border border-glass bg-surface-hi font-ui text-sm text-ink mb-3.5 outline-none focus:border-accent transition-colors';

const LABEL_CLASS =
  'font-data text-[10px] uppercase tracking-widest text-muted m-0 mb-1.5';

export const AddDownloadSheet = ({ onClose }: AddDownloadSheetProps) => {
  const [url, setUrl] = useState('');
  const [dir, setDir] = useState('');
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const { mutate, isPending, isError, error } = useCreateDownload();

  const canSubmit = url.trim() !== '' && !isPending;

  const handleSubmit = () => {
    mutate(
      { url: url.trim(), dir, name: name.trim() || undefined },
      { onSuccess: onClose },
    );
  };

  if (picking) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>
        <div className="max-w-md w-full mx-auto p-5 box-border">
          <FolderPicker
            onSelect={selected => {
              setDir(selected);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="border-b border-glass px-5 py-3 flex justify-between items-center font-ui text-lg font-semibold text-ink">
        <span>Add Download</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bg-transparent border-none cursor-pointer text-muted hover:text-ink transition-colors"
        >
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="max-w-md w-full mx-auto p-5 box-border">
        <p className={LABEL_CLASS}>Link</p>
        <input className={FIELD_CLASS} placeholder="Paste link (https://…)" value={url} onChange={e => setUrl(e.target.value)} />

        <p className={LABEL_CLASS}>Destination folder</p>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`${FIELD_CLASS} flex justify-between cursor-pointer text-left`}
        >
          <span className="font-data text-[13px]">/{dir}</span>
          <span className="font-data text-[11px] text-accent">CHANGE ▸</span>
        </button>

        <p className={LABEL_CLASS}>File name — optional</p>
        <input className={FIELD_CLASS} placeholder="Leave blank to use the link's name" value={name} onChange={e => setName(e.target.value)} />

        {isError && (
          <p className="text-danger text-[13px] m-0 mb-3">
            {error instanceof Error ? error.message : 'Something went wrong.'}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 rounded-full border-none font-ui text-base font-semibold text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
        >
          {isPending ? 'Starting…' : 'Start Download'}
        </button>
      </div>
    </div>
  );
};
