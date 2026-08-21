import { CADENCE_LABEL, CADENCES, type Cadence } from "@/lib/tracking/cadence";

type Action = (formData: FormData) => Promise<void>;

/**
 * Whether this business is re-measured on its own, and how often. Plain forms: three
 * one-button posts and a select, so the whole panel works before any JavaScript loads.
 */
export function TrackingPanel({
  businessId,
  cadence,
  nextRunAt,
  lastRunAt,
  paused,
  set,
  pause,
  resume,
  stop,
}: {
  businessId: string;
  cadence: Cadence | null;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  paused: boolean;
  set: Action;
  pause: Action;
  resume: Action;
  stop: Action;
}) {
  const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

  return (
    <section className="panel panel-pad">
      <h2 className="section-title">Tracking</h2>
      <p className="mt-0.5 text-sm text-ink-muted">
        {cadence === null
          ? "Not measured on a schedule. A one-off scan is still a scan."
          : paused
            ? `${CADENCE_LABEL[cadence]}, paused.`
            : `${CADENCE_LABEL[cadence]}. Next on ${day(nextRunAt)}.`}
        {lastRunAt ? ` Last run ${day(lastRunAt)}.` : ""}
      </p>

      <form action={set} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="flex flex-col gap-1">
          <label htmlFor="cadence" className="text-sm font-medium">
            How often
          </label>
          <select
            id="cadence"
            name="cadence"
            defaultValue={cadence ?? "monthly"}
            className="control"
          >
            {CADENCES.map((option) => (
              <option key={option} value={option}>
                {CADENCE_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">
          {cadence === null ? "Start tracking" : "Change cadence"}
        </button>
      </form>

      {cadence === null ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={paused ? resume : pause}>
            <input type="hidden" name="businessId" value={businessId} />
            <button type="submit" className="btn btn-secondary btn-sm">
              {paused ? "Resume" : "Pause"}
            </button>
          </form>
          <form action={stop}>
            <input type="hidden" name="businessId" value={businessId} />
            <button type="submit" className="btn btn-secondary btn-sm">
              Stop tracking
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
