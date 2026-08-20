import { beforeEach, describe, expect, it } from "vitest";
import { resetTables } from "@/test/db";
import { creditBalance, grantCredits, listCreditEntries, refundCredits, spendCredits } from "./credits";
import { createOrg } from "./orgs";

async function workspace(slug: string) {
  const org = await createOrg({ name: slug, slug });
  return { orgId: org.id };
}

beforeEach(() => resetTables());

describe("credits ledger", () => {
  it("starts at nothing and sums the rows", async () => {
    const scope = await workspace("agency-a");
    expect(await creditBalance(scope)).toBe(0);

    await grantCredits(scope, { amount: 25, reason: "Welcome" });
    await spendCredits(scope, { amount: 1, reason: "Rank grid", idempotencyKey: "k1" });
    expect(await creditBalance(scope)).toBe(24);
  });

  it("refuses a spend the balance cannot cover, and says by how much", async () => {
    const scope = await workspace("agency-a");
    await grantCredits(scope, { amount: 2, reason: "Welcome" });

    const result = await spendCredits(scope, { amount: 5, reason: "Rank grid", idempotencyKey: "k1" });
    expect(result).toEqual({ ok: false, balance: 2, shortfall: 3 });
    expect(await creditBalance(scope)).toBe(2);
  });

  it("charges once however many times a retried dispatch asks", async () => {
    const scope = await workspace("agency-a");
    await grantCredits(scope, { amount: 5, reason: "Welcome" });

    const first = await spendCredits(scope, { amount: 1, reason: "Rank grid", idempotencyKey: "scan-1:geogrid" });
    const second = await spendCredits(scope, { amount: 1, reason: "Rank grid", idempotencyKey: "scan-1:geogrid" });

    expect(first).toMatchObject({ ok: true, charged: true });
    expect(second).toMatchObject({ ok: true, charged: false });
    expect(await creditBalance(scope)).toBe(4);
  });

  it("lets exactly one of two racing dispatches take the last credit", async () => {
    const scope = await workspace("agency-a");
    await grantCredits(scope, { amount: 1, reason: "Welcome" });

    const [a, b] = await Promise.all([
      spendCredits(scope, { amount: 1, reason: "Rank grid", idempotencyKey: "scan-a:geogrid" }),
      spendCredits(scope, { amount: 1, reason: "Rank grid", idempotencyKey: "scan-b:geogrid" }),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await creditBalance(scope)).toBe(0);
  });

  it("keeps the charge visible after a refund, rather than erasing it", async () => {
    const scope = await workspace("agency-a");
    await grantCredits(scope, { amount: 5, reason: "Welcome" });
    await spendCredits(scope, { amount: 1, reason: "Rank grid", idempotencyKey: "scan-1:geogrid" });
    await refundCredits(scope, {
      amount: 1,
      reason: "Rank provider failed",
      idempotencyKey: "scan-1:geogrid:refund",
    });

    expect(await creditBalance(scope)).toBe(5);
    const entries = await listCreditEntries(scope);
    expect(entries.map((e) => e.delta)).toEqual([1, -1, 5]);
  });

  it("refunds once, however many times the failure is reported", async () => {
    const scope = await workspace("agency-a");
    await grantCredits(scope, { amount: 5, reason: "Welcome" });
    await refundCredits(scope, { amount: 1, reason: "Failed", idempotencyKey: "r1" });
    await refundCredits(scope, { amount: 1, reason: "Failed", idempotencyKey: "r1" });
    expect(await creditBalance(scope)).toBe(6);
  });

  it("keeps one workspace's credits out of another's balance", async () => {
    const a = await workspace("agency-a");
    const b = await workspace("agency-b");
    await grantCredits(a, { amount: 10, reason: "Welcome" });
    expect(await creditBalance(b)).toBe(0);
  });

  it("will not accept a grant or spend of nothing", async () => {
    const scope = await workspace("agency-a");
    await expect(grantCredits(scope, { amount: 0, reason: "x" })).rejects.toThrow(/positive/);
    await expect(spendCredits(scope, { amount: -1, reason: "x", idempotencyKey: "k" })).rejects.toThrow(
      /positive/,
    );
  });
});
