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
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Fix these first</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {opportunities.map((finding) => (
              <li key={finding.code} className="rounded border border-neutral-200 px-3 py-2">
                <span className="font-medium">{finding.label}</span>
                {finding.detail ? <span className="text-neutral-600"> · {finding.detail}</span> : null}
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
