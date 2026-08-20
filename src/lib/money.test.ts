import { describe, expect, it } from "vitest";
import {
  add,
  formatMoney,
  money,
  moneyFromColumn,
  multiply,
  percentOf,
  subtract,
  sum,
  zero,
} from "./money";

describe("money", () => {
  it("rejects non-integer minor units", () => {
    expect(() => money(10.5, "EUR")).toThrow(/integer/i);
  });

  it("adds within a currency", () => {
    expect(add(money(150_00, "EUR"), money(97_00, "EUR"))).toEqual(money(247_00, "EUR"));
  });

  it("refuses to mix currencies", () => {
    expect(() => add(money(100, "EUR"), money(100, "CAD"))).toThrow(/CAD/);
  });

  it("subtracts and allows negatives", () => {
    expect(subtract(money(100, "EUR"), money(250, "EUR"))).toEqual(money(-150, "EUR"));
  });

  it("sums a list", () => {
    expect(sum([money(1, "EUR"), money(2, "EUR"), money(3, "EUR")], "EUR")).toEqual(money(6, "EUR"));
    expect(sum([], "EUR")).toEqual(zero("EUR"));
  });

  it("multiplies by a quantity exactly", () => {
    expect(multiply(money(1500_00, "EUR"), 3)).toEqual(money(4500_00, "EUR"));
  });

  it("rounds half away from zero on fractional multiplication", () => {
    expect(multiply(money(5, "EUR"), 0.5)).toEqual(money(3, "EUR"));
    expect(multiply(money(-5, "EUR"), 0.5)).toEqual(money(-3, "EUR"));
  });

  it("computes a percentage without drifting", () => {
    expect(percentOf(money(1500_00, "EUR"), 20)).toEqual(money(300_00, "EUR"));
    expect(percentOf(money(999, "EUR"), 33)).toEqual(money(330, "EUR"));
  });

  it("never loses a cent across a split and rejoin", () => {
    const total = money(100_01, "EUR");
    const part = percentOf(total, 50);
    expect(add(part, subtract(total, part))).toEqual(total);
  });

  it("reads a NUMERIC column arriving as a string", () => {
    expect(moneyFromColumn("150000", "EUR")).toEqual(money(150000, "EUR"));
    expect(moneyFromColumn(null, "EUR")).toEqual(zero("EUR"));
    expect(() => moneyFromColumn("not a number", "EUR")).toThrow();
  });

  it("formats per currency", () => {
    expect(formatMoney(money(1500_00, "EUR"), "fr-FR")).toMatch(/1\s?500/);
    expect(formatMoney(money(2500_00, "CAD"), "en-CA")).toContain("2,500");
  });
});
