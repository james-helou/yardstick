import { describe, expect, it } from "vitest";
import { db } from "./client";
import { appliedMigrations } from "./migrate";

describe("migrations", () => {
  it("records every applied migration exactly once", async () => {
    expect(await appliedMigrations()).toContain("0001_init.sql");
    const dupes = await db()`
      select name from schema_migrations group by name having count(*) > 1
    `;
    expect(dupes).toHaveLength(0);
  });

  it("created the orgs table", async () => {
    const rows = await db()<{ t: string | null }[]>`select to_regclass('public.orgs') as t`;
    expect(rows[0].t).toBe("orgs");
  });

  it("is idempotent when run again", async () => {
    const { migrate } = await import("./migrate");
    expect(await migrate()).toEqual([]);
  });
});
