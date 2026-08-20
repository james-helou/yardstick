import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every table carrying an org_id, mapped to the single module allowed to query it.
 * Adding an org-scoped table in a migration means adding it here — the third test
 * below fails the build if you forget.
 *
 * This is a heuristic, not a proof, but it catches the realistic mistake: reaching
 * into a tenant table from a route handler or server action and forgetting the filter.
 */
const TENANT_TABLE_OWNERS: Record<string, string> = {
  memberships: "src/lib/db/repos/orgs.ts",
  jobs: "src/lib/jobs/queue.ts",
  businesses: "src/lib/db/repos/businesses.ts",
};

const SRC = path.join(process.cwd(), "src");
const MIGRATIONS = path.join(process.cwd(), "migrations");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const touches = (body: string, table: string) =>
  new RegExp(`\\b(from|into|update)\\s+${table}\\b`, "i").test(body);

describe("tenancy guard", () => {
  it("only the owning module queries each tenant table", async () => {
    const offenders: string[] = [];
    for (const file of await walk(SRC)) {
      const rel = path.relative(process.cwd(), file);
      const body = await readFile(file, "utf8");
      for (const [table, owner] of Object.entries(TENANT_TABLE_OWNERS)) {
        if (rel !== owner && touches(body, table)) {
          offenders.push(`${rel} queries ${table} (owned by ${owner})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every owning module takes an explicit org scope", async () => {
    const offenders: string[] = [];
    for (const owner of new Set(Object.values(TENANT_TABLE_OWNERS))) {
      const body = await readFile(path.join(process.cwd(), owner), "utf8");
      if (!body.includes("OrgScope")) offenders.push(owner);
    }
    expect(offenders).toEqual([]);
  });

  it("guards every org-scoped table that actually exists in the schema", async () => {
    const declared = new Set<string>();
    for (const file of (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql"))) {
      const body = await readFile(path.join(MIGRATIONS, file), "utf8");
      const DECLARATION = /create table (?:if not exists\s+)?(\w+)\s*\(([\s\S]*?)\n\);/g;
      for (const match of body.matchAll(DECLARATION)) {
        if (/\borg_id\b/.test(match[2])) declared.add(match[1]);
      }
    }
    expect([...declared].sort()).toEqual(Object.keys(TENANT_TABLE_OWNERS).sort());
  });
});
