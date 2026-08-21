import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ScanProgress, ScanReport, ScoreBadge } from "@/components/scan";
import { listAiProbes } from "@/lib/db/repos/ai-probes";
import { listGridPoints } from "@/lib/db/repos/grid";
import { findOrgById } from "@/lib/db/repos/orgs";
import { findReportLinkByToken, isLive, recordReportView } from "@/lib/db/repos/reports";
import { getScan, latestPillarResults } from "@/lib/db/repos/scans";
import type { PillarOutcome } from "@/lib/scans/score";

export const dynamic = "force-dynamic";
export const metadata = { title: "Local search report" };

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await findReportLinkByToken(token);
  // Revoked, expired and never-existed are all the same 404. Telling the difference
  // would confirm that a token was once real, which is exactly what a guesser wants.
  if (!link || !isLive(link)) notFound();

  // The token named the workspace, and every query below is scoped to it. There is no
  // path here that reads a row the link does not belong to.
  const scope = { orgId: link.orgId };
  const scan = await getScan(scope, link.scanId);
  if (!scan) notFound();

  const [results, gridPoints, aiProbes, agency] = await Promise.all([
    latestPillarResults(scope, link.scanId),
    listGridPoints(scope, link.scanId),
    listAiProbes(scope, { scanId: link.scanId }),
    findOrgById(link.orgId),
  ]);

  const requestHeaders = await headers();
  // Best effort: a view that fails to record must never stop the report rendering.
  await recordReportView({
    link,
    referrer: requestHeaders.get("referer"),
    userAgent: requestHeaders.get("user-agent"),
  }).catch(() => {});

  const outcomes: PillarOutcome[] = results.map((r) => ({
    pillar: r.pillar,
    status: r.status,
    ...(r.score === null ? {} : { score: r.score }),
    findings: r.findings,
    ...(r.detail === null ? {} : { detail: r.detail }),
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-5 py-10 sm:px-6 sm:py-12">
      <header>
        <p className="text-xs text-ink-muted">
          {agency ? `Prepared by ${agency.name}` : "Local search report"}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold">
          How {scan.businessName} shows up in local search
        </h1>
        <p className="mt-1.5 text-xs text-ink-muted">
          Measured <span className="data">{scan.createdAt.toISOString().slice(0, 10)}</span>
        </p>
      </header>

      <div className="panel panel-pad flex flex-wrap items-center gap-x-6 gap-y-4">
        <ScoreBadge score={scan.score} size="large" />
        <ScanProgress done={scan.status === "complete" || scan.status === "failed"} />
      </div>

      <ScanReport outcomes={outcomes} gridPoints={gridPoints} aiProbes={aiProbes} />

      <footer className="border-t border-line pt-4 text-xs text-ink-muted">
        Every number here comes from a live check run on the date above. Ask
        {agency ? ` ${agency.name}` : " your agency"} for the raw results behind any of them.
      </footer>
    </main>
  );
}
