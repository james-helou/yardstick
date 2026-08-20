import { callExternal, ExternalCallError, type CallOptions } from "@/lib/external/call";
import type { RankProvider, RankQuery } from "./types";

const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";
const PROVIDER = "dataforseo";
/** Tight enough that the result is local, wide enough to hold a full pack. */
const ZOOM = 14;
const DEPTH = 20;

export class RankRequestError extends ExternalCallError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(PROVIDER, message);
    this.name = "RankRequestError";
  }
}

type MapsItem = {
  rank_absolute?: number;
  place_id?: string;
  cid?: string;
  title?: string;
};

type MapsResponse = {
  status_code?: number;
  status_message?: string;
  tasks?: {
    status_code?: number;
    status_message?: string;
    result?: { items?: MapsItem[] }[];
  }[];
};

const normalise = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Finds our listing among the results. The place id is exact and is tried first; the
 * name is a fallback, normalised, because a provider's spelling of a business rarely
 * matches ours character for character.
 */
export function findRank(items: readonly MapsItem[], target: { placeId?: string | null; name: string }): number | null {
  if (target.placeId) {
    const byId = items.find((i) => i.place_id === target.placeId || i.cid === target.placeId);
    if (byId?.rank_absolute) return byId.rank_absolute;
  }

  const wanted = normalise(target.name);
  const byName = items.find((i) => i.title && normalise(i.title) === wanted);
  if (byName?.rank_absolute) return byName.rank_absolute;

  const contains = items.find((i) => i.title && normalise(i.title).includes(wanted));
  return contains?.rank_absolute ?? null;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof RankRequestError) return error.status === 429 || error.status >= 500;
  return true;
}

export type DataForSeoOptions = {
  login: string;
  password: string;
  fetchImpl?: typeof fetch;
  call?: Partial<CallOptions>;
};

export function dataForSeoRanks({
  login,
  password,
  fetchImpl = fetch,
  call,
}: DataForSeoOptions): RankProvider {
  // Basic auth, built once. The credentials never appear in a URL.
  const authorization = `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;

  return {
    name: PROVIDER,
    async rankAt(query: RankQuery): Promise<number | null> {
      const payload = await callExternal(
        async (signal) => {
          const response = await fetchImpl(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authorization },
            body: JSON.stringify([
              {
                keyword: query.keyword,
                location_coordinate: `${query.latitude},${query.longitude},${ZOOM}`,
                language_code: "en",
                device: "mobile",
                depth: DEPTH,
              },
            ]),
            signal,
          });

          if (!response.ok) {
            throw new RankRequestError(response.status, `Rank lookup failed with ${response.status}`);
          }

          const body = (await response.json()) as MapsResponse;
          const task = body.tasks?.[0];
          // The transport succeeded and the task still failed. Treating that as success
          // would silently report every point as unranked, which reads as a real result.
          if (task?.status_code && task.status_code >= 40000) {
            throw new RankRequestError(502, `Rank task failed: ${task.status_message ?? task.status_code}`);
          }
          return task?.result?.[0]?.items ?? [];
        },
        { name: PROVIDER, timeoutMs: 30_000, isRetryable, signal: query.signal, ...call },
      );

      return findRank(payload, { placeId: query.placeId, name: query.name });
    },
  };
}
