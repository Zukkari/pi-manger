import { describe, expect, it } from 'vitest';

import type { FileEntry } from '../files.types';

import { sortEntries } from './sortEntries';
import type { SortState } from './sortEntries';

const entry = (over: Partial<FileEntry>): FileEntry => ({
  id: 1, parent_id: null, name: 'x', path: '/x', size: 0,
  is_dir: false, modified_at: 0, ...over,
});

const byName = (s: SortState) =>
  sortEntries(
    [
      entry({ id: 1, name: 'beta.txt', size: 50, modified_at: 30 }),
      entry({ id: 2, name: 'docs', is_dir: true, modified_at: 10 }),
      entry({ id: 3, name: 'alpha.txt', size: 200, modified_at: 20 }),
      entry({ id: 4, name: 'archive', is_dir: true, modified_at: 40 }),
    ],
    s,
  ).map(e => e.name);

describe('sortEntries', () => {
  it('keeps directories first regardless of sort key', () => {
    expect(byName({ key: 'name', dir: 'asc' })).toEqual(['archive', 'docs', 'alpha.txt', 'beta.txt']);
    expect(byName({ key: 'size', dir: 'desc' })).toEqual(['archive', 'docs', 'alpha.txt', 'beta.txt']);
  });

  it('sorts by name descending within groups', () => {
    expect(byName({ key: 'name', dir: 'desc' })).toEqual(['docs', 'archive', 'beta.txt', 'alpha.txt']);
  });

  it('sorts by modified date', () => {
    expect(byName({ key: 'modified', dir: 'asc' })).toEqual(['docs', 'archive', 'alpha.txt', 'beta.txt']);
  });

  it('does not mutate the input array', () => {
    const input = [entry({ id: 1, name: 'b' }), entry({ id: 2, name: 'a' })];
    sortEntries(input, { key: 'name', dir: 'asc' });
    expect(input.map(e => e.name)).toEqual(['b', 'a']);
  });
});
