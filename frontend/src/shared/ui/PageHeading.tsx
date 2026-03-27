import type { ReactNode } from 'react';

interface PageHeadingProps {
  children: ReactNode;
}

export const PageHeading = ({ children }: PageHeadingProps) => (
  <h1 className="text-2xl font-semibold text-gray-800 tracking-tight">{children}</h1>
);
