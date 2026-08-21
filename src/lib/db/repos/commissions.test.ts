import { beforeEach, describe, expect, it } from "vitest";
import { createBusiness } from "@/lib/db/repos/businesses";
import { addMembership, createOrg } from "@/lib/db/repos/orgs";
import { addProposalLine, createProposal, sendProposal } from "@/lib/db/repos/proposals";
import { openEngagement } from "@/lib/db/repos/engagements";
import { money } from "@/lib/money";
import { createTestUser, resetTables } from "@/test/db";
import { startDelivery } from "@/lib/delivery/start";
import {
  accrueCommission,
  getCommissionPlan,
  listCommissionEntries,
  listOwed,
  owedTo,
  payCommission,
  setCommissionPlan,
} from "./commissions";

const cad = (amount: number) => money(amount, "CAD");

async function agency(slug: string) {
  const org = await createOrg({ name: slug, slug });
  const userId = await createTestUser(`rep@${slug}.test`);
  await addMembership({ orgId: org.id }, { userId, role: "owner" });
  return { scope: { orgId: org.id }, userId };
}

/** An accepted deal with an owner: a setup line and a retainer, the usual shape. */
async function signedDeal(scope: { orgId: string }, ownerUserId: string | null) {
  const business = await createBusiness(scope, { name: "Rivera Dental", status: "prospect" });
  const proposal = await createProposal(scope, {
    title: "Local SEO",
    currency: "CAD",
    businessId: business.id,
    ownerUserId,
    termMonths: 12,
  });
  await addProposalLine(scope, proposal.id, {
    name: "Citation cleanup",
    billing: "one_time",
    unitPrice: cad(150_000),
  });
  await addProposalLine(scope, proposal.id, {
    name: "Retainer",
    billing: "monthly",
    unitPrice: cad(90_000),
  });
  const sent = await sendProposal(scope, proposal.id);
  if (!sent.ok) throw new Error("could not send");

  return {
    proposalId: proposal.id,
    ownerUserId,
    lines: [
      { id: "a", name: "Citation cleanup", billing: "one_time" as const, quantity: 1 },
      { id: "b", name: "Retainer", billing: "monthly" as const, quantity: 1 },
    ],
  };
}

const start = (scope: { orgId: string }, deal: Awaited<ReturnType<typeof signedDeal>>) =>
  startDelivery(scope, {
    proposalId: deal.proposalId,
    monthly: cad(90_000),
    oneTime: cad(150_000),
    lines: deal.lines,
    ownerUserId: deal.ownerUserId,
  });

beforeEach(() => resetTables());

describe("the rate", () => {
  it("does not exist until somebody sets one", async () => {
    const { scope } = await agency("agency-a");
    expect(await getCommissionPlan(scope)).toBeNull();
  });

  it("is one per workspace, so saving it again changes it rather than adding another", async () => {
    const { scope } = await agency("agency-a");

    const first = await setCommissionPlan(scope, { oneTimeBp: 1000, monthlyBp: 1000, monthlyMonths: 3 });
    const second = await setCommissionPlan(scope, { oneTimeBp: 1250, monthlyBp: 500, monthlyMonths: 6 });

    expect(second.id).toBe(first.id);
    expect((await getCommissionPlan(scope))!.oneTimeBp).toBe(1250);
  });

  it("belongs to the workspace that set it", async () => {
    const a = await agency("agency-a");
    const b = await agency("agency-b");
    await setCommissionPlan(a.scope, { oneTimeBp: 1000 });

    expect(await getCommissionPlan(b.scope)).toBeNull();
  });
});

describe("what a signature accrues", () => {
  it("pays the rep who sold it, at the workspace's rate", async () => {
    const { scope, userId } = await agency("agency-a");
    await setCommissionPlan(scope, { oneTimeBp: 1000, monthlyBp: 1000, monthlyMonths: 3 });

    const result = await start(scope, await signedDeal(scope, userId));
    // Ten per cent of the $1,500 setup, plus ten per cent of $900 for three months.
    expect(result!.commission!.amount).toBe(42_000);
    expect(await owedTo(scope, userId, "CAD")).toEqual(cad(42_000));
  });

  it("pays nothing when no rate has been set, rather than guessing one", async () => {
    const { scope, userId } = await agency("agency-a");

    const result = await start(scope, await signedDeal(scope, userId));
    expect(result!.engagement.status).toBe("active");
    expect(result!.commission).toBeNull();
    expect(await owedTo(scope, userId, "CAD")).toEqual(cad(0));
  });

  it("pays nobody when the deal has no owner", async () => {
    const { scope } = await agency("agency-a");
    await setCommissionPlan(scope, { oneTimeBp: 1000, monthlyBp: 1000, monthlyMonths: 3 });

    const result = await start(scope, await signedDeal(scope, null));
    expect(result!.commission).toBeNull();
    expect(await listOwed(scope)).toEqual([]);
  });

  it("pays once per deal, however many times the signature is processed", async () => {
    const { scope, userId } = await agency("agency-a");
    await setCommissionPlan(scope, { oneTimeBp: 1000, monthlyBp: 1000, monthlyMonths: 3 });
    const deal = await signedDeal(scope, userId);

    await start(scope, deal);
    await start(scope, deal);
    await start(scope, deal);

    expect(await owedTo(scope, userId, "CAD")).toEqual(cad(42_000));
    expect(await listCommissionEntries(scope, userId)).toHaveLength(1);
  });

  it("says how it was reached, on the row itself", async () => {
    const { scope, userId } = await agency("agency-a");
    await setCommissionPlan(scope, { oneTimeBp: 1000, monthlyBp: 1000, monthlyMonths: 3 });
    await start(scope, await signedDeal(scope, userId));

    const [entry] = await listCommissionEntries(scope, userId);
    expect(entry.note).toContain("10% of");
    expect(entry.engagementId).not.toBeNull();
  });

  it("refuses an accrual for a user or a deal that is not an id", async () => {
    const { scope, userId } = await agency("agency-a");
    expect(
      await accrueCommission(scope, { userId: "new", engagementId: "new", amount: cad(1000) }),
    ).toBeNull();
    expect(
      await accrueCommission(scope, { userId, engagementId: "not-an-id", amount: cad(1000) }),
    ).toBeNull();
  });
});

describe("paying it", () => {
  async function owing() {
    const { scope, userId } = await agency("agency-a");
    await setCommissionPlan(scope, { oneTimeBp: 1000, monthlyBp: 1000, monthlyMonths: 3 });
    await start(scope, await signedDeal(scope, userId));
    return { scope, userId };
  }

  it("brings the balance down, and the balance is the sum of the rows", async () => {
    const { scope, userId } = await owing();

    await payCommission(scope, { userId, amount: cad(20_000), note: "August payroll" });
    expect(await owedTo(scope, userId, "CAD")).toEqual(cad(22_000));

    const [line] = await listOwed(scope);
    expect(line.accrued).toEqual(cad(42_000));
    expect(line.paid).toEqual(cad(20_000));
    expect(line.owed).toEqual(cad(22_000));
    expect(line.email).toBe("rep@agency-a.test");
  });

  it("refuses to pay more than is owed", async () => {
    const { scope, userId } = await owing();

    expect(await payCommission(scope, { userId, amount: cad(42_001) })).toBeNull();
    expect(await payCommission(scope, { userId, amount: cad(0) })).toBeNull();
    expect(await owedTo(scope, userId, "CAD")).toEqual(cad(42_000));
  });

  it("settles exactly, and then refuses the next payment", async () => {
    const { scope, userId } = await owing();

    expect(await payCommission(scope, { userId, amount: cad(42_000) })).not.toBeNull();
    expect(await owedTo(scope, userId, "CAD")).toEqual(cad(0));
    expect(await payCommission(scope, { userId, amount: cad(1) })).toBeNull();
  });

  it("keeps a workspace out of another one's ledger", async () => {
    const { userId } = await owing();
    const b = await agency("agency-b");

    expect(await payCommission(b.scope, { userId, amount: cad(1_000) })).toBeNull();
    expect(await listOwed(b.scope)).toEqual([]);
    expect(await listCommissionEntries(b.scope, userId)).toEqual([]);
  });

  it("never mixes currencies", async () => {
    const { scope, userId } = await owing();
    // Nothing was ever earned in euros, so nothing can be paid in euros.
    expect(await owedTo(scope, userId, "EUR")).toEqual(money(0, "EUR"));
    expect(await payCommission(scope, { userId, amount: money(1_000, "EUR") })).toBeNull();
  });
});

describe("an engagement opened without the service", () => {
  it("accrues nothing, because only the service knows about the rate", async () => {
    const { scope, userId } = await agency("agency-a");
    await setCommissionPlan(scope, { oneTimeBp: 1000, monthlyBp: 1000, monthlyMonths: 3 });
    const deal = await signedDeal(scope, userId);

    await openEngagement(scope, {
      proposalId: deal.proposalId,
      monthly: cad(90_000),
      oneTime: cad(150_000),
      lines: deal.lines,
    });

    expect(await listOwed(scope)).toEqual([]);
  });
});
