import { Search, X } from 'lucide-react';

interface FileSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export const FileSearchBar = ({ value, onChange }: FileSearchBarProps) => (
  <div className="relative">
    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
    <input
      type="search"
      role="searchbox"
      aria-label="Search files"
      placeholder="Search all files…"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full box-border pl-9 pr-9 py-2.5 rounded-xl border border-glass bg-surface-hi font-ui text-sm text-ink outline-none focus:border-accent transition-colors [&::-webkit-search-cancel-button]:hidden"
    />
    {value !== '' && (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange('')}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-transparent border-none cursor-pointer text-muted hover:text-ink transition-colors"
      >
        <X size={14} aria-hidden />
      </button>
    )}
  </div>
);
