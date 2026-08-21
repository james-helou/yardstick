import { beforeEach, describe, expect, it } from "vitest";
import { createOrg } from "./repos/orgs";
import { getBusiness } from "./repos/businesses";
import { getProposal } from "./repos/proposals";
import { getScan } from "./repos/scans";
import { findGrantForUser } from "./repos/portal";
import { resetTables } from "@/test/db";
import { isUuid } from "./uuid";

describe("recognising an id", () => {
  it("accepts what the database generates", () => {
    expect(isUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
    expect(isUuid("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(true);
  });

  it("rejects everything else a URL could carry", () => {
    for (const value of ["", "new", "not-an-id", "3f2504e0", "3f2504e0-4f89-11d3-9a0c-0305e82c330", "' or 1=1"]) {
      expect(isUuid(value), value).toBe(false);
    }
  });
});

describe("a path segment that is not an id", () => {
  beforeEach(() => resetTables());

  it("is nothing found, not a database error", async () => {
    // Postgres raises rather than returning nothing when a uuid column meets junk, so
    // without this guard every one of these is a 500 with a driver message in it.
    const org = await createOrg({ name: "agency-a", slug: "agency-a" });
    const scope = { orgId: org.id };

    expect(await getBusiness(scope, "new")).toBeNull();
    expect(await getScan(scope, "not-an-id")).toBeNull();
    expect(await getProposal(scope, "../etc/passwd")).toBeNull();
    expect(await findGrantForUser(org.id, "new")).toBeNull();
  });
});
