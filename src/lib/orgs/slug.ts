const MAX_LENGTH = 40;

/**
 * A URL-safe name for a workspace. Accents are folded rather than dropped, so
 * "Créative Média" stays readable instead of becoming "cratve-mda".
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "");

  return slug || "workspace";
}
