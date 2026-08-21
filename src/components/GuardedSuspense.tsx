"use client";

import { Component, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";

type BoundaryProps = {
  label: string;
  onRetry: () => void;
  children: ReactNode;
};

class RenderErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <SectionError label={this.props.label} onRetry={this.props.onRetry} />;
    }
    return this.props.children;
  }
}

function SectionError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-band-critical-line bg-band-critical-soft p-4">
      <p className="font-medium text-band-critical">{label} could not load.</p>
      <p className="mt-1 text-band-critical">
        The data source did not respond. Nothing was lost, and nothing was saved.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="btn btn-danger btn-sm mt-3"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * Renders nothing. Its only job is to report that the boundary's contents committed.
 *
 * It sits INSIDE the Suspense boundary, so it cannot mount until the content it is
 * paired with has arrived — including the case where the content arrives from a
 * server stream long after hydration.
 */
function ResolvedSignal({ onResolved }: { onResolved: () => void }) {
  useEffect(() => {
    onResolved();
  }, [onResolved]);
  return null;
}

type Status = "pending" | "resolved" | "timedOut";

export type GuardedSuspenseProps = {
  /** Names the section in the error message, so the reader knows what failed. */
  label: string;
  fallback: ReactNode;
  timeoutMs?: number;
  children: ReactNode;
};

/**
 * Suspense with two guarantees the bare version does not give you: a render error
 * becomes a visible, retryable message, and a pending state that runs past its
 * deadline does too. A shimmer that never resolves is a bug, not a loading state.
 *
 * The deadline lives here, in the component that always mounts, rather than in the
 * fallback. During hydration React keeps the server-rendered fallback markup and
 * never mounts a client fallback component, so a timer owned by the fallback would
 * never start for the one case that matters most: a boundary that was already
 * pending when the HTML was streamed.
 */
export function GuardedSuspense({
  label,
  fallback,
  timeoutMs = 15_000,
  children,
}: GuardedSuspenseProps) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("pending");

  const retry = useCallback(() => {
    setStatus("pending");
    setAttempt((n) => n + 1);
  }, []);

  // Child effects run before parent effects, so content that is already present at
  // hydration reports itself resolved before the timer below is ever armed.
  const onResolved = useCallback(() => {
    setStatus((current) => (current === "pending" ? "resolved" : current));
  }, []);

  useEffect(() => {
    if (status !== "pending") return;
    const timer = setTimeout(() => setStatus("timedOut"), timeoutMs);
    return () => clearTimeout(timer);
  }, [status, timeoutMs, attempt]);

  if (status === "timedOut") return <SectionError label={label} onRetry={retry} />;

  return (
    <RenderErrorBoundary key={attempt} label={label} onRetry={retry}>
      <Suspense fallback={fallback}>
        {children}
        <ResolvedSignal onResolved={onResolved} />
      </Suspense>
    </RenderErrorBoundary>
  );
}
