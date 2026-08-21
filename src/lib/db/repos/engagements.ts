import { db } from "../client";
import { isUuid } from "../uuid";
import { requireOrg, type OrgScope } from "../scope";
import { moneyFromColumn, type Currency, type Money } from "@/lib/money";
import { dueAt, planFor, type PlanLine, type WorkKind, type WorkStatus } from "@/lib/delivery/plan";

/**
 * What happens after somebody signs.
 *
 * One engagement per accepted proposal, and the checklist it generated. The unique
 * constraint on proposal_id is doing real work: signing is answered once, but a retry, a
 * double submit or an agency marking the same proposal accepted by hand must never leave
 * two engagements and two copies of the checklist behind.
 *
 * The monthly figure is copied out of the proposal at signature and never looked up
 * again. What a client pays does not change because a catalogue price moved.
 */

export type EngagementStatus = "active" | "ended";

export type Engagement = {
  id: string;
  orgId: string;
  businessId: string;
  businessName: string | null;
  proposalId: string;
  proposalTitle: string | null;
  status: EngagementStatus;
  monthly: Money;
  oneTime: Money;
  startedAt: Date;
  endedAt: Date | null;
  endedReason: string | null;
};

export type WorkItem = {
  id: string;
  engagementId: string;
  businessId: string;
  title: string;
  kind: WorkKind;
  status: WorkStatus;
  dueAt: Date | null;
  doneAt: Date | null;
  sortOrder: number;
};

type Row = {
  id: string;
  org_id: string;
  business_id: string;
  business_name?: string | null;
  proposal_id: string;
  proposal_title?: string | null;
  status: EngagementStatus;
  currency: Currency;
  monthly_amount: string;
  one_time_amount: string;
  started_at: Date;
  ended_at: Date | null;
  ended_reason: string | null;
};

type ItemRow = {
  id: string;
  engagement_id: string;
  business_id: string;
  title: string;
  kind: WorkKind;
  status: WorkStatus;
  due_at: Date | null;
  done_at: Date | null;
  sort_order: number;
};

const toEngagement = (r: Row): Engagement => ({
  id: r.id,
  orgId: r.org_id,
  businessId: r.business_id,
  businessName: r.business_name ?? null,
  proposalId: r.proposal_id,
  proposalTitle: r.proposal_title ?? null,
  status: r.status,
  monthly: moneyFromColumn(r.monthly_amount, r.currency),
  oneTime: moneyFromColumn(r.one_time_amount, r.currency),
  startedAt: new Date(r.started_at),
  endedAt: r.ended_at === null ? null : new Date(r.ended_at),
  endedReason: r.ended_reason,
});

const toItem = (r: ItemRow): WorkItem => ({
  id: r.id,
  engagementId: r.engagement_id,
  businessId: r.business_id,
  title: r.title,
  kind: r.kind,
  status: r.status,
  dueAt: r.due_at === null ? null : new Date(r.due_at),
  doneAt: r.done_at === null ? null : new Date(r.done_at),
  sortOrder: r.sort_order,
});

export type OpenInput = {
  proposalId: string;
  monthly: Money;
  oneTime: Money;
  lines: readonly PlanLine[];
  signedAt?: Date;
};

/**
 * Turns an accepted proposal into an engagement and the work it owes. Returns the
 * engagement that already existed if there is one, without generating a second
 * checklist: the agency may have started ticking items off it already.
 *
 * A proposal with no business attached produces nothing. Delivery is owed to a client,
 * and there is nobody to owe it to.
 */
export async function openEngagement(scope: OrgScope, input: OpenInput): Promise<Engagement | null> {
  const orgId = requireOrg(scope);
  if (!isUuid(input.proposalId)) return null;
  const signedAt = input.signedAt ?? new Date();

  return db().begin(async (tx) => {
    // Selecting from proposals is the tenancy check, and it also refuses a proposal with
    // no business_id, since business_id is not null on the way in.
    const [row] = await tx<Row[]>`
      insert into engagements (org_id, business_id, proposal_id, currency, monthly_amount, one_time_amount, started_at)
      select ${orgId}, p.business_id, p.id, ${input.monthly.currency}, ${input.monthly.amount}, ${input.oneTime.amount}, ${signedAt}
        from proposals p
       where p.id = ${input.proposalId} and p.org_id = ${orgId} and p.business_id is not null
      on conflict (proposal_id) do nothing
      returning *
    `;

    if (!row) {
      // Either it already exists, or the proposal is not ours. The select tells them apart.
      const [existing] = await tx<Row[]>`
        select * from engagements where proposal_id = ${input.proposalId} and org_id = ${orgId}
      `;
      return existing ? toEngagement(existing) : null;
    }

    const items = planFor(input.lines);
    if (items.length > 0) {
      await tx`
        insert into work_items ${tx(
          items.map((item) => ({
            org_id: orgId,
            engagement_id: row.id,
            business_id: row.business_id,
            title: item.title,
            kind: item.kind,
            due_at: dueAt(item, signedAt),
            sort_order: item.sortOrder,
          })),
        )}
      `;
    }

    return toEngagement(row);
  });
}

export async function getEngagement(scope: OrgScope, id: string): Promise<Engagement | null> {
  const orgId = requireOrg(scope);
  if (!isUuid(id)) return null;
  const [row] = await db()<Row[]>`
    select e.*, b.name as business_name, p.title as proposal_title
      from engagements e
      join businesses b on b.id = e.business_id and b.org_id = e.org_id
      join proposals p on p.id = e.proposal_id and p.org_id = e.org_id
     where e.id = ${id} and e.org_id = ${orgId}
  `;
  return row ? toEngagement(row) : null;
}

/** Every engagement for one client, newest first. Usually one, sometimes two after a renewal. */
export async function listEngagementsForBusiness(scope: OrgScope, businessId: string): Promise<Engagement[]> {
  const orgId = requireOrg(scope);
  if (!isUuid(businessId)) return [];
  const rows = await db()<Row[]>`
    select e.*, b.name as business_name, p.title as proposal_title
      from engagements e
      join businesses b on b.id = e.business_id and b.org_id = e.org_id
      join proposals p on p.id = e.proposal_id and p.org_id = e.org_id
     where e.business_id = ${businessId} and e.org_id = ${orgId}
     order by e.started_at desc
  `;
  return rows.map(toEngagement);
}

/** The whole book of business. Small by nature: an agency has clients, not rows. */
export async function listEngagements(scope: OrgScope): Promise<Engagement[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select e.*, b.name as business_name, p.title as proposal_title
      from engagements e
      join businesses b on b.id = e.business_id and b.org_id = e.org_id
      join proposals p on p.id = e.proposal_id and p.org_id = e.org_id
     where e.org_id = ${orgId}
     order by e.status asc, e.started_at desc
  `;
  return rows.map(toEngagement);
}

export async function listWorkItems(scope: OrgScope, engagementId: string): Promise<WorkItem[]> {
  const orgId = requireOrg(scope);
  if (!isUuid(engagementId)) return [];
  const rows = await db()<ItemRow[]>`
    select * from work_items
     where engagement_id = ${engagementId} and org_id = ${orgId}
     order by sort_order asc, created_at asc
  `;
  return rows.map(toItem);
}

/** Everything still open across the workspace, soonest due first. Undated work comes last. */
export async function listOpenWork(scope: OrgScope, limit = 50): Promise<WorkItem[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<ItemRow[]>`
    select * from work_items
     where org_id = ${orgId} and status <> 'done' and kind <> 'recurring'
     order by due_at asc nulls last, sort_order asc
     limit ${limit}
  `;
  return rows.map(toItem);
}

/** Ticking an item is not history worth keeping, so this is the one place work is updated. */
export async function setWorkStatus(
  scope: OrgScope,
  itemId: string,
  status: WorkStatus,
): Promise<WorkItem | null> {
  const orgId = requireOrg(scope);
  if (!isUuid(itemId)) return null;
  const [row] = await db()<ItemRow[]>`
    update work_items
       set status = ${status},
           done_at = ${status === "done" ? new Date() : null}
     where id = ${itemId} and org_id = ${orgId}
    returning *
  `;
  return row ? toItem(row) : null;
}

/** Work the agency added itself, after the plan. Always due-dated by hand or not at all. */
export async function addWorkItem(
  scope: OrgScope,
  input: { engagementId: string; title: string; dueAt?: Date | null },
): Promise<WorkItem | null> {
  const orgId = requireOrg(scope);
  if (!isUuid(input.engagementId)) return null;
  const title = input.title.trim();
  if (title.length === 0) return null;

  const [row] = await db()<ItemRow[]>`
    insert into work_items (org_id, engagement_id, business_id, title, kind, due_at, sort_order)
    select ${orgId}, e.id, e.business_id, ${title}, 'setup', ${input.dueAt ?? null},
           coalesce((select max(sort_order) + 1 from work_items w where w.engagement_id = e.id), 0)
      from engagements e
     where e.id = ${input.engagementId} and e.org_id = ${orgId}
    returning *
  `;
  return row ? toItem(row) : null;
}

/**
 * Churn, recorded rather than inferred. A reason is kept because a churn number without
 * reasons is something nobody can act on.
 */
export async function endEngagement(
  scope: OrgScope,
  id: string,
  reason: string | null,
): Promise<Engagement | null> {
  const orgId = requireOrg(scope);
  if (!isUuid(id)) return null;
  const [row] = await db()<Row[]>`
    update engagements
       set status = 'ended', ended_at = now(), ended_reason = ${reason?.trim() || null}
     where id = ${id} and org_id = ${orgId} and status = 'active'
    returning *
  `;
  return row ? toEngagement(row) : null;
}

/** Won back. The engagement is the same relationship, so it resumes rather than restarts. */
export async function reopenEngagement(scope: OrgScope, id: string): Promise<Engagement | null> {
  const orgId = requireOrg(scope);
  if (!isUuid(id)) return null;
  const [row] = await db()<Row[]>`
    update engagements
       set status = 'active', ended_at = null, ended_reason = null
     where id = ${id} and org_id = ${orgId} and status = 'ended'
    returning *
  `;
  return row ? toEngagement(row) : null;
}
