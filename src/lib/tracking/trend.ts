import { PILLAR_LABEL, type Pillar } from "@/lib/scans/pillars";

/**
 * Movement, which is the only number a client who has been paying for six months
 * actually cares about. Pure: it takes measurements and a window and says what changed.
 *
 * Every comparison is first-in-window against latest. Comparing against "last month" is
 * the thing that lets a bad month erase a good half-year, and a client who signed in
 * March is owed the answer to "what have I got since March".
 */

export type Point = { scanId: string; at: Date; score: number };

export type Direction = "up" | "down" | "flat";

export type PillarMove = { pillar: Pillar; label: string; from: number; to: number; change: number };

export type Trend = {
  /** Oldest first, so a chart can read it straight through. */
  points: Point[];
  first: Point | null;
  latest: Point | null;
  change: number;
  direction: Direction;
  /** Whole days between the first measurement in the window and the latest. */
  spanDays: number;
  movers: PillarMove[];
  best: PillarMove | null;
  worst: PillarMove | null;
  /** Plain English, for a client who will not be reading a chart. */
  headline: string;
};

export type PillarScores = Partial<Record<Pillar, number>>;

const DAY = 24 * 60 * 60 * 1000;

/** A move smaller than a point is noise, not progress. */
const direction = (change: number): Direction => (change >= 1 ? "up" : change <= -1 ? "down" : "flat");

const byTime = (a: Point, b: Point) => a.at.getTime() - b.at.getTime();

export function movement(from: number, to: number): number {
  return Math.round(to) - Math.round(from);
}

/**
 * `since` is the anchor: the day the client signed, usually. Measurements before it are
 * dropped rather than averaged in, because they are the agency's "before" picture and
 * counting them would flatter the result.
 */
export function trendOf(
  points: readonly Point[],
  pillars: ReadonlyMap<string, PillarScores> = new Map(),
  options: { since?: Date | null; now?: Date } = {},
): Trend {
  const since = options.since ?? null;
  const window = [...points]
    .filter((p) => (since ? p.at.getTime() >= since.getTime() : true))
    .sort(byTime);

  const first = window[0] ?? null;
  const latest = window.length > 0 ? window[window.length - 1] : null;

  if (!first || !latest || first.scanId === latest.scanId) {
    return {
      points: window,
      first,
      latest,
      change: 0,
      direction: "flat",
      spanDays: 0,
      movers: [],
      best: null,
      worst: null,
      headline: latest
        ? `Measured once, at ${Math.round(latest.score)}. The next measurement is what makes it a trend.`
        : "Nothing measured yet.",
    };
  }

  const change = movement(first.score, latest.score);
  const spanDays = Math.max(0, Math.floor((latest.at.getTime() - first.at.getTime()) / DAY));

  const before = pillars.get(first.scanId) ?? {};
  const after = pillars.get(latest.scanId) ?? {};
  const movers: PillarMove[] = (Object.keys(after) as Pillar[])
    .filter((pillar) => typeof before[pillar] === "number" && typeof after[pillar] === "number")
    .map((pillar) => ({
      pillar,
      label: PILLAR_LABEL[pillar],
      from: before[pillar]!,
      to: after[pillar]!,
      change: movement(before[pillar]!, after[pillar]!),
    }))
    .sort((a, b) => b.change - a.change || a.label.localeCompare(b.label));

  const moved = movers.filter((m) => m.change !== 0);
  const best = moved.length > 0 && moved[0].change > 0 ? moved[0] : null;
  const worstCandidate = moved[moved.length - 1];
  const worst = moved.length > 0 && worstCandidate.change < 0 ? worstCandidate : null;

  return {
    points: window,
    first,
    latest,
    change,
    direction: direction(change),
    spanDays,
    movers,
    best,
    worst,
    headline: headlineFor({ change, spanDays, latest, best, worst }),
  };
}

function headlineFor(input: {
  change: number;
  spanDays: number;
  latest: Point;
  best: PillarMove | null;
  worst: PillarMove | null;
}): string {
  const over = input.spanDays >= 60
    ? `over ${Math.round(input.spanDays / 30)} months`
    : input.spanDays >= 14
      ? `over ${Math.round(input.spanDays / 7)} weeks`
      : `over ${input.spanDays} day${input.spanDays === 1 ? "" : "s"}`;
  const score = Math.round(input.latest.score);

  if (input.change >= 1) {
    const led = input.best ? ` ${input.best.label} led it, up ${input.best.change}.` : "";
    return `Up ${input.change} points ${over}, now ${score}.${led}`;
  }
  if (input.change <= -1) {
    const blame = input.worst ? ` ${input.worst.label} fell ${Math.abs(input.worst.change)}.` : "";
    return `Down ${Math.abs(input.change)} points ${over}, now ${score}.${blame}`;
  }
  return `Holding at ${score} ${over}.`;
}

/**
 * The polyline for a sparkline, in a 0..width by 0..height box. Kept here rather than in
 * the component so it is testable and so nothing about the chart depends on the browser.
 */
export function sparkline(points: readonly Point[], width = 240, height = 48): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `0,${height / 2} ${width},${height / 2}`;

  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  const step = width / (points.length - 1);

  return points
    .map((point, index) => {
      const x = Math.round(index * step * 10) / 10;
      // Inverted: a higher score has to sit higher on the page.
      const y = Math.round((height - ((point.score - min) / span) * height) * 10) / 10;
      return `${x},${y}`;
    })
    .join(" ");
}
