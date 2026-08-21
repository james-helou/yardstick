import { money, sum, type Currency, type Money } from "@/lib/money";

/**
 * The book of business, in the numbers an agency owner actually asks for.
 *
 * Pure. Engagements in, figures out, no clock of its own and no database. Every number
 * here is derived from the rows rather than stored anywhere, which is what keeps them
 * from drifting apart: an engagement that ended is one fact, and monthly revenue, churn
 * and the client count are three readings of it.
 */

export type PortfolioEngagement = {
  monthly: Money;
  startedAt: Date;
  endedAt: Date | null;
  status: "active" | "ended";
};

export type Portfolio = {
  active: number;
  ended: number;
  /** One figure per currency, biggest first. Currencies are never added together. */
  mrr: Money[];
  /** Contracted revenue that walked out during the window, per currency. */
  lost: Money[];
  won: number;
  churned: number;
  /**
   * Churn over the window, in basis points, measured the only defensible way: against
   * how many clients there were when the window opened. Null when there were none, since
   * losing nothing out of nothing is not zero per cent, it is nothing to report.
   */
  churnBp: number | null;
  /** How many clients there were when the window opened. The denominator, shown. */
  openedWith: number;
  windowDays: number;
};

const byCurrency = (items: readonly { monthly: Money }[]): Money[] => {
  const currencies = new Set<Currency>(items.map((item) => item.monthly.currency));
  return [...currencies]
    .map((currency) =>
      sum(
        items.filter((item) => item.monthly.currency === currency).map((item) => item.monthly),
        currency,
      ),
    )
    .filter((total) => total.amount > 0)
    .sort((a, b) => b.amount - a.amount);
};

const daysBefore = (now: Date, days: number): Date =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

export function portfolioOf(
  engagements: readonly PortfolioEngagement[],
  now: Date,
  windowDays = 30,
): Portfolio {
  const opened = daysBefore(now, windowDays);

  const active = engagements.filter((e) => e.status === "active");
  const ended = engagements.filter((e) => e.status === "ended");

  const won = engagements.filter((e) => e.startedAt >= opened).length;
  const churnedInWindow = ended.filter((e) => e.endedAt !== null && e.endedAt >= opened);

  // Who was on the books when the window opened: started before it, and either still
  // running or ended after it.
  const openedWith = engagements.filter(
    (e) => e.startedAt < opened && (e.endedAt === null || e.endedAt >= opened),
  ).length;

  return {
    active: active.length,
    ended: ended.length,
    mrr: byCurrency(active),
    lost: byCurrency(churnedInWindow),
    won,
    churned: churnedInWindow.length,
    churnBp: openedWith === 0 ? null : Math.round((churnedInWindow.length / openedWith) * 10_000),
    openedWith,
    windowDays,
  };
}

/** Basis points read back as a percentage, at one decimal, because churn of 8.3% is not 8%. */
export function formatRate(bp: number): string {
  return `${(bp / 100).toFixed(1)}%`;
}

/** What the portfolio is worth over a year at today's run rate, per currency. */
export function annualised(mrr: readonly Money[]): Money[] {
  return mrr.map((m) => money(m.amount * 12, m.currency));
}
