import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "@/lib/external/call";
import { dataForSeoRanks, findRank, RankRequestError } from "./dataforseo";

const items = [
  { rank_absolute: 1, place_id: "other", title: "Dental Studio" },
  { rank_absolute: 2, place_id: "ChIJ_dental", title: "Bright Smile Dental & Implants" },
  { rank_absolute: 3, place_id: "third", title: "Montreal Teeth" },
];

const body = (list: unknown[] = items) => ({ tasks: [{ status_code: 20000, result: [{ items: list }] }] });
const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

const fast = { retries: 1, baseDelayMs: 0, jitter: false };
const query = {
  keyword: "dentist montreal",
  latitude: 45.5,
  longitude: -73.5,
  placeId: "ChIJ_dental",
  name: "Bright Smile Dental",
};

beforeEach(() => resetBreakers());

describe("findRank", () => {
  it("prefers the exact identifier", () => {
    expect(findRank(items, { placeId: "ChIJ_dental", name: "Something else entirely" })).toBe(2);
  });

  it("falls back to the name when there is no identifier", () => {
    expect(findRank(items, { name: "Montreal Teeth" })).toBe(3);
  });

  it("matches a name the provider spells differently", () => {
    expect(findRank(items, { name: "Bright Smile Dental" })).toBe(2);
    expect(findRank(items, { name: "Brïght-Smile  Dental" })).toBe(2);
  });

  it("returns nothing when the business is simply not there", () => {
    expect(findRank(items, { placeId: "missing", name: "Nowhere Dental" })).toBeNull();
    expect(findRank([], { name: "Anyone" })).toBeNull();
  });
});

describe("dataForSeoRanks", () => {
  it("asks from the point given and reports the position", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body()));
    const rank = await dataForSeoRanks({
      login: "user@agency.test",
      password: "s3cr3t-password",
      fetchImpl,
      call: fast,
    }).rankAt(query);

    expect(rank).toBe(2);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.dataforseo.com/v3/serp/google/maps/live/advanced");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("user@agency.test:s3cr3t-password").toString("base64")}`,
    );
    // Credentials belong in a header. In a query string they land in logs.
    expect(url).not.toContain("s3cr3t-password");
    expect(JSON.parse(init.body)[0]).toMatchObject({
      keyword: "dentist montreal",
      location_coordinate: "45.5,-73.5,14",
    });
  });

  it("reports a business missing from the pack as unranked, not as an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body([])));
    await expect(
      dataForSeoRanks({ login: "l", password: "p", fetchImpl, call: fast }).rankAt(query),
    ).resolves.toBeNull();
  });

  it("refuses to read a failed task as an empty pack", async () => {
    // 200 with a task error would otherwise look like "found nothing", which would tell
    // an agency their client is invisible when in fact nobody searched.
    // A fresh response per call: this one is retried, and a body can only be read once.
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ tasks: [{ status_code: 40501, status_message: "quota" }] }));
    await expect(
      dataForSeoRanks({ login: "l", password: "p", fetchImpl, call: fast }).rankAt(query),
    ).rejects.toThrow(/quota/);
  });

  it("does not retry rejected credentials", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({}, 401));
    const provider = dataForSeoRanks({ login: "l", password: "bad", fetchImpl, call: fast });
    await expect(provider.rankAt(query)).rejects.toBeInstanceOf(RankRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
