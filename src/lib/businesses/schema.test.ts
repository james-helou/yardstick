import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { parseBusinessInput } from "./schema";

beforeEach(() => resetEnvCache());

const ok = (raw: unknown) => {
  const result = parseBusinessInput(raw);
  if (!result.ok) throw new Error(`expected valid, got ${JSON.stringify(result.errors)}`);
  return result.value;
};

const errors = (raw: unknown) => {
  const result = parseBusinessInput(raw);
  if (result.ok) throw new Error("expected invalid");
  return result.errors;
};

describe("parseBusinessInput", () => {
  it("requires a name", () => {
    expect(errors({ name: "   " })).toHaveProperty("name");
  });

  it("trims and collapses whitespace in text", () => {
    expect(ok({ name: "  Bright   Smile  Dental " }).name).toBe("Bright Smile Dental");
  });

  it("treats a blank optional field as absent rather than empty", () => {
    expect(ok({ name: "Acme", locality: "   " }).locality).toBeUndefined();
  });

  it("defaults status to prospect and rejects anything unknown", () => {
    expect(ok({ name: "Acme" }).status).toBe("prospect");
    expect(ok({ name: "Acme", status: "client" }).status).toBe("client");
    expect(errors({ name: "Acme", status: "lead" })).toHaveProperty("status");
  });

  it("upper-cases a two letter country and rejects longer ones", () => {
    expect(ok({ name: "Acme", country: "ca" }).country).toBe("CA");
    expect(errors({ name: "Acme", country: "Canada" })).toHaveProperty("country");
  });

  it("adds a scheme to a bare website and drops a trailing slash", () => {
    expect(ok({ name: "Acme", websiteUrl: "brightsmile.ca/" }).websiteUrl).toBe(
      "https://brightsmile.ca",
    );
    expect(ok({ name: "Acme", websiteUrl: "HTTP://Acme.COM/clinic" }).websiteUrl).toBe(
      "http://acme.com/clinic",
    );
  });

  it("rejects a website that is not http", () => {
    expect(errors({ name: "Acme", websiteUrl: "javascript:alert(1)" })).toHaveProperty(
      "websiteUrl",
    );
  });

  it("keeps coordinates inside the real world", () => {
    expect(ok({ name: "Acme", latitude: 45.5, longitude: -73.6 }).latitude).toBe(45.5);
    expect(errors({ name: "Acme", latitude: 91, longitude: 0 })).toHaveProperty("latitude");
    expect(errors({ name: "Acme", latitude: 0, longitude: 181 })).toHaveProperty("longitude");
  });

  it("refuses one coordinate without the other, which locates nothing", () => {
    expect(errors({ name: "Acme", latitude: 45.5 })).toHaveProperty("longitude");
    expect(errors({ name: "Acme", longitude: -73.6 })).toHaveProperty("latitude");
  });

  it("accepts a coordinate pair sent as strings, which is what a form posts", () => {
    expect(ok({ name: "Acme", latitude: "45.5", longitude: "-73.6" }).longitude).toBe(-73.6);
  });

  it("reports every bad field at once, not just the first", () => {
    expect(Object.keys(errors({ name: "", country: "Canada" })).sort()).toEqual([
      "country",
      "name",
    ]);
  });
});
