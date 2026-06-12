export type ChangeType = 'added' | 'removed' | 'grown' | 'shrunk';

export interface FileChange {
  id: number;
  path: string;
  change_type: ChangeType;
  bytes_delta: number;
  detected_at: number;
}
