import { Monitor, Moon, Sun } from 'lucide-react';

import type { ThemePreference } from './ThemeProvider';
import { useTheme } from './ThemeProvider';

const PREFERENCE_LABEL: Record<ThemePreference, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

const PREFERENCE_ICON: Record<ThemePreference, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export const ThemeToggle = () => {
  const { preference, cyclePreference } = useTheme();
  const Icon = PREFERENCE_ICON[preference];

  return (
    <button
      type="button"
      aria-label={`${PREFERENCE_LABEL[preference]} — switch theme`}
      title={PREFERENCE_LABEL[preference]}
      onClick={cyclePreference}
      className="w-8 h-8 flex items-center justify-center rounded-full border border-glass bg-surface-hi text-muted hover:text-ink transition-colors cursor-pointer"
    >
      <Icon size={15} aria-hidden />
    </button>
  );
};
