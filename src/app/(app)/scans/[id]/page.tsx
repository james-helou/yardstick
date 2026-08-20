import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AiAnswers, GridMap, PillarCard, ScoreBadge } from "@/components/scan";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listAiProbes } from "@/lib/db/repos/ai-probes";
import { listGridPoints } from "@/lib/db/repos/grid";
import { getScan, latestPillarResults } from "@/lib/db/repos/scans";
import { PILLARS } from "@/lib/scans/pillars";
import { topOpportunities, type PillarOutcome } from "@/lib/scans/score";
import { ScanProgress } from "../ScanProgress";
import { SCAN_STATUS_LABEL } from "../page";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { scope } = await resolveWorkspace(await headers());

  const scan = await getScan(scope, id);
  // A scan in another workspace does not exist here, same as a business.
  if (!scan) notFound();

  const [results, gridPoints, aiProbes] = await Promise.all([
    latestPillarResults(scope, id),
    listGridPoints(scope, id),
    listAiProbes(scope, { scanId: id }),
  ]);
  const byPillar = new Map(results.map((r) => [r.pillar, r]));

  const outcomes: PillarOutcome[] = results.map((r) => ({
    pillar: r.pillar,
    status: r.status,
    ...(r.score === null ? {} : { score: r.score }),
    findings: r.findings,
    ...(r.detail === null ? {} : { detail: r.detail }),
  }));

  const opportunities = topOpportunities(outcomes);
  const done = scan.status === "complete" || scan.status === "failed";

  return (
    <section className="flex flex-col gap-8">
      <div>
        <Link href={`/businesses/${scan.businessId}`} className="text-sm text-neutral-600 hover:underline">
          Back to {scan.businessName}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Scan of {scan.businessName}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {SCAN_STATUS_LABEL[scan.status]} · started {scan.createdAt.toISOString().slice(0, 16).replace("T", " ")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <ScoreBadge score={scan.score} size="large" />
        <ScanProgress done={done} />
        {scan.status === "failed" ? (
          <p className="text-sm text-neutral-700">
            Nothing could be measured on this business yet. Link a Google listing or add a website, then run it again.
          </p>
        ) : null}
      </div>

      {opportunities.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Fix these first
          </h2>
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
    </section>
  );
}
