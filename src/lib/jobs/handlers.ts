import { aiProvider } from "@/lib/ai";
import { placesProvider } from "@/lib/places";
import { rankProvider } from "@/lib/rank";
import { scanHandlers } from "@/lib/scans/runner";
import type { JobHandlers } from "./worker";

/**
 * Every job kind the worker knows how to run. A kind that is enqueued but missing here
 * is buried immediately with a clear message rather than retried, so a forgotten
 * registration surfaces as a failed job instead of a silent backlog.
 *
 * Providers are resolved once, at registration. `placesProvider()` returns null without
 * a key, which is what turns two of the three pillars into a reported skip rather than
 * an error.
 */
export const handlers: JobHandlers = {
  ...scanHandlers({ places: placesProvider(), ranks: rankProvider(), ai: aiProvider() }),
};
