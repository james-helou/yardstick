import { formatMoney } from "@/lib/money";
import { annualised, formatRate, type Portfolio } from "@/lib/delivery/portfolio";

/**
 * The four numbers an agency owner asks for, and nothing else.
 *
 * Every one of them is derived from the engagement rows on each render rather than kept
 * in a column, so they cannot drift away from each other or from what actually happened.
 */
export function PortfolioSummary({ portfolio }: { portfolio: Portfolio }) {
  const mrr = portfolio.mrr.length === 0 ? "Nothing recurring" : portfolio.mrr.map((m) => formatMoney(m)).join(" · ");
  const year = annualised(portfolio.mrr).map((m) => formatMoney(m)).join(" · ");

  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Figure
        label="Monthly recurring"
        value={mrr}
        note={portfolio.mrr.length > 0 ? `${year} a year at this rate` : "No monthly lines signed yet"}
      />
      <Figure
        label="Active clients"
        value={String(portfolio.active)}
        note={portfolio.ended > 0 ? `${portfolio.ended} ended` : "None ended"}
      />
      <Figure
        label={`Won, last ${portfolio.windowDays} days`}
        value={String(portfolio.won)}
        note={portfolio.churned > 0 ? `${portfolio.churned} lost` : "None lost"}
      />
      <Figure
        label="Churn"
        value={portfolio.churnBp === null ? "—" : formatRate(portfolio.churnBp)}
        note={
          portfolio.churnBp === null
            ? "Nobody on the books when the window opened"
            : `Of ${portfolio.openedWith} on the books ${portfolio.windowDays} days ago` +
              (portfolio.lost.length > 0 ? `, ${portfolio.lost.map((m) => formatMoney(m)).join(" · ")} a month` : "")
        }
      />
    </dl>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel panel-pad">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-1">
        <span className="data text-lg font-semibold">{value}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{note}</span>
      </dd>
    </div>
  );
}
