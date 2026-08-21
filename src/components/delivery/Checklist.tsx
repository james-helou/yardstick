import { formatMoney } from "@/lib/money";
import { progressOf, WORK_KIND_LABEL, type WorkStatus } from "@/lib/delivery/plan";
import type { Engagement, WorkItem } from "@/lib/db/repos/engagements";

type Action = (formData: FormData) => Promise<void>;

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/** The next status in the cycle, so one button moves an item along without a menu. */
const NEXT: Record<WorkStatus, WorkStatus> = { todo: "doing", doing: "done", done: "todo" };
const ADVANCE_LABEL: Record<WorkStatus, string> = {
  todo: "Start",
  doing: "Mark done",
  done: "Reopen",
};

/**
 * What the agency owes this client, and how far along it is.
 *
 * Recurring work sits in the list but is left out of the count, because it is never
 * finished and counting it would hold every engagement below full for ever.
 */
export function Checklist({
  engagement,
  items,
  now,
  advance,
  add,
  end,
  reopen,
}: {
  engagement: Engagement;
  items: readonly WorkItem[];
  now: Date;
  advance: Action;
  add: Action;
  end: Action;
  reopen: Action;
}) {
  const progress = progressOf(items);
  const ended = engagement.status === "ended";

  return (
    <section className="rounded-md border p-4" aria-label={`Delivery for ${engagement.businessName ?? "this client"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Delivery</h2>
          <p className="mt-0.5 text-sm text-neutral-600">
            {ended
              ? `Ended ${day(engagement.endedAt)}${engagement.endedReason ? `. ${engagement.endedReason}` : "."}`
              : `Signed ${day(engagement.startedAt)}.`}
            {engagement.monthly.amount > 0 ? ` ${formatMoney(engagement.monthly)} a month.` : ""}
            {engagement.oneTime.amount > 0 ? ` ${formatMoney(engagement.oneTime)} once.` : ""}
          </p>
        </div>
        <p className="text-sm tabular-nums text-neutral-600">
          {progress.done} of {progress.total} done
        </p>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Delivery progress"
      >
        <div className="h-full bg-neutral-800" style={{ width: `${progress.percent}%` }} />
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-600">Nothing on the list yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {items.map((item) => {
            const late =
              item.status !== "done" && item.dueAt !== null && item.dueAt.getTime() < now.getTime();
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm ${item.status === "done" ? "text-neutral-500 line-through" : "font-medium"}`}
                  >
                    {item.title}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {WORK_KIND_LABEL[item.kind]}
                    {item.dueAt ? ` · due ${day(item.dueAt)}` : ""}
                    {late ? " · overdue" : ""}
                  </p>
                </div>
                <form action={advance}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="status" value={NEXT[item.status]} />
                  <button
                    type="submit"
                    className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 focus:outline-2 focus:outline-offset-2"
                  >
                    {ADVANCE_LABEL[item.status]}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <form action={add} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="engagementId" value={engagement.id} />
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`work-${engagement.id}`} className="text-sm font-medium">
            Add work
          </label>
          <input
            id={`work-${engagement.id}`}
            name="title"
            placeholder="Rewrite the services page"
            className="w-full rounded border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2"
          />
        </div>
        <button
          type="submit"
          className="rounded border px-3 py-2 text-sm font-medium hover:bg-neutral-50 focus:outline-2 focus:outline-offset-2"
        >
          Add
        </button>
      </form>

      {ended ? (
        <form action={reopen} className="mt-3">
          <input type="hidden" name="engagementId" value={engagement.id} />
          <button
            type="submit"
            className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 focus:outline-2 focus:outline-offset-2"
          >
            Won back
          </button>
        </form>
      ) : (
        <form action={end} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="engagementId" value={engagement.id} />
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={`why-${engagement.id}`} className="text-sm font-medium">
              End this engagement
            </label>
            <input
              id={`why-${engagement.id}`}
              name="reason"
              placeholder="Why they left"
              className="w-full rounded border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2"
            />
          </div>
          <button
            type="submit"
            className="rounded border px-3 py-2 text-sm font-medium hover:bg-neutral-50 focus:outline-2 focus:outline-offset-2"
          >
            End
          </button>
        </form>
      )}
    </section>
  );
}
