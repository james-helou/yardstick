import { describe, expect, it } from "vitest";
import { absoluteUrl, originFrom } from "./origin";

const h = (init: Record<string, string>) => new Headers(init);

describe("originFrom", () => {
  it("trusts the forwarded host and protocol a proxy sets", () => {
    expect(originFrom(h({ "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" }))).toBe(
      "https://app.example.com",
    );
  });

  it("takes the first protocol when a chain of proxies appended more", () => {
    expect(originFrom(h({ host: "app.example.com", "x-forwarded-proto": "https, http" }))).toBe(
      "https://app.example.com",
    );
  });

  it("assumes https for a real host and http for a local one", () => {
    expect(originFrom(h({ host: "app.example.com" }))).toBe("https://app.example.com");
    expect(originFrom(h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(originFrom(h({ host: "127.0.0.1:3100" }))).toBe("http://127.0.0.1:3100");
  });

  it("returns nothing when there is no host at all, rather than inventing one", () => {
    expect(originFrom(h({}))).toBe("");
  });
});

describe("absoluteUrl", () => {
  it("builds an absolute link when it can and falls back to the path when it cannot", () => {
    expect(absoluteUrl(h({ host: "app.example.com" }), "/r/abc")).toBe("https://app.example.com/r/abc");
    expect(absoluteUrl(h({}), "/r/abc")).toBe("/r/abc");
  });
});
