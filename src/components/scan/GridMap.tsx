import { RANK_HORIZON } from "@/lib/scans/geogrid";

export type GridCell = { latitude: number; longitude: number; rank: number | null };

function tone(rank: number | null): string {
  if (rank === null || rank > RANK_HORIZON) return "bg-band-critical-soft text-band-critical border-band-critical-line";
  if (rank <= 3) return "bg-band-strong-soft text-band-strong border-band-strong-line";
  if (rank <= 10) return "bg-band-fair-soft text-band-fair border-band-fair-line";
  return "bg-band-weak-soft text-band-weak border-band-weak-line";
}

/**
 * The grid as the searcher sees it: one cell per point, north at the top. A number is
 * the position; a dash means the business did not appear at all, which is the cell an
 * agency points at on a call.
 */
export function GridMap({ points, keyword }: { points: readonly GridCell[]; keyword?: string }) {
  const size = Math.round(Math.sqrt(points.length));
  if (size < 2 || size * size !== points.length) return null;

  return (
    <figure className="flex flex-col gap-2">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        role="img"
        aria-label={
          keyword
            ? `Rank grid for "${keyword}", ${size} by ${size} points`
            : `Rank grid, ${size} by ${size} points`
        }
      >
        {points.map((point, index) => (
          <div
            key={`${point.latitude},${point.longitude},${index}`}
            className={`flex aspect-square items-center justify-center rounded border text-xs font-medium tabular-nums ${tone(point.rank)}`}
            title={`${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`}
          >
            {point.rank === null || point.rank > RANK_HORIZON ? "–" : point.rank}
          </div>
        ))}
      </div>
      <figcaption className="text-xs text-ink-muted">
        Position in the map pack when searching from each point. A dash means the business does
        not appear at all.
      </figcaption>
    </figure>
  );
}
