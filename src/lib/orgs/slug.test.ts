import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lower-cases and joins words with a single dash", () => {
    expect(slugify("Bright Smile  Dental")).toBe("bright-smile-dental");
  });

  it("folds accents rather than dropping the letters", () => {
    expect(slugify("Créative Média")).toBe("creative-media");
  });

  it("drops punctuation and never leaves a leading or trailing dash", () => {
    expect(slugify("  --Acme, Inc.!  ")).toBe("acme-inc");
  });

  it("falls back to a usable word when nothing survives", () => {
    expect(slugify("!!!")).toBe("workspace");
    expect(slugify("")).toBe("workspace");
  });

  it("truncates without leaving a trailing dash", () => {
    const slug = slugify(`${"a".repeat(38)} bbbbbbbb`);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});
