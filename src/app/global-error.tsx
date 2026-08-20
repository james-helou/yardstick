"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main role="alert" style={{ maxWidth: "32rem", margin: "4rem auto", padding: "0 1rem" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Yardstick could not start.</h1>
          <p style={{ marginTop: "0.5rem", color: "#525252" }}>
            The application failed before it could render. Nothing was changed.
          </p>
          {error.digest ? (
            <p style={{ marginTop: "0.5rem", fontFamily: "monospace", fontSize: "0.75rem" }}>
              Reference {error.digest}
            </p>
          ) : null}
          <button type="button" onClick={reset} style={{ marginTop: "1rem" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
