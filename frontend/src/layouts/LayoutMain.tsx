import { Outlet } from '@tanstack/react-router';

import { ThemeToggle } from '@/shared/theme/ThemeToggle';
import { NavBar } from '@/shared/ui/NavBar';

export const LayoutMain = () => (
  <div className="min-h-screen flex flex-col">
    <header className="sticky top-0 z-10 bg-surface backdrop-blur-xl border-b border-glass">
      <div className="max-w-md mx-auto px-5 pt-4 pb-3 flex items-center justify-between">
        <span className="font-ui text-lg font-semibold tracking-wide text-ink">
          Pi Manager
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="live-dot" aria-hidden="true" />
            <span className="font-data text-[10px] tracking-widest text-muted">LIVE</span>
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
    <NavBar />
    <main className="flex-1 max-w-md mx-auto w-full px-5 pt-6 pb-10">
      <Outlet />
    </main>
  </div>
);
