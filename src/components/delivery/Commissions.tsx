import { formatMoney, type Money } from "@/lib/money";
import { formatRate, type CommissionPlan } from "@/lib/commissions/rate";

type Action = (formData: FormData) => Promise<void>;

export type PayoutLine = {
  userId: string;
  label: string;
  accrued: Money;
  paid: Money;
  owed: Money;
};

/**
 * What the workspace owes its reps, and the rate it owes them at.
 *
 * The payout button carries the exact amount owed rather than an amount somebody types,
 * because a payout screen that lets a typo overpay is worse than no payout screen. The
 * repo refuses anything larger anyway; this just means nobody has to find out.
 */
export function Commissions({
  plan,
  lines,
  setPlan,
  pay,
}: {
  plan: CommissionPlan | null;
  lines: readonly PayoutLine[];
  setPlan: Action;
  pay: Action;
}) {
  return (
    <section className="panel panel-pad" aria-label="Commissions">
      <h2 className="section-title">Commissions</h2>
      <p className="mt-0.5 text-sm text-ink-muted">
        {plan === null
          ? "No rate set, so nothing is owed on anything signed. Set one and it applies from the next signature."
          : `${formatRate(plan.oneTimeBp)} of the setup, and ${formatRate(plan.monthlyBp)} of the retainer for ${plan.monthlyMonths === 1 ? "the first month" : `${plan.monthlyMonths} months`}.`}
      </p>

      <form action={setPlan} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="oneTimePercent" className="text-sm font-medium">
            Setup (%)
          </label>
          <input
            id="oneTimePercent"
            name="oneTimePercent"
            inputMode="decimal"
            defaultValue={plan ? plan.oneTimeBp / 100 : 10}
            className="control w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="monthlyPercent" className="text-sm font-medium">
            Retainer (%)
          </label>
          <input
            id="monthlyPercent"
            name="monthlyPercent"
            inputMode="decimal"
            defaultValue={plan ? plan.monthlyBp / 100 : 10}
            className="control w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="monthlyMonths" className="text-sm font-medium">
            For (months)
          </label>
          <input
            id="monthlyMonths"
            name="monthlyMonths"
            inputMode="numeric"
            defaultValue={plan ? plan.monthlyMonths : 3}
            className="control w-24"
          />
        </div>
        <button
          type="submit"
          className="btn btn-secondary"
        >
          Save rate
        </button>
      </form>

      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Nobody has earned anything yet.</p>
      ) : (
        <ul className="panel mt-3 flex flex-col divide-y divide-line">
          {lines.map((line) => (
            <li
              key={`${line.userId}-${line.owed.currency}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{line.label}</p>
                <p className="text-xs text-ink-muted">
                  {formatMoney(line.accrued)} earned
                  {line.paid.amount > 0 ? `, ${formatMoney(line.paid)} paid` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums">{formatMoney(line.owed)} owed</span>
                {line.owed.amount > 0 ? (
                  <form action={pay}>
                    <input type="hidden" name="userId" value={line.userId} />
                    <input type="hidden" name="currency" value={line.owed.currency} />
                    <input type="hidden" name="amount" value={line.owed.amount} />
                    <button
                      type="submit"
                      className="btn btn-secondary btn-sm"
                    >
                      Mark paid
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
