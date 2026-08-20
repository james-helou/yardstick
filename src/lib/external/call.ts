export class ExternalCallError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ExternalCallError";
  }
}

export class ExternalTimeoutError extends ExternalCallError {
  constructor(provider: string, timeoutMs: number) {
    super(provider, `${provider} did not respond within ${timeoutMs}ms`);
    this.name = "ExternalTimeoutError";
  }
}

export class CircuitOpenError extends ExternalCallError {
  constructor(provider: string, reopensInMs: number) {
    super(provider, `${provider} circuit is open, retrying in ${Math.ceil(reopensInMs / 1000)}s`);
    this.name = "CircuitOpenError";
  }
}

export type CallOptions = {
  /** Provider name. Scopes the circuit breaker and appears in every error. */
  name: string;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  jitter?: boolean;
  isRetryable?: (error: unknown) => boolean;
  /** Injected so backoff is testable without fake timers. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected so breaker cooldown is testable. */
  now?: () => number;
  signal?: AbortSignal;
};

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000;

type BreakerState = { failures: number; openedAt: number | null };

const breakers = new Map<string, BreakerState>();

export function resetBreakers(): void {
  breakers.clear();
}

function breakerFor(name: string): BreakerState {
  let state = breakers.get(name);
  if (!state) {
    state = { failures: 0, openedAt: null };
    breakers.set(name, state);
  }
  return state;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  provider: string,
  timeoutMs: number,
  outer?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort(outer?.reason);
  outer?.addEventListener("abort", onOuterAbort, { once: true });

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new ExternalTimeoutError(provider, timeoutMs));
    }, timeoutMs);

    Promise.resolve(fn(controller.signal))
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timer);
        outer?.removeEventListener("abort", onOuterAbort);
      });
  });
}

/**
 * The single door every outbound call goes through: bounded time, bounded retries,
 * exponential backoff, and a per-provider circuit breaker.
 *
 * Nothing here swallows a failure. A caller always learns that the call failed, which is
 * what lets a Suspense boundary render an error instead of a skeleton that never resolves.
 */
export async function callExternal<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: CallOptions,
): Promise<T> {
  const {
    name,
    timeoutMs = 10_000,
    retries = 2,
    baseDelayMs = 250,
    jitter = true,
    isRetryable = () => true,
    sleep = realSleep,
    now = Date.now,
    signal,
  } = options;

  const breaker = breakerFor(name);

  if (breaker.openedAt !== null) {
    const elapsed = now() - breaker.openedAt;
    if (elapsed < COOLDOWN_MS) {
      throw new CircuitOpenError(name, COOLDOWN_MS - elapsed);
    }
    // Half-open: let one call through and judge the provider by its result.
    breaker.openedAt = null;
    breaker.failures = FAILURE_THRESHOLD - 1;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const value = await withTimeout(fn, name, timeoutMs, signal);
      breaker.failures = 0;
      breaker.openedAt = null;
      return value;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === retries) break;
      const delay = baseDelayMs * 2 ** attempt;
      await sleep(jitter ? Math.round(delay * (0.5 + Math.random())) : delay);
    }
  }

  breaker.failures += 1;
  if (breaker.failures >= FAILURE_THRESHOLD) {
    breaker.openedAt = now();
  }
  throw lastError;
}
