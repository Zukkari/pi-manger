export interface FileEntry {
  id: number;
  parent_id: number | null;
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  modified_at: number;
}
