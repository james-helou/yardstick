import { money, type Currency, type Money } from "@/lib/money";
import type { Billing } from "./quote";

/**
 * What a person may type into a price box, turned into integer minor units.
 *
 * A price is entered once and quoted for a year, so this is deliberately forgiving about
 * separators and deliberately strict about everything else: no negatives, no third
 * decimal, no silent rounding of something that was never a number.
 */

export const CURRENCIES: Currency[] = ["EUR", "CAD"];
export const BILLINGS: Billing[] = ["one_time", "monthly"];

const MINOR_UNITS = 2;

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export function parseAmount(input: unknown, currency: Currency): { ok: true; value: Money } | { ok: false; error: string } {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, error: "Enter a price" };

  // Strip currency symbols, spaces and thousands separators, then settle on one decimal mark.
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/\s/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalMark = lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;

  let whole = cleaned;
  let fraction = "";
  if (decimalMark) {
    const at = cleaned.lastIndexOf(decimalMark);
    whole = cleaned.slice(0, at);
    fraction = cleaned.slice(at + 1);
  }

  whole = whole.replace(/[.,]/g, "");
  if (!/^-?\d*$/.test(whole) || !/^\d*$/.test(fraction)) return { ok: false, error: "Enter a price like 1200.00" };
  if (whole.startsWith("-")) return { ok: false, error: "A price cannot be negative" };
  if (fraction.length > MINOR_UNITS) return { ok: false, error: "A price stops at cents" };
  if (!whole && !fraction) return { ok: false, error: "Enter a price like 1200.00" };

  const minor = Number.parseInt((whole || "0") + fraction.padEnd(MINOR_UNITS, "0"), 10);
  if (!Number.isSafeInteger(minor)) return { ok: false, error: "That price is larger than we can quote" };

  return { ok: true, value: money(minor, currency) };
}

/** Shown back to the person who typed it, in the same units they entered. */
export function amountToInput(m: Money): string {
  return (m.amount / 10 ** MINOR_UNITS).toFixed(MINOR_UNITS);
}

function parsePercent(input: unknown, field: string, errors: Record<string, string>): number {
  const raw = String(input ?? "").trim();
  if (!raw) return 0;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    errors[field] = "Enter a percentage between 0 and 100";
    return 0;
  }
  // Basis points are the storage unit, so anything finer than a hundredth is not kept.
  return Math.round(value * 100) / 100;
}

function parseWholeNumber(input: unknown, field: string, errors: Record<string, string>, fallback = 0): number {
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    errors[field] = "Enter a whole number";
    return fallback;
  }
  return value;
}

const text = (input: unknown): string => String(input ?? "").trim().replace(/\s+/g, " ");

export type ServiceItemFields = {
  name: string;
  description: string | null;
  billing: Billing;
  unitPrice: Money;
  defaultQuantity: number;
};

export function parseServiceItem(fields: Record<string, unknown> | undefined): Parsed<ServiceItemFields> {
  const input = fields ?? {};
  const errors: Record<string, string> = {};

  const name = text(input.name);
  if (!name) errors.name = "Give it a name your client will recognise";
  if (name.length > 120) errors.name = "That name is longer than a line on a quote";

  const currency = CURRENCIES.includes(input.currency as Currency) ? (input.currency as Currency) : "CAD";
  const billing = BILLINGS.includes(input.billing as Billing) ? (input.billing as Billing) : null;
  if (!billing) errors.billing = "Say whether this is one-time or monthly";

  const price = parseAmount(input.unitPrice, currency);
  if (!price.ok) errors.unitPrice = price.error;

  const defaultQuantity = parseWholeNumber(input.defaultQuantity, "defaultQuantity", errors, 1);

  if (Object.keys(errors).length > 0 || !price.ok || !billing) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      description: text(input.description) || null,
      billing,
      unitPrice: price.value,
      defaultQuantity,
    },
  };
}

export type ProposalFields = {
  title: string;
  currency: Currency;
  businessId: string | null;
  termMonths: number;
  freeMonths: number;
  discountPercent: number;
  taxPercent: number;
  notes: string | null;
};

export function parseProposalFields(fields: Record<string, unknown> | undefined): Parsed<ProposalFields> {
  const input = fields ?? {};
  const errors: Record<string, string> = {};

  const title = text(input.title);
  if (!title) errors.title = "Give the proposal a title";
  if (title.length > 160) errors.title = "That title is too long to sit above a price";

  const currency = CURRENCIES.includes(input.currency as Currency) ? (input.currency as Currency) : "CAD";
  const termMonths = parseWholeNumber(input.termMonths, "termMonths", errors);
  const freeMonths = parseWholeNumber(input.freeMonths, "freeMonths", errors);
  if (freeMonths > termMonths && termMonths > 0) {
    errors.freeMonths = "More free months than the term itself";
  }

  const discountPercent = parsePercent(input.discountPercent, "discountPercent", errors);
  const taxPercent = parsePercent(input.taxPercent, "taxPercent", errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title,
      currency,
      businessId: text(input.businessId) || null,
      termMonths,
      freeMonths,
      discountPercent,
      taxPercent,
      notes: text(input.notes) || null,
    },
  };
}

export type LineFields = {
  name: string;
  billing: Billing;
  unitPrice: Money;
  quantity: number;
  discountPercent: number;
  serviceItemId: string | null;
};

export function parseLineFields(
  fields: Record<string, unknown> | undefined,
  currency: Currency,
): Parsed<LineFields> {
  const input = fields ?? {};
  const errors: Record<string, string> = {};

  const name = text(input.name);
  if (!name) errors.name = "Name the line, since this is what the client reads";

  const billing = BILLINGS.includes(input.billing as Billing) ? (input.billing as Billing) : null;
  if (!billing) errors.billing = "Say whether this is one-time or monthly";

  const price = parseAmount(input.unitPrice, currency);
  if (!price.ok) errors.unitPrice = price.error;

  const quantity = parseWholeNumber(input.quantity, "quantity", errors, 1);
  const discountPercent = parsePercent(input.discountPercent, "discountPercent", errors);

  if (Object.keys(errors).length > 0 || !price.ok || !billing) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      billing,
      unitPrice: price.value,
      quantity,
      discountPercent,
      serviceItemId: text(input.serviceItemId) || null,
    },
  };
}
