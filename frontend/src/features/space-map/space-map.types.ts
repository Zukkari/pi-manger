export interface UsageChild {
  id: number;
  name: string;
  is_dir: boolean;
  total_bytes: number;
}

export interface DirectoryUsage {
  parent_id: number | null;
  parent_path: string | null;
  children: UsageChild[];
}
