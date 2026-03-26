export interface DiskUsage {
  path: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number;
}
