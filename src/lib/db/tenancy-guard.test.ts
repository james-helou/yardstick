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
  scans: "src/lib/db/repos/scans.ts",
  pillar_results: "src/lib/db/repos/scans.ts",
  credits_ledger: "src/lib/db/repos/credits.ts",
  grid_points: "src/lib/db/repos/grid.ts",
  ai_probes: "src/lib/db/repos/ai-probes.ts",
  report_links: "src/lib/db/repos/reports.ts",
  report_views: "src/lib/db/repos/reports.ts",
  widget_keys: "src/lib/db/repos/widgets.ts",
  leads: "src/lib/db/repos/leads.ts",
};

/**
 * Reviewed exceptions: a module that legitimately reads a table it does not own. Each
 * entry is a promise that the join is filtered by the same org_id in the same statement.
 * Writing it down is the point. A new cross-table read fails the build until someone
 * decides it is correct and says why here.
 */
const ALLOWED_READS: Record<string, { table: string; because: string }[]> = {
  "src/lib/db/repos/reports.ts": [
    {
      table: "scans",
      because:
        "sharing a scan inserts by selecting from scans under the same org_id, which is what makes a scan in another workspace produce no link at all",
    },
  ],
  "src/lib/db/repos/leads.ts": [
    {
      table: "businesses",
      because:
        "a lead reads as a name and a company, so the list joins the business it created, and every join carries the same org_id filter",
    },
    {
      table: "scans",
      because:
        "the lead list shows the score the audit produced, joined under the same org_id as the lead itself",
    },
  ],
  "src/lib/db/repos/scans.ts": [
    {
      table: "businesses",
      because:
        "a scan is meaningless without the business it measured, and every join carries the same org_id filter",
    },
  ],
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
        const allowed = ALLOWED_READS[rel]?.some((entry) => entry.table === table) ?? false;
        if (rel !== owner && !allowed && touches(body, table)) {
          offenders.push(`${rel} queries ${table} (owned by ${owner})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every allowed cross-table read is scoped and explained", async () => {
    for (const [rel, entries] of Object.entries(ALLOWED_READS)) {
      const body = await readFile(path.join(process.cwd(), rel), "utf8");
      for (const entry of entries) {
        expect(entry.because.length, `${rel} must say why it reads ${entry.table}`).toBeGreaterThan(20);
        // An exception is only defensible if the module scopes every query it makes.
        expect(body).toContain("requireOrg(scope)");
      }
    }
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
