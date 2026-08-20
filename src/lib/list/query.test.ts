import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageWindow, parseListQuery, toSearchParams } from "./query";

const spec = {
  sortable: ["name", "createdAt", "score"] as const,
  defaultSort: "createdAt" as const,
  defaultDirection: "desc" as const,
};

const params = (s: string) => new URLSearchParams(s);

describe("parseListQuery", () => {
  it("falls back to the declared defaults", () => {
    expect(parseListQuery(params(""), spec)).toEqual({
      page: 1,
      sort: "createdAt",
      direction: "desc",
      search: "",
    });
  });

  it("reads a valid query", () => {
    expect(parseListQuery(params("page=3&sort=name&dir=asc&q=acme"), spec)).toEqual({
      page: 3,
      sort: "name",
      direction: "asc",
      search: "acme",
    });
  });

  it("ignores a sort column that is not whitelisted", () => {
    // The alternative is interpolating user input into an ORDER BY clause.
    expect(parseListQuery(params("sort=password"), spec).sort).toBe("createdAt");
    expect(parseListQuery(params("sort=name;drop table orgs"), spec).sort).toBe("createdAt");
  });

  it("ignores an unknown direction", () => {
    expect(parseListQuery(params("dir=sideways"), spec).direction).toBe("desc");
  });

  it("clamps a page below one", () => {
    expect(parseListQuery(params("page=0"), spec).page).toBe(1);
    expect(parseListQuery(params("page=-5"), spec).page).toBe(1);
    expect(parseListQuery(params("page=not-a-number"), spec).page).toBe(1);
  });

  it("normalises whitespace in the search term", () => {
    expect(parseListQuery(params("q=%20%20acme%20%20roofing%20%20"), spec).search).toBe(
      "acme roofing",
    );
  });

  it("accepts a plain record of params as Next hands them over", () => {
    expect(parseListQuery({ page: "2", sort: "name" }, spec)).toMatchObject({
      page: 2,
      sort: "name",
    });
  });

  it("takes the first value when a param repeats", () => {
    expect(parseListQuery({ sort: ["name", "score"] }, spec).sort).toBe("name");
  });
});

describe("toSearchParams", () => {
  it("omits everything that is already the default, for clean URLs", () => {
    const query = parseListQuery(params(""), spec);
    expect(toSearchParams(query, spec).toString()).toBe("");
  });

  it("keeps only what differs", () => {
    const query = parseListQuery(params("page=2&sort=createdAt&dir=desc&q=acme"), spec);
    expect(toSearchParams(query, spec).toString()).toBe("page=2&q=acme");
  });

  it("round-trips", () => {
    const original = parseListQuery(params("page=4&sort=score&dir=asc&q=roof"), spec);
    expect(parseListQuery(toSearchParams(original, spec), spec)).toEqual(original);
  });
});

describe("pageWindow", () => {
  it("describes a middle page", () => {
    expect(pageWindow({ total: 95, page: 3 })).toEqual({
      total: 95,
      page: 3,
      pageSize: PAGE_SIZE,
      totalPages: 5,
      offset: 40,
      limit: 20,
      from: 41,
      to: 60,
      hasPrevious: true,
      hasNext: true,
    });
  });

  it("handles a short last page", () => {
    expect(pageWindow({ total: 95, page: 5 })).toMatchObject({
      from: 81,
      to: 95,
      hasNext: false,
    });
  });

  it("handles no results without producing a nonsense range", () => {
    expect(pageWindow({ total: 0, page: 1 })).toMatchObject({
      totalPages: 0,
      from: 0,
      to: 0,
      hasPrevious: false,
      hasNext: false,
      offset: 0,
    });
  });

  it("clamps a page past the end back onto the last page", () => {
    expect(pageWindow({ total: 25, page: 99 })).toMatchObject({
      page: 2,
      offset: 20,
      from: 21,
      to: 25,
      hasNext: false,
    });
  });

  it("never yields a negative offset", () => {
    expect(pageWindow({ total: 10, page: -3 }).offset).toBe(0);
  });

  it("defaults to twenty per page", () => {
    expect(PAGE_SIZE).toBe(20);
  });
});
