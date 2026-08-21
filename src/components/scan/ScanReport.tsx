import type { AiAnswer } from "./AiAnswers";
import { AiAnswers } from "./AiAnswers";
import type { GridCell } from "./GridMap";
import { GridMap } from "./GridMap";
import { PillarCard } from "./PillarCard";
import { PILLARS } from "@/lib/scans/pillars";
import { topOpportunities, type PillarOutcome } from "@/lib/scans/score";

export type ScanReportProps = {
  outcomes: PillarOutcome[];
  gridPoints: (GridCell & { keyword: string })[];
  aiProbes: AiAnswer[];
};

/**
 * The body of a report: what to fix first, then a card per pillar with the evidence
 * under it. Shared by the workspace view and the public link on purpose, so a prospect
 * and the rep on the call are looking at exactly the same page.
 */
export function ScanReport({ outcomes, gridPoints, aiProbes }: ScanReportProps) {
  const byPillar = new Map(outcomes.map((o) => [o.pillar, o]));
  const opportunities = topOpportunities(outcomes);

  return (
    <>
      {opportunities.length > 0 ? (
        <div>
          <h2 className="section-title mb-3">Fix these first</h2>
          {/* Numbered because the order is the finding: heaviest failure first. */}
          <ol className="panel flex flex-col divide-y divide-line">
            {opportunities.map((finding, index) => (
              <li key={finding.code} className="flex gap-3 px-3 py-2.5 sm:px-4">
                <span aria-hidden="true" className="data pt-px text-xs text-brass-ink">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{finding.label}</span>
                  {finding.detail ? (
                    <span className="text-ink-muted"> · {finding.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {PILLARS.map((pillar) => {
          const result = byPillar.get(pillar);
          return (
            <div key={pillar} className="flex flex-col gap-3">
              <PillarCard
                pillar={pillar}
                status={result?.status ?? "pending"}
                score={result?.score ?? null}
                findings={result?.findings ?? []}
                detail={result?.detail ?? null}
              />
              {pillar === "geogrid" && gridPoints.length > 0 ? (
                <GridMap points={gridPoints} keyword={gridPoints[0].keyword} />
              ) : null}
              {pillar === "ai_visibility" ? <AiAnswers answers={aiProbes} /> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
