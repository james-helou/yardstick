import { z } from "zod";

export const BUSINESS_STATUSES = ["prospect", "client", "archived"] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

/**
 * Collapses a free-text field to its meaningful content. A field the user tabbed
 * through and left blank is absent, not an empty string, so the column stays null and
 * "no website" reads the same however it was entered.
 */
function collapse(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const collapsed = value.trim().replace(/\s+/g, " ");
  return collapsed.length > 0 ? collapsed : undefined;
}

function toNumber(value: unknown): number | undefined | typeof INVALID {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : INVALID;
}

const INVALID = Symbol("invalid");

/**
 * A person types "acme.com". Assuming https keeps that working, while still refusing
 * anything that is not a web address.
 */
function toWebsiteUrl(value: unknown): string | undefined | typeof INVALID {
  const raw = collapse(value);
  if (raw === undefined) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return INVALID;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return INVALID;
  if (!url.hostname.includes(".")) return INVALID;
  url.hostname = url.hostname.toLowerCase();
  const serialised = url.toString();
  return url.pathname === "/" && serialised.endsWith("/") ? serialised.slice(0, -1) : serialised;
}

const schema = z.object({
  name: z.string("Enter the business name").min(1, "Enter the business name").max(200),
  status: z.enum(BUSINESS_STATUSES, "Pick a status we recognise"),
  addressLine: z.string().max(300).optional(),
  locality: z.string().max(120).optional(),
  region: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().regex(/^[A-Z]{2}$/, "Use a two letter country code").optional(),
  latitude: z.number().min(-90, "Latitude runs from -90 to 90").max(90, "Latitude runs from -90 to 90").optional(),
  longitude: z.number().min(-180, "Longitude runs from -180 to 180").max(180, "Longitude runs from -180 to 180").optional(),
  primaryCategory: z.string().max(120).optional(),
  websiteUrl: z.string().max(500).optional(),
  phone: z.string().max(40).optional(),
  placeId: z.string().max(300).optional(),
});

export type BusinessInput = z.infer<typeof schema>;

export type ParseResult =
  | { ok: true; value: BusinessInput }
  | { ok: false; errors: Record<string, string> };

/**
 * Validates one business, reporting every bad field at once. A form needs all of the
 * problems, not the first one, or the user fixes them one reload at a time.
 */
export function parseBusinessInput(raw: unknown): ParseResult {
  const source = (raw ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const website = toWebsiteUrl(source.websiteUrl);
  if (website === INVALID) errors.websiteUrl = "Enter a web address like acme.com";

  const latitude = toNumber(source.latitude);
  if (latitude === INVALID) errors.latitude = "Latitude must be a number";

  const longitude = toNumber(source.longitude);
  if (longitude === INVALID) errors.longitude = "Longitude must be a number";

  const countryRaw = collapse(source.country);

  const normalised = {
    name: collapse(source.name) ?? "",
    status: collapse(source.status) ?? "prospect",
    addressLine: collapse(source.addressLine),
    locality: collapse(source.locality),
    region: collapse(source.region),
    postalCode: collapse(source.postalCode),
    country: countryRaw?.toUpperCase(),
    latitude: latitude === INVALID ? undefined : latitude,
    longitude: longitude === INVALID ? undefined : longitude,
    primaryCategory: collapse(source.primaryCategory),
    websiteUrl: website === INVALID ? undefined : website,
    phone: collapse(source.phone),
    placeId: collapse(source.placeId),
  };

  const parsed = schema.safeParse(normalised);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".") || "form";
      errors[field] ??= issue.message;
    }
  }

  // Half a coordinate pair locates nothing, and dropping it silently would lose data
  // the user believes they entered.
  const hasLat = normalised.latitude !== undefined;
  const hasLng = normalised.longitude !== undefined;
  if (hasLat && !hasLng) errors.longitude ??= "Add a longitude too";
  if (hasLng && !hasLat) errors.latitude ??= "Add a latitude too";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: (parsed as { data: BusinessInput }).data };
}
