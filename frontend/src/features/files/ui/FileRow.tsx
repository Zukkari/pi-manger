import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { FileEntry } from '../files.types';

const formatFileSize = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${bytes} B`;
};

const formatDate = (unixSec: number): string =>
  new Date(unixSec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
      stroke="var(--paper-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const FileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
      stroke="var(--paper-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
    <polyline points="14 2 14 8 20 8" stroke="var(--paper-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);


const iconBoxStyle = (isDir: boolean): CSSProperties => ({
  width: '28px',
  height: '28px',
  border: '1px solid var(--paper-border)',
  borderRadius: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  background: isDir ? 'color-mix(in srgb, var(--paper-accent) 6%, transparent)' : 'transparent',
});

type FileRowProps =
  | { isParent: true; onParentClick: () => void; entry?: never; onClick?: never; onDelete?: never; index?: number }
  | { isParent?: false; entry: FileEntry; onClick: (entry: FileEntry) => void; onParentClick?: never; onDelete: (entry: FileEntry) => void; index?: number };

export const FileRow = ({ isParent, entry, onClick, onParentClick, onDelete, index }: FileRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    minHeight: '44px',
    borderBottom: '1px solid var(--paper-border)',
    transition: 'background 0.1s',
    background: hovered ? 'color-mix(in srgb, var(--paper-accent) 4%, transparent)' : 'transparent',
    animation: 'paper-slide-in 0.35s cubic-bezier(0.22,1,0.36,1) both',
    animationDelay: `${(index ?? 0) * 50}ms`,
  };

  if (isParent) {
    return (
      <button
        type="button"
        onClick={onParentClick}
        aria-label="Go to parent directory"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ ...rowStyle, width: '100%', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={iconBoxStyle(true)}>
          <FolderIcon />
        </div>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '14px', color: 'var(--paper-muted)' }}>
          ..
        </span>
      </button>
    );
  }

  const nameAndMeta = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontFamily: 'var(--font-ui)',
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--paper-text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {entry.name}
      </div>
    </div>
  );

  return (
    <div
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {entry.is_dir ? (
        <button
          type="button"
          onClick={() => onClick(entry)}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
        >
          <div style={iconBoxStyle(true)}><FolderIcon /></div>
          {nameAndMeta}
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          <div style={iconBoxStyle(false)}><FileIcon /></div>
          {nameAndMeta}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '12px', color: 'var(--paper-muted)', fontWeight: 500 }}>
          {entry.is_dir ? '—' : formatFileSize(entry.size)}
        </span>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '10px', color: 'var(--paper-dim)' }}>
          {formatDate(entry.modified_at)}
        </span>
      </div>

      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          className="paper-row-menu-btn"
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: '16px',
            color: 'var(--paper-muted)',
            opacity: hovered ? 1 : 0.25,
            transition: 'opacity 0.1s',
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="File actions"
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              zIndex: 10,
              background: 'var(--paper-surface-hi)',
              border: '1px solid var(--paper-border-bold)',
              boxShadow: '3px 3px 0 var(--paper-border-bold)',
              minWidth: '120px',
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { onDelete(entry); setMenuOpen(false); }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: '13px',
                color: 'var(--paper-danger)',
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
