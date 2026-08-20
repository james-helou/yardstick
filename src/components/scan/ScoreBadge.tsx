import { BAND_LABEL, band } from "@/lib/scans/score";

const TONE: Record<ReturnType<typeof band>, string> = {
  strong: "bg-green-50 text-green-800 border-green-200",
  fair: "bg-amber-50 text-amber-900 border-amber-200",
  weak: "bg-orange-50 text-orange-900 border-orange-200",
  critical: "bg-red-50 text-red-800 border-red-200",
};

/** The number and the word for it. A bare number invites the wrong reaction. */
export function ScoreBadge({ score, size = "small" }: { score: number | null; size?: "small" | "large" }) {
  if (score === null) {
    return (
      <span className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-600">
        Not scored
      </span>
    );
  }

  const tone = TONE[band(score)];

  if (size === "large") {
    return (
      <div className={`flex items-baseline gap-3 rounded-lg border px-5 py-4 ${tone}`}>
        <span className="text-4xl font-semibold tabular-nums">{score}</span>
        <span className="text-sm">out of 100 · {BAND_LABEL[band(score)]}</span>
      </div>
    );
  }

  return (
    <span className={`rounded border px-2 py-1 text-sm font-medium tabular-nums ${tone}`}>{score}</span>
  );
}
