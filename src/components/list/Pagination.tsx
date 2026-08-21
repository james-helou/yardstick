import Link from "next/link";
import type { PageWindow } from "@/lib/list/query";

export type PaginationProps = {
  window: PageWindow;
  noun: string;
  href: (page: number) => string;
};

/** Renders nothing when there is only one page — a lone "Page 1 of 1" is noise. */
export function Pagination({ window: w, noun, href }: PaginationProps) {
  if (w.totalPages <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-4 text-sm" aria-label="Pagination">
      <p className="text-xs tabular-nums text-ink-muted">
        Showing {w.from} to {w.to} of {w.total} {noun}
      </p>
      <div className="flex gap-2">
        {w.hasPrevious ? (
          <Link href={href(w.page - 1)} className="rounded border px-3 py-1 hover:bg-surface-2">
            Previous
          </Link>
        ) : null}
        {w.hasNext ? (
          <Link href={href(w.page + 1)} className="rounded border px-3 py-1 hover:bg-surface-2">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
