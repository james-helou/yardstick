import { addMembership, createOrg, listOrgsForUser, type Org } from "@/lib/db/repos/orgs";
import { slugify } from "./slug";

const UNIQUE_VIOLATION = "23505";
const MAX_ATTEMPTS = 5;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error &&
  (error as { code?: string }).code === UNIQUE_VIOLATION;

/** Short and unambiguous. No l, 1, o or 0, so a slug read aloud survives the trip. */
function suffix(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * The workspace a new account lands in.
 *
 * Idempotent on purpose: sign-up can be retried, and a double submit must not leave the
 * user owning two workspaces with the same name. If they already belong to one, that one
 * is returned untouched.
 *
 * Two agencies may genuinely share a name, so a slug collision is resolved with a suffix
 * rather than treated as an error.
 */
export async function ensureWorkspaceForUser(userId: string, name: string): Promise<Org> {
  const existing = await listOrgsForUser(userId);
  if (existing.length > 0) return existing[0];

  const trimmed = name.trim().replace(/\s+/g, " ");
  const displayName = trimmed || "My workspace";
  const base = slugify(displayName);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${suffix()}`;
    try {
      const org = await createOrg({ name: displayName, slug });
      await addMembership({ orgId: org.id }, { userId, role: "owner" });
      return org;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw new Error("Could not find a free workspace address. Try a different agency name.");
}
