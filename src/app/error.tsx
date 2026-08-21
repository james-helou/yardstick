"use client";

import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main role="alert" className="mx-auto max-w-lg p-8">
      <h1 className="text-lg font-semibold">This page could not load.</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Something upstream did not respond. Nothing was changed, and nothing was saved.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-ink-faint">Reference {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="btn btn-secondary btn-sm mt-4"
      >
        Try again
      </button>
    </main>
  );
}
