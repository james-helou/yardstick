import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { annualised, formatRate, portfolioOf, type PortfolioEngagement } from "./portfolio";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const client = (over: Partial<PortfolioEngagement> = {}): PortfolioEngagement => ({
  monthly: money(90_000, "EUR"),
  startedAt: daysAgo(200),
  endedAt: null,
  status: "active",
  ...over,
});

describe("what the book is worth", () => {
  it("adds up only what is still running", () => {
    const book = portfolioOf(
      [
        client({ monthly: money(90_000, "EUR") }),
        client({ monthly: money(150_000, "EUR") }),
        client({ monthly: money(500_000, "EUR"), status: "ended", endedAt: daysAgo(90) }),
      ],
      NOW,
    );

    expect(book.active).toBe(2);
    expect(book.ended).toBe(1);
    expect(book.mrr).toEqual([money(240_000, "EUR")]);
  });

  it("never adds two currencies together", () => {
    const book = portfolioOf(
      [client({ monthly: money(90_000, "EUR") }), client({ monthly: money(120_000, "CAD") })],
      NOW,
    );

    // Biggest first, and each one still says what it is.
    expect(book.mrr).toEqual([money(120_000, "CAD"), money(90_000, "EUR")]);
  });

  it("leaves out a client paying nothing every month", () => {
    // A one-time project is real work and a real engagement, but it is not run rate.
    const book = portfolioOf([client({ monthly: money(0, "EUR") })], NOW);
    expect(book.active).toBe(1);
    expect(book.mrr).toEqual([]);
  });

  it("says what a year at this rate is worth", () => {
    expect(annualised([money(90_000, "EUR")])).toEqual([money(1_080_000, "EUR")]);
  });
});

describe("churn", () => {
  it("measures against how many there were when the window opened", () => {
    const book = portfolioOf(
      [
        client({ startedAt: daysAgo(200) }),
        client({ startedAt: daysAgo(200) }),
        client({ startedAt: daysAgo(200) }),
        client({ startedAt: daysAgo(200), status: "ended", endedAt: daysAgo(5) }),
      ],
      NOW,
    );

    // Four on the books thirty days ago, one gone since.
    expect(book.openedWith).toBe(4);
    expect(book.churned).toBe(1);
    expect(book.churnBp).toBe(2500);
    expect(formatRate(book.churnBp!)).toBe("25.0%");
  });

  it("does not count a client who arrived inside the window in the denominator", () => {
    const book = portfolioOf(
      [
        client({ startedAt: daysAgo(200) }),
        // Signed and gone again this month. Real, but it cannot inflate the base.
        client({ startedAt: daysAgo(10), status: "ended", endedAt: daysAgo(2) }),
      ],
      NOW,
    );

    expect(book.openedWith).toBe(1);
    expect(book.won).toBe(1);
    expect(book.churned).toBe(1);
    expect(book.churnBp).toBe(10_000);
  });

  it("ignores a departure older than the window", () => {
    const book = portfolioOf(
      [client({ startedAt: daysAgo(400), status: "ended", endedAt: daysAgo(120) })],
      NOW,
    );

    expect(book.churned).toBe(0);
    expect(book.lost).toEqual([]);
    // Nobody was on the books when the window opened, so there is no rate to quote.
    expect(book.churnBp).toBeNull();
  });

  it("reports nothing rather than zero per cent when there were no clients", () => {
    expect(portfolioOf([], NOW).churnBp).toBeNull();
    expect(portfolioOf([], NOW).mrr).toEqual([]);
  });

  it("says what the departures were worth", () => {
    const book = portfolioOf(
      [
        client({ startedAt: daysAgo(200) }),
        client({
          monthly: money(75_000, "EUR"),
          startedAt: daysAgo(200),
          status: "ended",
          endedAt: daysAgo(3),
        }),
      ],
      NOW,
    );

    expect(book.lost).toEqual([money(75_000, "EUR")]);
  });

  it("takes the window it is given", () => {
    const engagements = [client({ startedAt: daysAgo(400), status: "ended", endedAt: daysAgo(120) })];
    expect(portfolioOf(engagements, NOW, 365).churned).toBe(1);
    expect(portfolioOf(engagements, NOW, 365).windowDays).toBe(365);
  });
});
