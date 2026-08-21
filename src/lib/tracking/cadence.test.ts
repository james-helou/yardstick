import { describe, expect, it } from "vitest";
import { catchUp, isCadence, isDue, nextRun } from "./cadence";

const at = (iso: string) => new Date(iso);

describe("when the next measurement is due", () => {
  it("is seven days later, every week", () => {
    expect(nextRun("weekly", at("2026-08-20T09:00:00.000Z")).toISOString()).toBe("2026-08-27T09:00:00.000Z");
  });

  it("keeps the day of the month", () => {
    expect(nextRun("monthly", at("2026-08-20T09:00:00.000Z")).toISOString()).toBe("2026-09-20T09:00:00.000Z");
    expect(nextRun("quarterly", at("2026-08-20T09:00:00.000Z")).toISOString()).toBe(
      "2026-11-20T09:00:00.000Z",
    );
  });

  it("lands on the last day of a shorter month rather than sliding", () => {
    // The 31st of January has no counterpart in February.
    expect(nextRun("monthly", at("2026-01-31T09:00:00.000Z")).toISOString()).toBe("2026-02-28T09:00:00.000Z");
    // And it goes back to the 31st in March: the clamp does not become permanent.
    expect(nextRun("monthly", at("2026-03-31T09:00:00.000Z")).toISOString()).toBe("2026-04-30T09:00:00.000Z");
    expect(nextRun("monthly", at("2028-01-31T09:00:00.000Z")).toISOString()).toBe("2028-02-29T09:00:00.000Z");
  });

  it("crosses a year without arithmetic trouble", () => {
    expect(nextRun("monthly", at("2026-12-15T09:00:00.000Z")).toISOString()).toBe("2027-01-15T09:00:00.000Z");
    expect(nextRun("quarterly", at("2026-11-15T09:00:00.000Z")).toISOString()).toBe(
      "2027-02-15T09:00:00.000Z",
    );
  });

  it("always moves forward", () => {
    for (const cadence of ["weekly", "monthly", "quarterly"] as const) {
      const from = at("2026-01-31T23:59:59.000Z");
      expect(nextRun(cadence, from).getTime()).toBeGreaterThan(from.getTime());
    }
  });
});

describe("catching up after an outage", () => {
  it("measures once and carries on, rather than firing for every missed period", () => {
    const lastRun = at("2026-05-01T09:00:00.000Z");
    const now = at("2026-08-20T09:00:00.000Z");

    const next = catchUp("monthly", lastRun, now);
    expect(next.toISOString()).toBe("2026-09-01T09:00:00.000Z");
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it("is the plain next run when nothing was missed", () => {
    const from = at("2026-08-20T09:00:00.000Z");
    const now = at("2026-08-21T09:00:00.000Z");
    expect(catchUp("weekly", from, now)).toEqual(nextRun("weekly", from));
  });

  it("handles a long outage on the shortest cadence", () => {
    const next = catchUp("weekly", at("2020-01-01T00:00:00.000Z"), at("2026-08-20T09:00:00.000Z"));
    expect(next.getTime()).toBeGreaterThan(at("2026-08-20T09:00:00.000Z").getTime());
  });
});

describe("guards", () => {
  it("knows a cadence from a string somebody typed", () => {
    expect(isCadence("weekly")).toBe(true);
    expect(isCadence("daily")).toBe(false);
    expect(isCadence(undefined)).toBe(false);
  });

  it("is due the moment it is not in the future", () => {
    const now = at("2026-08-20T09:00:00.000Z");
    expect(isDue(now, now)).toBe(true);
    expect(isDue(at("2026-08-20T08:59:59.000Z"), now)).toBe(true);
    expect(isDue(at("2026-08-20T09:00:01.000Z"), now)).toBe(false);
  });
});
