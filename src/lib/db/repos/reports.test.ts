import { beforeEach, describe, expect, it } from "vitest";
import { resetTables } from "@/test/db";
import { createBusiness } from "./businesses";
import { createOrg } from "./orgs";
import {
  countReportViews,
  findReportLinkByToken,
  getReportLink,
  isLive,
  newReportToken,
  recordReportView,
  revokeReportLink,
  shareScan,
} from "./reports";
import { createScan } from "./scans";

async function workspace(slug: string) {
  const org = await createOrg({ name: slug, slug });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, { name: "Bright Smile Dental", status: "prospect" });
  const scan = (await createScan(scope, { businessId: business.id }))!;
  return { scope, scan };
}

beforeEach(() => resetTables());

describe("report tokens", () => {
  it("mints a token long enough that guessing is not a strategy", () => {
    const token = newReportToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(newReportToken()).not.toBe(token);
  });
});

describe("sharing a scan", () => {
  it("creates a link the token can find", async () => {
    const { scope, scan } = await workspace("agency-a");
    const link = await shareScan(scope, { scanId: scan.id });

    expect(link).not.toBeNull();
    const found = await findReportLinkByToken(link!.token);
    expect(found).toMatchObject({ scanId: scan.id, orgId: scope.orgId, revokedAt: null });
    expect(isLive(found!)).toBe(true);
  });

  it("hands back the same token when a scan is shared twice", async () => {
    const { scope, scan } = await workspace("agency-a");
    const first = await shareScan(scope, { scanId: scan.id });
    const second = await shareScan(scope, { scanId: scan.id });

    // Two live links would mean the agency revokes one and the other keeps working.
    expect(second!.token).toBe(first!.token);
    expect(await getReportLink(scope, scan.id)).toMatchObject({ token: first!.token });
  });

  it("refuses to share a scan from another workspace", async () => {
    const a = await workspace("agency-a");
    const b = await workspace("agency-b");

    expect(await shareScan(b.scope, { scanId: a.scan.id })).toBeNull();
    expect(await getReportLink(b.scope, a.scan.id)).toBeNull();
  });

  it("revives a revoked link rather than leaving the scan unshareable", async () => {
    const { scope, scan } = await workspace("agency-a");
    const first = await shareScan(scope, { scanId: scan.id });
    await revokeReportLink(scope, scan.id);

    const again = await shareScan(scope, { scanId: scan.id });
    expect(again!.revokedAt).toBeNull();
    expect(again!.token).toBe(first!.token);
  });
});

describe("a link that should no longer open", () => {
  it("stops being live once revoked", async () => {
    const { scope, scan } = await workspace("agency-a");
    const link = await shareScan(scope, { scanId: scan.id });

    expect(await revokeReportLink(scope, scan.id)).toBe(true);
    const found = await findReportLinkByToken(link!.token);
    expect(isLive(found!)).toBe(false);
  });

  it("reports a second revoke as nothing to do", async () => {
    const { scope, scan } = await workspace("agency-a");
    await shareScan(scope, { scanId: scan.id });
    await revokeReportLink(scope, scan.id);
    expect(await revokeReportLink(scope, scan.id)).toBe(false);
  });

  it("stops being live once it expires", () => {
    const base = {
      id: "1",
      orgId: "o",
      scanId: "s",
      token: "t",
      revokedAt: null,
      createdAt: new Date("2026-08-01"),
    };
    const now = new Date("2026-08-20T12:00:00Z");

    expect(isLive({ ...base, expiresAt: new Date("2026-08-21") }, now)).toBe(true);
    expect(isLive({ ...base, expiresAt: new Date("2026-08-19") }, now)).toBe(false);
    expect(isLive({ ...base, expiresAt: null }, now)).toBe(true);
  });

  it("finds nothing for a token that was never real", async () => {
    expect(await findReportLinkByToken("not-a-token-but-long-enough-to-try")).toBeNull();
    // Short input never reaches the database at all.
    expect(await findReportLinkByToken("short")).toBeNull();
  });
});

describe("report views", () => {
  it("counts opens as rows, so the history survives", async () => {
    const { scope, scan } = await workspace("agency-a");
    const link = await shareScan(scope, { scanId: scan.id });

    expect(await countReportViews(scope, scan.id)).toBe(0);
    await recordReportView({ link: link!, referrer: "https://mail.google.com/", userAgent: "Safari" });
    await recordReportView({ link: link!, referrer: null, userAgent: null });
    expect(await countReportViews(scope, scan.id)).toBe(2);
  });

  it("never counts another workspace's opens", async () => {
    const a = await workspace("agency-a");
    const b = await workspace("agency-b");
    const link = await shareScan(a.scope, { scanId: a.scan.id });
    await recordReportView({ link: link! });

    expect(await countReportViews(b.scope, a.scan.id)).toBe(0);
  });

  it("trims a user agent rather than storing an essay", async () => {
    const { scope, scan } = await workspace("agency-a");
    const link = await shareScan(scope, { scanId: scan.id });
    await recordReportView({ link: link!, userAgent: "x".repeat(1000) });
    expect(await countReportViews(scope, scan.id)).toBe(1);
  });
});
