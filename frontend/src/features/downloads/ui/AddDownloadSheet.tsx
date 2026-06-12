import { useState } from 'react';

import { useCreateDownload } from '../queries/useCreateDownload';

import { FolderPicker } from './FolderPicker';

interface AddDownloadSheetProps {
  onClose: () => void;
}

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: 'var(--paper-bg)',
  backgroundImage: 'var(--paper-bg-texture)',
  display: 'flex',
  flexDirection: 'column',
};

const PANEL_STYLE: React.CSSProperties = {
  maxWidth: '440px',
  width: '100%',
  margin: '0 auto',
  padding: '20px',
  boxSizing: 'border-box',
};

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 11px',
  border: '1px solid var(--paper-border)',
  borderRadius: '8px',
  marginBottom: '13px',
  fontFamily: 'var(--font-ui)',
  fontSize: '14px',
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--paper-muted)',
  margin: '0 0 5px',
};

export const AddDownloadSheet = ({ onClose }: AddDownloadSheetProps) => {
  const [url, setUrl] = useState('');
  const [dir, setDir] = useState('');
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const { mutate, isPending, isError, error } = useCreateDownload();

  const handleSubmit = () => {
    mutate(
      { url: url.trim(), dir, name: name.trim() || undefined },
      { onSuccess: onClose },
    );
  };

  if (picking) {
    return (
      <div style={OVERLAY_STYLE}>
        <div style={PANEL_STYLE}>
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
    <div style={OVERLAY_STYLE}>
      <header
        style={{
          borderBottom: '3px solid var(--paper-text)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: '20px',
        }}
      >
        <span>Add Download</span>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--paper-muted)' }}>
          ✕
        </button>
      </header>

      <div style={PANEL_STYLE}>
        <p style={LABEL_STYLE}>Link</p>
        <input style={FIELD_STYLE} placeholder="Paste link (https://…)" value={url} onChange={e => setUrl(e.target.value)} />

        <p style={LABEL_STYLE}>Destination folder</p>
        <button
          type="button"
          onClick={() => setPicking(true)}
          style={{ ...FIELD_STYLE, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '13px' }}>/{dir}</span>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--paper-accent)' }}>CHANGE ▸</span>
        </button>

        <p style={LABEL_STYLE}>File name — optional</p>
        <input style={FIELD_STYLE} placeholder="Leave blank to use the link's name" value={name} onChange={e => setName(e.target.value)} />

        {isError && (
          <p style={{ color: 'var(--paper-danger)', fontSize: '13px', margin: '0 0 12px' }}>
            {error instanceof Error ? error.message : 'Something went wrong.'}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={url.trim() === '' || isPending}
          style={{
            width: '100%',
            padding: '12px',
            border: 'none',
            borderRadius: '8px',
            background: 'var(--paper-accent)',
            color: '#fff',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: '16px',
            cursor: 'pointer',
            opacity: url.trim() === '' || isPending ? 0.5 : 1,
          }}
        >
          {isPending ? 'Starting…' : 'Start Download'}
        </button>
      </div>
    </div>
  );
};
