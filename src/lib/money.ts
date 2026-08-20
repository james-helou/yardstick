export type Currency = "EUR" | "CAD";

/** Always integer minor units. A float never touches a money path. */
export type Money = Readonly<{ amount: number; currency: Currency }>;

const MINOR_UNITS: Record<Currency, number> = { EUR: 2, CAD: 2 };

export function money(amount: number, currency: Currency): Money {
  if (!Number.isInteger(amount)) {
    throw new Error(`Money must be an integer number of minor units, received ${amount}`);
  }
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Money amount ${amount} is outside the safe integer range`);
  }
  return Object.freeze({ amount, currency });
}

export const zero = (currency: Currency): Money => money(0, currency);

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot combine ${a.currency} with ${b.currency} — convert explicitly or keep them apart`,
    );
  }
}

/** Commercial rounding: half away from zero, so -2.5 becomes -3 rather than -2. */
function roundHalfAwayFromZero(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function sum(items: readonly Money[], currency: Currency): Money {
  return items.reduce<Money>((acc, m) => add(acc, m), zero(currency));
}

export function multiply(m: Money, factor: number): Money {
  return money(roundHalfAwayFromZero(m.amount * factor), m.currency);
}

export function percentOf(m: Money, percent: number): Money {
  return money(roundHalfAwayFromZero((m.amount * percent) / 100), m.currency);
}

export function formatMoney(m: Money, locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
  }).format(m.amount / 10 ** MINOR_UNITS[m.currency]);
}

/** Postgres hands back NUMERIC and BIGINT as strings. Coerce here, at the boundary, and nowhere else. */
export function moneyFromColumn(value: string | number | null, currency: Currency): Money {
  if (value === null) return zero(currency);
  const n = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Cannot read money from column value ${String(value)}`);
  }
  return money(n, currency);
}
