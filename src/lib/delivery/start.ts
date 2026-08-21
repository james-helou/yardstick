import { openEngagement, type Engagement, type OpenInput } from "@/lib/db/repos/engagements";
import { accrueCommission, getCommissionPlan } from "@/lib/db/repos/commissions";
import { commissionFor } from "@/lib/commissions/rate";
import type { OrgScope } from "@/lib/db/scope";

/**
 * Everything a signature sets in motion, in one call.
 *
 * The engagement and its checklist come first, because that is what the client is owed.
 * The commission follows, and only if there is a plan and somebody to pay: a workspace
 * that has not set a rate pays nothing rather than guessing one, and a proposal written
 * before commissions existed has no owner, so it accrues to nobody.
 *
 * Both steps are idempotent on their own keys, so signing twice, or the agency generating
 * the checklist by hand afterwards, cannot pay a rep twice or duplicate the work.
 */

export type StartInput = OpenInput & {
  /** Who sold it. Null accrues nothing, which is the honest answer to "who gets paid?". */
  ownerUserId?: string | null;
};

export type StartResult = {
  engagement: Engagement;
  /** Null when there was no plan, no owner, or the plan pays nothing on this deal. */
  commission: { amount: number; currency: string; explanation: string } | null;
};

export async function startDelivery(
  scope: OrgScope,
  input: StartInput,
): Promise<StartResult | null> {
  const engagement = await openEngagement(scope, input);
  if (!engagement) return null;

  const owner = input.ownerUserId ?? null;
  if (!owner) return { engagement, commission: null };

  const plan = await getCommissionPlan(scope);
  if (!plan) return { engagement, commission: null };

  const earned = commissionFor(plan, { oneTime: engagement.oneTime, monthly: engagement.monthly });
  if (earned.total.amount <= 0) return { engagement, commission: null };

  const entry = await accrueCommission(scope, {
    userId: owner,
    engagementId: engagement.id,
    amount: earned.total,
    planId: plan.id,
    note: earned.explanation,
  });

  return {
    engagement,
    commission: entry
      ? { amount: entry.amount.amount, currency: entry.amount.currency, explanation: earned.explanation }
      : null,
  };
}
