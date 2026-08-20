import { callExternal } from "@/lib/external/call";

/** What one fetch of a home page tells us. Deliberately small and provider-free. */
export type SiteProbe = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  https: boolean;
  responseMs: number;
  htmlBytes: number;
  title?: string;
  metaDescription?: string;
  h1Count: number;
  hasViewport: boolean;
  hasCanonical: boolean;
  noindex: boolean;
  /** `@type` values pulled out of any ld+json blocks. */
  structuredDataTypes: string[];
};

export type ParsedHtml = Pick<
  SiteProbe,
  "title" | "metaDescription" | "h1Count" | "hasViewport" | "hasCanonical" | "noindex" | "structuredDataTypes"
>;

const decodeEntities = (value: string): string =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

const clean = (value: string): string => decodeEntities(value).replace(/\s+/g, " ").trim();

function metaContent(html: string, nameOrProperty: string): string | undefined {
  // Attributes appear in either order, so match the tag first and read inside it.
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (name?.toLowerCase() !== nameOrProperty.toLowerCase()) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (content !== undefined) return clean(content);
  }
  return undefined;
}

function structuredDataTypes(html: string): string[] {
  const blocks = html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const types = new Set<string>();

  for (const block of blocks) {
    const body = block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      // A malformed block is a finding for a later phase, not a reason to fail the probe.
      continue;
    }
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== "object" || node === null) return;
      const record = node as Record<string, unknown>;
      const type = record["@type"];
      if (typeof type === "string") types.add(type);
      if (Array.isArray(type)) type.forEach((t) => typeof t === "string" && types.add(t));
      if (Array.isArray(record["@graph"])) walk(record["@graph"]);
    };
    walk(parsed);
  }

  return [...types];
}

/** Pure, so every site-health assertion is a string in a test rather than a live site. */
export function parseHtml(html: string): ParsedHtml {
  const head = html.slice(0, 200_000);
  const robots = metaContent(head, "robots") ?? "";

  return {
    title: (() => {
      const raw = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      const value = raw ? clean(raw) : "";
      return value.length > 0 ? value : undefined;
    })(),
    metaDescription: metaContent(head, "description"),
    h1Count: (html.match(/<h1\b[^>]*>/gi) ?? []).length,
    hasViewport: metaContent(head, "viewport") !== undefined,
    hasCanonical: /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(head),
    noindex: /\bnoindex\b/i.test(robots),
    structuredDataTypes: structuredDataTypes(html),
  };
}

const MAX_BYTES = 2_000_000;
const USER_AGENT = "YardstickBot/1.0 (+https://yardstick.app/bot)";

export type ProbeOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/**
 * One GET of the home page, through the same door as every other outbound call. A site
 * that answers 500 is a probe that succeeded and a finding that failed, so the pillar
 * still scores rather than erroring out.
 */
export async function probeSite(url: string, options: ProbeOptions = {}): Promise<SiteProbe> {
  const { fetchImpl = fetch, now = Date.now, signal, timeoutMs = 10_000 } = options;

  return callExternal(
    async (innerSignal) => {
      const startedAt = now();
      const response = await fetchImpl(url, {
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        signal: innerSignal,
      });
      const body = await response.text();
      const html = body.length > MAX_BYTES ? body.slice(0, MAX_BYTES) : body;
      const finalUrl = response.url || url;

      return {
        requestedUrl: url,
        finalUrl,
        status: response.status,
        https: finalUrl.startsWith("https://"),
        responseMs: Math.max(0, now() - startedAt),
        htmlBytes: body.length,
        ...parseHtml(html),
      };
    },
    { name: "site-probe", timeoutMs, retries: 1, signal },
  );
}
