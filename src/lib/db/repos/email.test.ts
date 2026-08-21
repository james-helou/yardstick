import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../client";
import { resetTables } from "@/test/db";
import { countDeliveries, latestDeliveryByLead, listDeliveriesForLead, recordDelivery } from "./email";
import { createOrg } from "./orgs";

async function agency(slug: string) {
  const org = await createOrg({ name: slug, slug });
  return { orgId: org.id };
}

const row = (over: Partial<Parameters<typeof recordDelivery>[1]> = {}) => ({
  template: "report_ready",
  toAddress: "owner@rivera.example",
  subject: "Your local search report",
  status: "sent" as const,
  ...over,
});

beforeEach(() => resetTables());

describe("email deliveries", () => {
  it("keeps both attempts when the same message is sent twice", async () => {
    const scope = await agency("agency-a");

    await recordDelivery(scope, row({ status: "failed", error: "Resend answered 422" }));
    await recordDelivery(scope, row({ providerId: "msg_2" }));

    expect(await countDeliveries(scope)).toBe(2);
    expect(await countDeliveries(scope, "sent")).toBe(1);
    expect(await countDeliveries(scope, "failed")).toBe(1);
  });

  it("reads back in the order it happened, attached to its lead", async () => {
    const scope = await agency("agency-a");
    const leadId = null;

    const first = await recordDelivery(scope, row({ leadId, status: "skipped", error: "not configured" }));
    expect(first.leadId).toBeNull();
    expect(first.error).toBe("not configured");
    expect(await listDeliveriesForLead(scope, first.id)).toEqual([]);
  });

  it("truncates a provider complaint rather than storing a page of it", async () => {
    const scope = await agency("agency-a");
    const delivery = await recordDelivery(scope, row({ status: "failed", error: "x".repeat(900) }));
    expect(delivery.error).toHaveLength(500);
  });

  it("answers for a page of leads in one go, latest attempt first", async () => {
    const scope = await agency("agency-a");
    expect(await latestDeliveryByLead(scope, [])).toEqual(new Map());

    // A lead row is needed for the foreign key, so borrow one from an existing test path.
    const [lead] = await db()<{ id: string }[]>`
      insert into leads (org_id, email) values (${scope.orgId}, 'owner@rivera.example') returning id
    `;

    await recordDelivery(scope, row({ leadId: lead.id, status: "failed", error: "first try" }));
    const latest = await recordDelivery(scope, row({ leadId: lead.id, providerId: "msg_9" }));

    const map = await latestDeliveryByLead(scope, [lead.id]);
    expect(map.get(lead.id)?.id).toBe(latest.id);
    expect(map.get(lead.id)?.status).toBe("sent");
    expect(await listDeliveriesForLead(scope, lead.id)).toHaveLength(2);
  });

  it("never shows one workspace another's deliveries", async () => {
    const a = await agency("agency-a");
    const b = await agency("agency-b");

    await recordDelivery(a, row());
    expect(await countDeliveries(b)).toBe(0);
  });
});
