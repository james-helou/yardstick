"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * A scan finishes on a worker, not in this request, so the page has to go and look. It
 * polls only while the scan is unfinished and stops the moment it is, which keeps a
 * completed report from holding a timer open forever.
 */
export function ScanProgress({ done, everyMs = 3000 }: { done: boolean; everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [done, everyMs, router]);

  if (done) return null;

  return (
    <p role="status" className="text-sm text-ink-muted">
      Pillars land here as each one finishes. This page updates itself.
    </p>
  );
}
