import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { createBusiness } from "@/lib/db/repos/businesses";
import { createOrg } from "@/lib/db/repos/orgs";
import {
  countProposalViews,
  findSignature,
  listProposalEvents,
  recordProposalEvent,
  revokeProposalLink,
  shareProposal,
} from "@/lib/db/repos/proposal-sharing";
import {
  addProposalLine,
  createProposal,
  getProposal,
  listProposalLines,
  sendProposal,
} from "@/lib/db/repos/proposals";
import { money } from "@/lib/money";
import { resetTables } from "@/test/db";
import { openProposal, signProposal } from "./sign";

const cad = (amount: number) => money(amount, "CAD");

async function sentProposal(slug = "agency-a") {
  const org = await createOrg({ name: slug, slug });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, { name: "Rivera Plumbing", status: "prospect" });
  const proposal = await createProposal(scope, {
    title: "Local search, twelve months",
    currency: "CAD",
    businessId: business.id,
    termMonths: 12,
  });
  await addProposalLine(scope, proposal.id, { name: "Setup", billing: "one_time", unitPrice: cad(150_000) });
  await addProposalLine(scope, proposal.id, { name: "Retainer", billing: "monthly", unitPrice: cad(120_000) });
  const sent = await sendProposal(scope, proposal.id);
  if (!sent.ok) throw new Error("could not send the fixture proposal");

  const link = await shareProposal(scope, { proposalId: proposal.id });
  return { scope, proposalId: proposal.id, token: link!.token };
}

const signer = { signerName: "  Ana   Rivera ", signerEmail: " Owner@Rivera.example " };

beforeEach(() => resetTables());

describe("opening a proposal by its link", () => {
  it("hands back the proposal and its lines, with no session anywhere", async () => {
    const { token } = await sentProposal();

    const opened = await openProposal(token);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.proposal.title).toBe("Local search, twelve months");
    expect(opened.lines).toHaveLength(2);
    // The fingerprint was stamped at send, and it is what a signature is checked against.
    expect(opened.proposal.termsFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("treats revoked, unshared and never-existed alike", async () => {
    const { scope, proposalId, token } = await sentProposal();

    expect(await openProposal("not-a-real-token-at-all")).toEqual({ ok: false, reason: "gone" });
    expect(await revokeProposalLink(scope, proposalId)).toBe(true);
    expect(await openProposal(token)).toEqual({ ok: false, reason: "gone" });
  });

  it("never opens a draft, even with a link in hand", async () => {
    const org = await createOrg({ name: "agency-b", slug: "agency-b" });
    const scope = { orgId: org.id };
    const draft = await createProposal(scope, { title: "Not ready", currency: "CAD" });
    const link = await shareProposal(scope, { proposalId: draft.id });

    expect(await openProposal(link!.token)).toEqual({ ok: false, reason: "gone" });
  });

  it("counts a view without stopping the page when it cannot", async () => {
    const { scope, proposalId, token } = await sentProposal();
    const opened = await openProposal(token);
    expect(opened.ok).toBe(true);

    await recordProposalEvent(scope, { proposalId, type: "viewed" });
    await recordProposalEvent(scope, { proposalId, type: "viewed" });
    expect(await countProposalViews(scope, proposalId)).toBe(2);
  });
});

describe("signing", () => {
  it("records the signature against the totals as sent", async () => {
    const { scope, proposalId, token } = await sentProposal();

    const result = await signProposal({ token, decision: "accepted", ...signer });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const signature = await findSignature(scope, proposalId);
    expect(signature).toMatchObject({
      signerName: "Ana Rivera",
      signerEmail: "owner@rivera.example",
      termsFingerprint: result.fingerprint,
    });
    expect(signature?.totals.contractValue).toEqual(cad(150_000 + 120_000 * 12));

    const proposal = await getProposal(scope, proposalId);
    expect(proposal?.status).toBe("accepted");
    expect(signature?.termsFingerprint).toBe(proposal?.termsFingerprint);
  });

  it("refuses to sign terms that moved after they were sent", async () => {
    const { scope, proposalId, token } = await sentProposal();

    // Editing a sent proposal is refused everywhere in the product, so reach past the
    // repo to prove the check does not rely on that being true.
    const [line] = await listProposalLines(scope, proposalId);
    await db()`update proposal_lines set unit_amount = 999999 where id = ${line.id}`;

    const result = await signProposal({ token, decision: "accepted", ...signer });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.errors.form).toMatch(/changed since they were sent/);

    // Nothing was recorded, and the proposal is still open.
    expect(await findSignature(scope, proposalId)).toBeNull();
    expect((await getProposal(scope, proposalId))?.status).toBe("sent");
  });

  it("records a decline without a signature", async () => {
    const { scope, proposalId, token } = await sentProposal();

    const result = await signProposal({ token, decision: "declined", ...signer });
    expect(result.ok).toBe(true);
    expect(await findSignature(scope, proposalId)).toBeNull();
    expect((await getProposal(scope, proposalId))?.status).toBe("declined");
  });

  it("answers once, however many times the button is pressed", async () => {
    const { token } = await sentProposal();

    const first = await signProposal({ token, decision: "accepted", ...signer });
    const second = await signProposal({ token, decision: "declined", ...signer });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.status).toBe(409);
  });

  it("asks for a name and an address a person could actually be reached at", async () => {
    const { token } = await sentProposal();

    const result = await signProposal({ token, decision: "accepted", signerName: "A", signerEmail: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["signerEmail", "signerName"]);
  });

  it("leaves a history the follow-up queue can be built from", async () => {
    const { scope, proposalId, token } = await sentProposal();
    await recordProposalEvent(scope, { proposalId, type: "sent" });
    await recordProposalEvent(scope, { proposalId, type: "viewed" });
    await signProposal({ token, decision: "accepted", ...signer });

    const events = await listProposalEvents(scope, proposalId);
    expect(events.map((e) => e.type)).toEqual(["sent", "viewed", "accepted"]);
  });

  it("tells the agency, and does not fail the signature when it cannot", async () => {
    const { proposalId, token } = await sentProposal();
    const sent: string[] = [];

    const result = await signProposal(
      { token, decision: "accepted", ...signer },
      {
        origin: "https://audit.northline.example",
        agencyEmails: async () => ["hello@northline.example"],
        sendEmail: async (_scope, message) => {
          sent.push(message.subject);
          return { status: "sent", providerId: "msg", reason: null };
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(sent[0]).toMatch(/Rivera Plumbing accepted/);

    const broken = await sentProposal("agency-c");
    const stillOk = await signProposal(
      { token: broken.token, decision: "accepted", ...signer },
      {
        origin: "https://audit.northline.example",
        agencyEmails: async () => {
          throw new Error("the user table went away");
        },
      },
    );
    expect(stillOk.ok).toBe(true);
    expect(await findSignature(broken.scope, broken.proposalId)).not.toBeNull();
    expect(proposalId).not.toBe(broken.proposalId);
  });

  it("never lets one workspace read another's signature", async () => {
    const a = await sentProposal("agency-a");
    const b = await sentProposal("agency-b");
    await signProposal({ token: a.token, decision: "accepted", ...signer });

    expect(await findSignature(b.scope, a.proposalId)).toBeNull();
    expect(await countProposalViews(b.scope, a.proposalId)).toBe(0);
    expect(await listProposalEvents(b.scope, a.proposalId)).toEqual([]);
    // And it cannot reach in to pull the link either.
    expect(await revokeProposalLink(b.scope, a.proposalId)).toBe(false);
    expect(await getProposal(b.scope, a.proposalId)).toBeNull();
  });
});
