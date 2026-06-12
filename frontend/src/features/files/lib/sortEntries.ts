import type { FileEntry } from '../files.types';

export type SortKey = 'name' | 'size' | 'modified';
export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: SortState = { key: 'name', dir: 'asc' };

const compareBy = (key: SortKey, a: FileEntry, b: FileEntry): number => {
  switch (key) {
    case 'size':
      return a.size - b.size;
    case 'modified':
      return a.modified_at - b.modified_at;
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }
};

// Directories always sort before files (standard file-manager behavior);
// the chosen key and direction apply within each group. When the primary key
// ties, name ascending is used as a stable secondary sort.
export const sortEntries = (entries: FileEntry[], sort: SortState): FileEntry[] =>
  [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    const cmp = compareBy(sort.key, a, b);
    if (cmp !== 0) return sort.dir === 'asc' ? cmp : -cmp;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
