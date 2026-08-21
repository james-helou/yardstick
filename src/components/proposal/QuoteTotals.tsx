import { formatMoney, type Money } from "@/lib/money";

export type TotalsView = {
  oneTimeSubtotal?: Money;
  monthlySubtotal?: Money;
  oneTimeDiscount?: Money;
  monthlyDiscount?: Money;
  oneTimeTax?: Money;
  monthlyTax?: Money;
  oneTimeTotal: Money;
  monthlyTotal: Money;
  contractValue: Money;
  firstInvoice?: Money;
  termMonths: number;
  freeMonths: number;
};

function Row({ label, value, strong }: { label: string; value: Money; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-neutral-600"}>{label}</span>
      <span className="tabular-nums">{formatMoney(value)}</span>
    </div>
  );
}

/**
 * The numbers a rep says out loud: what it costs to start, what it costs every month,
 * and what the whole thing is worth. Everything else is working.
 */
export function QuoteTotals({ totals }: { totals: TotalsView }) {
  const term =
    totals.termMonths === 0
      ? "Month to month"
      : `${totals.termMonths} months${totals.freeMonths > 0 ? `, ${totals.freeMonths} free` : ""}`;

  return (
    <div className="flex flex-col gap-2 rounded-md border p-4 text-sm">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">Totals</span>
        <span className="text-xs text-neutral-600">{term}</span>
      </div>

      {totals.oneTimeSubtotal ? <Row label="One time, before discount" value={totals.oneTimeSubtotal} /> : null}
      {totals.oneTimeDiscount && totals.oneTimeDiscount.amount > 0 ? (
        <Row label="One-time discount" value={totals.oneTimeDiscount} />
      ) : null}
      {totals.oneTimeTax && totals.oneTimeTax.amount > 0 ? <Row label="Tax on setup" value={totals.oneTimeTax} /> : null}
      <Row label="Billed once" value={totals.oneTimeTotal} strong />

      {totals.monthlySubtotal ? <Row label="Monthly, before discount" value={totals.monthlySubtotal} /> : null}
      {totals.monthlyDiscount && totals.monthlyDiscount.amount > 0 ? (
        <Row label="Monthly discount" value={totals.monthlyDiscount} />
      ) : null}
      {totals.monthlyTax && totals.monthlyTax.amount > 0 ? <Row label="Tax each month" value={totals.monthlyTax} /> : null}
      <Row label="Billed every month" value={totals.monthlyTotal} strong />

      <hr className="my-1" />
      {totals.firstInvoice ? <Row label="First invoice" value={totals.firstInvoice} /> : null}
      <Row label="Worth over the term" value={totals.contractValue} strong />
    </div>
  );
}
