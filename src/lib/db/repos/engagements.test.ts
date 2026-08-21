import { beforeEach, describe, expect, it } from "vitest";
import { createBusiness } from "@/lib/db/repos/businesses";
import { createOrg } from "@/lib/db/repos/orgs";
import { addProposalLine, createProposal, decideProposal, sendProposal } from "@/lib/db/repos/proposals";
import { money } from "@/lib/money";
import { ONBOARDING } from "@/lib/delivery/plan";
import { resetTables } from "@/test/db";
import {
  addWorkItem,
  endEngagement,
  getEngagement,
  listEngagements,
  listEngagementsForBusiness,
  listOpenWork,
  listWorkItems,
  openEngagement,
  reopenEngagement,
  setWorkStatus,
} from "./engagements";

const SIGNED = new Date("2026-08-20T09:00:00.000Z");

async function agency(slug: string) {
  const org = await createOrg({ name: slug, slug });
  return { orgId: org.id };
}

/** An accepted proposal with one setup line and one retainer, which is the usual shape. */
async function accepted(scope: { orgId: string }, name = "Rivera Dental") {
  const business = await createBusiness(scope, { name, status: "prospect" });
  const proposal = await createProposal(scope, {
    title: "Local SEO",
    currency: "CAD",
    businessId: business.id,
    termMonths: 12,
  });
  await addProposalLine(scope, proposal.id, {
    name: "Citation cleanup",
    billing: "one_time",
    unitPrice: money(120_000, "CAD"),
  });
  await addProposalLine(scope, proposal.id, {
    name: "Local SEO retainer",
    billing: "monthly",
    unitPrice: money(90_000, "CAD"),
  });
  const sent = await sendProposal(scope, proposal.id);
  if (!sent.ok) throw new Error("could not send");
  await decideProposal(scope, proposal.id, "accepted");

  return {
    businessId: business.id,
    proposalId: proposal.id,
    lines: [
      { id: "a", name: "Citation cleanup", billing: "one_time" as const, quantity: 1 },
      { id: "b", name: "Local SEO retainer", billing: "monthly" as const, quantity: 1 },
    ],
  };
}

const open = (scope: { orgId: string }, deal: Awaited<ReturnType<typeof accepted>>) =>
  openEngagement(scope, {
    proposalId: deal.proposalId,
    monthly: money(90_000, "CAD"),
    oneTime: money(120_000, "CAD"),
    lines: deal.lines,
    signedAt: SIGNED,
  });

beforeEach(() => resetTables());

describe("opening an engagement", () => {
  it("generates the work the signature promised", async () => {
    const scope = await agency("agency-a");
    const deal = await accepted(scope);

    const engagement = await open(scope, deal);
    expect(engagement).not.toBeNull();
    expect(engagement!.status).toBe("active");
    expect(engagement!.monthly).toEqual(money(90_000, "CAD"));
    expect(engagement!.businessName).toBe(null); // insert returns the row, not the join

    const items = await listWorkItems(scope, engagement!.id);
    expect(items).toHaveLength(ONBOARDING.length + 2);
    expect(items[0].title).toBe(ONBOARDING[0].title);
    expect(items.map((i) => i.title)).toContain("Set up Citation cleanup");
    expect(items.map((i) => i.title)).toContain("Local SEO retainer, every month");
  });

  it("dates the work from the day they signed, and leaves recurring work undated", async () => {
    const scope = await agency("agency-a");
    const deal = await accepted(scope);
    const engagement = (await open(scope, deal))!;

    const items = await listWorkItems(scope, engagement.id);
    const first = items[0];
    expect(first.dueAt!.toISOString()).toBe("2026-08-23T09:00:00.000Z");

    const recurring = items.find((i) => i.kind === "recurring")!;
    expect(recurring.dueAt).toBeNull();
  });

  it("cannot be opened twice, and does not regenerate a checklist somebody is working", async () => {
    const scope = await agency("agency-a");
    const deal = await accepted(scope);

    const first = (await open(scope, deal))!;
    const items = await listWorkItems(scope, first.id);
    await setWorkStatus(scope, items[0].id, "done");

    const again = await open(scope, deal);
    expect(again!.id).toBe(first.id);

    const after = await listWorkItems(scope, first.id);
    expect(after).toHaveLength(items.length);
    expect(after[0].status).toBe("done");
  });

  it("refuses a proposal belonging to another workspace", async () => {
    const a = await agency("agency-a");
    const b = await agency("agency-b");
    const deal = await accepted(a);

    expect(await open(b, deal)).toBeNull();
    expect(await listEngagements(b)).toEqual([]);
  });

  it("refuses a proposal with nobody to owe the work to", async () => {
    const scope = await agency("agency-a");
    const proposal = await createProposal(scope, { title: "No client", currency: "CAD" });

    expect(
      await openEngagement(scope, {
        proposalId: proposal.id,
        monthly: money(0, "CAD"),
        oneTime: money(0, "CAD"),
        lines: [],
      }),
    ).toBeNull();
  });

  it("answers nothing for junk in a path segment rather than raising", async () => {
    const scope = await agency("agency-a");
    expect(await getEngagement(scope, "new")).toBeNull();
    expect(await listWorkItems(scope, "new")).toEqual([]);
    expect(await listEngagementsForBusiness(scope, "not-an-id")).toEqual([]);
  });
});

describe("working the checklist", () => {
  it("records when something was finished, and forgets it when it is reopened", async () => {
    const scope = await agency("agency-a");
    const engagement = (await open(scope, await accepted(scope)))!;
    const [item] = await listWorkItems(scope, engagement.id);

    const done = await setWorkStatus(scope, item.id, "done");
    expect(done!.status).toBe("done");
    expect(done!.doneAt).not.toBeNull();

    const reopened = await setWorkStatus(scope, item.id, "todo");
    expect(reopened!.doneAt).toBeNull();
  });

  it("refuses to move an item in another workspace", async () => {
    const a = await agency("agency-a");
    const b = await agency("agency-b");
    const engagement = (await open(a, await accepted(a)))!;
    const [item] = await listWorkItems(a, engagement.id);

    expect(await setWorkStatus(b, item.id, "done")).toBeNull();
    expect((await listWorkItems(a, engagement.id))[0].status).toBe("todo");
  });

  it("takes work the plan did not know about, at the end of the list", async () => {
    const scope = await agency("agency-a");
    const engagement = (await open(scope, await accepted(scope)))!;
    const before = await listWorkItems(scope, engagement.id);

    const added = await addWorkItem(scope, {
      engagementId: engagement.id,
      title: "  Rewrite the services page  ",
    });
    expect(added!.title).toBe("Rewrite the services page");

    const after = await listWorkItems(scope, engagement.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1].id).toBe(added!.id);
  });

  it("does not take an empty title, or an engagement in another workspace", async () => {
    const a = await agency("agency-a");
    const b = await agency("agency-b");
    const engagement = (await open(a, await accepted(a)))!;

    expect(await addWorkItem(a, { engagementId: engagement.id, title: "   " })).toBeNull();
    expect(await addWorkItem(b, { engagementId: engagement.id, title: "Sneaky" })).toBeNull();
  });

  it("lists what is still open across the workspace, soonest first, without the recurring work", async () => {
    const scope = await agency("agency-a");
    const engagement = (await open(scope, await accepted(scope)))!;

    const open_ = await listOpenWork(scope);
    expect(open_.every((i) => i.kind !== "recurring")).toBe(true);
    expect(open_.map((i) => i.dueAt!.getTime())).toEqual(
      [...open_].map((i) => i.dueAt!.getTime()).sort((x, y) => x - y),
    );

    for (const item of open_) await setWorkStatus(scope, item.id, "done");
    expect(await listOpenWork(scope)).toEqual([]);
    expect(engagement.status).toBe("active");
  });
});

describe("ending and winning back", () => {
  it("keeps the reason, because churn without one is a number nobody can act on", async () => {
    const scope = await agency("agency-a");
    const engagement = (await open(scope, await accepted(scope)))!;

    const ended = await endEngagement(scope, engagement.id, "  Sold the practice  ");
    expect(ended!.status).toBe("ended");
    expect(ended!.endedReason).toBe("Sold the practice");
    expect(ended!.endedAt).not.toBeNull();

    // Already gone: ending it again changes nothing.
    expect(await endEngagement(scope, engagement.id, "again")).toBeNull();
  });

  it("resumes the same relationship rather than starting a new one", async () => {
    const scope = await agency("agency-a");
    const engagement = (await open(scope, await accepted(scope)))!;
    await endEngagement(scope, engagement.id, "Budget");

    const back = await reopenEngagement(scope, engagement.id);
    expect(back!.id).toBe(engagement.id);
    expect(back!.status).toBe("active");
    expect(back!.endedAt).toBeNull();
    expect(back!.endedReason).toBeNull();
    expect(await listEngagements(scope)).toHaveLength(1);
  });

  it("reads back with the client's name attached", async () => {
    const scope = await agency("agency-a");
    const engagement = (await open(scope, await accepted(scope, "Rivera Dental")))!;

    const read = await getEngagement(scope, engagement.id);
    expect(read!.businessName).toBe("Rivera Dental");
    expect(read!.proposalTitle).toBe("Local SEO");

    const forBusiness = await listEngagementsForBusiness(scope, engagement.businessId);
    expect(forBusiness.map((e) => e.id)).toEqual([engagement.id]);
  });
});
