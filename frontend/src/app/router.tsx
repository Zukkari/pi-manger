import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { LayoutMain } from '@/layouts/LayoutMain';
import { PageDashboard } from '@/pages/dashboard/PageDashboard';
import { PageFiles } from '@/pages/files/PageFiles';

const rootRoute = createRootRoute({
  component: LayoutMain,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PageDashboard,
});

const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/files',
  validateSearch: (search: Record<string, unknown>) => ({
    parent_id: search.parent_id !== undefined ? Number(search.parent_id) : undefined,
  }),
  component: PageFiles,
});

const routeTree = rootRoute.addChildren([dashboardRoute, filesRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
