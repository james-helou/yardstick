import { money, type Currency, type Money } from "@/lib/money";
import { orderByFragment, pageWindow, type ListQuery, type PageWindow } from "@/lib/list/query";
import { termsFingerprint } from "@/lib/proposals/fingerprint";
import { quote, snapshotOf, type Billing, type Quote, type QuoteLine } from "@/lib/proposals/quote";
import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

export type ProposalStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export type Proposal = {
  id: string;
  orgId: string;
  businessId: string | null;
  businessName: string | null;
  scanId: string | null;
  title: string;
  status: ProposalStatus;
  currency: Currency;
  termMonths: number;
  freeMonths: number;
  discountPercent: number;
  taxPercent: number;
  notes: string | null;
  sentAt: Date | null;
  expiresAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
  /** Written when it was sent. Null on a draft, which is recomputed from its lines. */
  totals: { oneTime: Money; monthly: Money; contractValue: Money } | null;
  /** The terms as sent, hashed. What a signature is checked against. */
  termsFingerprint: string | null;
};

export type ProposalLine = {
  id: string;
  proposalId: string;
  serviceItemId: string | null;
  name: string;
  billing: Billing;
  unitPrice: Money;
  quantity: number;
  discountPercent: number;
  sortOrder: number;
};

type Row = {
  id: string;
  org_id: string;
  business_id: string | null;
  business_name?: string | null;
  scan_id: string | null;
  title: string;
  status: ProposalStatus;
  currency: Currency;
  term_months: number;
  free_months: number;
  discount_bp: number;
  tax_bp: number;
  notes: string | null;
  sent_at: Date | null;
  one_time_total: string | null;
  monthly_total: string | null;
  contract_value: string | null;
  expires_at: Date | null;
  decided_at: Date | null;
  terms_fingerprint: string | null;
  created_at: Date;
};

type LineRow = {
  id: string;
  proposal_id: string;
  service_item_id: string | null;
  name: string;
  billing: Billing;
  unit_amount: string;
  quantity: number;
  discount_bp: number;
  sort_order: number;
};

/** Basis points keep a discount of 12.5% exact in storage. Percent is what the engine takes. */
const toPercent = (bp: number): number => bp / 100;
const toBp = (percent: number): number => Math.round(percent * 100);

const toProposal = (r: Row): Proposal => ({
  id: r.id,
  orgId: r.org_id,
  businessId: r.business_id,
  businessName: r.business_name ?? null,
  scanId: r.scan_id,
  title: r.title,
  status: r.status,
  currency: r.currency,
  termMonths: r.term_months,
  freeMonths: r.free_months,
  discountPercent: toPercent(r.discount_bp),
  taxPercent: toPercent(r.tax_bp),
  notes: r.notes,
  sentAt: r.sent_at ? new Date(r.sent_at) : null,
  expiresAt: r.expires_at ? new Date(r.expires_at) : null,
  decidedAt: r.decided_at ? new Date(r.decided_at) : null,
  createdAt: new Date(r.created_at),
  termsFingerprint: r.terms_fingerprint,
  totals:
    r.one_time_total === null || r.monthly_total === null || r.contract_value === null
      ? null
      : {
          oneTime: money(Number.parseInt(r.one_time_total, 10), r.currency),
          monthly: money(Number.parseInt(r.monthly_total, 10), r.currency),
          contractValue: money(Number.parseInt(r.contract_value, 10), r.currency),
        },
});

const toLine = (r: LineRow, currency: Currency): ProposalLine => ({
  id: r.id,
  proposalId: r.proposal_id,
  serviceItemId: r.service_item_id,
  name: r.name,
  billing: r.billing,
  unitPrice: money(Number.parseInt(r.unit_amount, 10), currency),
  quantity: r.quantity,
  discountPercent: toPercent(r.discount_bp),
  sortOrder: r.sort_order,
});

/** A draft is only ever a draft. Everything past that is a record of what was said. */
export const isEditable = (proposal: Proposal): boolean => proposal.status === "draft";

export type ProposalInput = {
  title: string;
  currency: Currency;
  businessId?: string | null;
  scanId?: string | null;
  termMonths?: number;
  freeMonths?: number;
  discountPercent?: number;
  taxPercent?: number;
  notes?: string | null;
};

export async function createProposal(scope: OrgScope, input: ProposalInput): Promise<Proposal> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    insert into proposals (
      org_id, business_id, scan_id, title, currency, term_months, free_months, discount_bp, tax_bp, notes
    )
    values (
      ${orgId},
      ${input.businessId ?? null},
      ${input.scanId ?? null},
      ${input.title},
      ${input.currency},
      ${input.termMonths ?? 0},
      ${input.freeMonths ?? 0},
      ${toBp(input.discountPercent ?? 0)},
      ${toBp(input.taxPercent ?? 0)},
      ${input.notes ?? null}
    )
    returning *
  `;
  return toProposal(row);
}

export async function getProposal(scope: OrgScope, id: string): Promise<Proposal | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    select p.*, b.name as business_name
      from proposals p
      left join businesses b on b.id = p.business_id and b.org_id = p.org_id
     where p.id = ${id} and p.org_id = ${orgId}
  `;
  return row ? toProposal(row) : null;
}

export async function listProposalLines(scope: OrgScope, proposalId: string): Promise<ProposalLine[]> {
  const orgId = requireOrg(scope);
  const [head] = await db()<{ currency: Currency }[]>`
    select currency from proposals where id = ${proposalId} and org_id = ${orgId}
  `;
  if (!head) return [];

  const rows = await db()<LineRow[]>`
    select * from proposal_lines
     where proposal_id = ${proposalId} and org_id = ${orgId}
     order by sort_order asc, created_at asc
  `;
  return rows.map((row) => toLine(row, head.currency));
}

/** The live price of a draft, from its own lines. A sent proposal renders its snapshot instead. */
export function quoteOf(proposal: Proposal, lines: readonly ProposalLine[]): Quote {
  const quoteLines: QuoteLine[] = lines.map((line) => ({
    key: line.id,
    name: line.name,
    billing: line.billing,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    discountPercent: line.discountPercent,
  }));

  return quote(quoteLines, {
    currency: proposal.currency,
    termMonths: proposal.termMonths,
    freeMonths: proposal.freeMonths,
    discountPercent: proposal.discountPercent,
    taxPercent: proposal.taxPercent,
  });
}

export type ProposalSort = "createdAt" | "title" | "contractValue";

export const PROPOSAL_LIST_SPEC = {
  sortable: ["createdAt", "title", "contractValue"] as const,
  defaultSort: "createdAt" as const,
  defaultDirection: "desc" as const,
};

const ORDER_COLUMNS: Record<ProposalSort, string> = {
  createdAt: "p.created_at",
  title: "lower(p.title)",
  contractValue: "coalesce(p.contract_value, 0)",
};

export async function listProposals(
  scope: OrgScope,
  query: ListQuery<ProposalSort>,
): Promise<{ rows: Proposal[]; window: PageWindow }> {
  const orgId = requireOrg(scope);
  const sql = db();
  const term = query.search ? `%${query.search.replace(/[%_\\]/g, "\\$&")}%` : null;

  const filter = term
    ? sql`and (p.title ilike ${term} escape '\\' or b.name ilike ${term} escape '\\')`
    : sql``;

  const [{ count }] = await sql<{ count: string }[]>`
    select count(*)::text as count
      from proposals p
      left join businesses b on b.id = p.business_id and b.org_id = p.org_id
     where p.org_id = ${orgId} ${filter}
  `;

  const window = pageWindow({ total: Number(count), page: query.page });
  if (window.total === 0) return { rows: [], window };

  const rows = await sql<Row[]>`
    select p.*, b.name as business_name
      from proposals p
      left join businesses b on b.id = p.business_id and b.org_id = p.org_id
     where p.org_id = ${orgId} ${filter}
     order by ${sql.unsafe(orderByFragment(query, ORDER_COLUMNS))}, p.id asc
     limit ${window.limit} offset ${window.offset}
  `;

  return { rows: rows.map(toProposal), window };
}

export type ProposalPatch = Partial<Omit<ProposalInput, "currency">>;

/** Refuses anything that is no longer a draft, so a sent price cannot be edited afterwards. */
export async function updateProposal(
  scope: OrgScope,
  id: string,
  patch: ProposalPatch,
): Promise<Proposal | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    update proposals set
      title = coalesce(${patch.title ?? null}, title),
      business_id = ${patch.businessId === undefined ? db()`business_id` : patch.businessId},
      scan_id = ${patch.scanId === undefined ? db()`scan_id` : patch.scanId},
      term_months = coalesce(${patch.termMonths ?? null}, term_months),
      free_months = coalesce(${patch.freeMonths ?? null}, free_months),
      discount_bp = coalesce(${patch.discountPercent === undefined ? null : toBp(patch.discountPercent)}, discount_bp),
      tax_bp = coalesce(${patch.taxPercent === undefined ? null : toBp(patch.taxPercent)}, tax_bp),
      notes = ${patch.notes === undefined ? db()`notes` : patch.notes},
      updated_at = now()
    where id = ${id} and org_id = ${orgId} and status = 'draft'
    returning *
  `;
  return row ? toProposal(row) : null;
}

export type LineInput = {
  serviceItemId?: string | null;
  name: string;
  billing: Billing;
  unitPrice: Money;
  quantity?: number;
  discountPercent?: number;
  sortOrder?: number;
};

export async function addProposalLine(
  scope: OrgScope,
  proposalId: string,
  input: LineInput,
): Promise<ProposalLine | null> {
  const orgId = requireOrg(scope);
  // The insert selects from proposals, so a proposal in another workspace, or one that
  // has already been sent, produces no line at all rather than an error to interpret.
  const [row] = await db()<LineRow[]>`
    insert into proposal_lines (
      org_id, proposal_id, service_item_id, name, billing, unit_amount, quantity, discount_bp, sort_order
    )
    select
      ${orgId},
      ${proposalId},
      ${input.serviceItemId ?? null},
      ${input.name},
      ${input.billing},
      ${input.unitPrice.amount},
      ${input.quantity ?? 1},
      ${toBp(input.discountPercent ?? 0)},
      ${input.sortOrder ?? 0}
      from proposals p
     where p.id = ${proposalId}
       and p.org_id = ${orgId}
       and p.status = 'draft'
       and p.currency = ${input.unitPrice.currency}
    returning *
  `;
  return row ? toLine(row, input.unitPrice.currency) : null;
}

export async function updateProposalLine(
  scope: OrgScope,
  lineId: string,
  patch: { quantity?: number; discountPercent?: number; name?: string; unitPrice?: Money },
): Promise<boolean> {
  const orgId = requireOrg(scope);
  const rows = await db()<{ id: string }[]>`
    update proposal_lines l set
      name = coalesce(${patch.name ?? null}, l.name),
      quantity = coalesce(${patch.quantity ?? null}, l.quantity),
      unit_amount = coalesce(${patch.unitPrice?.amount ?? null}, l.unit_amount),
      discount_bp = coalesce(${patch.discountPercent === undefined ? null : toBp(patch.discountPercent)}, l.discount_bp)
      from proposals p
     where l.id = ${lineId}
       and l.org_id = ${orgId}
       and p.id = l.proposal_id
       and p.org_id = ${orgId}
       and p.status = 'draft'
    returning l.id
  `;
  return rows.length > 0;
}

export async function removeProposalLine(scope: OrgScope, lineId: string): Promise<boolean> {
  const orgId = requireOrg(scope);
  const rows = await db()<{ id: string }[]>`
    delete from proposal_lines l
     using proposals p
     where l.id = ${lineId}
       and l.org_id = ${orgId}
       and p.id = l.proposal_id
       and p.org_id = ${orgId}
       and p.status = 'draft'
    returning l.id
  `;
  return rows.length > 0;
}

export type SendResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; reason: "not_found" | "not_a_draft" | "empty" };

/**
 * Sending is the moment the price stops moving. The totals are computed once, from the
 * lines as they stand, and written to the row under a lock, so two clicks on send
 * produce one sent proposal rather than two different prices.
 */
export async function sendProposal(
  scope: OrgScope,
  id: string,
  options: { expiresAt?: Date | null } = {},
): Promise<SendResult> {
  const orgId = requireOrg(scope);

  return db().begin(async (tx) => {
    const [row] = await tx<Row[]>`
      select * from proposals where id = ${id} and org_id = ${orgId} for update
    `;
    if (!row) return { ok: false, reason: "not_found" as const };
    if (row.status !== "draft") return { ok: false, reason: "not_a_draft" as const };

    const lineRows = await tx<LineRow[]>`
      select * from proposal_lines where proposal_id = ${id} and org_id = ${orgId}
       order by sort_order asc, created_at asc
    `;
    if (lineRows.length === 0) return { ok: false, reason: "empty" as const };

    const proposal = toProposal(row);
    const lines = lineRows.map((line) => toLine(line, row.currency));
    const snapshot = snapshotOf(quoteOf(proposal, lines));
    // Computed here, once, from the same rows the totals came from. A signature later is
    // checked against this and nothing else.
    const fingerprint = termsFingerprint({ ...proposal, lines });

    const [sent] = await tx<Row[]>`
      update proposals set
        status = 'sent',
        sent_at = now(),
        one_time_total = ${snapshot.oneTimeTotal},
        monthly_total = ${snapshot.monthlyTotal},
        contract_value = ${snapshot.contractValue},
        terms_fingerprint = ${fingerprint},
        expires_at = ${options.expiresAt ?? null},
        updated_at = now()
      where id = ${id} and org_id = ${orgId} and status = 'draft'
      returning *
    `;
    return { ok: true as const, proposal: toProposal(sent) };
  });
}

/** Recorded once. A proposal that already has an answer keeps the first one. */
export async function decideProposal(
  scope: OrgScope,
  id: string,
  decision: "accepted" | "declined",
): Promise<Proposal | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    update proposals set status = ${decision}, decided_at = now(), updated_at = now()
     where id = ${id} and org_id = ${orgId} and status = 'sent'
    returning *
  `;
  return row ? toProposal(row) : null;
}

/**
 * Every proposal still waiting on an answer. Small by nature: a proposal leaves this list
 * the moment it is accepted, declined or expired, so the follow-up queue reads a set that
 * stays the size of a rep's actual pipeline.
 */
export async function listAwaitingAnswer(scope: OrgScope): Promise<Proposal[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select p.*, b.name as business_name
      from proposals p
      left join businesses b on b.id = p.business_id and b.org_id = p.org_id
     where p.org_id = ${orgId} and p.status = 'sent' and p.sent_at is not null
     order by p.sent_at asc
  `;
  return rows.map(toProposal);
}
