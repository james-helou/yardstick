import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { amountToInput, parseAmount, parseLineFields, parseProposalFields, parseServiceItem } from "./schema";

const cad = (amount: number) => money(amount, "CAD");

describe("parseAmount", () => {
  it("reads the ways a person actually types a price", () => {
    for (const raw of ["1200", "1200.00", "1 200,00", "$1,200.00", " 1200.0 "]) {
      expect(parseAmount(raw, "CAD")).toEqual({ ok: true, value: cad(120_000) });
    }
  });

  it("keeps the cents it was given", () => {
    expect(parseAmount("99.99", "CAD")).toEqual({ ok: true, value: cad(9_999) });
    expect(parseAmount("0.5", "CAD")).toEqual({ ok: true, value: cad(50) });
    expect(parseAmount(".75", "CAD")).toEqual({ ok: true, value: cad(75) });
  });

  it("refuses to round away a third decimal rather than quietly losing it", () => {
    const result = parseAmount("10.005", "CAD");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cents/);
  });

  it("refuses a negative price and says what to do instead", () => {
    const result = parseAmount("-10", "CAD");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/negative/);
  });

  it("refuses what is not a number at all", () => {
    expect(parseAmount("", "CAD").ok).toBe(false);
    expect(parseAmount("free", "CAD").ok).toBe(false);
    expect(parseAmount(undefined, "CAD").ok).toBe(false);
  });

  it("shows a stored price back in the units it was typed in", () => {
    expect(amountToInput(cad(120_000))).toBe("1200.00");
    expect(amountToInput(cad(75))).toBe("0.75");
  });
});

describe("parseServiceItem", () => {
  it("takes a name, a billing type and a price", () => {
    expect(
      parseServiceItem({
        name: "  Local SEO   retainer ",
        billing: "monthly",
        unitPrice: "1200",
        currency: "CAD",
        description: " Everything monthly ",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Local SEO retainer",
        description: "Everything monthly",
        billing: "monthly",
        unitPrice: cad(120_000),
        defaultQuantity: 1,
      },
    });
  });

  it("reports every problem at once", () => {
    const result = parseServiceItem({ name: "", billing: "sometimes", unitPrice: "x" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["billing", "name", "unitPrice"]);
  });
});

describe("parseProposalFields", () => {
  it("reads the terms of the deal", () => {
    const result = parseProposalFields({
      title: "Local search, twelve months",
      currency: "CAD",
      termMonths: "12",
      freeMonths: "1",
      discountPercent: "12,5",
      taxPercent: "5",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        title: "Local search, twelve months",
        currency: "CAD",
        businessId: null,
        termMonths: 12,
        freeMonths: 1,
        discountPercent: 12.5,
        taxPercent: 5,
        notes: null,
      },
    });
  });

  it("refuses more free months than there is term", () => {
    const result = parseProposalFields({ title: "Deal", termMonths: "6", freeMonths: "12" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.freeMonths).toMatch(/free months/);
  });

  it("refuses a discount that is not a percentage", () => {
    const result = parseProposalFields({ title: "Deal", discountPercent: "150" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.discountPercent).toMatch(/between 0 and 100/);
  });

  it("defaults a month-to-month deal to no term rather than rejecting it", () => {
    const result = parseProposalFields({ title: "Deal" });
    expect(result).toMatchObject({ ok: true, value: { termMonths: 0, freeMonths: 0 } });
  });
});

describe("parseLineFields", () => {
  it("prices a line in the proposal's currency, not one of its own", () => {
    const result = parseLineFields({ name: "Setup", billing: "one_time", unitPrice: "1500" }, "EUR");
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Setup",
        billing: "one_time",
        unitPrice: money(150_000, "EUR"),
        quantity: 1,
        discountPercent: 0,
        serviceItemId: null,
      },
    });
  });

  it("refuses half a unit", () => {
    const result = parseLineFields({ name: "Setup", billing: "one_time", unitPrice: "10", quantity: "1.5" }, "CAD");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.quantity).toMatch(/whole number/);
  });
});
