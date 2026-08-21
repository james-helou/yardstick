import { beforeEach, describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { db } from "../client";
import { resetTables } from "@/test/db";
import { createOrg } from "./orgs";
import {
  findProposalLinkByToken,
  findSignature,
  getProposalLink,
  isLive,
  newProposalToken,
  recordSignature,
  revokeProposalLink,
  shareProposal,
} from "./proposal-sharing";
import { createProposal } from "./proposals";

const totals = {
  oneTime: money(150_000, "CAD"),
  monthly: money(120_000, "CAD"),
  contractValue: money(1_590_000, "CAD"),
};

async function workspace(slug: string) {
  const org = await createOrg({ name: slug, slug });
  const scope = { orgId: org.id };
  const proposal = await createProposal(scope, { title: "Local search", currency: "CAD" });
  return { scope, proposalId: proposal.id };
}

beforeEach(() => resetTables());

describe("tokens", () => {
  it("mints something guessing will not reach", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newProposalToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(32);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("does not even look up something too short to be one of ours", async () => {
    expect(await findProposalLinkByToken("short")).toBeNull();
    expect(await findProposalLinkByToken("")).toBeNull();
  });
});

describe("sharing", () => {
  it("shares once and keeps handing back the same link", async () => {
    const { scope, proposalId } = await workspace("agency-a");

    const first = await shareProposal(scope, { proposalId });
    const second = await shareProposal(scope, { proposalId });

    expect(first).not.toBeNull();
    // A second press of Share must not orphan the URL already sitting in someone's inbox.
    expect(second!.token).toBe(first!.token);
    expect((await getProposalLink(scope, proposalId))!.token).toBe(first!.token);
  });

  it("refuses to share another workspace's proposal", async () => {
    const a = await workspace("agency-a");
    const b = await workspace("agency-b");

    expect(await shareProposal(b.scope, { proposalId: a.proposalId })).toBeNull();
    expect(await getProposalLink(b.scope, a.proposalId)).toBeNull();
  });

  it("revokes, and re-sharing brings the same link back to life", async () => {
    const { scope, proposalId } = await workspace("agency-a");
    const link = await shareProposal(scope, { proposalId });

    expect(await revokeProposalLink(scope, proposalId)).toBe(true);
    expect(isLive((await getProposalLink(scope, proposalId))!)).toBe(false);
    // Revoking twice is not an error, it is just already done.
    expect(await revokeProposalLink(scope, proposalId)).toBe(false);

    const again = await shareProposal(scope, { proposalId });
    expect(again!.token).toBe(link!.token);
    expect(isLive(again!)).toBe(true);
  });

  it("treats an expiry as a deadline, not a suggestion", async () => {
    const { scope, proposalId } = await workspace("agency-a");
    const past = new Date(Date.now() - 60_000);
    const link = await shareProposal(scope, { proposalId, expiresAt: past });

    expect(link!.expiresAt?.getTime()).toBe(past.getTime());
    expect(isLive(link!)).toBe(false);
    // The row is still findable. Deciding it is dead is the caller's job, and it is the
    // same answer either way, so nobody learns whether the token was ever real.
    expect(await findProposalLinkByToken(link!.token)).not.toBeNull();
  });

  it("finds a link by token with no scope, and says which workspace it belongs to", async () => {
    const a = await workspace("agency-a");
    await workspace("agency-b");
    const link = await shareProposal(a.scope, { proposalId: a.proposalId });

    const found = await findProposalLinkByToken(link!.token);
    expect(found!.orgId).toBe(a.scope.orgId);
    expect(found!.proposalId).toBe(a.proposalId);
  });
});

describe("signatures", () => {
  it("keeps the first signature when the button is pressed twice", async () => {
    const { scope, proposalId } = await workspace("agency-a");

    const first = await recordSignature(scope, {
      proposalId,
      signerName: "Ana Rivera",
      signerEmail: "ana@rivera.example",
      termsFingerprint: "a".repeat(64),
      totals,
    });
    const second = await recordSignature(scope, {
      proposalId,
      signerName: "Someone Else",
      signerEmail: "else@rivera.example",
      termsFingerprint: "b".repeat(64),
      totals,
    });

    expect(second.id).toBe(first.id);
    expect(second.signerName).toBe("Ana Rivera");
    expect(second.termsFingerprint).toBe("a".repeat(64));
  });

  it("stores the totals as money, in the currency they were signed in", async () => {
    const { scope, proposalId } = await workspace("agency-a");
    await recordSignature(scope, {
      proposalId,
      signerName: "Ana Rivera",
      signerEmail: "ana@rivera.example",
      termsFingerprint: "a".repeat(64),
      totals,
    });

    const found = await findSignature(scope, proposalId);
    expect(found!.totals).toEqual(totals);
  });

  it("truncates a user agent long enough to be a payload", async () => {
    const { scope, proposalId } = await workspace("agency-a");
    const signature = await recordSignature(scope, {
      proposalId,
      signerName: "Ana Rivera",
      signerEmail: "ana@rivera.example",
      termsFingerprint: "a".repeat(64),
      totals,
      userAgent: "x".repeat(5_000),
    });

    const [row] = await db()<{ user_agent: string }[]>`
      select user_agent from proposal_signatures where id = ${signature.id}
    `;
    expect(row.user_agent.length).toBe(300);
  });
});
