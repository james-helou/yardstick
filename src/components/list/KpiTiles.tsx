export type KpiTone = "neutral" | "good" | "warning" | "critical";

export type KpiTile = {
  label: string;
  /** null means genuinely not measured yet, which is different from zero. */
  value: string | null;
  tone?: KpiTone;
  hint?: string;
};

const TONE_NOTE: Record<Exclude<KpiTone, "neutral">, string> = {
  good: "On track",
  warning: "Worth a look",
  critical: "Needs attention",
};

const TONE_CLASS: Record<KpiTone, string> = {
  neutral: "border-line",
  good: "border-band-strong-line",
  warning: "border-band-fair-line",
  critical: "border-band-critical-line",
};

const TONE_INK: Record<KpiTone, string> = {
  neutral: "text-ink-muted",
  good: "text-band-strong",
  warning: "text-band-fair",
  critical: "text-band-critical",
};

/**
 * Summary before detail. Tone is carried by a word as well as a colour, so the
 * distinction survives a greyscale print and a colour-blind reader.
 */
export function KpiTiles({ tiles }: { tiles: readonly KpiTile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
      {tiles.map((tile) => {
        const tone = tile.tone ?? "neutral";
        return (
          <li
            key={tile.label}
            data-tone={tone}
            className={`panel flex flex-col gap-1 p-3 ${TONE_CLASS[tone]}`}
          >
            <p className="text-xs font-medium text-ink-muted">{tile.label}</p>
            <p className="data text-xl font-semibold">
              {tile.value ?? (
                <span className="text-sm font-normal text-ink-faint">Not yet measured</span>
              )}
            </p>
            {tone !== "neutral" ? (
              <p className={`text-xs font-medium ${TONE_INK[tone]}`}>{TONE_NOTE[tone]}</p>
            ) : null}
            {tile.hint ? <p className="text-xs text-ink-faint">{tile.hint}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
