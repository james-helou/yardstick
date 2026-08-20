import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every table carrying an org_id column. Adding one in a migration means adding it here —
 * this guard is a heuristic, not a proof, but it catches the realistic mistake of
 * querying a tenant table from outside a repository.
 */
const TENANT_TABLES = ["memberships"];

const SRC = path.join(process.cwd(), "src");
const REPO_DIR = path.join(SRC, "lib/db/repos");

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
  it("only repositories query tenant tables", async () => {
    const offenders: string[] = [];
    for (const file of await walk(SRC)) {
      if (file.startsWith(REPO_DIR)) continue;
      const body = await readFile(file, "utf8");
      for (const table of TENANT_TABLES) {
        if (touches(body, table)) {
          offenders.push(`${path.relative(process.cwd(), file)} queries ${table}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every repository touching a tenant table takes an org scope", async () => {
    const offenders: string[] = [];
    for (const file of await walk(REPO_DIR)) {
      const body = await readFile(file, "utf8");
      if (TENANT_TABLES.some((t) => touches(body, t)) && !body.includes("OrgScope")) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("guards every tenant table that actually exists in the schema", async () => {
    const files = (await readdir(path.join(process.cwd(), "migrations"))).filter((f) =>
      f.endsWith(".sql"),
    );
    const declared = new Set<string>();
    for (const file of files) {
      const body = await readFile(path.join(process.cwd(), "migrations", file), "utf8");
      for (const match of body.matchAll(/create table (\w+)\s*\(([\s\S]*?)\n\);/g)) {
        if (/\borg_id\b/.test(match[2])) declared.add(match[1]);
      }
    }
    expect([...declared].sort()).toEqual([...TENANT_TABLES].sort());
  });
});
