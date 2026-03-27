import { Outlet } from '@tanstack/react-router';

export const LayoutMain = () => (
  <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 h-12 flex items-center">
        <span className="text-sm font-semibold text-gray-800 tracking-tight">Pi Manager</span>
      </div>
    </header>
    <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
      <Outlet />
    </main>
  </div>
);
