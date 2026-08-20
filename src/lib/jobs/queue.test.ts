import { beforeEach, describe, expect, it } from "vitest";
import { createOrg } from "@/lib/db/repos/orgs";
import type { OrgScope } from "@/lib/db/scope";
import { resetTables } from "@/test/db";
import { claimJobs, completeJob, enqueue, failJob, reapStuckJobs } from "./queue";

let scope: OrgScope;

beforeEach(async () => {
  await resetTables();
  const org = await createOrg({ name: "Agency", slug: "agency" });
  scope = { orgId: org.id };
});

describe("job queue", () => {
  it("enqueues and claims a job", async () => {
    await enqueue(scope, { kind: "scan.gbp", payload: { scanId: "s1" } });
    const claimed = await claimJobs({ worker: "w1", limit: 5 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].kind).toBe("scan.gbp");
    expect(claimed[0].payload).toEqual({ scanId: "s1" });
    expect(claimed[0].attempts).toBe(1);
    expect(claimed[0].orgId).toBe(scope.orgId);
    expect(claimed[0].runAfter).toBeInstanceOf(Date);
  });

  it("never hands the same job to two workers", async () => {
    await enqueue(scope, { kind: "scan.gbp", payload: {} });
    const [a, b] = await Promise.all([
      claimJobs({ worker: "w1", limit: 5 }),
      claimJobs({ worker: "w2", limit: 5 }),
    ]);
    expect(a.length + b.length).toBe(1);
  });

  it("deduplicates on idempotency key", async () => {
    await enqueue(scope, { kind: "scan.gbp", payload: {}, idempotencyKey: "scan:1:gbp" });
    await enqueue(scope, { kind: "scan.gbp", payload: {}, idempotencyKey: "scan:1:gbp" });
    expect(await claimJobs({ worker: "w1", limit: 10 })).toHaveLength(1);
  });

  it("does not claim a job scheduled for the future", async () => {
    await enqueue(scope, {
      kind: "later",
      payload: {},
      runAfter: new Date(Date.now() + 60_000),
    });
    expect(await claimJobs({ worker: "w1", limit: 5 })).toHaveLength(0);
  });

  it("claims in run_after order", async () => {
    await enqueue(scope, { kind: "second", payload: {}, runAfter: new Date(Date.now() - 1_000) });
    await enqueue(scope, { kind: "first", payload: {}, runAfter: new Date(Date.now() - 5_000) });
    const claimed = await claimJobs({ worker: "w1", limit: 2 });
    expect(claimed.map((j) => j.kind)).toEqual(["first", "second"]);
  });

  it("marks a job done", async () => {
    await enqueue(scope, { kind: "scan.gbp", payload: {} });
    const [job] = await claimJobs({ worker: "w1", limit: 1 });
    await completeJob(job.id);
    expect(await claimJobs({ worker: "w1", limit: 5 })).toHaveLength(0);
  });

  it("reschedules a failed job with backoff until max attempts", async () => {
    await enqueue(scope, { kind: "scan.gbp", payload: {}, maxAttempts: 2 });
    const [first] = await claimJobs({ worker: "w1", limit: 1 });
    await failJob(first.id, "provider down");

    const soon = await claimJobs({ worker: "w1", limit: 1 });
    expect(soon).toHaveLength(0);

    const later = await claimJobs({ worker: "w1", limit: 1, now: new Date(Date.now() + 60_000) });
    expect(later).toHaveLength(1);
    expect(later[0].attempts).toBe(2);

    await failJob(later[0].id, "provider down again");
    const dead = await claimJobs({ worker: "w1", limit: 1, now: new Date(Date.now() + 600_000) });
    expect(dead).toHaveLength(0);
  });

  it("records the last error on a dead job", async () => {
    await enqueue(scope, { kind: "scan.gbp", payload: {}, maxAttempts: 1 });
    const [job] = await claimJobs({ worker: "w1", limit: 1 });
    const failed = await failJob(job.id, "429 from provider");
    expect(failed?.status).toBe("failed");
    expect(failed?.lastError).toContain("429");
  });

  it("reaps a job whose worker died", async () => {
    await enqueue(scope, { kind: "scan.gbp", payload: {} });
    await claimJobs({ worker: "w1", limit: 1 });
    expect(await reapStuckJobs({ olderThanMs: 0 })).toBe(1);
    expect(await claimJobs({ worker: "w2", limit: 1 })).toHaveLength(1);
  });

  it("leaves a freshly claimed job alone when reaping", async () => {
    await enqueue(scope, { kind: "scan.gbp", payload: {} });
    await claimJobs({ worker: "w1", limit: 1 });
    expect(await reapStuckJobs({ olderThanMs: 300_000 })).toBe(0);
  });

  it("scopes enqueue to an org", async () => {
    await expect(enqueue({ orgId: "" }, { kind: "x", payload: {} })).rejects.toThrow(/org/i);
  });
});
