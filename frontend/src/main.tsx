import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/iosevka-aile/400.css';
import '@fontsource/iosevka-aile/600.css';
import '@fontsource/iosevka/400.css';
import '@fontsource/iosevka/500.css';

import { QueryProvider } from './app/providers/QueryProvider';
import { router } from './app/router';
import { ThemeProvider } from './shared/theme/ThemeProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryProvider>
        <RouterProvider router={router} />
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
);
