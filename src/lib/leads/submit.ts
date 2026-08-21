import { parseBusinessInput } from "@/lib/businesses/schema";
import { createBusiness, findBusinessByWebsite } from "@/lib/db/repos/businesses";
import { countRecentLeadsByIp, createLead, type Lead } from "@/lib/db/repos/leads";
import { shareScan } from "@/lib/db/repos/reports";
import { findActiveWidgetKey, type WidgetKey } from "@/lib/db/repos/widgets";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { startScan } from "@/lib/scans/runner";
import { parseAuditRequest } from "./schema";

/** How many audits one submitter may ask for, and over what window. */
export const RATE_LIMIT = { requests: 5, windowMs: 60 * 60 * 1000 };

export type SubmitInput = {
  publicKey: string;
  fields: Record<string, unknown>;
  botToken?: string | null;
  ip?: string | null;
  ipHash?: string | null;
};

export type SubmitResult =
  | { ok: true; lead: Lead; scanId: string; token: string }
  | { ok: false; status: number; errors: Record<string, string> };

export type SubmitDeps = {
  verifyBot?: typeof verifyTurnstile;
};

/**
 * The whole public audit path, in one injected module: check the key, check it is a
 * person, check they have not asked five times already, then create the business, the
 * lead, the scan and the link to the report in that order.
 *
 * Both entry points call this one function, so the browser form and the JSON API cannot
 * drift into enforcing different rules.
 */
export async function submitAuditRequest(
  input: SubmitInput,
  deps: SubmitDeps = {},
): Promise<SubmitResult> {
  const key: WidgetKey | null = await findActiveWidgetKey(input.publicKey);
  // An unknown or switched-off key is a 404, not a 401. There is nothing here to
  // authenticate against, and saying "wrong key" would help someone go looking.
  if (!key) return { ok: false, status: 404, errors: { form: "This audit form is no longer active" } };

  const parsed = parseAuditRequest(input.fields);
  if (!parsed.ok) return { ok: false, status: 422, errors: parsed.errors };

  const verify = deps.verifyBot ?? verifyTurnstile;
  const bot = await verify(input.botToken, { remoteIp: input.ip });
  if (!bot.ok) return { ok: false, status: 400, errors: { form: bot.reason ?? "That check did not pass" } };

  if (input.ipHash) {
    const recent = await countRecentLeadsByIp({ ipHash: input.ipHash, withinMs: RATE_LIMIT.windowMs });
    if (recent >= RATE_LIMIT.requests) {
      return {
        ok: false,
        status: 429,
        errors: { form: "That is a lot of audits from one place. Try again in an hour." },
      };
    }
  }

  const scope = { orgId: key.orgId };

  // A repeat submission for the same website joins the business that is already there,
  // so an agency does not end up with four rows for one prospect who clicked twice.
  const existing = parsed.value.website ? await findBusinessByWebsite(scope, parsed.value.website) : null;

  const business =
    existing ??
    (await (async () => {
      const businessInput = parseBusinessInput({
        name: parsed.value.businessName,
        status: "prospect",
        websiteUrl: parsed.value.website,
        locality: parsed.value.locality,
        primaryCategory: parsed.value.primaryCategory,
      });
      if (!businessInput.ok) return null;
      return createBusiness(scope, businessInput.value);
    })());

  if (!business) {
    return { ok: false, status: 422, errors: { website: "Enter a web address like acme.com" } };
  }

  const scan = await startScan(scope, { businessId: business.id });
  if (!scan) return { ok: false, status: 500, errors: { form: "The scan could not be started" } };

  // Shared straight away: the whole promise of the widget is that the person who asked
  // gets a link, and a link that only exists after a rep remembers to press share is
  // not that.
  const link = await shareScan(scope, { scanId: scan.id });
  if (!link) return { ok: false, status: 500, errors: { form: "The report could not be prepared" } };

  const lead = await createLead(scope, {
    email: parsed.value.email,
    contactName: parsed.value.contactName ?? null,
    phone: parsed.value.phone ?? null,
    widgetKeyId: key.id,
    businessId: business.id,
    scanId: scan.id,
    ipHash: input.ipHash ?? null,
  });

  return { ok: true, lead, scanId: scan.id, token: link.token };
}
