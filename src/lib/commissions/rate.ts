import { add, formatMoney, money, multiply, percentOf, zero, type Money } from "@/lib/money";

/**
 * What a rep earns on a deal.
 *
 * Pure, and deliberately arithmetic nobody has to trust: rates are basis points, money is
 * integer minor units, and the result carries a sentence saying how it was reached. A rep
 * who cannot check their own commission does not believe it, and a commission nobody
 * believes causes more arguments than it settles.
 */

export type CommissionPlan = {
  name: string;
  /** Of the one-off part of the deal. 1000 is ten per cent. */
  oneTimeBp: number;
  /** Of the monthly part, earned for `monthlyMonths` months. */
  monthlyBp: number;
  monthlyMonths: number;
};

export const DEFAULT_PLAN: CommissionPlan = {
  name: "Standard",
  oneTimeBp: 1000,
  monthlyBp: 1000,
  monthlyMonths: 3,
};

export type Deal = { oneTime: Money; monthly: Money };

export type Commission = {
  /** Earned once, on the setup part. */
  oneTime: Money;
  /** The whole of the recurring part, already multiplied by the months it is earned for. */
  recurring: Money;
  total: Money;
  /** How it was reached, in a sentence a rep can check against their own arithmetic. */
  explanation: string;
};

const bpToPercent = (bp: number) => bp / 100;

/** A rate outside nought to a hundred per cent is not a rate, so it is treated as nought. */
const clampBp = (bp: number): number => (Number.isFinite(bp) ? Math.min(10_000, Math.max(0, Math.trunc(bp))) : 0);

const clampMonths = (months: number): number =>
  Number.isFinite(months) ? Math.min(60, Math.max(0, Math.trunc(months))) : 0;

export function commissionFor(plan: CommissionPlan, deal: Deal): Commission {
  // The deal is priced in one currency, and a commission never leaves it.
  const currency = deal.monthly.amount !== 0 ? deal.monthly.currency : deal.oneTime.currency;

  const oneTimeBp = clampBp(plan.oneTimeBp);
  const monthlyBp = clampBp(plan.monthlyBp);
  const months = clampMonths(plan.monthlyMonths);

  const oneTime = oneTimeBp === 0 ? zero(currency) : percentOf(deal.oneTime, bpToPercent(oneTimeBp));
  const perMonth = monthlyBp === 0 ? zero(currency) : percentOf(deal.monthly, bpToPercent(monthlyBp));
  const recurring = months === 0 ? zero(currency) : multiply(perMonth, months);

  return {
    oneTime,
    recurring,
    total: add(oneTime, recurring),
    explanation: explain({ deal, oneTimeBp, monthlyBp, months, oneTime, perMonth, recurring }),
  };
}

function explain(input: {
  deal: Deal;
  oneTimeBp: number;
  monthlyBp: number;
  months: number;
  oneTime: Money;
  perMonth: Money;
  recurring: Money;
}): string {
  const parts: string[] = [];

  if (input.oneTime.amount > 0) {
    parts.push(
      `${formatRate(input.oneTimeBp)} of ${formatMoney(input.deal.oneTime)} once is ${formatMoney(input.oneTime)}`,
    );
  }
  if (input.recurring.amount > 0) {
    const months = input.months === 1 ? "the first month" : `${input.months} months`;
    parts.push(
      `${formatRate(input.monthlyBp)} of ${formatMoney(input.deal.monthly)} for ${months} is ${formatMoney(input.recurring)}`,
    );
  }

  return parts.length === 0 ? "Nothing on this deal." : `${parts.join(", and ")}.`;
}

/** 1250 reads as 12.5%, and 1000 reads as 10%, because a trailing nought looks like a typo. */
export function formatRate(bp: number): string {
  const percent = clampBp(bp) / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, "")}%`;
}

/** What the workspace owes altogether, kept per currency because money never mixes. */
export function totalOwed(amounts: readonly Money[]): Money[] {
  const currencies = [...new Set(amounts.map((m) => m.currency))];
  return currencies
    .map((currency) =>
      amounts
        .filter((m) => m.currency === currency)
        .reduce((running, m) => add(running, m), money(0, currency)),
    )
    .filter((m) => m.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
}
