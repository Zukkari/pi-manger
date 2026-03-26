import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import LayoutMain from '@/layouts/LayoutMain';
import PageDashboard from '@/pages/dashboard/PageDashboard';

const rootRoute = createRootRoute({
  component: LayoutMain,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PageDashboard,
});

const routeTree = rootRoute.addChildren([dashboardRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
