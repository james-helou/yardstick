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
      <div className="rounded-md border border-dashed p-8 text-center text-sm">
        <p className="font-medium">
          No {noun} match “{search}”.
        </p>
        <p className="mt-1 text-neutral-600">Try a shorter term, or check the spelling.</p>
        {onClearSearch ? (
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-3 rounded border px-3 py-1 font-medium hover:bg-neutral-50"
          >
            Clear search
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed p-8 text-center text-sm">
      <p className="font-medium">No {noun} yet.</p>
      <p className="mt-1 text-neutral-600">They will appear here as soon as there are any.</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
