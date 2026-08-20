import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { createOrg } from "@/lib/db/repos/orgs";
import type { OrgScope } from "@/lib/db/scope";
import { resetTables } from "@/test/db";
import { enqueue } from "./queue";
import { runOnce, type JobHandlers } from "./worker";

let scope: OrgScope;

beforeEach(async () => {
  await resetTables();
  const org = await createOrg({ name: "Agency", slug: "agency" });
  scope = { orgId: org.id };
});

const statusOf = async (kind: string) => {
  const rows = await db()<{ status: string; last_error: string | null }[]>`
    select status, last_error from jobs where kind = ${kind}
  `;
  return rows[0];
};

describe("runOnce", () => {
  it("does nothing when the queue is empty", async () => {
    expect(await runOnce({ worker: "w1", handlers: {} })).toEqual({
      claimed: 0,
      completed: 0,
      failed: 0,
    });
  });

  it("runs a job and marks it done", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await enqueue(scope, { kind: "scan.gbp", payload: { scanId: "s1" } });

    const result = await runOnce({ worker: "w1", handlers: { "scan.gbp": handler } });

    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toMatchObject({ payload: { scanId: "s1" } });
    expect((await statusOf("scan.gbp")).status).toBe("done");
  });

  it("records the error and reschedules when a handler throws", async () => {
    const handlers: JobHandlers = {
      "scan.gbp": async () => {
        throw new Error("provider returned 429");
      },
    };
    await enqueue(scope, { kind: "scan.gbp", payload: {}, maxAttempts: 3 });

    expect(await runOnce({ worker: "w1", handlers })).toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
    });

    const row = await statusOf("scan.gbp");
    expect(row.status).toBe("pending");
    expect(row.last_error).toContain("429");
  });

  it("buries a job with no registered handler, without burning its retries", async () => {
    // Default maxAttempts is 5. Retrying cannot conjure a handler, so it should not try.
    await enqueue(scope, { kind: "scan.unknown", payload: {} });

    expect(await runOnce({ worker: "w1", handlers: {} })).toMatchObject({ failed: 1 });

    const row = await statusOf("scan.unknown");
    expect(row.status).toBe("failed");
    expect(row.last_error).toMatch(/no handler/i);
  });

  it("keeps going when one job in a batch fails", async () => {
    const handlers: JobHandlers = {
      good: async () => {},
      bad: async () => {
        throw new Error("nope");
      },
    };
    await enqueue(scope, { kind: "bad", payload: {} });
    await enqueue(scope, { kind: "good", payload: {} });

    expect(await runOnce({ worker: "w1", handlers, batchSize: 10 })).toEqual({
      claimed: 2,
      completed: 1,
      failed: 1,
    });
    expect((await statusOf("good")).status).toBe("done");
  });

  it("respects the batch size", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    for (let i = 0; i < 5; i++) {
      await enqueue(scope, { kind: "scan.gbp", payload: { i } });
    }
    expect(await runOnce({ worker: "w1", handlers: { "scan.gbp": handler }, batchSize: 2 })).toMatchObject({
      claimed: 2,
    });
  });

  it("stops claiming once asked to shut down", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await enqueue(scope, { kind: "scan.gbp", payload: {} });
    const controller = new AbortController();
    controller.abort();

    expect(
      await runOnce({ worker: "w1", handlers: { "scan.gbp": handler }, signal: controller.signal }),
    ).toEqual({ claimed: 0, completed: 0, failed: 0 });
    expect(handler).not.toHaveBeenCalled();
  });
});
