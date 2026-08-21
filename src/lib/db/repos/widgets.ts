import { randomBytes } from "node:crypto";
import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

export type WidgetKey = {
  id: string;
  orgId: string;
  publicKey: string;
  label: string;
  active: boolean;
  createdAt: Date;
};

type Row = {
  id: string;
  org_id: string;
  public_key: string;
  label: string;
  active: boolean;
  created_at: Date;
};

const toKey = (r: Row): WidgetKey => ({
  id: r.id,
  orgId: r.org_id,
  publicKey: r.public_key,
  label: r.label,
  active: r.active,
  createdAt: new Date(r.created_at),
});

/** Prefixed so a key found in someone's page source is recognisable for what it is. */
export function newPublicKey(): string {
  return `yk_${randomBytes(12).toString("base64url")}`;
}

export async function createWidgetKey(scope: OrgScope, input?: { label?: string }): Promise<WidgetKey> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    insert into widget_keys (org_id, public_key, label)
    values (${orgId}, ${newPublicKey()}, ${input?.label ?? "Website widget"})
    returning *
  `;
  return toKey(row);
}

export async function listWidgetKeys(scope: OrgScope): Promise<WidgetKey[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select * from widget_keys where org_id = ${orgId} order by created_at desc
  `;
  return rows.map(toKey);
}

export async function deactivateWidgetKey(scope: OrgScope, id: string): Promise<boolean> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    update widget_keys set active = false
     where id = ${id} and org_id = ${orgId} and active
    returning *
  `;
  return rows.length > 0;
}

/**
 * The public lookup. No scope: the key names the workspace, which is the whole point of
 * it. An inactive key resolves to nothing, so turning one off takes effect immediately.
 */
export async function findActiveWidgetKey(publicKey: string): Promise<WidgetKey | null> {
  if (!publicKey.startsWith("yk_")) return null;
  const [row] = await db()<Row[]>`
    select * from widget_keys where public_key = ${publicKey} and active
  `;
  return row ? toKey(row) : null;
}
