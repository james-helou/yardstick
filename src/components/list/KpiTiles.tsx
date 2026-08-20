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
  neutral: "border-neutral-200",
  good: "border-emerald-300",
  warning: "border-amber-300",
  critical: "border-red-300",
};

/**
 * Summary before detail. Tone is carried by a word as well as a colour, so the
 * distinction survives a greyscale print and a colour-blind reader.
 */
export function KpiTiles({ tiles }: { tiles: readonly KpiTile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => {
        const tone = tile.tone ?? "neutral";
        return (
          <li
            key={tile.label}
            data-tone={tone}
            className={`rounded-md border p-3 ${TONE_CLASS[tone]}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {tile.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {tile.value ?? <span className="text-base font-normal text-neutral-500">Not yet measured</span>}
            </p>
            {tone !== "neutral" ? (
              <p className="mt-1 text-xs font-medium text-neutral-600">{TONE_NOTE[tone]}</p>
            ) : null}
            {tile.hint ? <p className="mt-1 text-xs text-neutral-500">{tile.hint}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
