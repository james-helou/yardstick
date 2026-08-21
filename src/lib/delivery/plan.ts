import type { Billing } from "@/lib/proposals/quote";

/**
 * What the agency now owes.
 *
 * A signature is a promise, and this turns that promise into a list somebody can work
 * from on Monday. Pure: proposal lines in, work items out, no clock and no database.
 *
 * Two kinds of item, because they are worked differently. A one-time line is done once
 * and then it is done. A monthly line is never done, it is due again next month, and a
 * checklist that lets somebody tick "Local SEO retainer" as finished is a checklist that
 * lies about what is owed.
 */

export type WorkKind = "onboarding" | "setup" | "recurring";

export type WorkItem = {
  title: string;
  kind: WorkKind;
  /** The proposal line this came from, where there is one. */
  sourceLineId: string | null;
  /** Days after signing that this is due. Null for recurring work, which is never late. */
  dueInDays: number | null;
  sortOrder: number;
};

export type PlanLine = {
  id: string;
  name: string;
  billing: Billing;
  quantity: number;
};

/**
 * The same four things at the start of every engagement, whatever was sold. They are the
 * things that block all the rest: without access nothing can be fixed, and without a
 * baseline nothing can be proved later.
 */
export const ONBOARDING: readonly { title: string; dueInDays: number }[] = [
  { title: "Get access to the Google Business Profile", dueInDays: 3 },
  { title: "Get access to the website", dueInDays: 3 },
  { title: "Run the baseline scan", dueInDays: 5 },
  { title: "Book the kickoff call", dueInDays: 7 },
];

const titleFor = (line: PlanLine): string => {
  const name = line.name.trim();
  const many = line.quantity > 1 ? ` (${line.quantity})` : "";
  return line.billing === "monthly" ? `${name}, every month${many}` : `Set up ${name}${many}`;
};

/** One-time work is due inside the first fortnight. Everything sold is due before it. */
const SETUP_DUE_DAYS = 14;

export function planFor(lines: readonly PlanLine[]): WorkItem[] {
  const items: WorkItem[] = ONBOARDING.map((item, index) => ({
    title: item.title,
    kind: "onboarding" as const,
    sourceLineId: null,
    dueInDays: item.dueInDays,
    sortOrder: index,
  }));

  let order = items.length;
  // One-time work first: it is what the client is waiting on, and it usually has to
  // happen before the recurring work is worth doing at all.
  for (const line of [...lines].filter((l) => l.billing === "one_time")) {
    items.push({
      title: titleFor(line),
      kind: "setup",
      sourceLineId: line.id,
      dueInDays: SETUP_DUE_DAYS,
      sortOrder: order++,
    });
  }

  for (const line of [...lines].filter((l) => l.billing === "monthly")) {
    items.push({
      title: titleFor(line),
      kind: "recurring",
      sourceLineId: line.id,
      dueInDays: null,
      sortOrder: order++,
    });
  }

  return items;
}

/** Recurring work is never overdue; it is simply what happens every month. */
export function dueAt(item: WorkItem, signedAt: Date): Date | null {
  if (item.dueInDays === null) return null;
  return new Date(signedAt.getTime() + item.dueInDays * 24 * 60 * 60 * 1000);
}

export type WorkStatus = "todo" | "doing" | "done";

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
};

/** Where a checklist actually stands, in the two numbers anybody asks for. */
export function progressOf(items: readonly { status: WorkStatus; kind: WorkKind }[]): {
  done: number;
  total: number;
  percent: number;
} {
  // Recurring work is excluded: it can never be finished, and counting it would pin
  // every engagement below a hundred per cent forever.
  const countable = items.filter((item) => item.kind !== "recurring");
  const done = countable.filter((item) => item.status === "done").length;
  const total = countable.length;
  return { done, total, percent: total === 0 ? 100 : Math.round((done / total) * 100) };
}

export const WORK_STATUSES: readonly WorkStatus[] = ["todo", "doing", "done"];

/** A status that came from a form is a string until this says otherwise. */
export const isWorkStatus = (value: unknown): value is WorkStatus =>
  typeof value === "string" && (WORK_STATUSES as readonly string[]).includes(value);

export const WORK_KIND_LABEL: Record<WorkKind, string> = {
  onboarding: "Onboarding",
  setup: "Setup",
  recurring: "Every month",
};
