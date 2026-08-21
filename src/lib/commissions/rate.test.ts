import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { commissionFor, DEFAULT_PLAN, formatRate, totalOwed, type CommissionPlan } from "./rate";

const plan = (over: Partial<CommissionPlan> = {}): CommissionPlan => ({ ...DEFAULT_PLAN, ...over });
const cad = (amount: number) => money(amount, "CAD");

describe("what a rep earns", () => {
  it("takes its cut of both halves of the deal", () => {
    const result = commissionFor(plan({ oneTimeBp: 1000, monthlyBp: 1000, monthlyMonths: 3 }), {
      oneTime: cad(150_000),
      monthly: cad(90_000),
    });

    expect(result.oneTime).toEqual(cad(15_000));
    // Three months at nine hundred dollars a month, ten per cent of each.
    expect(result.recurring).toEqual(cad(27_000));
    expect(result.total).toEqual(cad(42_000));
  });

  it("says how it got there, so a rep can check it", () => {
    const result = commissionFor(plan({ oneTimeBp: 1000, monthlyBp: 1000, monthlyMonths: 3 }), {
      oneTime: cad(150_000),
      monthly: cad(90_000),
    });

    expect(result.explanation).toContain("10% of");
    expect(result.explanation).toContain("for 3 months");
  });

  it("names the first month rather than counting to one", () => {
    const result = commissionFor(plan({ oneTimeBp: 0, monthlyMonths: 1 }), {
      oneTime: cad(0),
      monthly: cad(90_000),
    });
    expect(result.explanation).toContain("for the first month");
  });

  it("keeps a fractional rate exact", () => {
    // 12.5% of $1,000.00 is $125.00, and a float would have made this $124.99 eventually.
    const result = commissionFor(plan({ oneTimeBp: 1250, monthlyBp: 0 }), {
      oneTime: cad(100_000),
      monthly: cad(0),
    });
    expect(result.oneTime).toEqual(cad(12_500));
    expect(formatRate(1250)).toBe("12.5%");
    expect(formatRate(1000)).toBe("10%");
  });

  it("earns nothing on a deal with no money in it", () => {
    const result = commissionFor(plan(), { oneTime: cad(0), monthly: cad(0) });
    expect(result.total).toEqual(cad(0));
    expect(result.explanation).toBe("Nothing on this deal.");
  });

  it("earns nothing when the plan pays nothing", () => {
    const result = commissionFor(plan({ oneTimeBp: 0, monthlyBp: 0 }), {
      oneTime: cad(150_000),
      monthly: cad(90_000),
    });
    expect(result.total).toEqual(cad(0));
  });

  it("stays in the currency of the deal", () => {
    const result = commissionFor(plan(), { oneTime: money(0, "EUR"), monthly: money(90_000, "EUR") });
    expect(result.total.currency).toBe("EUR");
  });

  it("refuses a rate that is not a rate", () => {
    const absurd = commissionFor(plan({ oneTimeBp: 50_000, monthlyBp: -100, monthlyMonths: 9999 }), {
      oneTime: cad(100_000),
      monthly: cad(100_000),
    });

    // A hundred per cent is the ceiling, a negative rate is nought, and sixty months is
    // as long as anybody earns on one signature.
    expect(absurd.oneTime).toEqual(cad(100_000));
    expect(absurd.recurring).toEqual(cad(0));
  });

  it("does not round a half down", () => {
    // Commercial rounding, away from zero: half a cent owed is a cent owed.
    const result = commissionFor(plan({ oneTimeBp: 1000, monthlyBp: 0 }), {
      oneTime: cad(5),
      monthly: cad(0),
    });
    expect(result.oneTime).toEqual(cad(1));
  });
});

describe("what the workspace owes", () => {
  it("adds up each currency on its own, biggest first", () => {
    expect(totalOwed([cad(1_000), money(5_000, "EUR"), cad(2_000)])).toEqual([
      money(5_000, "EUR"),
      cad(3_000),
    ]);
  });

  it("leaves out a rep who is square", () => {
    expect(totalOwed([cad(1_000), cad(-1_000)])).toEqual([]);
    expect(totalOwed([])).toEqual([]);
  });
});
