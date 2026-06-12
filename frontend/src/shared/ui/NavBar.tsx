import { useNavigate, useRouterState } from '@tanstack/react-router';

const tabClass = (active: boolean): string =>
  'font-ui text-sm font-semibold tracking-wide px-4 py-1.5 rounded-full border transition-colors cursor-pointer ' +
  (active
    ? 'bg-surface-hi text-accent border-glass'
    : 'bg-transparent text-muted border-transparent hover:text-ink');

export const NavBar = () => {
  const { location } = useRouterState();
  const navigate = useNavigate();

  const isHome  = location.pathname === '/';
  const isFiles = location.pathname.startsWith('/files');

  return (
    <div className="border-b border-glass">
      <div className="max-w-md mx-auto flex gap-2 px-5 py-2">
        <button
          type="button"
          aria-label="Home"
          aria-current={isHome ? 'page' : undefined}
          onClick={() => navigate({ to: '/' })}
          className={tabClass(isHome)}
        >
          Home
        </button>
        <button
          type="button"
          aria-label="Files"
          aria-current={isFiles ? 'page' : undefined}
          onClick={() => navigate({ to: '/files', search: { parent_id: undefined } })}
          className={tabClass(isFiles)}
        >
          Files
        </button>
      </div>
    </div>
  );
};
