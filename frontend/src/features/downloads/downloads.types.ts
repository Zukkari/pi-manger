export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed';

export interface DownloadJob {
  id: string;
  url: string;
  dir: string;
  name: string;
  status: DownloadStatus;
  bytes_downloaded: number;
  total_bytes: number;
  error: string;
  created_at: number;
  finished_at: number;
}

export interface CreateDownloadInput {
  url: string;
  dir: string;
  name?: string;
}

export interface FolderEntry {
  id: number;
  name: string;
}
