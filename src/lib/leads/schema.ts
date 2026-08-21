import { z } from "zod";

/**
 * What a stranger types into an agency's website. Deliberately short: every extra field
 * is a reason not to finish, and everything else about the business is something the
 * scan finds out on its own.
 */
const schema = z.object({
  businessName: z.string("Enter the business name").min(1, "Enter the business name").max(200),
  email: z.email("Enter an email we can send the report to").max(200),
  website: z.string().max(500).optional(),
  contactName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  locality: z.string().max(120).optional(),
  primaryCategory: z.string().max(120).optional(),
});

export type AuditRequest = z.infer<typeof schema>;

export type ParseResult =
  | { ok: true; value: AuditRequest }
  | { ok: false; errors: Record<string, string> };

function collapse(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const collapsed = value.trim().replace(/\s+/g, " ");
  return collapsed.length > 0 ? collapsed : undefined;
}

/**
 * Validates one audit request, reporting every bad field at once. A public form gets one
 * chance: sending someone back for a second field they could have fixed the first time
 * is how a lead becomes a bounce.
 */
export function parseAuditRequest(raw: unknown): ParseResult {
  const source = (raw ?? {}) as Record<string, unknown>;

  const parsed = schema.safeParse({
    businessName: collapse(source.businessName),
    email: collapse(source.email)?.toLowerCase(),
    website: collapse(source.website),
    contactName: collapse(source.contactName),
    phone: collapse(source.phone),
    locality: collapse(source.locality),
    primaryCategory: collapse(source.primaryCategory),
  });

  if (parsed.success) return { ok: true, value: parsed.data };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}
