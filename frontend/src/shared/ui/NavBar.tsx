import type { CSSProperties } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';

const tabStyle = (active: boolean): CSSProperties => ({
  fontFamily: 'var(--font-display)',
  fontSize: '17px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  padding: '8px 16px 10px',
  background: 'none',
  border: 'none',
  borderBottom: active ? '3px solid var(--paper-accent)' : '3px solid transparent',
  marginBottom: '-1px',
  color: active ? 'var(--paper-accent)' : 'var(--paper-muted)',
  cursor: 'pointer',
  transition: 'color 0.15s',
});

export const NavBar = () => {
  const { location } = useRouterState();
  const navigate = useNavigate();

  const isHome  = location.pathname === '/';
  const isFiles = location.pathname.startsWith('/files');

  return (
    <div style={{ borderBottom: '1px solid var(--paper-border)' }}>
      <div style={{ maxWidth: '440px', margin: '0 auto', display: 'flex' }}>
        <button
          type="button"
          aria-label="Home"
          aria-current={isHome ? 'page' : undefined}
          onClick={() => navigate({ to: '/' })}
          style={tabStyle(isHome)}
        >
          Home
        </button>
        <button
          type="button"
          aria-label="Files"
          aria-current={isFiles ? 'page' : undefined}
          onClick={() => navigate({ to: '/files', search: { parent_id: undefined } })}
          style={tabStyle(isFiles)}
        >
          Files
        </button>
      </div>
    </div>
  );
};
