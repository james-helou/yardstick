import { describe, expect, it } from "vitest";
import { CURRENT_PROMPT_SET, placeLabel, promptSet, PROMPT_SETS } from "./prompts";

const VARS = { name: "Bright Smile Dental", category: "dentist", place: "Montreal, QC" };

describe("prompt sets", () => {
  it("gives every version a unique id and every prompt a unique key within it", () => {
    const versions = PROMPT_SETS.map((set) => set.version);
    expect(new Set(versions).size).toBe(versions.length);

    for (const set of PROMPT_SETS) {
      const keys = set.prompts.map((p) => p.key);
      expect(new Set(keys).size, `${set.version} repeats a prompt key`).toBe(keys.length);
    }
  });

  it("asks discovery questions without naming the business, since absence is the finding", () => {
    for (const template of CURRENT_PROMPT_SET.prompts.filter((p) => p.intent === "discovery")) {
      const rendered = template.render(VARS);
      expect(rendered, `${template.key} names the business`).not.toContain(VARS.name);
      expect(rendered).toContain(VARS.category);
      expect(rendered).toContain(VARS.place);
    }
  });

  it("names the business in the brand question, which is what makes it a brand question", () => {
    const brand = CURRENT_PROMPT_SET.prompts.filter((p) => p.intent === "brand");
    expect(brand.length).toBeGreaterThan(0);
    for (const template of brand) {
      expect(template.render(VARS)).toContain(VARS.name);
    }
  });

  it("weights discovery above the brand check", () => {
    const weight = (intent: "discovery" | "brand") =>
      CURRENT_PROMPT_SET.prompts.filter((p) => p.intent === intent).reduce((sum, p) => sum + p.weight, 0);
    expect(weight("discovery")).toBeGreaterThan(weight("brand"));
  });

  it("looks up an older version by id, so old probes stay readable", () => {
    expect(promptSet(CURRENT_PROMPT_SET.version)).toBe(CURRENT_PROMPT_SET);
    expect(promptSet("v99")).toBeNull();
  });
});

describe("placeLabel", () => {
  it("prefers the town, and falls back to the region alone", () => {
    expect(placeLabel({ locality: "Montreal", region: "QC" })).toBe("Montreal, QC");
    expect(placeLabel({ locality: "Montreal", region: null })).toBe("Montreal");
    expect(placeLabel({ locality: null, region: "QC" })).toBe("QC");
  });

  it("is null when there is nowhere to ask about", () => {
    expect(placeLabel({ locality: null, region: null })).toBeNull();
    expect(placeLabel({ locality: "  ", region: null })).toBeNull();
  });
});
