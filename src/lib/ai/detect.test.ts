import { describe, expect, it } from "vitest";
import { detectMention, listedNames, namesBusiness, normaliseName } from "./detect";

describe("normaliseName", () => {
  it("casefolds, strips accents, punctuation and the legal suffix", () => {
    expect(normaliseName("Joe's Plumbing, Inc.")).toBe("joes plumbing");
    expect(normaliseName("Clinique Dentaire Rosemont")).toBe("clinique dentaire rosemont");
    expect(normaliseName("Café Olimpico LLC")).toBe("cafe olimpico");
    expect(normaliseName("The Barber Shop")).toBe("barber shop");
    expect(normaliseName("Smith & Sons")).toBe("smith and sons");
  });

  it("keeps a name that is only a suffix, since dropping it would leave nothing", () => {
    expect(normaliseName("Inc")).toBe("inc");
  });
});

describe("namesBusiness", () => {
  it("matches across punctuation and legal suffixes", () => {
    expect(namesBusiness("I would try Joe's Plumbing first.", "Joe's Plumbing Inc")).toBe(true);
  });

  it("matches a longer name in the answer than the one on record", () => {
    expect(namesBusiness("Acme Dental Group is well reviewed.", "Acme Dental")).toBe(true);
  });

  it("does not match a name that merely shares a word", () => {
    expect(namesBusiness("Try Montreal Dental Centre.", "Bright Smile Dental")).toBe(false);
  });

  it("refuses to match on a name too short to be distinctive", () => {
    expect(namesBusiness("The co-op on the corner is good.", "Co")).toBe(false);
  });
});

describe("listedNames", () => {
  it("reads numbered, bulleted and bolded lists in order", () => {
    const answer = [
      "Here are some options:",
      "",
      "1. **Bright Smile Dental** - modern clinic downtown",
      "2. Plateau Dental Care: family practice",
      "- Clinique Dentaire Rosemont (evenings)",
      "",
      "Any of these would be a reasonable call.",
    ].join("\n");

    expect(listedNames(answer)).toEqual([
      "Bright Smile Dental",
      "Plateau Dental Care",
      "Clinique Dentaire Rosemont",
    ]);
  });

  it("ignores prose, so a name in a closing paragraph is not a recommendation", () => {
    expect(listedNames("You could also ask around about Bright Smile Dental.")).toEqual([]);
  });

  it("drops a list item that is a sentence rather than a name", () => {
    const answer = "1. Check reviews on Google before booking anything at all this week\n2. Acme Dental";
    expect(listedNames(answer)).toEqual(["Acme Dental"]);
  });

  it("keeps each business once, however many times the answer repeats it", () => {
    expect(listedNames("1. Acme Dental\n2. ACME DENTAL\n3. Other Clinic")).toEqual([
      "Acme Dental",
      "Other Clinic",
    ]);
  });
});

describe("detectMention", () => {
  const answer = [
    "1. **Plateau Dental Care** - family practice",
    "2. **Bright Smile Dental** - modern clinic downtown",
    "3. Clinique Dentaire Rosemont",
  ].join("\n");

  it("reports the position and everyone else named", () => {
    const mention = detectMention(answer, "Bright Smile Dental");
    expect(mention).toEqual({
      mentioned: true,
      position: 2,
      competitors: ["Plateau Dental Care", "Clinique Dentaire Rosemont"],
    });
  });

  it("separates named in prose from ranked in the list", () => {
    const prose = "I do not have a ranking, but Bright Smile Dental comes up often.\n\n1. Acme Dental";
    const mention = detectMention(prose, "Bright Smile Dental");
    expect(mention.mentioned).toBe(true);
    expect(mention.position).toBeNull();
    expect(mention.competitors).toEqual(["Acme Dental"]);
  });

  it("reports absence, with the businesses that took the place instead", () => {
    const mention = detectMention(answer, "Nowhere Dental");
    expect(mention.mentioned).toBe(false);
    expect(mention.position).toBeNull();
    expect(mention.competitors).toHaveLength(3);
  });
});
