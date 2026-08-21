import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrg } from "@/lib/db/repos/orgs";
import { listBusinesses } from "@/lib/db/repos/businesses";
import { countRecentLeadsByIp, listLeads } from "@/lib/db/repos/leads";
import { findReportLinkByToken, isLive } from "@/lib/db/repos/reports";
import { listDeliveriesForLead } from "@/lib/db/repos/email";
import { getScan } from "@/lib/db/repos/scans";
import { createWidgetKey, deactivateWidgetKey } from "@/lib/db/repos/widgets";
import { parseListQuery } from "@/lib/list/query";
import { LEAD_LIST_SPEC } from "@/lib/db/repos/leads";
import { BUSINESS_LIST_SPEC } from "@/lib/db/repos/businesses";
import { resetTables } from "@/test/db";
import { RATE_LIMIT, submitAuditRequest } from "./submit";

const FIELDS = {
  businessName: "Rivera Plumbing",
  email: "Owner@Rivera.example",
  website: "riveraplumbing.example",
  contactName: "Ana Rivera",
  locality: "Montreal",
  primaryCategory: "plumber",
};

async function agency(slug = "agency-a") {
  const org = await createOrg({ name: slug, slug });
  const scope = { orgId: org.id };
  const key = await createWidgetKey(scope);
  return { scope, key };
}

const leadQuery = parseListQuery({}, LEAD_LIST_SPEC);
const businessQuery = parseListQuery({}, BUSINESS_LIST_SPEC);

beforeEach(() => resetTables());

describe("submitting a public audit request", () => {
  it("creates the business, the scan, the shared link and the lead", async () => {
    const { scope, key } = await agency();

    const result = await submitAuditRequest({ publicKey: key.publicKey, fields: FIELDS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const scan = await getScan(scope, result.scanId);
    expect(scan?.businessName).toBe("Rivera Plumbing");

    // The link exists before anyone presses share, which is the whole promise of the widget.
    const link = await findReportLinkByToken(result.token);
    expect(link).not.toBeNull();
    expect(isLive(link!)).toBe(true);

    const { rows } = await listLeads(scope, leadQuery);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "owner@rivera.example",
      contactName: "Ana Rivera",
      businessName: "Rivera Plumbing",
      source: "widget",
    });
  });

  it("joins the business already on file rather than creating a second one", async () => {
    const { scope, key } = await agency();

    const first = await submitAuditRequest({ publicKey: key.publicKey, fields: FIELDS });
    const second = await submitAuditRequest({
      publicKey: key.publicKey,
      fields: { ...FIELDS, website: "https://riveraplumbing.example", email: "other@rivera.example" },
    });

    expect(first.ok && second.ok).toBe(true);
    const { rows } = await listBusinesses(scope, businessQuery);
    expect(rows).toHaveLength(1);
    // Two leads, two scans, one business.
    expect((await listLeads(scope, leadQuery)).rows).toHaveLength(2);
  });

  it("refuses a key that was switched off, without saying why", async () => {
    const { scope, key } = await agency();
    await deactivateWidgetKey(scope, key.id);

    const result = await submitAuditRequest({ publicKey: key.publicKey, fields: FIELDS });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a key that was never real", async () => {
    const result = await submitAuditRequest({ publicKey: "yk_made_up", fields: FIELDS });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("reports every bad field at once rather than the first", async () => {
    const { key } = await agency();
    const result = await submitAuditRequest({
      publicKey: key.publicKey,
      fields: { businessName: "", email: "not-an-email" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(Object.keys(result.errors).sort()).toEqual(["businessName", "email"]);
  });

  it("stops a submitter who has already asked five times in the hour", async () => {
    const { key } = await agency();
    const ipHash = "a-hashed-address";

    for (let i = 0; i < RATE_LIMIT.requests; i++) {
      const ok = await submitAuditRequest({
        publicKey: key.publicKey,
        fields: { ...FIELDS, website: `site-${i}.example`, email: `owner${i}@rivera.example` },
        ipHash,
      });
      expect(ok.ok).toBe(true);
    }

    const blocked = await submitAuditRequest({
      publicKey: key.publicKey,
      fields: { ...FIELDS, website: "one-too-many.example" },
      ipHash,
    });
    expect(blocked).toMatchObject({ ok: false, status: 429 });
    expect(await countRecentLeadsByIp({ ipHash, withinMs: RATE_LIMIT.windowMs })).toBe(RATE_LIMIT.requests);
  });

  it("counts the rate limit per submitter, not across everybody", async () => {
    const { key } = await agency();
    for (let i = 0; i < RATE_LIMIT.requests; i++) {
      await submitAuditRequest({
        publicKey: key.publicKey,
        fields: { ...FIELDS, website: `site-${i}.example` },
        ipHash: "first",
      });
    }

    const other = await submitAuditRequest({
      publicKey: key.publicKey,
      fields: { ...FIELDS, website: "somebody-else.example" },
      ipHash: "second",
    });
    expect(other.ok).toBe(true);
  });

  it("turns a failed bot check into a message rather than a lead", async () => {
    const { scope, key } = await agency();
    const verifyBot = vi.fn(async () => ({ ok: false, reason: "That check did not pass" }));

    const result = await submitAuditRequest(
      { publicKey: key.publicKey, fields: FIELDS, botToken: "bad" },
      { verifyBot },
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect((await listLeads(scope, leadQuery)).rows).toEqual([]);
    expect(verifyBot).toHaveBeenCalledOnce();
  });

  it("accepts a request with no website, since a business may not have one", async () => {
    const { scope, key } = await agency();
    const result = await submitAuditRequest({
      publicKey: key.publicKey,
      fields: { businessName: "Rivera Plumbing", email: "owner@rivera.example" },
    });

    expect(result.ok).toBe(true);
    expect((await listBusinesses(scope, businessQuery)).rows[0].websiteUrl).toBeNull();
  });

  it("never lets one workspace's key create work in another", async () => {
    const a = await agency();
    const bOrg = await createOrg({ name: "Agency B", slug: "agency-b" });

    await submitAuditRequest({ publicKey: a.key.publicKey, fields: FIELDS });
    expect((await listLeads({ orgId: bOrg.id }, leadQuery)).rows).toEqual([]);
    expect((await listBusinesses({ orgId: bOrg.id }, businessQuery)).rows).toEqual([]);
  });
});

describe("the rate limit belongs to one workspace at a time", () => {
  it("does not let one agency's traffic close another agency's door", async () => {
    const a = await agency("agency-a");
    const b = await agency("agency-b");
    const ipHash = "one-shared-office";

    for (let i = 0; i < RATE_LIMIT.requests; i++) {
      const ok = await submitAuditRequest({
        publicKey: a.key.publicKey,
        fields: { ...FIELDS, website: `site-${i}.example`, email: `owner${i}@rivera.example` },
        ipHash,
      });
      expect(ok.ok).toBe(true);
    }

    // Spent, here.
    expect((await submitAuditRequest({ publicKey: a.key.publicKey, fields: FIELDS, ipHash })).ok).toBe(false);
    // A different agency's prospect is a different conversation.
    expect((await submitAuditRequest({ publicKey: b.key.publicKey, fields: FIELDS, ipHash })).ok).toBe(true);
  });

  it("still stops one address walking every widget on the platform", async () => {
    const ipHash = "a-busy-bot";
    let refusals = 0;

    for (let i = 0; i < RATE_LIMIT.platformRequests + 2; i++) {
      // A fresh workspace every time, so only the platform ceiling can refuse it.
      const { key } = await agency(`agency-${i}`);
      const result = await submitAuditRequest({
        publicKey: key.publicKey,
        fields: { ...FIELDS, website: `site-${i}.example`, email: `owner${i}@rivera.example` },
        ipHash,
      });
      if (!result.ok) {
        refusals += 1;
        expect(result.status).toBe(429);
      }
    }

    expect(refusals).toBe(2);
  });
});

describe("what the lead and the agency are told", () => {
  it("emails the prospect their report and the agency their lead", async () => {
    const { scope, key } = await agency();
    const sent: { to: string; template: string; text: string; leadId: string }[] = [];

    const result = await submitAuditRequest(
      { publicKey: key.publicKey, fields: FIELDS, origin: "https://audit.northline.example" },
      {
        agencyEmails: async () => ["hello@northline.example"],
        sendEmail: async (_scope, leadId, message) => {
          sent.push({ to: message.to, template: message.template, text: message.text, leadId });
          return { status: "sent", providerId: "msg", reason: null };
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(sent.map((s) => s.to)).toEqual(["owner@rivera.example", "hello@northline.example"]);
    // Both messages point at the same live report, on the host the request arrived on.
    const url = `https://audit.northline.example/r/${result.token}`;
    expect(sent.every((s) => s.text.includes(url))).toBe(true);
    // Both are filed against the lead, so the agency can see what was sent.
    expect(sent.every((s) => s.leadId === result.lead.id)).toBe(true);
    expect(await listDeliveriesForLead(scope, result.lead.id)).toEqual([]);
  });

  it("records what happened when nothing can be sent, and still keeps the lead", async () => {
    const { scope, key } = await agency();

    const result = await submitAuditRequest(
      { publicKey: key.publicKey, fields: FIELDS, origin: "https://audit.northline.example" },
      { agencyEmails: async () => [] },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const deliveries = await listDeliveriesForLead(scope, result.lead.id);
    // No provider is configured in a test environment, so the attempt is on file as skipped.
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ status: "skipped", toAddress: "owner@rivera.example" });
  });

  it("keeps the lead when the mail provider throws on its way out", async () => {
    const { scope, key } = await agency();

    const result = await submitAuditRequest(
      { publicKey: key.publicKey, fields: FIELDS, origin: "https://audit.northline.example" },
      {
        agencyEmails: async () => {
          throw new Error("the user table went away");
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { rows } = await listLeads(scope, leadQuery);
    expect(rows).toHaveLength(1);
  });

  it("sends nothing when there is no host to build a link on", async () => {
    const { scope, key } = await agency();
    const sent: string[] = [];

    const result = await submitAuditRequest(
      { publicKey: key.publicKey, fields: FIELDS },
      {
        agencyEmails: async () => ["hello@northline.example"],
        sendEmail: async (_scope, _leadId, message) => {
          sent.push(message.to);
          return { status: "sent", providerId: "msg", reason: null };
        },
      },
    );

    expect(result.ok).toBe(true);
    // A report link with no origin is a relative path, which is useless in an inbox.
    expect(sent).toEqual([]);
    if (!result.ok) return;
    expect(await listDeliveriesForLead(scope, result.lead.id)).toEqual([]);
  });
});
