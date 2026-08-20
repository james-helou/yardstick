import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "@/lib/external/call";
import { parseHtml, probeSite } from "./probe";

const PAGE = `<!doctype html><html><head>
  <title> Bright Smile Dental &amp; Implants </title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta content="A dental clinic in Montreal" name="description">
  <link rel="canonical" href="https://brightsmile.ca/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Bright Smile"}</script>
</head><body><h1>Bright Smile</h1></body></html>`;

beforeEach(() => resetBreakers());

describe("parseHtml", () => {
  it("reads the head a real page actually has", () => {
    const parsed = parseHtml(PAGE);
    expect(parsed.title).toBe("Bright Smile Dental & Implants");
    expect(parsed.metaDescription).toBe("A dental clinic in Montreal");
    expect(parsed.h1Count).toBe(1);
    expect(parsed.hasViewport).toBe(true);
    expect(parsed.hasCanonical).toBe(true);
    expect(parsed.noindex).toBe(false);
    expect(parsed.structuredDataTypes).toEqual(["Dentist"]);
  });

  it("finds attributes in either order, because pages are written by hand", () => {
    expect(parseHtml('<meta content="hello" name="description">').metaDescription).toBe("hello");
    expect(parseHtml('<meta name="description" content="hello">').metaDescription).toBe("hello");
  });

  it("notices a page asking not to be indexed", () => {
    expect(parseHtml('<meta name="robots" content="noindex, nofollow">').noindex).toBe(true);
    expect(parseHtml('<meta name="robots" content="index, follow">').noindex).toBe(false);
  });

  it("walks an @graph, which is how most CMS plugins emit schema", () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebSite"},{"@type":["LocalBusiness","Dentist"]}]}</script>`;
    expect(parseHtml(html).structuredDataTypes).toEqual(["WebSite", "LocalBusiness", "Dentist"]);
  });

  it("survives a malformed ld+json block rather than failing the whole probe", () => {
    const html = `<script type="application/ld+json">{ not json </script><h1>Hi</h1>`;
    expect(parseHtml(html).structuredDataTypes).toEqual([]);
    expect(parseHtml(html).h1Count).toBe(1);
  });

  it("treats an empty title as no title", () => {
    expect(parseHtml("<title>   </title>").title).toBeUndefined();
    expect(parseHtml("<body></body>").title).toBeUndefined();
  });
});

describe("probeSite", () => {
  it("reports the final URL, the status and how long it took", async () => {
    let clock = 1000;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      clock += 250;
      return new Response(PAGE, { status: 200, headers: { "content-type": "text/html" } });
    });

    const probe = await probeSite("http://brightsmile.ca", {
      fetchImpl,
      now: () => clock,
    });

    expect(probe.status).toBe(200);
    expect(probe.responseMs).toBe(250);
    expect(probe.title).toBe("Bright Smile Dental & Implants");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "follow" });
  });

  it("identifies itself, because a bot that hides gets blocked", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(PAGE));
    await probeSite("https://brightsmile.ca", { fetchImpl });
    const headers = (fetchImpl.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Yardstick");
  });

  it("returns a 500 as a probe rather than an error, so the pillar still scores", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("boom", { status: 500 }));
    const probe = await probeSite("https://brightsmile.ca", { fetchImpl });
    expect(probe.status).toBe(500);
    expect(probe.https).toBe(true);
  });

  it("propagates a site that will not answer at all", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("getaddrinfo ENOTFOUND brightsmile.ca");
    });
    await expect(
      probeSite("https://brightsmile.ca", { fetchImpl }),
    ).rejects.toThrow(/ENOTFOUND/);
  });
});
