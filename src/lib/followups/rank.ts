import type { Money } from "@/lib/money";

/**
 * Who to call this morning, decided from what a proposal actually did after it was sent.
 *
 * Everything here is pure. The only inputs are the proposal's own facts and the current
 * time, which is passed in rather than read, so the same queue is reproducible and every
 * boundary in it is testable.
 *
 * The idea the whole file rests on: a proposal somebody is reading right now outranks a
 * bigger one that has been silent for a week. Attention is the perishable thing.
 */

export type FollowUpState =
  | "reading" // opened in the last two days and still unanswered
  | "opened" // opened, but not lately
  | "cold" // opened once, a long time ago
  | "unopened" // sent a while back and never opened at all
  | "waiting" // sent a few days ago, not opened yet
  | "fresh"; // only just sent, nothing to chase

export type FollowUpInput = {
  proposalId: string;
  title: string;
  businessId: string | null;
  businessName: string | null;
  contractValue: Money;
  sentAt: Date;
  views: number;
  lastViewedAt: Date | null;
};

export type FollowUp = FollowUpInput & {
  state: FollowUpState;
  /** 0 to 100. Sorting key, and the only thing the screen orders by. */
  urgency: number;
  /** Days since the last thing that happened: a view if there was one, otherwise the send. */
  silentDays: number;
  daysSinceSent: number;
  /** What is true. */
  because: string;
  /** What to do about it. */
  next: string;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Two days is "they are still reading it", a week is "this is drifting". Named because a
 * threshold buried in a comparison is a threshold nobody can argue with.
 */
export const WINDOWS = { recent: 2, stale: 7 } as const;

/** Base urgency per state. The gaps are deliberately at least 10 — see `valueBump`. */
const BASE: Record<FollowUpState, number> = {
  reading: 90,
  opened: 70,
  unopened: 60,
  cold: 50,
  waiting: 40,
  fresh: 15,
};

const daysBetween = (from: Date, to: Date): number => Math.floor((to.getTime() - from.getTime()) / DAY);

/**
 * A bigger deal breaks a tie; it never jumps a state. Capped at 9 while every gap between
 * states is at least 10, so no amount of money moves a silent proposal above a live
 * reader. The scale is logarithmic because the difference between a €1k and a €10k deal
 * matters far more than between €90k and €100k.
 */
export function valueBump(value: Money): number {
  const amount = Math.max(value.amount, 1);
  return Math.min(9, Math.max(0, Math.floor(Math.log10(amount))));
}

export function classify(input: FollowUpInput, now: Date): FollowUpState {
  const sinceSent = daysBetween(input.sentAt, now);

  if (input.views > 0 && input.lastViewedAt) {
    const sinceView = daysBetween(input.lastViewedAt, now);
    if (sinceView < WINDOWS.recent) return "reading";
    if (sinceView < WINDOWS.stale) return "opened";
    return "cold";
  }

  if (sinceSent >= WINDOWS.stale) return "unopened";
  if (sinceSent >= WINDOWS.recent) return "waiting";
  return "fresh";
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const ago = (days: number): string => {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${plural(days, "day")} ago`;
};

function narrate(input: FollowUpInput, state: FollowUpState, silentDays: number, daysSinceSent: number) {
  const opens = plural(input.views, "time");
  switch (state) {
    case "reading":
      return {
        because: `Opened ${opens}, most recently ${ago(silentDays)}.`,
        next: "Call now. They have it open.",
      };
    case "opened":
      return {
        because: `Opened ${opens}, last ${ago(silentDays)}. No answer yet.`,
        next: "Ask what is holding it up.",
      };
    case "cold":
      return {
        because: `Read ${ago(silentDays)} and nothing since.`,
        next: "One more call, then decide whether this is real.",
      };
    case "unopened":
      return {
        because: `Sent ${ago(daysSinceSent)} and never opened.`,
        next: "The link probably never landed. Send it again another way.",
      };
    case "waiting":
      return {
        because: `Sent ${ago(daysSinceSent)}, not opened yet.`,
        next: "Nudge them, briefly.",
      };
    case "fresh":
      return {
        because: `Sent ${ago(daysSinceSent)}.`,
        next: "Leave it. It has not had a chance yet.",
      };
  }
}

export function rankOne(input: FollowUpInput, now: Date): FollowUp {
  const state = classify(input, now);
  const daysSinceSent = Math.max(0, daysBetween(input.sentAt, now));
  const silentDays = Math.max(0, daysBetween(input.lastViewedAt ?? input.sentAt, now));

  return {
    ...input,
    state,
    urgency: BASE[state] + valueBump(input.contractValue),
    silentDays,
    daysSinceSent,
    ...narrate(input, state, silentDays, daysSinceSent),
  };
}

/**
 * The queue itself: most urgent first, and among equals the one that has been silent
 * longest, because that is the one closest to being lost.
 */
export function rankFollowUps(inputs: readonly FollowUpInput[], now: Date): FollowUp[] {
  return inputs
    .map((input) => rankOne(input, now))
    .sort((a, b) => b.urgency - a.urgency || b.silentDays - a.silentDays || a.title.localeCompare(b.title));
}

/** What the top of the screen says, so a rep knows the shape of the morning before reading. */
export function summarise(queue: readonly FollowUp[]): { total: number; callNow: number; chasing: number } {
  return {
    total: queue.length,
    callNow: queue.filter((f) => f.state === "reading").length,
    chasing: queue.filter((f) => f.state === "opened" || f.state === "unopened" || f.state === "cold").length,
  };
}
