import { describe, expect, it } from "vitest";
import { shortFingerprint, termsFingerprint, type FingerprintInput } from "./fingerprint";

const base: FingerprintInput = {
  title: "Local search, twelve months",
  currency: "CAD",
  termMonths: 12,
  freeMonths: 0,
  discountPercent: 0,
  taxPercent: 0,
  notes: null,
  lines: [
    { name: "Setup", billing: "one_time", unitPrice: { amount: 150_000, currency: "CAD" }, quantity: 1, discountPercent: 0 },
    { name: "Retainer", billing: "monthly", unitPrice: { amount: 120_000, currency: "CAD" }, quantity: 1, discountPercent: 0 },
  ],
};

describe("termsFingerprint", () => {
  it("is the same deal however the lines are ordered", () => {
    const reversed = { ...base, lines: [...base.lines].reverse() };
    expect(termsFingerprint(reversed)).toBe(termsFingerprint(base));
  });

  it("moves when a single cent moves", () => {
    const dearer = {
      ...base,
      lines: [base.lines[0], { ...base.lines[1], unitPrice: { amount: 120_001, currency: "CAD" } }],
    };
    expect(termsFingerprint(dearer)).not.toBe(termsFingerprint(base));
  });

  it("moves when the term, the discount or the tax moves", () => {
    for (const change of [{ termMonths: 24 }, { discountPercent: 5 }, { taxPercent: 5 }, { freeMonths: 1 }]) {
      expect(termsFingerprint({ ...base, ...change })).not.toBe(termsFingerprint(base));
    }
  });

  it("moves when a line is added, removed or renamed", () => {
    expect(termsFingerprint({ ...base, lines: [base.lines[0]] })).not.toBe(termsFingerprint(base));
    expect(
      termsFingerprint({ ...base, lines: [base.lines[0], { ...base.lines[1], name: "Retainer " }] }),
    ).toBe(termsFingerprint(base));
    expect(
      termsFingerprint({ ...base, lines: [base.lines[0], { ...base.lines[1], name: "Retainer plus" }] }),
    ).not.toBe(termsFingerprint(base));
  });

  it("moves when the words around the price change", () => {
    expect(termsFingerprint({ ...base, notes: "Cancel any time" })).not.toBe(termsFingerprint(base));
    expect(termsFingerprint({ ...base, title: "Something else" })).not.toBe(termsFingerprint(base));
  });

  it("does not care about surrounding whitespace, which no client can see", () => {
    expect(termsFingerprint({ ...base, title: "  Local search, twelve months  " })).toBe(termsFingerprint(base));
    expect(termsFingerprint({ ...base, notes: null })).toBe(termsFingerprint({ ...base, notes: "  " }));
  });

  it("cannot be confused by a name that looks like the next field", () => {
    // Two lines whose concatenations would collide if fields were simply glued together.
    const a = { ...base.lines[0], name: "A", quantity: 11 };
    const b = { ...base.lines[0], name: "A1", quantity: 1 };
    expect(termsFingerprint({ ...base, lines: [a] })).not.toBe(termsFingerprint({ ...base, lines: [b] }));
  });

  it("shortens to something a person can read out", () => {
    const short = shortFingerprint(termsFingerprint(base));
    expect(short).toHaveLength(12);
    expect(short).toBe(short.toUpperCase());
  });
});
