import Link from "next/link";
import type { SortDirection } from "@/lib/list/query";

export type SortableHeaderProps<Column extends string> = {
  column: Column;
  label: string;
  activeSort: Column;
  activeDirection: SortDirection;
  href: (sort: Column, direction: SortDirection) => string;
  align?: "left" | "right";
};

/**
 * Clicking an unsorted column sorts it ascending; clicking the active column flips it.
 * `aria-sort` carries the same information to a screen reader that the arrow carries
 * visually.
 */
export function SortableHeader<Column extends string>({
  column,
  label,
  activeSort,
  activeDirection,
  href,
  align = "left",
}: SortableHeaderProps<Column>) {
  const isActive = activeSort === column;
  const nextDirection: SortDirection = isActive && activeDirection === "asc" ? "desc" : "asc";

  return (
    <th
      scope="col"
      aria-sort={isActive ? (activeDirection === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}
    >
      <Link href={href(column, nextDirection)} className="inline-flex items-center gap-1 hover:underline">
        {label}
        <span aria-hidden="true" className="text-neutral-400">
          {isActive ? (activeDirection === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}
