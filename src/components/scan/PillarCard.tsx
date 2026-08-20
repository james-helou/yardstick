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

/** One pillar, its score, and the checks behind it in the words the report uses. */
export function PillarCard({ pillar, status, score, findings, detail }: PillarCardProps) {
  const note = STATUS_NOTE[status];

  return (
    <article className="rounded-lg border border-neutral-200 p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">{PILLAR_LABEL[pillar]}</h3>
          <p className="mt-0.5 text-sm text-neutral-600">{PILLAR_BLURB[pillar]}</p>
        </div>
        {status === "ok" ? <ScoreBadge score={score} /> : null}
      </header>

      {note ? (
        <p className="mt-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          {note}
          {detail ? `: ${detail}` : ""}
        </p>
      ) : null}

      {findings.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {findings.map((finding) => (
            <li key={finding.code} className="flex gap-2">
              <span aria-hidden="true" className={finding.ok ? "text-green-700" : "text-red-700"}>
                {finding.ok ? "✓" : "✕"}
              </span>
              <span className="sr-only">{finding.ok ? "Passed" : "Needs work"}:</span>
              <span>
                <span className={finding.ok ? "text-neutral-700" : "font-medium"}>{finding.label}</span>
                {finding.detail ? <span className="text-neutral-600"> · {finding.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
