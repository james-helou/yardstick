import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

export type DeliveryStatus = "sent" | "skipped" | "failed";

export type EmailDelivery = {
  id: string;
  orgId: string;
  leadId: string | null;
  template: string;
  toAddress: string;
  subject: string;
  status: DeliveryStatus;
  providerId: string | null;
  error: string | null;
  createdAt: Date;
};

type Row = {
  id: string;
  org_id: string;
  lead_id: string | null;
  template: string;
  to_address: string;
  subject: string;
  status: DeliveryStatus;
  provider_id: string | null;
  error: string | null;
  created_at: Date;
};

const toDelivery = (r: Row): EmailDelivery => ({
  id: r.id,
  orgId: r.org_id,
  leadId: r.lead_id,
  template: r.template,
  toAddress: r.to_address,
  subject: r.subject,
  status: r.status,
  providerId: r.provider_id,
  error: r.error,
  createdAt: new Date(r.created_at),
});

export type DeliveryInput = {
  leadId?: string | null;
  template: string;
  toAddress: string;
  subject: string;
  status: DeliveryStatus;
  providerId?: string | null;
  error?: string | null;
};

/** Insert-only. A second attempt is a second row, so the history reads as it happened. */
export async function recordDelivery(scope: OrgScope, input: DeliveryInput): Promise<EmailDelivery> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    insert into email_deliveries (org_id, lead_id, template, to_address, subject, status, provider_id, error)
    values (
      ${orgId},
      ${input.leadId ?? null},
      ${input.template},
      ${input.toAddress},
      ${input.subject},
      ${input.status},
      ${input.providerId ?? null},
      ${input.error ? input.error.slice(0, 500) : null}
    )
    returning *
  `;
  return toDelivery(row);
}

export async function listDeliveriesForLead(scope: OrgScope, leadId: string): Promise<EmailDelivery[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select * from email_deliveries
     where org_id = ${orgId} and lead_id = ${leadId}
     order by created_at asc
  `;
  return rows.map(toDelivery);
}

export async function countDeliveries(scope: OrgScope, status?: DeliveryStatus): Promise<number> {
  const orgId = requireOrg(scope);
  const [row] = await db()<{ total: string }[]>`
    select count(*) as total from email_deliveries
     where org_id = ${orgId}
       ${status ? db()`and status = ${status}` : db()``}
  `;
  return Number(row?.total ?? 0);
}

/**
 * The latest attempt per lead, for a page of leads. One statement, so a list of twenty
 * leads does not become twenty-one queries.
 */
export async function latestDeliveryByLead(
  scope: OrgScope,
  leadIds: string[],
): Promise<Map<string, EmailDelivery>> {
  const orgId = requireOrg(scope);
  if (leadIds.length === 0) return new Map();

  const rows = await db()<Row[]>`
    select distinct on (lead_id) *
      from email_deliveries
     where org_id = ${orgId}
       and lead_id = any(${db().array(leadIds)}::uuid[])
     order by lead_id, created_at desc
  `;
  return new Map(rows.map((r) => [r.lead_id as string, toDelivery(r)]));
}
