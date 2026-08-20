import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "@/lib/external/call";
import { anthropicAi } from "./anthropic";
import { runPromptSet } from "./probe";
import { CURRENT_PROMPT_SET, type PromptSet } from "./prompts";
import type { AiProvider } from "./types";

const VARS = { name: "Bright Smile Dental", category: "dentist", place: "Montreal, QC" };

const ANSWER = [
  "1. **Plateau Dental Care** - family practice",
  "2. **Bright Smile Dental** - modern clinic downtown",
].join("\n");

const provider = (answer: string | ((prompt: string) => string)): AiProvider & { asked: string[] } => {
  const asked: string[] = [];
  return {
    name: "fake",
    model: "test-model",
    asked,
    ask: async (prompt) => {
      asked.push(prompt);
      return { model: "test-model", text: typeof answer === "function" ? answer(prompt) : answer };
    },
  };
};

describe("runPromptSet", () => {
  it("asks every prompt in the set and measures each answer", async () => {
    const ai = provider(ANSWER);
    const probes = await runPromptSet(ai, VARS);

    expect(ai.asked).toHaveLength(CURRENT_PROMPT_SET.prompts.length);
    expect(probes.map((p) => p.promptKey)).toEqual(CURRENT_PROMPT_SET.prompts.map((p) => p.key));
    expect(probes.every((p) => p.mentioned)).toBe(true);
    expect(probes[0].position).toBe(2);
    expect(probes[0].competitors).toEqual(["Plateau Dental Care"]);
  });

  it("stamps every probe with the prompt set version and the model that answered", async () => {
    const probes = await runPromptSet(provider(ANSWER), VARS);
    expect(probes.every((p) => p.promptSetVersion === CURRENT_PROMPT_SET.version)).toBe(true);
    expect(probes.every((p) => p.model === "test-model")).toBe(true);
  });

  it("keeps the answer verbatim, because the answer is the evidence", async () => {
    const probes = await runPromptSet(provider(ANSWER), VARS);
    expect(probes[0].response).toBe(ANSWER);
  });

  it("records an absence rather than inventing one", async () => {
    const probes = await runPromptSet(provider("1. Acme Dental\n2. Plateau Dental Care"), VARS);
    expect(probes.every((p) => p.mentioned)).toBe(false);
    expect(probes[0].position).toBeNull();
  });

  it("runs an older prompt set unchanged, so a rerun can reproduce an old score", async () => {
    const older: PromptSet = {
      version: "v0",
      notes: "one question",
      prompts: [{ key: "only", intent: "discovery", weight: 1, render: ({ place }) => `Who is in ${place}?` }],
    };
    const ai = provider(ANSWER);
    const probes = await runPromptSet(ai, VARS, { set: older });

    expect(ai.asked).toEqual(["Who is in Montreal, QC?"]);
    expect(probes[0].promptSetVersion).toBe("v0");
  });
});

describe("anthropicAi", () => {
  beforeEach(() => resetBreakers());

  const body = (text: string) =>
    new Response(JSON.stringify({ model: "claude-test", content: [{ type: "text", text }] }), { status: 200 });

  it("sends the key in a header, never in the URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => body("hello"));
    const ai = anthropicAi({ apiKey: "sk-ant-secret-value", model: "claude-test", fetchImpl });

    const answer = await ai.ask("Who are the best dentists in Montreal?");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).not.toContain("sk-ant-secret-value");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-secret-value");
    expect(answer).toEqual({ model: "claude-test", text: "hello" });
  });

  it("asks at temperature zero, so the same question twice is the same answer twice", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => body("hello"));
    await anthropicAi({ apiKey: "k", model: "claude-test", fetchImpl }).ask("q");

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({
      temperature: 0,
      model: "claude-test",
    });
  });

  it("joins the text blocks and reports the model that actually answered", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            model: "claude-served",
            content: [{ type: "text", text: "one" }, { type: "thinking" }, { type: "text", text: "two" }],
          }),
          { status: 200 },
        ),
    );

    const answer = await anthropicAi({ apiKey: "k", model: "claude-asked", fetchImpl }).ask("q");
    expect(answer).toEqual({ model: "claude-served", text: "one\ntwo" });
  });

  it("retries a rate limit and gives up on a bad request", async () => {
    const rateLimited = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => new Response("slow down", { status: 429 }))
      .mockImplementationOnce(async () => body("recovered"));

    const answer = await anthropicAi({
      apiKey: "k",
      model: "m",
      fetchImpl: rateLimited,
      callOptions: { baseDelayMs: 0, jitter: false },
    }).ask("q");
    expect(answer.text).toBe("recovered");
    expect(rateLimited).toHaveBeenCalledTimes(2);

    const rejected = vi.fn<typeof fetch>().mockImplementation(async () => new Response("nope", { status: 400 }));
    await expect(
      anthropicAi({ apiKey: "k", model: "m", fetchImpl: rejected, callOptions: { baseDelayMs: 0 } }).ask("q"),
    ).rejects.toThrow(/400/);
    // A bad request is not weather. Retrying it just spends money twice.
    expect(rejected).toHaveBeenCalledTimes(1);
  });
});
