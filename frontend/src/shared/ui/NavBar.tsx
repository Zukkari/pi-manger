import { useNavigate, useRouterState } from '@tanstack/react-router';

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
      stroke={active ? '#3b82f6' : '#aeaeb2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 22V12h6v10"
      stroke={active ? '#3b82f6' : '#aeaeb2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FilesIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
      stroke={active ? '#3b82f6' : '#aeaeb2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const NavBar = () => {
  const { location } = useRouterState();
  const navigate = useNavigate();

  const isHome = location.pathname === '/';
  const isFiles = location.pathname.startsWith('/files');

  return (
    <nav className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
      <div className="flex gap-1 bg-white/80 backdrop-blur-md rounded-2xl px-4 py-2 shadow-md ring-1 ring-black/[0.06]">
        <button
          type="button"
          aria-label="Home"
          data-active={isHome || undefined}
          onClick={() => navigate({ to: '/' })}
          className={`flex flex-col items-center gap-1 px-5 py-1.5 rounded-xl transition-colors ${
            isHome ? 'bg-blue-50' : ''
          }`}
        >
          <HomeIcon active={isHome} />
          <span className={isHome ? 'text-[10px] font-bold text-blue-500' : 'text-[10px] font-medium text-gray-400'}>
            Home
          </span>
        </button>

        <button
          type="button"
          aria-label="Files"
          data-active={isFiles || undefined}
          onClick={() => navigate({ to: '/files', search: { parent_id: undefined } })}
          className={`flex flex-col items-center gap-1 px-5 py-1.5 rounded-xl transition-colors ${
            isFiles ? 'bg-blue-50' : ''
          }`}
        >
          <FilesIcon active={isFiles} />
          <span className={isFiles ? 'text-[10px] font-bold text-blue-500' : 'text-[10px] font-medium text-gray-400'}>
            Files
          </span>
        </button>
      </div>
    </nav>
  );
};
