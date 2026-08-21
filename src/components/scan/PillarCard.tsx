import { PILLAR_BLURB, PILLAR_LABEL, type Pillar } from "@/lib/scans/pillars";
import type { Finding, PillarStatus } from "@/lib/scans/score";
import { ScoreBadge } from "./ScoreBadge";

export type PillarCardProps = {
  pillar: Pillar;
  status: PillarStatus | "pending";
  score: number | null;
  findings: Finding[];
  detail: string | null;
};

const STATUS_NOTE: Record<PillarStatus | "pending", string | null> = {
  ok: null,
  pending: "Still running",
  skipped: "Not measured",
  failed: "Could not be measured",
};

/**
 * A check has three states, not two. `measured: false` means the provider gave us nothing
 * to judge it by, which is neither a pass nor a failure, and drawing it as a red cross
 * puts a finding in front of a prospect that is about our data rather than their business.
 */
const MARK = {
  ok: { glyph: "✓", tone: "text-band-strong", label: "Passed", emphasis: "text-ink" },
  bad: { glyph: "✕", tone: "text-band-critical", label: "Needs work", emphasis: "font-medium" },
  unknown: { glyph: "·", tone: "text-ink-faint", label: "Not measured", emphasis: "text-ink-muted" },
} as const;

const markFor = (finding: Finding) =>
  finding.measured === false ? MARK.unknown : finding.ok ? MARK.ok : MARK.bad;

/** One pillar, its score, and the checks behind it in the words the report uses. */
export function PillarCard({ pillar, status, score, findings, detail }: PillarCardProps) {
  const note = STATUS_NOTE[status];

  return (
    <article className="panel panel-pad">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">{PILLAR_LABEL[pillar]}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">{PILLAR_BLURB[pillar]}</p>
        </div>
        {status === "ok" ? <ScoreBadge score={score} /> : null}
      </header>

      {note ? (
        <p className="mt-3 rounded-sm border border-line bg-surface-2 px-3 py-2 text-ink">
          {note}
          {detail ? `: ${detail}` : ""}
        </p>
      ) : null}

      {findings.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {findings.map((finding) => {
            const mark = markFor(finding);
            return (
              <li key={finding.code} className="flex gap-2">
                <span aria-hidden="true" className={mark.tone}>
                  {mark.glyph}
                </span>
                <span className="sr-only">{mark.label}:</span>
                <span>
                  <span className={mark.emphasis}>{finding.label}</span>
                  {finding.detail ? <span className="text-ink-muted"> · {finding.detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
