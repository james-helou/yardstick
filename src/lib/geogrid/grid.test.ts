import { describe, expect, it } from "vitest";
import { scoreGeogrid, type RankedPoint } from "@/lib/scans/geogrid";
import { buildGrid, DEFAULT_GRID } from "./grid";

const MONTREAL = { latitude: 45.5017, longitude: -73.5673 };

describe("buildGrid", () => {
  it("lays out size squared points centred on the business", () => {
    const points = buildGrid({ center: MONTREAL, ...DEFAULT_GRID });
    expect(points).toHaveLength(25);

    const middle = points[12];
    expect(middle.latitude).toBeCloseTo(MONTREAL.latitude, 6);
    expect(middle.longitude).toBeCloseTo(MONTREAL.longitude, 6);
    expect(middle.distanceKm).toBe(0);
  });

  it("reaches the radius at the edge, north and south", () => {
    const points = buildGrid({ center: MONTREAL, radiusKm: 3, size: 5 });
    const north = points[2]; // top row, middle column
    expect((north.latitude - MONTREAL.latitude) * 110.574).toBeCloseTo(3, 1);
  });

  it("corrects longitude spacing for latitude, so the grid is square on the ground", () => {
    const here = buildGrid({ center: MONTREAL, radiusKm: 3, size: 3 });
    const equator = buildGrid({ center: { latitude: 0, longitude: 0 }, radiusKm: 3, size: 3 });

    const spreadHere = here[2].longitude - here[0].longitude;
    const spreadEquator = equator[2].longitude - equator[0].longitude;
    // Montreal is at 45 degrees, so a kilometre east is about 1.4 times more longitude.
    expect(spreadHere / spreadEquator).toBeCloseTo(1 / Math.cos((45.5017 * Math.PI) / 180), 2);
  });

  it("refuses a grid that would not include the business itself", () => {
    expect(() => buildGrid({ center: MONTREAL, radiusKm: 3, size: 4 })).toThrow(/odd/);
    expect(() => buildGrid({ center: MONTREAL, radiusKm: 3, size: 11 })).toThrow(/3 to 9/);
    expect(() => buildGrid({ center: MONTREAL, radiusKm: 0, size: 3 })).toThrow(/radius/);
  });
});

describe("scoreGeogrid", () => {
  const grid = (ranks: (number | null)[]): RankedPoint[] =>
    ranks.map((rank, i) => ({ latitude: 45 + i / 1000, longitude: -73, rank }));

  it("scores a business that is first everywhere at full marks", () => {
    expect(scoreGeogrid(grid([1, 1, 1, 1]), "dentist").score).toBe(100);
  });

  it("scores a business nobody can find at zero", () => {
    const outcome = scoreGeogrid(grid([null, null, null, null]), "dentist");
    expect(outcome.score).toBe(0);
    expect(outcome.findings.find((f) => f.code === "blank")?.label).toBe("Invisible from 4 of 4 points");
  });

  it("counts a rank past the horizon as no better than absent", () => {
    expect(scoreGeogrid(grid([25, 25]), "dentist").score).toBe(
      scoreGeogrid(grid([null, null]), "dentist").score,
    );
  });

  it("does not let one strong point hide a blank map", () => {
    const spiky = scoreGeogrid(grid([1, null, null, null]), "dentist").score!;
    const even = scoreGeogrid(grid([8, 8, 8, 8]), "dentist").score!;
    expect(spiky).toBeLessThan(even);
  });

  it("reports coverage in the words a rep would use", () => {
    const outcome = scoreGeogrid(grid([1, 2, 11, null]), "dentist");
    expect(outcome.findings.find((f) => f.code === "top3")?.label).toBe("In the top 3 from 50% of the area");
    expect(outcome.findings.find((f) => f.code === "average")?.label).toBe("Average position 4.7");
  });

  it("calls an empty grid a failure rather than a zero", () => {
    expect(scoreGeogrid([], "dentist")).toMatchObject({ status: "failed" });
  });
});
