import type { ReactNode } from 'react';

interface LayoutDashboardProps {
  children: ReactNode;
}

export const LayoutDashboard = ({ children }: LayoutDashboardProps) => (
  <div className="flex flex-col gap-6">{children}</div>
);
