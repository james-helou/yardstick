import { BAND_LABEL, band } from "@/lib/scans/score";

type Band = ReturnType<typeof band>;

const CHIP: Record<Band, string> = {
  strong: "chip-strong",
  fair: "chip-fair",
  weak: "chip-weak",
  critical: "chip-critical",
};

const INK: Record<Band, string> = {
  strong: "var(--strong)",
  fair: "var(--fair)",
  weak: "var(--weak)",
  critical: "var(--critical)",
};

/**
 * The scale a reading sits against.
 *
 * A number on its own says nothing about where it falls, so every large score gets a
 * track with the halfway tick marked. The tick is brass because it is structure; the
 * fill is the band's colour because it is the reading.
 */
const TICKS = [0, 50, 100] as const;

/** Where a tick sits relative to its own mark, so the ends stay inside the track. */
const SHIFT = ["translateX(0)", "translateX(-50%)", "translateX(-100%)"];

/**
 * The scale a reading sits against.
 *
 * A number on its own says nothing about where it falls, so every large score gets a
 * track with the ends and the middle marked. The ticks are brass because they are the
 * instrument; the fill is the band's colour because it is the reading. They never
 * overlap, so a high score cannot paint over its own scale.
 */
function Scale({ score, tone }: { score: number; tone: Band }) {
  return (
    <div>
      <div className="relative h-2 overflow-hidden rounded-full border border-line bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(1, Math.min(100, score))}%`, background: INK[tone] }}
        />
      </div>
      <div className="relative h-5" aria-hidden="true">
        {TICKS.map((tick, index) => (
          <span
            key={tick}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${tick}%`, transform: SHIFT[index] }}
          >
            <span className="block h-1 w-px bg-brass" />
            <span className="data mt-0.5 text-2xs text-ink-faint">{tick}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The number and the word for it. A bare number invites the wrong reaction. */
export function ScoreBadge({
  score,
  size = "small",
}: {
  score: number | null;
  size?: "small" | "large";
}) {
  if (score === null) {
    return <span className="chip">Not scored</span>;
  }

  const tone = band(score);

  if (size === "large") {
    return (
      <div className="flex w-full max-w-xs flex-col gap-2">
        <div className="flex items-baseline gap-2.5">
          <span className="data text-3xl leading-none font-semibold" style={{ color: INK[tone] }}>
            {score}
          </span>
          <span className="text-xs text-ink-muted">out of 100 · {BAND_LABEL[tone]}</span>
        </div>
        <Scale score={score} tone={tone} />
      </div>
    );
  }

  // Small is a number, not a word: at this size the figure is the reading, and the
  // colour only repeats what it already says.
  return (
    <span className={`chip ${CHIP[tone]} data font-semibold`} title={BAND_LABEL[tone]}>
      {score}
    </span>
  );
}
