export interface TopFilesEntry {
  id: number;
  name: string;
  is_dir: boolean;
  size_bytes: number;
}

export interface TopFilesResponse {
  parent_id: number | null;
  parent_path: string | null;
  entries: TopFilesEntry[];
  other_bytes: number;
  total_bytes: number;
}
