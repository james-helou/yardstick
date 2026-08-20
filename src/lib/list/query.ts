/** Backend pagination, twenty rows a page, everywhere. */
export const PAGE_SIZE = 20;

export type SortDirection = "asc" | "desc";

export type ListSpec<Column extends string> = {
  /**
   * The only columns a caller may sort by. Anything outside this list is discarded
   * rather than corrected, because the alternative is interpolating user input into
   * an ORDER BY clause.
   */
  readonly sortable: readonly Column[];
  readonly defaultSort: Column;
  readonly defaultDirection?: SortDirection;
};

export type ListQuery<Column extends string> = {
  page: number;
  sort: Column;
  direction: SortDirection;
  search: string;
};

/** Next hands searchParams over as a plain record; a URLSearchParams is easier to test. */
export type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: RawParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parseListQuery<Column extends string>(
  params: RawParams,
  spec: ListSpec<Column>,
): ListQuery<Column> {
  const defaultDirection = spec.defaultDirection ?? "desc";

  const rawSort = read(params, "sort");
  const sort = spec.sortable.includes(rawSort as Column) ? (rawSort as Column) : spec.defaultSort;

  const rawDirection = read(params, "dir");
  const direction: SortDirection =
    rawDirection === "asc" || rawDirection === "desc" ? rawDirection : defaultDirection;

  const rawPage = Number.parseInt(read(params, "page") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const search = (read(params, "q") ?? "").trim().replace(/\s+/g, " ");

  return { page, sort, direction, search };
}

/** Serialises back to a URL, omitting anything already at its default. */
export function toSearchParams<Column extends string>(
  query: ListQuery<Column>,
  spec: ListSpec<Column>,
): URLSearchParams {
  const defaultDirection = spec.defaultDirection ?? "desc";
  const params = new URLSearchParams();
  if (query.page > 1) params.set("page", String(query.page));
  if (query.sort !== spec.defaultSort) params.set("sort", query.sort);
  if (query.direction !== defaultDirection) params.set("dir", query.direction);
  if (query.search) params.set("q", query.search);
  return params;
}

export type PageWindow = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  offset: number;
  limit: number;
  /** 1-indexed, inclusive, for "showing 41 to 60 of 95". Both 0 when there is nothing. */
  from: number;
  to: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

/**
 * Resolves a requested page against a known total. A page past the end clamps back
 * onto the last page rather than rendering an empty table the reader cannot explain.
 */
export function pageWindow(input: {
  total: number;
  page: number;
  pageSize?: number;
}): PageWindow {
  const pageSize = input.pageSize ?? PAGE_SIZE;
  const total = Math.max(0, input.total);
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(Math.max(1, input.page), Math.max(1, totalPages));
  const offset = total === 0 ? 0 : (page - 1) * pageSize;

  return {
    total,
    page,
    pageSize,
    totalPages,
    offset,
    limit: pageSize,
    from: total === 0 ? 0 : offset + 1,
    to: total === 0 ? 0 : Math.min(offset + pageSize, total),
    hasPrevious: total > 0 && page > 1,
    hasNext: total > 0 && page < totalPages,
  };
}

/** Maps a whitelisted column to its SQL identifier. Values never reach SQL as text. */
export function orderByFragment<Column extends string>(
  query: ListQuery<Column>,
  columns: Record<Column, string>,
): string {
  return `${columns[query.sort]} ${query.direction === "asc" ? "asc" : "desc"}`;
}
