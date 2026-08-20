import { env } from "@/lib/env";
import { dataForSeoRanks } from "./dataforseo";
import type { RankProvider } from "./types";

export type { RankProvider, RankQuery } from "./types";

/**
 * Rank data is the expensive half of the product, so it stays off until both halves of
 * the credential exist. Null means the grid pillar reports itself unmeasured, which is
 * honest, rather than reporting a business as invisible when nobody looked.
 */
export function rankProvider(): RankProvider | null {
  const { DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD } = env();
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) return null;
  return dataForSeoRanks({ login: DATAFORSEO_LOGIN, password: DATAFORSEO_PASSWORD });
}
