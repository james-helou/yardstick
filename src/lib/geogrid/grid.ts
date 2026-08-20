/** A square of search points centred on the business, in kilometres. */
export type GridSpec = {
  center: { latitude: number; longitude: number };
  radiusKm: number;
  /** Points a side. Odd, so the business's own location is always measured. */
  size: number;
};

export type GridPointSpec = {
  row: number;
  col: number;
  latitude: number;
  longitude: number;
  /** Straight-line distance from the centre, in kilometres. */
  distanceKm: number;
};

export const DEFAULT_GRID: Pick<GridSpec, "radiusKm" | "size"> = { radiusKm: 3, size: 5 };

const KM_PER_DEGREE_LAT = 110.574;
const KM_PER_DEGREE_LNG = 111.32;
const MAX_SIZE = 9;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Lays out the grid. Longitude degrees shrink as you leave the equator, so the spacing
 * is corrected by the cosine of the latitude. Without that, a grid in Montreal is a
 * third narrower on the ground than it looks on paper, and the coverage claim is wrong.
 */
export function buildGrid(spec: GridSpec): GridPointSpec[] {
  const { center, radiusKm, size } = spec;

  if (!Number.isInteger(size) || size < 3 || size > MAX_SIZE || size % 2 === 0) {
    throw new Error(`A grid must be an odd number of points a side, 3 to ${MAX_SIZE}`);
  }
  if (!(radiusKm > 0)) throw new Error("A grid needs a radius");

  const step = (radiusKm * 2) / (size - 1);
  const half = (size - 1) / 2;
  const latRadians = (center.latitude * Math.PI) / 180;
  const kmPerDegreeLng = KM_PER_DEGREE_LNG * Math.max(0.01, Math.cos(latRadians));

  const points: GridPointSpec[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const northKm = (half - row) * step;
      const eastKm = (col - half) * step;
      points.push({
        row,
        col,
        latitude: round6(center.latitude + northKm / KM_PER_DEGREE_LAT),
        longitude: round6(center.longitude + eastKm / kmPerDegreeLng),
        distanceKm: Math.round(Math.hypot(northKm, eastKm) * 100) / 100,
      });
    }
  }
  return points;
}
