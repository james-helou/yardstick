import { randomBytes } from "node:crypto";
import { money, type Currency, type Money } from "@/lib/money";
import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

/**
 * Everything about a proposal after it leaves the building: the link it went out on,
 * what happened to it, and the signature at the end.
 *
 * The link is the authorization. `findProposalLinkByToken` takes no scope on purpose:
 * there is no session on a public page, so the token has to decide which workspace this
 * is, and the org it returns is what scopes every query that follows.
 */

export type ProposalLink = {
  id: string;
  orgId: string;
  proposalId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

type LinkRow = {
  id: string;
  org_id: string;
  proposal_id: string;
  token: string;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

const toLink = (r: LinkRow): ProposalLink => ({
  id: r.id,
  orgId: r.org_id,
  proposalId: r.proposal_id,
  token: r.token,
  expiresAt: r.expires_at === null ? null : new Date(r.expires_at),
  revokedAt: r.revoked_at === null ? null : new Date(r.revoked_at),
  createdAt: new Date(r.created_at),
});

/** 24 bytes, url-safe: long enough that guessing is not a strategy. */
export function newProposalToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Shares a proposal, or hands back the share it already has. Never mints a second live link. */
export async function shareProposal(
  scope: OrgScope,
  input: { proposalId: string; expiresAt?: Date | null },
): Promise<ProposalLink | null> {
  const orgId = requireOrg(scope);
  const sql = db();

  // Selecting from proposals is the tenancy check: another workspace's proposal produces
  // no row at all rather than a link to someone else's price.
  const [row] = await sql<LinkRow[]>`
    insert into proposal_links (org_id, proposal_id, token, expires_at)
    select ${orgId}, ${input.proposalId}, ${newProposalToken()}, ${input.expiresAt ?? null}
      from proposals where id = ${input.proposalId} and org_id = ${orgId}
    on conflict (proposal_id) do update
      set revoked_at = null, expires_at = excluded.expires_at
    returning *
  `;
  return row ? toLink(row) : null;
}

export async function getProposalLink(scope: OrgScope, proposalId: string): Promise<ProposalLink | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<LinkRow[]>`
    select * from proposal_links where proposal_id = ${proposalId} and org_id = ${orgId}
  `;
  return row ? toLink(row) : null;
}

export async function revokeProposalLink(scope: OrgScope, proposalId: string): Promise<boolean> {
  const orgId = requireOrg(scope);
  const rows = await db()<{ id: string }[]>`
    update proposal_links set revoked_at = now()
     where proposal_id = ${proposalId} and org_id = ${orgId} and revoked_at is null
    returning id
  `;
  return rows.length > 0;
}

/** No scope: the token is the authorization, and the org it names scopes what follows. */
export async function findProposalLinkByToken(token: string): Promise<ProposalLink | null> {
  if (token.length < 16) return null;
  const [row] = await db()<LinkRow[]>`select * from proposal_links where token = ${token}`;
  return row ? toLink(row) : null;
}

export function isLive(link: ProposalLink, now: Date = new Date()): boolean {
  if (link.revokedAt !== null) return false;
  return link.expiresAt === null || link.expiresAt.getTime() > now.getTime();
}

export type EventType = "sent" | "viewed" | "accepted" | "declined";

export type ProposalEvent = {
  id: string;
  proposalId: string;
  type: EventType;
  createdAt: Date;
};

type EventRow = { id: string; proposal_id: string; type: EventType; created_at: Date };

const toEvent = (r: EventRow): ProposalEvent => ({
  id: r.id,
  proposalId: r.proposal_id,
  type: r.type,
  createdAt: new Date(r.created_at),
});

/**
 * Best effort. A view that could not be written down is not a reason to refuse to show
 * the proposal, so this swallows its own failure and says whether it worked.
 */
export async function recordProposalEvent(
  scope: OrgScope,
  input: { proposalId: string; type: EventType; ipHash?: string | null; userAgent?: string | null },
): Promise<boolean> {
  const orgId = requireOrg(scope);
  try {
    await db()`
      insert into proposal_events (org_id, proposal_id, type, ip_hash, user_agent)
      values (
        ${orgId},
        ${input.proposalId},
        ${input.type},
        ${input.ipHash ?? null},
        ${input.userAgent ? input.userAgent.slice(0, 300) : null}
      )
    `;
    return true;
  } catch {
    return false;
  }
}

export async function listProposalEvents(scope: OrgScope, proposalId: string): Promise<ProposalEvent[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<EventRow[]>`
    select id, proposal_id, type, created_at from proposal_events
     where proposal_id = ${proposalId} and org_id = ${orgId}
     order by created_at asc
  `;
  return rows.map(toEvent);
}

export async function countProposalViews(scope: OrgScope, proposalId: string): Promise<number> {
  const orgId = requireOrg(scope);
  const [row] = await db()<{ views: string }[]>`
    select count(*) as views from proposal_events
     where proposal_id = ${proposalId} and org_id = ${orgId} and type = 'viewed'
  `;
  return Number(row?.views ?? 0);
}

export type Signature = {
  id: string;
  proposalId: string;
  signerName: string;
  signerEmail: string;
  termsFingerprint: string;
  totals: { oneTime: Money; monthly: Money; contractValue: Money };
  signedAt: Date;
};

type SignatureRow = {
  id: string;
  proposal_id: string;
  signer_name: string;
  signer_email: string;
  terms_fingerprint: string;
  currency: Currency;
  one_time_total: string;
  monthly_total: string;
  contract_value: string;
  signed_at: Date;
};

const toSignature = (r: SignatureRow): Signature => ({
  id: r.id,
  proposalId: r.proposal_id,
  signerName: r.signer_name,
  signerEmail: r.signer_email,
  termsFingerprint: r.terms_fingerprint,
  totals: {
    oneTime: money(Number.parseInt(r.one_time_total, 10), r.currency),
    monthly: money(Number.parseInt(r.monthly_total, 10), r.currency),
    contractValue: money(Number.parseInt(r.contract_value, 10), r.currency),
  },
  signedAt: new Date(r.signed_at),
});

export type SignatureInput = {
  proposalId: string;
  signerName: string;
  signerEmail: string;
  termsFingerprint: string;
  totals: { oneTime: Money; monthly: Money; contractValue: Money };
  ipHash?: string | null;
  userAgent?: string | null;
};

/** One signature per proposal. A second attempt returns the first, it does not replace it. */
export async function recordSignature(scope: OrgScope, input: SignatureInput): Promise<Signature> {
  const orgId = requireOrg(scope);
  const [row] = await db()<SignatureRow[]>`
    insert into proposal_signatures (
      org_id, proposal_id, signer_name, signer_email, terms_fingerprint,
      currency, one_time_total, monthly_total, contract_value, ip_hash, user_agent
    )
    values (
      ${orgId},
      ${input.proposalId},
      ${input.signerName},
      ${input.signerEmail},
      ${input.termsFingerprint},
      ${input.totals.contractValue.currency},
      ${input.totals.oneTime.amount},
      ${input.totals.monthly.amount},
      ${input.totals.contractValue.amount},
      ${input.ipHash ?? null},
      ${input.userAgent ? input.userAgent.slice(0, 300) : null}
    )
    on conflict (proposal_id) do update set proposal_id = excluded.proposal_id
    returning *
  `;
  return toSignature(row);
}

export async function findSignature(scope: OrgScope, proposalId: string): Promise<Signature | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<SignatureRow[]>`
    select * from proposal_signatures where proposal_id = ${proposalId} and org_id = ${orgId}
  `;
  return row ? toSignature(row) : null;
}
