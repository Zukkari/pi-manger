import { Trash2, X } from 'lucide-react';

interface SelectionBarProps {
  count: number;
  onDelete: () => void;
  onCancel: () => void;
}

export const SelectionBar = ({ count, onDelete, onCancel }: SelectionBarProps) => (
  <div className="glass-card flex items-center justify-between px-4 py-2">
    <span className="font-ui text-sm font-medium text-ink">
      {count} selected
    </span>
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Delete selected"
        disabled={count === 0}
        onClick={onDelete}
        className="flex items-center gap-1.5 px-4 py-2 min-h-11 rounded-full font-ui text-[13px] font-semibold bg-danger text-white border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <Trash2 size={13} aria-hidden />
        Delete
      </button>
      <button
        type="button"
        aria-label="Cancel selection"
        onClick={onCancel}
        className="w-11 h-11 flex items-center justify-center rounded-full border border-glass bg-surface-hi text-muted hover:text-ink border-solid cursor-pointer transition-colors"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  </div>
);
