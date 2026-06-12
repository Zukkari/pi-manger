import type { HTMLAttributes } from 'react';

type GlassCardProps = HTMLAttributes<HTMLDivElement>;

export const GlassCard = ({ className, ...props }: GlassCardProps) => (
  <div className={className ? `glass-card ${className}` : 'glass-card'} {...props} />
);
