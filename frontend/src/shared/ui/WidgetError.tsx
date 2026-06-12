import { GlassCard } from './GlassCard';

interface WidgetErrorProps {
  message: string;
  onRetry?: () => void;
}

export const WidgetError = ({ message, onRetry }: WidgetErrorProps) => (
  <GlassCard className="p-6">
    <p className="font-ui text-sm text-danger m-0">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 px-4 py-1.5 rounded-full border border-glass bg-surface-hi font-ui text-xs font-semibold text-ink hover:text-accent transition-colors cursor-pointer"
      >
        Retry
      </button>
    )}
  </GlassCard>
);
