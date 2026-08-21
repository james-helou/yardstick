import { beforeEach, describe, expect, it } from "vitest";
import { parseListQuery } from "@/lib/list/query";
import { money } from "@/lib/money";
import { resetTables } from "@/test/db";
import { createBusiness } from "./businesses";
import { createServiceItem } from "./catalog";
import { createOrg } from "./orgs";
import {
  addProposalLine,
  createProposal,
  decideProposal,
  getProposal,
  isEditable,
  listProposalLines,
  listProposals,
  PROPOSAL_LIST_SPEC,
  quoteOf,
  removeProposalLine,
  sendProposal,
  signedSince,
  updateProposal,
  updateProposalLine,
} from "./proposals";

const cad = (amount: number) => money(amount, "CAD");
const query = parseListQuery({}, PROPOSAL_LIST_SPEC);

async function agency(slug: string) {
  const org = await createOrg({ name: slug, slug });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, { name: "Rivera Plumbing", status: "prospect" });
  return { scope, business };
}

async function draftWithLines(slug = "agency-a") {
  const { scope, business } = await agency(slug);
  const proposal = await createProposal(scope, {
    title: "Local search, twelve months",
    currency: "CAD",
    businessId: business.id,
    termMonths: 12,
  });
  await addProposalLine(scope, proposal.id, {
    name: "Setup",
    billing: "one_time",
    unitPrice: cad(150_000),
  });
  await addProposalLine(scope, proposal.id, {
    name: "Retainer",
    billing: "monthly",
    unitPrice: cad(120_000),
    sortOrder: 1,
  });
  return { scope, business, proposalId: proposal.id };
}

beforeEach(() => resetTables());

describe("a draft proposal", () => {
  it("prices itself from its lines, every time it is read", async () => {
    const { scope, proposalId } = await draftWithLines();

    const proposal = (await getProposal(scope, proposalId))!;
    const lines = await listProposalLines(scope, proposalId);
    const q = quoteOf(proposal, lines);

    expect(isEditable(proposal)).toBe(true);
    expect(proposal.totals).toBeNull();
    expect(q.contractValue).toEqual(cad(150_000 + 120_000 * 12));
    expect(lines.map((l) => l.name)).toEqual(["Setup", "Retainer"]);
  });

  it("carries the catalogue price as its own copy", async () => {
    const { scope, proposalId } = await draftWithLines();
    const item = await createServiceItem(scope, {
      name: "Citations",
      billing: "one_time",
      unitPrice: cad(40_000),
    });

    const line = await addProposalLine(scope, proposalId, {
      serviceItemId: item.id,
      name: item.name,
      billing: item.billing,
      unitPrice: item.unitPrice,
    });

    expect(line?.unitPrice).toEqual(cad(40_000));
    expect(line?.serviceItemId).toBe(item.id);
  });

  it("refuses a line priced in a currency the proposal is not in", async () => {
    const { scope, proposalId } = await draftWithLines();

    const line = await addProposalLine(scope, proposalId, {
      name: "Euro line",
      billing: "monthly",
      unitPrice: money(50_000, "EUR"),
    });
    expect(line).toBeNull();
  });

  it("edits and removes its own lines", async () => {
    const { scope, proposalId } = await draftWithLines();
    const [setup, retainer] = await listProposalLines(scope, proposalId);

    expect(await updateProposalLine(scope, retainer.id, { quantity: 2, discountPercent: 12.5 })).toBe(true);
    expect(await removeProposalLine(scope, setup.id)).toBe(true);

    const lines = await listProposalLines(scope, proposalId);
    expect(lines).toHaveLength(1);
    // Basis points survive a decimal discount exactly.
    expect(lines[0].discountPercent).toBe(12.5);

    const proposal = (await getProposal(scope, proposalId))!;
    expect(quoteOf(proposal, lines).monthlyTotal).toEqual(cad(210_000));
  });

  it("changes its own terms", async () => {
    const { scope, proposalId } = await draftWithLines();

    const updated = await updateProposal(scope, proposalId, { termMonths: 6, freeMonths: 1, discountPercent: 10 });
    expect(updated).toMatchObject({ termMonths: 6, freeMonths: 1, discountPercent: 10 });
  });
});

describe("sending a proposal", () => {
  it("writes the totals once and stops accepting edits", async () => {
    const { scope, proposalId } = await draftWithLines();

    const sent = await sendProposal(scope, proposalId);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    expect(sent.proposal.status).toBe("sent");
    expect(sent.proposal.sentAt).toBeInstanceOf(Date);
    expect(sent.proposal.totals?.contractValue).toEqual(cad(150_000 + 120_000 * 12));

    // Nothing about it moves after this.
    expect(await updateProposal(scope, proposalId, { termMonths: 24 })).toBeNull();
    expect(await addProposalLine(scope, proposalId, { name: "Extra", billing: "monthly", unitPrice: cad(1) })).toBeNull();
    const [line] = await listProposalLines(scope, proposalId);
    expect(await updateProposalLine(scope, line.id, { quantity: 9 })).toBe(false);
    expect(await removeProposalLine(scope, line.id)).toBe(false);
  });

  it("keeps the sent price when the catalogue moves underneath it", async () => {
    const { scope, proposalId } = await draftWithLines();
    await sendProposal(scope, proposalId);

    const before = (await getProposal(scope, proposalId))!.totals!;
    // A catalogue change is exactly the event this snapshot exists to survive.
    await createServiceItem(scope, { name: "New price list", billing: "monthly", unitPrice: cad(999_999) });

    expect((await getProposal(scope, proposalId))!.totals).toEqual(before);
  });

  it("sends once, however many times the button is pressed", async () => {
    const { scope, proposalId } = await draftWithLines();

    const [first, second] = await Promise.all([sendProposal(scope, proposalId), sendProposal(scope, proposalId)]);
    const outcomes = [first.ok, second.ok].sort();
    expect(outcomes).toEqual([false, true]);
  });

  it("refuses to send nothing", async () => {
    const { scope } = await agency("agency-a");
    const empty = await createProposal(scope, { title: "Nothing yet", currency: "CAD" });

    expect(await sendProposal(scope, empty.id)).toEqual({ ok: false, reason: "empty" });
  });

  it("records an answer once, and only for something that was sent", async () => {
    const { scope, proposalId } = await draftWithLines();
    expect(await decideProposal(scope, proposalId, "accepted")).toBeNull();

    await sendProposal(scope, proposalId);
    const accepted = await decideProposal(scope, proposalId, "accepted");
    expect(accepted?.status).toBe("accepted");
    expect(accepted?.decidedAt).toBeInstanceOf(Date);

    // A second answer does not overwrite the first.
    expect(await decideProposal(scope, proposalId, "declined")).toBeNull();
  });
});

describe("the proposal list", () => {
  it("finds a proposal by the prospect it is for", async () => {
    const { scope } = await draftWithLines();

    const byBusiness = await listProposals(scope, { ...query, search: "Rivera" });
    expect(byBusiness.rows).toHaveLength(1);
    expect(byBusiness.rows[0].businessName).toBe("Rivera Plumbing");

    const byTitle = await listProposals(scope, { ...query, search: "twelve" });
    expect(byTitle.rows).toHaveLength(1);

    expect((await listProposals(scope, { ...query, search: "nobody" })).rows).toEqual([]);
  });

  it("never shows one workspace another's proposals", async () => {
    const { proposalId } = await draftWithLines("agency-a");
    const { scope: other } = await agency("agency-b");

    expect(await getProposal(other, proposalId)).toBeNull();
    expect(await listProposalLines(other, proposalId)).toEqual([]);
    expect((await listProposals(other, query)).rows).toEqual([]);
    expect(await sendProposal(other, proposalId)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("when a business became a client", () => {
  it("is the day the first proposal was accepted", async () => {
    const { scope, business, proposalId } = await draftWithLines();
    expect(await signedSince(scope, business.id)).toBeNull();

    await sendProposal(scope, proposalId);
    // Sent is not signed: a client who has been quoted has not become a client.
    expect(await signedSince(scope, business.id)).toBeNull();

    const decided = await decideProposal(scope, proposalId, "accepted");
    const since = await signedSince(scope, business.id);
    expect(since!.getTime()).toBe(decided!.decidedAt!.getTime());
  });

  it("stays on the first acceptance when a second deal is signed later", async () => {
    const { scope, business, proposalId } = await draftWithLines();
    await sendProposal(scope, proposalId);
    await decideProposal(scope, proposalId, "accepted");
    const first = await signedSince(scope, business.id);

    const second = await createProposal(scope, {
      title: "An upsell",
      currency: "CAD",
      businessId: business.id,
    });
    await addProposalLine(scope, second.id, { name: "More", billing: "monthly", unitPrice: cad(50_000) });
    await sendProposal(scope, second.id);
    await decideProposal(scope, second.id, "accepted");

    expect(await signedSince(scope, business.id)).toEqual(first);
  });

  it("ignores a declined proposal, and another workspace's acceptance", async () => {
    const { scope, business, proposalId } = await draftWithLines();
    await sendProposal(scope, proposalId);
    await decideProposal(scope, proposalId, "declined");
    expect(await signedSince(scope, business.id)).toBeNull();

    const { scope: other } = await agency("agency-b");
    expect(await signedSince(other, business.id)).toBeNull();
  });
});
