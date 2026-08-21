import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ScoreBadge } from "@/components/scan";
import { Checklist } from "@/components/delivery";
import { ClientAccess, TrackingPanel, TrendPanel } from "@/components/tracking";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { getBusiness } from "@/lib/db/repos/businesses";
import { listGrantsForBusiness } from "@/lib/db/repos/portal";
import { listEngagementsForBusiness, listWorkItems } from "@/lib/db/repos/engagements";
import { getSchedule } from "@/lib/db/repos/schedules";
import { listScans, SCAN_LIST_SPEC, type ScanSort } from "@/lib/db/repos/scans";
import { absoluteUrl } from "@/lib/http/origin";
import { trendFor } from "@/lib/tracking/history";
import { parseListQuery } from "@/lib/list/query";
import {
  addWorkItemAction,
  endEngagementAction,
  reopenEngagementAction,
  setWorkStatusAction,
} from "../../clients/actions";
import { runScanAction } from "../../scans/actions";
import { RunScanButton } from "../../scans/RunScanButton";
import { SCAN_STATUS_LABEL } from "../../scans/page";
import {
  inviteClientAction,
  pauseTrackingAction,
  resumeTrackingAction,
  setTrackingAction,
  revokeClientAccessAction,
  stopTrackingAction,
  updateBusinessAction,
} from "../actions";
import { BusinessForm } from "../BusinessForm";

export const dynamic = "force-dynamic";

const STATUS_LABEL = { prospect: "Prospect", client: "Client", archived: "Archived" } as const;

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { scope } = await resolveWorkspace(await headers());
  const business = await getBusiness(scope, id);

  // A business in another workspace is not "forbidden", it does not exist here. Saying
  // so gives away nothing about what other workspaces hold.
  if (!business) notFound();

  const { rows: scans } = await listScans(
    scope,
    parseListQuery<ScanSort>({}, SCAN_LIST_SPEC),
    { businessId: business.id },
  );

  const requestHeaders = await headers();
  const [schedule, trend, grants, engagements] = await Promise.all([
    getSchedule(scope, business.id),
    trendFor(scope, business.id),
    listGrantsForBusiness(scope, business.id),
    listEngagementsForBusiness(scope, business.id),
  ]);

  // One query per engagement, and an agency has one or two per client, not hundreds.
  const checklists = await Promise.all(
    engagements.map(async (engagement) => ({
      engagement,
      items: await listWorkItems(scope, engagement.id),
    })),
  );
  const now = new Date();

  const place = [business.addressLine, business.locality, business.region, business.postalCode, business.country]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="flex flex-col gap-8">
      <div>
        <Link href="/businesses" className="back-link">
          Back to businesses
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{business.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {STATUS_LABEL[business.status]}
          {place ? ` · ${place}` : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TrendPanel trend={trend} title="Movement" />
        <TrackingPanel
          businessId={business.id}
          cadence={schedule?.cadence ?? null}
          nextRunAt={schedule?.nextRunAt ?? null}
          lastRunAt={schedule?.lastRunAt ?? null}
          paused={Boolean(schedule?.pausedAt)}
          set={setTrackingAction}
          pause={pauseTrackingAction}
          resume={resumeTrackingAction}
          stop={stopTrackingAction}
        />
      </div>

      {checklists.map(({ engagement, items }) => (
        <Checklist
          key={engagement.id}
          engagement={engagement}
          items={items}
          now={now}
          advance={setWorkStatusAction}
          add={addWorkItemAction}
          end={endEngagementAction}
          reopen={reopenEngagementAction}
        />
      ))}

      <ClientAccess
        businessId={business.id}
        grants={grants}
        linkFor={(token) => absoluteUrl(requestHeaders, `/portal/join/${token}`)}
        invite={inviteClientAction}
        revoke={revokeClientAccessAction}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Diagnostics</h2>
          <RunScanButton businessId={business.id} action={runScanAction} />
        </div>

        {scans.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing run yet. A diagnostic grades the Google profile, the reviews and the website,
            and takes about a minute.
          </p>
        ) : (
          <ul className="panel flex flex-col divide-y divide-line">
            {scans.map((scan) => (
              <li key={scan.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <Link href={`/scans/${scan.id}`} className="text-sm font-medium hover:underline">
                    {scan.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </Link>
                  <p className="text-xs text-ink-muted">{SCAN_STATUS_LABEL[scan.status]}</p>
                </div>
                <ScoreBadge score={scan.score} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="section-title mb-3">Details</h2>
        <BusinessForm
          action={updateBusinessAction}
          submitLabel="Save changes"
          defaults={{
            id: business.id,
            name: business.name,
            status: business.status,
            addressLine: business.addressLine,
            locality: business.locality,
            region: business.region,
            postalCode: business.postalCode,
            country: business.country,
            latitude: business.latitude,
            longitude: business.longitude,
            primaryCategory: business.primaryCategory,
            websiteUrl: business.websiteUrl,
            phone: business.phone,
          }}
        />
      </div>
    </section>
  );
}
