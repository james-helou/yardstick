import { createHash } from "node:crypto";
import type { Billing } from "./quote";

/**
 * A fingerprint of exactly what was sent.
 *
 * A signature is worth what it is attached to. This turns the terms and the lines into
 * one short string, computed the same way every time, so a signed proposal can be
 * checked against what the client actually saw rather than against whatever the row
 * says today. If a single cent, month or word moved, the fingerprint moves with it.
 */

export type FingerprintInput = {
  title: string;
  currency: string;
  termMonths: number;
  freeMonths: number;
  discountPercent: number;
  taxPercent: number;
  notes: string | null;
  lines: readonly {
    name: string;
    billing: Billing;
    unitPrice: { amount: number; currency: string };
    quantity: number;
    discountPercent: number;
  }[];
};

/** A separator no name can contain, so two fields can never glue into a third. */
const SEP = "\u0000";

/**
 * Lines are sorted before hashing, so the same deal presented in a different order is
 * the same deal. Everything else is written out in a fixed order with no whitespace,
 * because a fingerprint that depends on how JSON.stringify felt that day is not one.
 */
export function termsFingerprint(input: FingerprintInput): string {
  const lines = input.lines
    .map((line) =>
      [
        line.name.trim(),
        line.billing,
        String(line.unitPrice.amount),
        line.unitPrice.currency,
        String(line.quantity),
        String(line.discountPercent),
      ].join(SEP),
    )
    .sort();

  const canonical = [
    input.title.trim(),
    input.currency,
    String(input.termMonths),
    String(input.freeMonths),
    String(input.discountPercent),
    String(input.taxPercent),
    (input.notes ?? "").trim(),
    String(lines.length),
    ...lines,
  ].join(SEP);

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Short enough to read out on a call, long enough that two deals will not collide. */
export function shortFingerprint(fingerprint: string): string {
  return fingerprint.slice(0, 12).toUpperCase();
}
