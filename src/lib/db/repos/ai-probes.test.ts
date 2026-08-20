import { beforeEach, describe, expect, it } from "vitest";
import { resetTables } from "@/test/db";
import { listAiProbes, recordAiProbes, type AiProbeInput } from "./ai-probes";
import { createBusiness } from "./businesses";
import { createOrg } from "./orgs";

const probe = (over: Partial<AiProbeInput> = {}): AiProbeInput => ({
  promptSetVersion: "v1",
  promptKey: "best",
  prompt: "Who are the best dentists in Montreal, QC?",
  model: "test-model",
  response: "1. Bright Smile Dental\n2. Plateau Dental Care",
  mentioned: true,
  position: 1,
  competitors: ["Plateau Dental Care"],
  ...over,
});

async function workspace(slug: string) {
  const org = await createOrg({ name: slug, slug });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, { name: "Bright Smile Dental", status: "prospect" });
  return { scope, business };
}

beforeEach(() => resetTables());

describe("ai probes repository", () => {
  it("stores the answer verbatim, with its stamps and its competitors", async () => {
    const { scope, business } = await workspace("agency-a");
    expect(await recordAiProbes(scope, { scanId: null, businessId: business.id, probes: [probe()] })).toBe(1);

    const [stored] = await listAiProbes(scope, { businessId: business.id });
    expect(stored).toMatchObject({
      promptSetVersion: "v1",
      promptKey: "best",
      model: "test-model",
      mentioned: true,
      position: 1,
      competitors: ["Plateau Dental Care"],
      scanId: null,
    });
    expect(stored.response).toContain("Plateau Dental Care");
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it("keeps an absence, with no position and no invented rank", async () => {
    const { scope, business } = await workspace("agency-a");
    await recordAiProbes(scope, {
      scanId: null,
      businessId: business.id,
      probes: [probe({ mentioned: false, position: null, competitors: [] })],
    });

    const [stored] = await listAiProbes(scope, { businessId: business.id });
    expect(stored.mentioned).toBe(false);
    expect(stored.position).toBeNull();
    expect(stored.competitors).toEqual([]);
  });

  it("writes nothing, and says so, when there is nothing to write", async () => {
    const { scope, business } = await workspace("agency-a");
    expect(await recordAiProbes(scope, { scanId: null, businessId: business.id, probes: [] })).toBe(0);
    expect(await listAiProbes(scope, { businessId: business.id })).toEqual([]);
  });

  it("never shows one workspace another workspace's answers", async () => {
    const a = await workspace("agency-a");
    const b = await workspace("agency-b");
    await recordAiProbes(a.scope, { scanId: null, businessId: a.business.id, probes: [probe()] });

    expect(await listAiProbes(b.scope, {})).toEqual([]);
    expect(await listAiProbes(b.scope, { businessId: a.business.id })).toEqual([]);
    expect(await listAiProbes(a.scope, {})).toHaveLength(1);
  });
});
