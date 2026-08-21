import { describe, expect, it } from "vitest";
import { money, type Money } from "@/lib/money";
import { emptyQuote, fromSnapshot, quote, snapshotOf, type QuoteLine } from "./quote";

const cad = (amount: number): Money => money(amount, "CAD");

const setup: QuoteLine = {
  key: "setup",
  name: "Local SEO setup",
  billing: "one_time",
  unitPrice: cad(150_000),
  quantity: 1,
};

const retainer: QuoteLine = {
  key: "retainer",
  name: "Monthly retainer",
  billing: "monthly",
  unitPrice: cad(120_000),
  quantity: 1,
};

describe("quote", () => {
  it("keeps the one-time and the recurring parts apart", () => {
    const q = quote([setup, retainer], { currency: "CAD", termMonths: 12 });

    expect(q.oneTimeTotal).toEqual(cad(150_000));
    expect(q.monthlyTotal).toEqual(cad(120_000));
    // Setup plus twelve months.
    expect(q.contractValue).toEqual(cad(150_000 + 120_000 * 12));
    expect(q.firstInvoice).toEqual(cad(150_000 + 120_000));
  });

  it("multiplies by quantity before it discounts", () => {
    const q = quote(
      [{ ...retainer, quantity: 3, discountPercent: 10 }],
      { currency: "CAD", termMonths: 6 },
    );

    const line = q.lines[0];
    expect(line.gross).toEqual(cad(360_000));
    expect(line.discount).toEqual(cad(36_000));
    expect(line.net).toEqual(cad(324_000));
    expect(q.monthlyTotal).toEqual(cad(324_000));
  });

  it("takes the quote discount off both buckets, after the line discounts", () => {
    const q = quote([setup, { ...retainer, discountPercent: 50 }], {
      currency: "CAD",
      termMonths: 12,
      discountPercent: 10,
    });

    expect(q.monthlySubtotal).toEqual(cad(60_000));
    expect(q.monthlyDiscount).toEqual(cad(6_000));
    expect(q.monthlyTotal).toEqual(cad(54_000));
    expect(q.oneTimeDiscount).toEqual(cad(15_000));
    expect(q.oneTimeTotal).toEqual(cad(135_000));
  });

  it("taxes what is owed, not what was asked for", () => {
    const q = quote([retainer], { currency: "CAD", termMonths: 12, discountPercent: 25, taxPercent: 5 });

    // 1200.00 less 25% is 900.00, and 5% of that is 45.00.
    expect(q.monthlyDiscount).toEqual(cad(30_000));
    expect(q.monthlyTax).toEqual(cad(4_500));
    expect(q.monthlyTotal).toEqual(cad(94_500));
  });

  it("rounds every step to the cent, half away from zero", () => {
    const q = quote([{ ...retainer, unitPrice: cad(999), discountPercent: 33 }], { currency: "CAD" });

    // 33% of 9.99 is 3.2967, which is 3.30 on an invoice.
    expect(q.lines[0].discount).toEqual(cad(330));
    expect(q.monthlyTotal).toEqual(cad(669));
  });

  it("gives away the first month when months are free, and shortens the term", () => {
    const q = quote([setup, retainer], { currency: "CAD", termMonths: 12, freeMonths: 2 });

    expect(q.chargedMonths).toBe(10);
    expect(q.firstInvoice).toEqual(cad(150_000));
    expect(q.contractValue).toEqual(cad(150_000 + 120_000 * 10));
  });

  it("never lets free months turn into a refund", () => {
    const q = quote([retainer], { currency: "CAD", termMonths: 3, freeMonths: 6 });

    expect(q.chargedMonths).toBe(0);
    expect(q.contractValue).toEqual(cad(0));
  });

  it("prices a month-to-month deal as one month, not zero", () => {
    const q = quote([retainer], { currency: "CAD" });

    expect(q.termMonths).toBe(0);
    expect(q.monthlyTotal).toEqual(cad(120_000));
    // Nothing is committed, so the contract value is only what is billed up front.
    expect(q.contractValue).toEqual(cad(0));
    expect(q.firstInvoice).toEqual(cad(120_000));
  });

  it("treats a removed line as zero rather than an error", () => {
    const q = quote([{ ...setup, quantity: 0 }, retainer], { currency: "CAD", termMonths: 12 });
    expect(q.oneTimeTotal).toEqual(cad(0));
    expect(q.lines[0].net).toEqual(cad(0));
  });

  it("starts empty without pretending a currency it was not given", () => {
    const q = emptyQuote("EUR");
    expect(q.currency).toBe("EUR");
    expect(q.contractValue).toEqual(money(0, "EUR"));
    expect(q.lines).toEqual([]);
  });
});

describe("quote refuses what an invoice could not survive", () => {
  it("rejects a line priced in another currency, and says which line", () => {
    expect(() => quote([{ ...retainer, unitPrice: money(120_000, "EUR") }], { currency: "CAD" })).toThrow(
      /Monthly retainer.*EUR.*CAD/,
    );
  });

  it("rejects a negative price, pointing at the discount instead", () => {
    expect(() => quote([{ ...setup, unitPrice: cad(-100) }], { currency: "CAD" })).toThrow(/discount/i);
  });

  it("rejects half a unit", () => {
    expect(() => quote([{ ...retainer, quantity: 1.5 }], { currency: "CAD" })).toThrow(/whole number/);
  });

  it("rejects a discount that is not a percentage", () => {
    expect(() => quote([retainer], { currency: "CAD", discountPercent: 120 })).toThrow(/between 0 and 100/);
    expect(() => quote([{ ...retainer, discountPercent: -5 }], { currency: "CAD" })).toThrow(/between 0 and 100/);
  });

  it("rejects a term measured in half months", () => {
    expect(() => quote([retainer], { currency: "CAD", termMonths: 1.5 })).toThrow(/whole number of months/);
  });

  it("rejects two lines sharing a key, since the result is addressed by key", () => {
    expect(() => quote([retainer, { ...retainer, name: "Second" }], { currency: "CAD" })).toThrow(/own key/);
  });
});

describe("snapshots", () => {
  it("stores the totals and nothing that could move later", () => {
    const q = quote([setup, retainer], { currency: "CAD", termMonths: 12, freeMonths: 1 });
    const snapshot = snapshotOf(q);

    expect(snapshot).toEqual({
      currency: "CAD",
      oneTimeTotal: 150_000,
      monthlyTotal: 120_000,
      contractValue: 150_000 + 120_000 * 11,
      termMonths: 12,
      freeMonths: 1,
    });

    const read = fromSnapshot(snapshot);
    expect(read.contractValue).toEqual(cad(150_000 + 120_000 * 11));
    expect(read.monthlyTotal).toEqual(cad(120_000));
  });
});
