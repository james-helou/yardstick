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
    <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm">
      <p className="font-medium text-red-900">{label} could not load.</p>
      <p className="mt-1 text-red-800">
        The data source did not respond. Nothing was lost, and nothing was saved.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded border border-red-400 px-3 py-1 font-medium text-red-900 hover:bg-red-100"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * The fallback owns the deadline. While it is mounted the data has not arrived;
 * when the data arrives React unmounts it and the cleanup cancels the timer.
 * A skeleton therefore cannot outlive its own deadline.
 */
function DeadlineFallback({
  timeoutMs,
  onDeadline,
  children,
}: {
  timeoutMs: number;
  onDeadline: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const timer = setTimeout(onDeadline, timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs, onDeadline]);
  return children;
}

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
 */
export function GuardedSuspense({
  label,
  fallback,
  timeoutMs = 15_000,
  children,
}: GuardedSuspenseProps) {
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  const retry = useCallback(() => {
    setTimedOut(false);
    setAttempt((n) => n + 1);
  }, []);

  // Stable, so a parent re-render cannot silently restart the deadline.
  const onDeadline = useCallback(() => setTimedOut(true), []);

  if (timedOut) return <SectionError label={label} onRetry={retry} />;

  return (
    <RenderErrorBoundary key={attempt} label={label} onRetry={retry}>
      <Suspense
        fallback={
          <DeadlineFallback timeoutMs={timeoutMs} onDeadline={onDeadline}>
            {fallback}
          </DeadlineFallback>
        }
      >
        {children}
      </Suspense>
    </RenderErrorBoundary>
  );
}
