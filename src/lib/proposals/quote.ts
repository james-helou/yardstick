import { add, money, multiply, percentOf, subtract, sum, zero, type Currency, type Money } from "@/lib/money";

/**
 * The whole price of a deal, computed in one pure pass.
 *
 * Nothing here reads a database or a clock. An agency's quote is the one number a
 * prospect remembers, so every step of how it was reached has to be reproducible from
 * its inputs alone, and a sent proposal has to be able to store the answer rather than
 * recompute it later from a catalogue that has since moved.
 */

/** How a line is billed. Everything else about a deal is a combination of these two. */
export type Billing = "one_time" | "monthly";

export type QuoteLine = {
  /** Stable within one quote. Identifies the line in the result without relying on order. */
  key: string;
  name: string;
  billing: Billing;
  unitPrice: Money;
  quantity: number;
  /** Taken off this line alone, before anything at the quote level. */
  discountPercent?: number;
};

export type QuoteTerms = {
  currency: Currency;
  /** Months the recurring part is committed for. Zero means month to month. */
  termMonths?: number;
  /** Taken off both subtotals after every line discount. */
  discountPercent?: number;
  /** Months of the recurring part given away. Charged months are the term minus these. */
  freeMonths?: number;
  /** Applied last, to the discounted amounts. */
  taxPercent?: number;
};

export type QuotedLine = QuoteLine & {
  /** Unit price times quantity, before any discount. */
  gross: Money;
  discount: Money;
  /** What this line contributes to its bucket. */
  net: Money;
};

export type Quote = {
  currency: Currency;
  lines: QuotedLine[];

  oneTimeSubtotal: Money;
  monthlySubtotal: Money;

  /** Quote-level discount, per bucket, so the two numbers can be shown separately. */
  oneTimeDiscount: Money;
  monthlyDiscount: Money;

  oneTimeTax: Money;
  monthlyTax: Money;

  /** What the client is billed once, and what they are billed every month. */
  oneTimeTotal: Money;
  monthlyTotal: Money;

  termMonths: number;
  freeMonths: number;
  /** Months actually charged over the term. Never negative. */
  chargedMonths: number;

  /** The number on the first invoice: setup plus the first charged month. */
  firstInvoice: Money;
  /** Everything the deal is worth over its term. The number a rep is measured on. */
  contractValue: Money;
};

function assertPercent(value: number | undefined, what: string): number {
  const percent = value ?? 0;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error(`${what} must be between 0 and 100, received ${String(value)}`);
  }
  return percent;
}

function assertWholeMonths(value: number | undefined, what: string): number {
  const months = value ?? 0;
  if (!Number.isInteger(months) || months < 0) {
    throw new Error(`${what} must be a whole number of months, received ${String(value)}`);
  }
  return months;
}

function priceLine(line: QuoteLine, currency: Currency): QuotedLine {
  if (!Number.isInteger(line.quantity) || line.quantity < 0) {
    throw new Error(`Quantity for "${line.name}" must be a whole number, received ${String(line.quantity)}`);
  }
  if (line.unitPrice.currency !== currency) {
    // Money refuses to add across currencies, but this says which line caused it.
    throw new Error(`Line "${line.name}" is priced in ${line.unitPrice.currency}, the quote is in ${currency}`);
  }
  if (line.unitPrice.amount < 0) {
    throw new Error(`Line "${line.name}" has a negative price. Use a discount instead.`);
  }

  const percent = assertPercent(line.discountPercent, `Discount on "${line.name}"`);
  const gross = multiply(line.unitPrice, line.quantity);
  const discount = percentOf(gross, percent);

  return { ...line, gross, discount, net: subtract(gross, discount) };
}

/** Every number a proposal shows, from the lines and the terms and nothing else. */
export function quote(lines: readonly QuoteLine[], terms: QuoteTerms): Quote {
  const currency = terms.currency;
  const priced = lines.map((line) => priceLine(line, currency));

  const keys = new Set(priced.map((line) => line.key));
  if (keys.size !== priced.length) {
    throw new Error("Every line in a quote needs its own key");
  }

  const bucket = (billing: Billing) =>
    sum(
      priced.filter((line) => line.billing === billing).map((line) => line.net),
      currency,
    );

  const oneTimeSubtotal = bucket("one_time");
  const monthlySubtotal = bucket("monthly");

  const quotePercent = assertPercent(terms.discountPercent, "Quote discount");
  const oneTimeDiscount = percentOf(oneTimeSubtotal, quotePercent);
  const monthlyDiscount = percentOf(monthlySubtotal, quotePercent);

  const oneTimeNet = subtract(oneTimeSubtotal, oneTimeDiscount);
  const monthlyNet = subtract(monthlySubtotal, monthlyDiscount);

  const taxPercent = assertPercent(terms.taxPercent, "Tax");
  const oneTimeTax = percentOf(oneTimeNet, taxPercent);
  const monthlyTax = percentOf(monthlyNet, taxPercent);

  const oneTimeTotal = add(oneTimeNet, oneTimeTax);
  const monthlyTotal = add(monthlyNet, monthlyTax);

  const termMonths = assertWholeMonths(terms.termMonths, "Term");
  const freeMonths = assertWholeMonths(terms.freeMonths, "Free months");
  // A month-to-month deal still bills a month at a time; the term is what it is worth
  // on paper, so free months cannot make a charged month negative.
  const chargedMonths = Math.max(termMonths - freeMonths, 0);

  // The first month is free when any month is, which is what "two months free" means to
  // the person signing.
  const firstMonth = freeMonths > 0 ? zero(currency) : monthlyTotal;

  return {
    currency,
    lines: priced,
    oneTimeSubtotal,
    monthlySubtotal,
    oneTimeDiscount,
    monthlyDiscount,
    oneTimeTax,
    monthlyTax,
    oneTimeTotal,
    monthlyTotal,
    termMonths,
    freeMonths,
    chargedMonths,
    firstInvoice: add(oneTimeTotal, firstMonth),
    contractValue: add(oneTimeTotal, multiply(monthlyTotal, chargedMonths)),
  };
}

/** An empty quote, so a new proposal has something to render before a line exists. */
export function emptyQuote(currency: Currency): Quote {
  return quote([], { currency });
}

/** The stored shape of a sent quote: totals only, in minor units, with no live prices in it. */
export type QuoteSnapshot = {
  currency: Currency;
  oneTimeTotal: number;
  monthlyTotal: number;
  contractValue: number;
  termMonths: number;
  freeMonths: number;
};

export function snapshotOf(q: Quote): QuoteSnapshot {
  return {
    currency: q.currency,
    oneTimeTotal: q.oneTimeTotal.amount,
    monthlyTotal: q.monthlyTotal.amount,
    contractValue: q.contractValue.amount,
    termMonths: q.termMonths,
    freeMonths: q.freeMonths,
  };
}

export function fromSnapshot(snapshot: QuoteSnapshot): {
  oneTimeTotal: Money;
  monthlyTotal: Money;
  contractValue: Money;
} {
  return {
    oneTimeTotal: money(snapshot.oneTimeTotal, snapshot.currency),
    monthlyTotal: money(snapshot.monthlyTotal, snapshot.currency),
    contractValue: money(snapshot.contractValue, snapshot.currency),
  };
}
