import { apiClient } from '@/shared/api/client';

import type { CreateDownloadInput, DownloadJob } from '../downloads.types';

export const fetchDownloads = (): Promise<DownloadJob[]> => apiClient<DownloadJob[]>('/downloads');

// postDownload uses fetch directly (not apiClient) so it can surface the
// server's validation message from a 422 response body to the form.
export const postDownload = async (input: CreateDownloadInput): Promise<DownloadJob> => {
  const response = await fetch('/api/downloads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<DownloadJob>;
};
