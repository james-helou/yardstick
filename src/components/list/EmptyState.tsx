import type { ReactNode } from "react";

export type EmptyStateProps = {
  /** Plural, lowercase: "prospects", "scans", "proposals". */
  noun: string;
  /** Present when the list is empty because of a search rather than because it is new. */
  search?: string;
  onClearSearch?: () => void;
  action?: ReactNode;
};

/**
 * An empty table with no explanation reads as a bug. These two cases mean different
 * things to the reader and get different words: nothing exists yet, versus nothing
 * matched what you typed.
 */
export function EmptyState({ noun, search, onClearSearch, action }: EmptyStateProps) {
  if (search) {
    return (
      <div className="rounded-md border border-dashed border-line px-6 py-10 text-center">
        <p className="font-medium">
          No {noun} match “{search}”.
        </p>
        <p className="mt-1 text-ink-muted">Try a shorter term, or check the spelling.</p>
        {onClearSearch ? (
          <button
            type="button"
            onClick={onClearSearch}
            className="btn btn-secondary btn-sm mt-4"
          >
            Clear search
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">No {noun} yet.</p>
      <p className="mt-1 text-ink-muted">They will appear here as soon as there are any.</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
