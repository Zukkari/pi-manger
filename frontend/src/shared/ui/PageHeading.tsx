import type { ReactNode } from 'react';

interface PageHeadingProps {
  children: ReactNode;
}

export const PageHeading = ({ children }: PageHeadingProps) => (
  <h1 className="font-ui text-2xl font-semibold tracking-tight text-ink">{children}</h1>
);
