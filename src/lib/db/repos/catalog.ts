import { money, type Currency, type Money } from "@/lib/money";
import type { Billing } from "@/lib/proposals/quote";
import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

export type ServiceItem = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  billing: Billing;
  unitPrice: Money;
  defaultQuantity: number;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
};

type Row = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  billing: Billing;
  unit_amount: string;
  currency: Currency;
  default_quantity: number;
  active: boolean;
  sort_order: number;
  created_at: Date;
};

/** The driver hands back bigint as a string. Coerce here, at the boundary, and nowhere deeper. */
const toItem = (r: Row): ServiceItem => ({
  id: r.id,
  orgId: r.org_id,
  name: r.name,
  description: r.description,
  billing: r.billing,
  unitPrice: money(Number.parseInt(r.unit_amount, 10), r.currency),
  defaultQuantity: r.default_quantity,
  active: r.active,
  sortOrder: r.sort_order,
  createdAt: new Date(r.created_at),
});

export type ServiceItemInput = {
  name: string;
  description?: string | null;
  billing: Billing;
  unitPrice: Money;
  defaultQuantity?: number;
  sortOrder?: number;
};

export async function createServiceItem(scope: OrgScope, input: ServiceItemInput): Promise<ServiceItem> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    insert into service_items (org_id, name, description, billing, unit_amount, currency, default_quantity, sort_order)
    values (
      ${orgId},
      ${input.name},
      ${input.description ?? null},
      ${input.billing},
      ${input.unitPrice.amount},
      ${input.unitPrice.currency},
      ${input.defaultQuantity ?? 1},
      ${input.sortOrder ?? 0}
    )
    returning *
  `;
  return toItem(row);
}

export async function listServiceItems(
  scope: OrgScope,
  options: { includeInactive?: boolean } = {},
): Promise<ServiceItem[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select * from service_items
     where org_id = ${orgId}
       ${options.includeInactive ? db()`` : db()`and active`}
     order by sort_order asc, created_at asc
  `;
  return rows.map(toItem);
}

export async function getServiceItem(scope: OrgScope, id: string): Promise<ServiceItem | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`select * from service_items where id = ${id} and org_id = ${orgId}`;
  return row ? toItem(row) : null;
}

export type ServiceItemPatch = Partial<ServiceItemInput> & { active?: boolean };

/**
 * The catalogue is the one place a price is allowed to change. Nothing already quoted
 * moves with it: a proposal line carries its own copy of the price from the moment it
 * is added.
 */
export async function updateServiceItem(
  scope: OrgScope,
  id: string,
  patch: ServiceItemPatch,
): Promise<ServiceItem | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    update service_items set
      name = coalesce(${patch.name ?? null}, name),
      description = ${patch.description === undefined ? db()`description` : patch.description},
      billing = coalesce(${patch.billing ?? null}, billing),
      unit_amount = coalesce(${patch.unitPrice?.amount ?? null}, unit_amount),
      currency = coalesce(${patch.unitPrice?.currency ?? null}, currency),
      default_quantity = coalesce(${patch.defaultQuantity ?? null}, default_quantity),
      sort_order = coalesce(${patch.sortOrder ?? null}, sort_order),
      active = coalesce(${patch.active ?? null}, active),
      updated_at = now()
    where id = ${id} and org_id = ${orgId}
    returning *
  `;
  return row ? toItem(row) : null;
}

/** Switched off, never deleted: proposals that already used it stay readable. */
export async function archiveServiceItem(scope: OrgScope, id: string): Promise<boolean> {
  const item = await updateServiceItem(scope, id, { active: false });
  return item !== null;
}
