/**
 * How often a business is re-measured, and when the next measurement is due.
 *
 * Pure, and deliberately so: the schedule a worker acts on is the same one the screen
 * promises, and both are computed here rather than in SQL, where a subtle difference
 * between two `interval` expressions would be invisible until a client asked why their
 * report arrived on the wrong day.
 */

export const CADENCES = ["weekly", "monthly", "quarterly"] as const;
export type Cadence = (typeof CADENCES)[number];

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Every week",
  monthly: "Every month",
  quarterly: "Every quarter",
};

export const isCadence = (value: unknown): value is Cadence =>
  typeof value === "string" && (CADENCES as readonly string[]).includes(value);

const MONTHS: Record<Cadence, number> = { weekly: 0, monthly: 1, quarterly: 3 };

/**
 * The next run after `from`. Weekly is seven days. Monthly and quarterly keep the day of
 * the month where they can and fall back to the last day where they cannot, so a schedule
 * started on the 31st runs on the 28th of February and on the 31st again in March, rather
 * than sliding a day earlier every month for the rest of its life.
 */
export function nextRun(cadence: Cadence, from: Date): Date {
  if (cadence === "weekly") return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

  const months = MONTHS[cadence];
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(from.getUTCDate(), lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/**
 * Catches a schedule up without running it once per missed period. A worker that was down
 * for a month should measure once and carry on, not fire four scans in four seconds.
 */
export function catchUp(cadence: Cadence, from: Date, now: Date): Date {
  let next = nextRun(cadence, from);
  // Bounded: even a decade of weekly misses is a few hundred steps, and the loop can only
  // move forward because nextRun is strictly increasing.
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 1_000) {
    next = nextRun(cadence, next);
    guard += 1;
  }
  return next;
}

export const isDue = (nextRunAt: Date, now: Date): boolean => nextRunAt.getTime() <= now.getTime();
