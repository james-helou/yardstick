import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { ScoreBadge } from "@/components/scan";
import { TrendPanel } from "@/components/tracking";
import { UnauthorizedError } from "@/lib/auth/guards";
import { getBusiness } from "@/lib/db/repos/businesses";
import { signedSince } from "@/lib/db/repos/proposals";
import { getSchedule } from "@/lib/db/repos/schedules";
import { pillarScoresFor } from "@/lib/db/repos/scans";
import { NoAccessError, resolvePortalBusiness } from "@/lib/portal/access";
import { PILLAR_BLURB, PILLAR_LABEL } from "@/lib/scans/pillars";
import { CADENCE_LABEL } from "@/lib/tracking/cadence";
import { trendFor } from "@/lib/tracking/history";
import type { OrgScope } from "@/lib/db/scope";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your results" };

async function Results({
  scope,
  businessId,
  since,
}: {
  scope: OrgScope;
  businessId: string;
  since: Date | null;
}) {
  // Anchored on the day they signed, so this answers "what have I got since March",
  // not "what does the agency's whole file on me say".
  const trend = await trendFor(scope, businessId, { since });
  const latest = trend.latest;
  const pillars = latest ? await pillarScoresFor(scope, [latest.scanId]) : new Map();
  const current = latest ? (pillars.get(latest.scanId) ?? {}) : {};

  return (
    <>
      <div className="flex items-center gap-4 panel panel-pad">
        <ScoreBadge score={latest ? Math.round(latest.score) : null} />
        <div>
          <p className="text-sm font-medium">
            {latest ? "Where you stand today" : "Not measured yet"}
          </p>
          <p className="text-sm text-ink-muted">{trend.headline}</p>
        </div>
      </div>

      <TrendPanel trend={trend} title={since ? "Since you signed" : "Since we started"} />

      {Object.keys(current).length > 0 ? (
        <section className="panel panel-pad">
          <h2 className="section-title">What makes up the score</h2>
          <dl className="mt-3 flex flex-col gap-3">
            {(Object.keys(current) as (keyof typeof PILLAR_LABEL)[]).map((pillar) => (
              <div key={pillar} className="flex items-start justify-between gap-4">
                <div>
                  <dt className="text-sm font-medium">{PILLAR_LABEL[pillar]}</dt>
                  <dd className="text-xs text-ink-muted">{PILLAR_BLURB[pillar]}</dd>
                </div>
                <span className="text-sm font-medium tabular-nums">{Math.round(current[pillar]!)}</span>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </>
  );
}

export default async function PortalBusinessPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;

  // The guard runs here rather than inside the boundary below: a 404 is the router's
  // answer, and an error boundary would turn it into "could not load", which is a
  // different and much less honest thing to tell somebody.
  let view;
  try {
    view = await resolvePortalBusiness(await headers(), businessId);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/sign-in");
    // A business nobody shared with this person does not exist as far as they are
    // concerned. Saying "forbidden" would confirm that it does.
    if (error instanceof NoAccessError) notFound();
    throw error;
  }

  const { scope, grant } = view;
  const [business, since, schedule] = await Promise.all([
    getBusiness(scope, businessId),
    signedSince(scope, businessId),
    getSchedule(scope, businessId),
  ]);
  if (!business) notFound();

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{business.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {since
            ? `Measured since you signed, on ${since.toISOString().slice(0, 10)}.`
            : "Measured since we started tracking."}
          {schedule && !schedule.pausedAt
            ? ` ${CADENCE_LABEL[schedule.cadence]}, next on ${schedule.nextRunAt.toISOString().slice(0, 10)}.`
            : ""}
        </p>
      </div>

      <GuardedSuspense
        label="Your results"
        fallback={<div className="skeleton h-64" aria-hidden="true" />}
      >
        <Results scope={scope} businessId={businessId} since={since} />
      </GuardedSuspense>

      <p className="text-xs text-ink-faint">
        Shared with {grant.email}. Ask your agency to change what you see here.
      </p>
    </section>
  );
}
