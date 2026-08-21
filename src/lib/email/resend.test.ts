import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "@/lib/external/call";
import { EmailRequestError, resendEmail } from "./resend";

beforeEach(() => resetBreakers());

const message = {
  to: "owner@rivera.example",
  subject: "Your local search report",
  text: "link",
  html: "<p>link</p>",
};

const ok = (id: string) => new Response(JSON.stringify({ id }), { status: 200 });

describe("resendEmail", () => {
  it("sends from the configured address, never one a caller chose", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok("msg_1"));
    const provider = resendEmail({ apiKey: "re_test", from: "Yardstick <reports@example.com>", fetchImpl });

    expect(await provider.send(message)).toEqual({ id: "msg_1" });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("api.resend.com");
    const body = JSON.parse(String(init?.body));
    expect(body.from).toBe("Yardstick <reports@example.com>");
    expect(body.to).toEqual(["owner@rivera.example"]);
    expect(body.reply_to).toBeUndefined();
  });

  it("carries the reply address when the message has one", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok("msg_2"));
    const provider = resendEmail({ apiKey: "re_test", from: "us@example.com", fetchImpl });

    await provider.send({ ...message, replyTo: "hello@northline.example" });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.reply_to).toEqual(["hello@northline.example"]);
  });

  it("keeps the key in the header and out of the body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok("msg_3"));
    const provider = resendEmail({ apiKey: "re_secret", from: "us@example.com", fetchImpl });

    await provider.send(message);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).not.toContain("re_secret");
    expect(String(init?.body)).not.toContain("re_secret");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_secret");
  });

  it("does not retry an address the provider refused", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("invalid recipient", { status: 422 }));
    const provider = resendEmail({
      apiKey: "re_test",
      from: "us@example.com",
      fetchImpl,
      callOptions: { retries: 3, sleep: async () => {} },
    });

    await expect(provider.send(message)).rejects.toBeInstanceOf(EmailRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a rate limit, because that one clears on its own", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(ok("msg_4"));
    const provider = resendEmail({
      apiKey: "re_test",
      from: "us@example.com",
      fetchImpl,
      callOptions: { retries: 2, sleep: async () => {} },
    });

    expect(await provider.send(message)).toEqual({ id: "msg_4" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
