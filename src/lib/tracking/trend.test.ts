import { describe, expect, it } from "vitest";
import type { Pillar } from "@/lib/scans/pillars";
import { movement, sparkline, trendOf, type PillarScores, type Point } from "./trend";

const at = (iso: string) => new Date(iso);
const point = (id: string, iso: string, score: number): Point => ({ scanId: id, at: at(iso), score });

const history: Point[] = [
  point("s1", "2026-03-01T09:00:00.000Z", 54),
  point("s2", "2026-04-01T09:00:00.000Z", 61),
  point("s3", "2026-05-01T09:00:00.000Z", 66),
  point("s4", "2026-06-01T09:00:00.000Z", 78),
];

const pillars = new Map<string, PillarScores>([
  ["s1", { gbp: 40, reputation: 70, site_health: 60, geogrid: 35 }],
  ["s4", { gbp: 82, reputation: 66, site_health: 61, geogrid: 74 }],
]);

describe("movement", () => {
  it("is whole points, rounded before subtracting", () => {
    expect(movement(54.4, 78.6)).toBe(25);
    expect(movement(78, 54)).toBe(-24);
    expect(movement(61, 61)).toBe(0);
  });
});

describe("the trend", () => {
  it("compares the latest against the first in the window, not against last time", () => {
    const trend = trendOf(history);
    expect(trend.first!.scanId).toBe("s1");
    expect(trend.latest!.scanId).toBe("s4");
    expect(trend.change).toBe(24);
    expect(trend.direction).toBe("up");
    expect(trend.spanDays).toBe(92);
  });

  it("anchors on the day they signed, and ignores the before picture", () => {
    // Signed in April: what happened in March is the agency's own sales material.
    const trend = trendOf(history, pillars, { since: at("2026-04-01T00:00:00.000Z") });
    expect(trend.points.map((p) => p.scanId)).toEqual(["s2", "s3", "s4"]);
    expect(trend.first!.scanId).toBe("s2");
    expect(trend.change).toBe(17);
  });

  it("sorts what it is given, so the caller cannot get it wrong", () => {
    const shuffled = [history[2], history[0], history[3], history[1]];
    expect(trendOf(shuffled).points.map((p) => p.scanId)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("names what led the change and what dragged on it", () => {
    const trend = trendOf(history, pillars);
    expect(trend.best).toMatchObject({ pillar: "gbp" as Pillar, change: 42 });
    expect(trend.worst).toMatchObject({ pillar: "reputation" as Pillar, change: -4 });
    expect(trend.headline).toBe("Up 24 points over 3 months, now 78. Google profile led it, up 42.");
  });

  it("does not name a mover that did not move", () => {
    const flat = new Map<string, PillarScores>([
      ["s1", { gbp: 50 }],
      ["s4", { gbp: 50 }],
    ]);
    const trend = trendOf(history, flat);
    expect(trend.best).toBeNull();
    expect(trend.worst).toBeNull();
    expect(trend.movers.map((m) => m.change)).toEqual([0]);
  });

  it("only compares pillars that were measured on both ends", () => {
    const partial = new Map<string, PillarScores>([
      ["s1", { gbp: 40 }],
      // The grid did not run the first time, so it has nothing to be compared against.
      ["s4", { gbp: 82, geogrid: 74 }],
    ]);
    expect(trendOf(history, partial).movers.map((m) => m.pillar)).toEqual(["gbp"]);
  });

  it("says so plainly when there is only one measurement", () => {
    const trend = trendOf([history[0]]);
    expect(trend.change).toBe(0);
    expect(trend.direction).toBe("flat");
    expect(trend.headline).toMatch(/Measured once, at 54/);
    expect(trend.movers).toEqual([]);
  });

  it("has an answer for nothing at all", () => {
    const trend = trendOf([]);
    expect(trend).toMatchObject({ change: 0, direction: "flat", headline: "Nothing measured yet." });
  });

  it("treats a move under a point as holding, not as progress", () => {
    const barely = [point("a", "2026-03-01T09:00:00.000Z", 61.2), point("b", "2026-06-01T09:00:00.000Z", 61.4)];
    const trend = trendOf(barely);
    expect(trend.direction).toBe("flat");
    expect(trend.headline).toBe("Holding at 61 over 3 months.");
  });

  it("reports a fall in the client's own words", () => {
    const falling = [point("a", "2026-05-01T09:00:00.000Z", 78), point("b", "2026-06-01T09:00:00.000Z", 66)];
    const dropped = new Map<string, PillarScores>([
      ["a", { geogrid: 70 }],
      ["b", { geogrid: 48 }],
    ]);
    expect(trendOf(falling, dropped).headline).toBe(
      "Down 12 points over 4 weeks, now 66. Local rank grid fell 22.",
    );
  });
});

describe("the sparkline", () => {
  it("puts a higher score higher on the page", () => {
    const line = sparkline(history, 300, 60);
    const ys = line.split(" ").map((pair) => Number(pair.split(",")[1]));
    expect(ys[0]).toBe(60); // the lowest score sits on the floor
    expect(ys[ys.length - 1]).toBe(0); // the highest at the top
  });

  it("spans the whole width", () => {
    const line = sparkline(history, 300, 60).split(" ");
    expect(line[0].split(",")[0]).toBe("0");
    expect(line[line.length - 1].split(",")[0]).toBe("300");
  });

  it("draws a flat line rather than dividing by zero", () => {
    const same = [point("a", "2026-05-01T09:00:00.000Z", 70), point("b", "2026-06-01T09:00:00.000Z", 70)];
    expect(sparkline(same, 100, 40)).toBe("0,40 100,40");
  });

  it("has nothing to draw for nothing", () => {
    expect(sparkline([])).toBe("");
    expect(sparkline([history[0]], 100, 40)).toBe("0,20 100,20");
  });
});
