import { beforeEach, describe, expect, it } from "vitest";
import { createBusiness } from "@/lib/db/repos/businesses";
import { createOrg } from "@/lib/db/repos/orgs";
import { recordProposalEvent, viewStatsFor } from "@/lib/db/repos/proposal-sharing";
import { addProposalLine, createProposal, decideProposal, sendProposal } from "@/lib/db/repos/proposals";
import { money } from "@/lib/money";
import { resetTables } from "@/test/db";
import { followUpQueue } from "./queue";

const NOW = new Date("2026-08-20T09:00:00.000Z");

async function agency(slug: string) {
  const org = await createOrg({ name: slug, slug });
  return { orgId: org.id };
}

async function sent(scope: { orgId: string }, title: string, monthly: number, businessName: string) {
  const business = await createBusiness(scope, { name: businessName, status: "prospect" });
  const proposal = await createProposal(scope, {
    title,
    currency: "CAD",
    businessId: business.id,
    termMonths: 12,
  });
  await addProposalLine(scope, proposal.id, {
    name: "Retainer",
    billing: "monthly",
    unitPrice: money(monthly, "CAD"),
  });
  const result = await sendProposal(scope, proposal.id);
  if (!result.ok) throw new Error(`could not send ${title}`);
  return proposal.id;
}

/** Events carry their own clock, so a test has to write the past directly. */
async function viewedAt(proposalId: string, when: Date) {
  const { db } = await import("@/lib/db/client");
  await db()`update proposal_events set created_at = ${when} where proposal_id = ${proposalId} and type = 'viewed'`;
}

async function sentAt(proposalId: string, when: Date) {
  const { db } = await import("@/lib/db/client");
  await db()`update proposals set sent_at = ${when} where id = ${proposalId}`;
}

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

beforeEach(() => resetTables());

describe("the follow-up queue", () => {
  it("is empty until something has been sent", async () => {
    const scope = await agency("agency-a");
    const proposal = await createProposal(scope, { title: "Draft", currency: "CAD" });
    expect(proposal.status).toBe("draft");

    expect(await followUpQueue(scope, { now: NOW })).toEqual({
      items: [],
      summary: { total: 0, callNow: 0, chasing: 0 },
    });
  });

  it("orders a real morning: the reader first, then the silence", async () => {
    const scope = await agency("agency-a");

    const reading = await sent(scope, "Reading it now", 120_000, "Rivera Plumbing");
    await recordProposalEvent(scope, { proposalId: reading, type: "viewed" });
    await sentAt(reading, daysAgo(5));

    const ignored = await sent(scope, "Never opened", 90_000, "Delacroix Dental");
    await sentAt(ignored, daysAgo(12));

    const justSent = await sent(scope, "Only just gone out", 200_000, "Northline Roofing");
    await sentAt(justSent, daysAgo(0));

    const { items, summary } = await followUpQueue(scope, { now: NOW });

    expect(items.map((i) => i.title)).toEqual(["Reading it now", "Never opened", "Only just gone out"]);
    expect(items[0].state).toBe("reading");
    expect(items[0].businessName).toBe("Rivera Plumbing");
    expect(items[1].because).toBe("Sent 12 days ago and never opened.");
    expect(summary).toEqual({ total: 3, callNow: 1, chasing: 1 });
  });

  it("prices each row from the snapshot the proposal was sent with", async () => {
    const scope = await agency("agency-a");
    await sent(scope, "Twelve months", 120_000, "Rivera Plumbing");

    const { items } = await followUpQueue(scope, { now: NOW });
    expect(items[0].contractValue).toEqual(money(120_000 * 12, "CAD"));
  });

  it("drops a proposal the moment it is answered", async () => {
    const scope = await agency("agency-a");
    const id = await sent(scope, "Answered", 120_000, "Rivera Plumbing");
    await sentAt(id, daysAgo(4));

    expect((await followUpQueue(scope, { now: NOW })).items).toHaveLength(1);
    await decideProposal(scope, id, "accepted");
    expect((await followUpQueue(scope, { now: NOW })).items).toHaveLength(0);
  });

  it("counts every open, and dates the last one", async () => {
    const scope = await agency("agency-a");
    const id = await sent(scope, "Read twice", 120_000, "Rivera Plumbing");
    await sentAt(id, daysAgo(9));
    await recordProposalEvent(scope, { proposalId: id, type: "viewed" });
    await recordProposalEvent(scope, { proposalId: id, type: "viewed" });
    await viewedAt(id, daysAgo(8));
    // One newer view on top of the two backdated ones.
    await recordProposalEvent(scope, { proposalId: id, type: "viewed" });

    const stats = await viewStatsFor(scope, [id]);
    expect(stats.get(id)!.views).toBe(3);

    const { items } = await followUpQueue(scope, { now: NOW });
    expect(items[0].state).toBe("reading");
    expect(items[0].because).toBe("Opened 3 times, most recently today.");
  });

  it("only counts opens, not sends and answers", async () => {
    const scope = await agency("agency-a");
    const id = await sent(scope, "Sent and read once", 120_000, "Rivera Plumbing");
    await recordProposalEvent(scope, { proposalId: id, type: "sent" });
    await recordProposalEvent(scope, { proposalId: id, type: "viewed" });

    expect((await viewStatsFor(scope, [id])).get(id)!.views).toBe(1);
  });

  it("never shows one workspace another's pipeline", async () => {
    const a = await agency("agency-a");
    const b = await agency("agency-b");
    const id = await sent(a, "Theirs", 120_000, "Rivera Plumbing");
    await recordProposalEvent(a, { proposalId: id, type: "viewed" });

    expect((await followUpQueue(b, { now: NOW })).items).toEqual([]);
    expect(await viewStatsFor(b, [id])).toEqual(new Map());
  });

  it("does not go to the database for statistics it has no proposals for", async () => {
    const scope = await agency("agency-a");
    let asked = false;

    const queue = await followUpQueue(scope, {
      now: NOW,
      proposals: async () => [],
      stats: async () => {
        asked = true;
        return new Map();
      },
    });

    expect(queue.items).toEqual([]);
    expect(asked).toBe(false);
  });
});
