import type { ReactNode } from "react";
import type { PageWindow } from "@/lib/list/query";
import { EmptyState } from "./EmptyState";
import { KpiTiles, type KpiTile } from "./KpiTiles";
import { Pagination } from "./Pagination";

export type ListShellProps = {
  title: string;
  /** Plural, lowercase: "prospects", "scans". Used in the empty state and the count. */
  noun: string;
  tiles?: readonly KpiTile[];
  filters?: ReactNode;
  action?: ReactNode;
  search?: string;
  window: PageWindow;
  href: (page: number) => string;
  children: ReactNode;
};

/**
 * The shape every list page in the product takes: summary, then filters, then the
 * table, then a written account of what you are looking at. A list that renders an
 * empty table with no words is a list the reader has to guess about.
 */
export function ListShell({
  title,
  noun,
  tiles,
  filters,
  action,
  search,
  window: w,
  href,
  children,
}: ListShellProps) {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {action}
      </header>

      {tiles?.length ? <KpiTiles tiles={tiles} /> : null}
      {filters ? <div className="flex flex-wrap items-end gap-3">{filters}</div> : null}

      {w.total === 0 ? (
        <EmptyState noun={noun} search={search} action={action} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">{children}</div>
          <Pagination window={w} noun={noun} href={href} />
        </>
      )}
    </section>
  );
}
