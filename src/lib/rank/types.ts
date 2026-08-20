export type RankQuery = {
  keyword: string;
  latitude: number;
  longitude: number;
  /** The listing we are looking for. The id is exact; the name is the fallback. */
  placeId?: string | null;
  name: string;
  signal?: AbortSignal;
};

/**
 * Where a business appears in the local pack for one search, from one point on the map.
 * Null means it did not appear in the results we looked at, which is worse than any rank.
 */
export interface RankProvider {
  readonly name: string;
  rankAt(query: RankQuery): Promise<number | null>;
}
