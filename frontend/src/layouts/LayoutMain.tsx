import { Outlet } from '@tanstack/react-router';

import { NavBar } from '@/shared/ui/NavBar';

export const LayoutMain = () => (
  <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      backgroundColor: 'var(--paper-bg)',
      backgroundImage: 'var(--paper-bg-texture)',
      borderBottom: '3px solid var(--paper-text)',
    }}>
      <div style={{
        maxWidth: '440px',
        margin: '0 auto',
        padding: '16px 20px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--paper-text)',
        }}>
          Pi Manager
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span className="live-dot" aria-hidden="true" />
          <span style={{
            fontFamily: 'var(--font-data)',
            fontSize: '10px',
            color: 'var(--paper-muted)',
            letterSpacing: '0.05em',
          }}>
            LIVE
          </span>
        </div>
      </div>
    </header>
    <NavBar />
    <main style={{
      flex: 1,
      maxWidth: '440px',
      margin: '0 auto',
      width: '100%',
      padding: '24px 20px 40px',
    }}>
      <Outlet />
    </main>
  </div>
);
