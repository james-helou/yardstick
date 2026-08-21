import { db } from "../client";
import { isUuid } from "../uuid";
import { requireOrg, type OrgScope } from "../scope";
import { moneyFromColumn, type Currency, type Money } from "@/lib/money";
import { DEFAULT_PLAN, type CommissionPlan } from "@/lib/commissions/rate";

/**
 * What each rep is owed.
 *
 * The ledger is append-only and the balance is the sum of the rows, exactly like the
 * credits ledger: there is no owed column to drift away from the payments that are
 * supposed to explain it. Accruals are positive, payments negative, and every row points
 * at the deal it came from.
 */

export type StoredPlan = CommissionPlan & { id: string; orgId: string };

export type CommissionEntry = {
  id: string;
  orgId: string;
  userId: string;
  kind: "accrued" | "paid";
  amount: Money;
  engagementId: string | null;
  note: string | null;
  createdAt: Date;
};

/** One rep's line in the payout list. Signed accruals in, payments out, difference owed. */
export type OwedRow = {
  userId: string;
  email: string | null;
  accrued: Money;
  paid: Money;
  owed: Money;
};

type PlanRow = {
  id: string;
  org_id: string;
  name: string;
  one_time_bp: number;
  monthly_bp: number;
  monthly_months: number;
};

type EntryRow = {
  id: string;
  org_id: string;
  user_id: string;
  kind: "accrued" | "paid";
  currency: Currency;
  amount: string;
  engagement_id: string | null;
  note: string | null;
  created_at: Date;
};

const toPlan = (r: PlanRow): StoredPlan => ({
  id: r.id,
  orgId: r.org_id,
  name: r.name,
  oneTimeBp: Number(r.one_time_bp),
  monthlyBp: Number(r.monthly_bp),
  monthlyMonths: Number(r.monthly_months),
});

const toEntry = (r: EntryRow): CommissionEntry => ({
  id: r.id,
  orgId: r.org_id,
  userId: r.user_id,
  kind: r.kind,
  amount: moneyFromColumn(r.amount, r.currency),
  engagementId: r.engagement_id,
  note: r.note,
  createdAt: new Date(r.created_at),
});

/** The workspace's plan, or nothing. A workspace without one pays no commission at all. */
export async function getCommissionPlan(scope: OrgScope): Promise<StoredPlan | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<PlanRow[]>`select * from commission_plans where org_id = ${orgId}`;
  return row ? toPlan(row) : null;
}

/** One plan per workspace, so this is an upsert rather than a list that can grow silently. */
export async function setCommissionPlan(
  scope: OrgScope,
  input: Partial<CommissionPlan>,
): Promise<StoredPlan> {
  const orgId = requireOrg(scope);
  const plan = { ...DEFAULT_PLAN, ...input };

  const [row] = await db()<PlanRow[]>`
    insert into commission_plans (org_id, name, one_time_bp, monthly_bp, monthly_months)
    values (${orgId}, ${plan.name}, ${plan.oneTimeBp}, ${plan.monthlyBp}, ${plan.monthlyMonths})
    on conflict (org_id) do update
       set name = excluded.name,
           one_time_bp = excluded.one_time_bp,
           monthly_bp = excluded.monthly_bp,
           monthly_months = excluded.monthly_months,
           updated_at = now()
    returning *
  `;
  return toPlan(row);
}

export type AccrueInput = {
  userId: string;
  engagementId: string;
  amount: Money;
  planId?: string | null;
  note?: string | null;
};

/**
 * Records what one deal earned. At most once per deal, whatever happens upstream: a
 * retried signature or a second pass by the agency finds the accrual already there and
 * returns it rather than paying twice.
 */
export async function accrueCommission(
  scope: OrgScope,
  input: AccrueInput,
): Promise<CommissionEntry | null> {
  const orgId = requireOrg(scope);
  if (!isUuid(input.userId) || !isUuid(input.engagementId)) return null;
  if (input.amount.amount <= 0) return null;

  const rows = await db()<EntryRow[]>`
    insert into commission_entries (org_id, user_id, kind, currency, amount, engagement_id, plan_id, note)
    values (
      ${orgId}, ${input.userId}, 'accrued', ${input.amount.currency}, ${input.amount.amount},
      ${input.engagementId}, ${input.planId ?? null}, ${input.note ?? null}
    )
    on conflict (engagement_id) where kind = 'accrued' do nothing
    returning *
  `;
  if (rows.length > 0) return toEntry(rows[0]);

  const [existing] = await db()<EntryRow[]>`
    select * from commission_entries
     where engagement_id = ${input.engagementId} and kind = 'accrued' and org_id = ${orgId}
  `;
  return existing ? toEntry(existing) : null;
}

/**
 * Records a payment. Stored negative so the balance stays a sum, and refused when it is
 * larger than what is actually owed: a payout screen that lets somebody overpay by a
 * typo is worse than no payout screen.
 */
export async function payCommission(
  scope: OrgScope,
  input: { userId: string; amount: Money; note?: string | null },
): Promise<CommissionEntry | null> {
  const orgId = requireOrg(scope);
  if (!isUuid(input.userId) || input.amount.amount <= 0) return null;

  const owed = await owedTo(scope, input.userId, input.amount.currency);
  if (input.amount.amount > owed.amount) return null;

  const [row] = await db()<EntryRow[]>`
    insert into commission_entries (org_id, user_id, kind, currency, amount, note)
    values (${orgId}, ${input.userId}, 'paid', ${input.amount.currency}, ${-input.amount.amount}, ${input.note ?? null})
    returning *
  `;
  return toEntry(row);
}

/** What one rep is owed in one currency. The sum of their rows, and nothing else. */
export async function owedTo(scope: OrgScope, userId: string, currency: Currency): Promise<Money> {
  const orgId = requireOrg(scope);
  const [row] = await db()<{ total: string }[]>`
    select coalesce(sum(amount), 0)::text as total
      from commission_entries
     where org_id = ${orgId} and user_id = ${userId} and currency = ${currency}
  `;
  return moneyFromColumn(row.total, currency);
}

/**
 * The payout list: one line per rep per currency, with the email the workspace already
 * knows. Reads better-auth's user table, which carries no org_id of its own; the entry
 * row is what scopes it, and the join is filtered by the same org_id in one statement.
 */
export async function listOwed(scope: OrgScope): Promise<OwedRow[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<
    { user_id: string; email: string | null; currency: Currency; accrued: string; paid: string }[]
  >`
    select e.user_id,
           u."email" as email,
           e.currency,
           coalesce(sum(e.amount) filter (where e.kind = 'accrued'), 0)::text as accrued,
           coalesce(sum(-e.amount) filter (where e.kind = 'paid'), 0)::text as paid
      from commission_entries e
      left join "user" u on u."id" = e.user_id
     where e.org_id = ${orgId}
     group by e.user_id, u."email", e.currency
     order by u."email" asc nulls last, e.currency asc
  `;

  return rows.map((r) => {
    const accrued = moneyFromColumn(r.accrued, r.currency);
    const paid = moneyFromColumn(r.paid, r.currency);
    return {
      userId: r.user_id,
      email: r.email,
      accrued,
      paid,
      owed: moneyFromColumn(String(accrued.amount - paid.amount), r.currency),
    };
  });
}

/** One rep's own rows, newest first. What a payout number has to be able to show. */
export async function listCommissionEntries(
  scope: OrgScope,
  userId: string,
  limit = 50,
): Promise<CommissionEntry[]> {
  const orgId = requireOrg(scope);
  if (!isUuid(userId)) return [];
  const rows = await db()<EntryRow[]>`
    select * from commission_entries
     where org_id = ${orgId} and user_id = ${userId}
     order by created_at desc
     limit ${limit}
  `;
  return rows.map(toEntry);
}
