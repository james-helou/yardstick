import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

export type CreditEntry = {
  id: string;
  orgId: string;
  delta: number;
  reason: string;
  scanId: string | null;
  createdAt: Date;
};

type Row = {
  id: string;
  org_id: string;
  delta: number | string;
  reason: string;
  scan_id: string | null;
  created_at: Date;
};

const toEntry = (r: Row): CreditEntry => ({
  id: r.id,
  orgId: r.org_id,
  delta: Number(r.delta),
  reason: r.reason,
  scanId: r.scan_id,
  createdAt: new Date(r.created_at),
});

export type SpendResult =
  | { ok: true; balance: number; charged: boolean }
  | { ok: false; balance: number; shortfall: number };

/** The balance is the sum of the rows. There is no balance column to drift. */
export async function creditBalance(scope: OrgScope): Promise<number> {
  const orgId = requireOrg(scope);
  const [row] = await db()<{ balance: string }[]>`
    select coalesce(sum(delta), 0)::text as balance from credits_ledger where org_id = ${orgId}
  `;
  return Number(row.balance);
}

export async function grantCredits(
  scope: OrgScope,
  input: { amount: number; reason: string; idempotencyKey?: string },
): Promise<CreditEntry | null> {
  const orgId = requireOrg(scope);
  if (input.amount <= 0) throw new Error("A grant must be positive");

  const rows = await db()<Row[]>`
    insert into credits_ledger (org_id, delta, reason, idempotency_key)
    values (${orgId}, ${input.amount}, ${input.reason}, ${input.idempotencyKey ?? null})
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning *
  `;
  return rows.length ? toEntry(rows[0]) : null;
}

/**
 * Spends against the balance, atomically. The org row is locked first, so two dispatches
 * racing for the last credit cannot both win: the second waits, re-reads the balance,
 * and is refused.
 *
 * An idempotency key makes the spend at-most-once, which matters because the job that
 * dispatches a paid pillar can itself be retried. A repeat comes back `charged: false`.
 */
export async function spendCredits(
  scope: OrgScope,
  input: { amount: number; reason: string; scanId?: string | null; idempotencyKey: string },
): Promise<SpendResult> {
  const orgId = requireOrg(scope);
  if (input.amount <= 0) throw new Error("A spend must be positive");

  return db().begin(async (tx) => {
    await tx`select id from orgs where id = ${orgId} for update`;

    const [already] = await tx<{ id: string }[]>`
      select id from credits_ledger where idempotency_key = ${input.idempotencyKey}
    `;
    const [{ balance }] = await tx<{ balance: string }[]>`
      select coalesce(sum(delta), 0)::text as balance from credits_ledger where org_id = ${orgId}
    `;
    if (already) return { ok: true as const, balance: Number(balance), charged: false };

    const current = Number(balance);
    if (current < input.amount) {
      return { ok: false as const, balance: current, shortfall: input.amount - current };
    }

    await tx`
      insert into credits_ledger (org_id, delta, reason, scan_id, idempotency_key)
      values (${orgId}, ${-input.amount}, ${input.reason}, ${input.scanId ?? null}, ${input.idempotencyKey})
    `;
    return { ok: true as const, balance: current - input.amount, charged: true };
  });
}

/**
 * Gives a spend back when the work it paid for could not be delivered. Append-only, so
 * the charge and the refund both stay visible: a balance that silently returns to where
 * it was hides the fact that a provider failed.
 */
export async function refundCredits(
  scope: OrgScope,
  input: { amount: number; reason: string; scanId?: string | null; idempotencyKey: string },
): Promise<CreditEntry | null> {
  const orgId = requireOrg(scope);
  if (input.amount <= 0) throw new Error("A refund must be positive");

  const rows = await db()<Row[]>`
    insert into credits_ledger (org_id, delta, reason, scan_id, idempotency_key)
    values (${orgId}, ${input.amount}, ${input.reason}, ${input.scanId ?? null}, ${input.idempotencyKey})
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning *
  `;
  return rows.length ? toEntry(rows[0]) : null;
}

export async function listCreditEntries(scope: OrgScope, limit = 50): Promise<CreditEntry[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select * from credits_ledger where org_id = ${orgId}
     order by created_at desc, id desc limit ${limit}
  `;
  return rows.map(toEntry);
}
