import { listAwaitingAnswer } from "@/lib/db/repos/proposals";
import { viewStatsFor } from "@/lib/db/repos/proposal-sharing";
import type { OrgScope } from "@/lib/db/scope";
import { rankFollowUps, summarise, type FollowUp, type FollowUpInput } from "./rank";

/**
 * The queue, assembled. Two reads, each staying inside the module that owns its table:
 * the proposals still waiting on an answer, and how often each has been opened. Ranking
 * is pure and lives next door, so this file has no opinions of its own.
 */

export type QueueDeps = {
  proposals?: typeof listAwaitingAnswer;
  stats?: typeof viewStatsFor;
  now?: Date;
};

export type Queue = {
  items: FollowUp[];
  summary: ReturnType<typeof summarise>;
};

export async function followUpQueue(scope: OrgScope, deps: QueueDeps = {}): Promise<Queue> {
  const proposals = await (deps.proposals ?? listAwaitingAnswer)(scope);
  if (proposals.length === 0) return { items: [], summary: summarise([]) };

  const stats = await (deps.stats ?? viewStatsFor)(
    scope,
    proposals.map((p) => p.id),
  );

  const inputs: FollowUpInput[] = proposals.map((proposal) => {
    const seen = stats.get(proposal.id);
    return {
      proposalId: proposal.id,
      title: proposal.title,
      businessId: proposal.businessId,
      businessName: proposal.businessName,
      // A sent proposal always carries its snapshot. The fallback is defensive, not a path.
      contractValue: proposal.totals?.contractValue ?? { amount: 0, currency: proposal.currency },
      sentAt: proposal.sentAt!,
      views: seen?.views ?? 0,
      lastViewedAt: seen?.lastViewedAt ?? null,
    };
  });

  const items = rankFollowUps(inputs, deps.now ?? new Date());
  return { items, summary: summarise(items) };
}
