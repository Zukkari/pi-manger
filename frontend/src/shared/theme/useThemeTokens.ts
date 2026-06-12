import { useMemo } from 'react';

import { useTheme } from './ThemeProvider';

// Reads computed CSS custom properties so canvas/SVG libraries (recharts) can
// use theme colors. Re-evaluates when the resolved mode flips.
export const useThemeTokens = (names: readonly string[]): Record<string, string> => {
  const { resolvedMode } = useTheme();
  const joined = names.join(',');

  return useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      joined.split(',').map(name => [name, styles.getPropertyValue(name).trim()]),
    );
  }, [resolvedMode, joined]); // eslint-disable-line react-hooks/exhaustive-deps -- resolvedMode invalidates the computed styles
};
