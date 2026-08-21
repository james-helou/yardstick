import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { resetBreakers } from "@/lib/external/call";
import { deliver, deliverForLead, emailConfigured } from "./send";
import { TEMPLATES } from "./templates";
import type { EmailProvider } from "./types";

const scope = { orgId: "11111111-1111-1111-1111-111111111111" };

const message = {
  template: TEMPLATES.reportReady,
  to: "owner@rivera.example",
  subject: "Your local search report",
  text: "link",
  html: "<p>link</p>",
  replyTo: null,
};

const recorded: Record<string, unknown>[] = [];
const record = vi.fn(async (_scope: unknown, input: Record<string, unknown>) => {
  recorded.push(input);
  return { id: "row" } as never;
});

beforeEach(() => {
  recorded.length = 0;
  record.mockClear();
  resetBreakers();
  resetEnvCache();
});

const provider = (send: EmailProvider["send"]): EmailProvider => ({ name: "test", from: "us@example", send });

describe("deliver", () => {
  it("writes down a send that worked", async () => {
    const result = await deliver(scope, message, {
      provider: provider(async () => ({ id: "msg_1" })),
      record,
    });

    expect(result).toEqual({ status: "sent", providerId: "msg_1", reason: null });
    expect(recorded[0]).toMatchObject({ status: "sent", template: TEMPLATES.reportReady, providerId: "msg_1" });
  });

  it("records a skip, in words, when no provider is configured", async () => {
    const result = await deliver(scope, message, { provider: null, record });

    expect(result.status).toBe("skipped");
    expect(result.reason).toMatch(/not configured/i);
    // The row still exists, so "why did the prospect never get it" has an answer.
    expect(recorded[0]).toMatchObject({ status: "skipped" });
  });

  it("never throws when the provider does, and keeps the complaint", async () => {
    const result = await deliver(scope, message, {
      provider: provider(async () => {
        throw new Error("Resend answered 422: address rejected");
      }),
      record,
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("422");
    expect(recorded[0]).toMatchObject({ status: "failed" });
  });

  it("survives the delivery log itself failing", async () => {
    const result = await deliver(scope, message, {
      provider: provider(async () => ({ id: "msg_2" })),
      record: async () => {
        throw new Error("database went away");
      },
    });

    expect(result.status).toBe("sent");
  });

  it("attaches the lead when there is one, so the agency can read the history back", async () => {
    await deliverForLead(scope, "22222222-2222-2222-2222-222222222222", message, {
      provider: provider(async () => ({ id: "msg_3" })),
      record,
    });

    expect(recorded[0]).toMatchObject({ leadId: "22222222-2222-2222-2222-222222222222" });
  });
});

describe("emailConfigured", () => {
  it("needs both a key and a verified sender", () => {
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.EMAIL_FROM;
    resetEnvCache();
    expect(emailConfigured()).toBe(false);

    process.env.EMAIL_FROM = "Yardstick <reports@example.com>";
    resetEnvCache();
    expect(emailConfigured()).toBe(true);

    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    resetEnvCache();
    expect(emailConfigured()).toBe(false);
  });
});
