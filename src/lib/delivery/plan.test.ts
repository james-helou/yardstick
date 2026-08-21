import { describe, expect, it } from "vitest";
import { dueAt, ONBOARDING, planFor, progressOf, type PlanLine } from "./plan";

const line = (over: Partial<PlanLine> & { id: string }): PlanLine => ({
  name: "Local SEO retainer",
  billing: "monthly",
  quantity: 1,
  ...over,
});

describe("turning a signature into work", () => {
  it("starts with the same access and baseline every time", () => {
    const plan = planFor([]);
    expect(plan.map((item) => item.title)).toEqual(ONBOARDING.map((item) => item.title));
    expect(plan.every((item) => item.kind === "onboarding")).toBe(true);
  });

  it("puts one-time work before recurring work", () => {
    const plan = planFor([
      line({ id: "a", name: "Local SEO retainer", billing: "monthly" }),
      line({ id: "b", name: "Citation cleanup", billing: "one_time" }),
    ]);

    const kinds = plan.map((item) => item.kind);
    expect(kinds.indexOf("setup")).toBeLessThan(kinds.indexOf("recurring"));
    expect(plan.map((item) => item.sortOrder)).toEqual(plan.map((_, index) => index));
  });

  it("names the two kinds so nobody ticks off something that is never finished", () => {
    const plan = planFor([
      line({ id: "a", name: "Citation cleanup", billing: "one_time" }),
      line({ id: "b", name: "Local SEO retainer", billing: "monthly" }),
    ]);

    const setup = plan.find((item) => item.sourceLineId === "a")!;
    const recurring = plan.find((item) => item.sourceLineId === "b")!;
    expect(setup.title).toBe("Set up Citation cleanup");
    expect(recurring.title).toBe("Local SEO retainer, every month");
    // Recurring work is never late, because it is never finished.
    expect(recurring.dueInDays).toBeNull();
    expect(setup.dueInDays).toBe(14);
  });

  it("says how many when more than one was sold", () => {
    const plan = planFor([line({ id: "a", name: "Landing page", billing: "one_time", quantity: 3 })]);
    expect(plan.find((item) => item.sourceLineId === "a")!.title).toBe("Set up Landing page (3)");
  });

  it("keeps every line, and points each item back at the line it came from", () => {
    const lines = [
      line({ id: "a", billing: "one_time", name: "Setup" }),
      line({ id: "b", billing: "monthly", name: "Retainer" }),
      line({ id: "c", billing: "monthly", name: "Content" }),
    ];
    const plan = planFor(lines);

    expect(plan).toHaveLength(ONBOARDING.length + 3);
    expect(plan.filter((i) => i.sourceLineId).map((i) => i.sourceLineId)).toEqual(["a", "b", "c"]);
  });
});

describe("when work is due", () => {
  const signed = new Date("2026-08-20T09:00:00.000Z");

  it("counts from the day they signed", () => {
    const [first] = planFor([]);
    expect(dueAt(first, signed)!.toISOString()).toBe("2026-08-23T09:00:00.000Z");
  });

  it("has no date for work that repeats", () => {
    const plan = planFor([line({ id: "a", billing: "monthly" })]);
    expect(dueAt(plan[plan.length - 1], signed)).toBeNull();
  });
});

describe("progress", () => {
  const item = (status: "todo" | "doing" | "done", kind: "onboarding" | "setup" | "recurring") => ({
    status,
    kind,
  });

  it("counts only work that can actually be finished", () => {
    expect(
      progressOf([
        item("done", "onboarding"),
        item("done", "setup"),
        // Never finishable, and counting it would pin this engagement below full forever.
        item("todo", "recurring"),
      ]),
    ).toEqual({ done: 2, total: 2, percent: 100 });
  });

  it("treats in progress as not done", () => {
    expect(progressOf([item("doing", "setup"), item("todo", "setup")])).toEqual({
      done: 0,
      total: 2,
      percent: 0,
    });
  });

  it("rounds to whole points", () => {
    const three = [item("done", "setup"), item("todo", "setup"), item("todo", "setup")];
    expect(progressOf(three).percent).toBe(33);
  });

  it("is finished when there is nothing to finish", () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0, percent: 100 });
    expect(progressOf([item("todo", "recurring")])).toEqual({ done: 0, total: 0, percent: 100 });
  });
});
