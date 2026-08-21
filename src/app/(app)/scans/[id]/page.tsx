import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ScanProgress, ScanReport, ScoreBadge } from "@/components/scan";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listAiProbes } from "@/lib/db/repos/ai-probes";
import { listGridPoints } from "@/lib/db/repos/grid";
import { countReportViews, getReportLink } from "@/lib/db/repos/reports";
import { getScan, latestPillarResults } from "@/lib/db/repos/scans";
import { absoluteUrl } from "@/lib/http/origin";
import type { PillarOutcome } from "@/lib/scans/score";
import { ShareReport } from "../ShareReport";
import { SCAN_STATUS_LABEL } from "../page";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const { scope } = await resolveWorkspace(requestHeaders);

  const scan = await getScan(scope, id);
  // A scan in another workspace does not exist here, same as a business.
  if (!scan) notFound();

  const [results, gridPoints, aiProbes, link, views] = await Promise.all([
    latestPillarResults(scope, id),
    listGridPoints(scope, id),
    listAiProbes(scope, { scanId: id }),
    getReportLink(scope, id),
    countReportViews(scope, id),
  ]);

  const outcomes: PillarOutcome[] = results.map((r) => ({
    pillar: r.pillar,
    status: r.status,
    ...(r.score === null ? {} : { score: r.score }),
    findings: r.findings,
    ...(r.detail === null ? {} : { detail: r.detail }),
  }));

  const done = scan.status === "complete" || scan.status === "failed";

  return (
    <section className="flex flex-col gap-8">
      <div>
        <Link href={`/businesses/${scan.businessId}`} className="back-link">
          Back to {scan.businessName}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Diagnostics for {scan.businessName}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {SCAN_STATUS_LABEL[scan.status]} · started {scan.createdAt.toISOString().slice(0, 16).replace("T", " ")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <ScoreBadge score={scan.score} size="large" />
        <ScanProgress done={done} />
        {scan.status === "failed" ? (
          <p className="text-sm text-ink">
            Nothing could be measured on this business yet. Link a Google listing or add a website, then run it again.
          </p>
        ) : null}
      </div>

      {done ? (
        <ShareReport
          scanId={id}
          url={link && link.revokedAt === null ? absoluteUrl(requestHeaders, `/r/${link.token}`) : null}
          views={views}
        />
      ) : null}

      <ScanReport outcomes={outcomes} gridPoints={gridPoints} aiProbes={aiProbes} />
    </section>
  );
}
