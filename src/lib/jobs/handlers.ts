import type { JobHandlers } from "./worker";

/**
 * Every job kind the worker knows how to run. A kind that is enqueued but missing here
 * is buried immediately with a clear message rather than retried, so a forgotten
 * registration surfaces as a failed job instead of a silent backlog.
 */
export const handlers: JobHandlers = {};
