import type { SiteProbe } from "@/lib/site/probe";
import { checklistScore, type Finding, type PillarOutcome } from "./score";

const TITLE_MIN = 10;
const TITLE_MAX = 65;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 165;
const SLOW_MS = 1_500;

const LOCAL_TYPES = /localbusiness|organization|dentist|restaurant|store|professionalservice|medical/i;

/**
 * What a local business's site has to get right before any of the clever work matters:
 * reachable, indexable, on https, and saying who it is. Every check maps to a sentence a
 * rep can read aloud.
 */
export function scoreSiteHealth(probe: SiteProbe): PillarOutcome {
  const reachable = probe.status < 400;
  const title = probe.title ?? "";
  const description = probe.metaDescription ?? "";

  const findings: Finding[] = [
    {
      code: "reachable",
      label: "Home page loads",
      ok: reachable,
      weight: 4,
      detail: reachable ? undefined : `The site answered ${probe.status}`,
    },
    {
      code: "indexable",
      label: "Open to search engines",
      ok: !probe.noindex,
      weight: 3,
      detail: probe.noindex ? "The page asks search engines not to index it" : undefined,
    },
    {
      code: "https",
      label: "Served over https",
      ok: probe.https,
      weight: 3,
      detail: probe.https ? undefined : "Browsers mark this site as not secure",
    },
    {
      code: "title",
      label: "Useful page title",
      ok: title.length >= TITLE_MIN && title.length <= TITLE_MAX,
      weight: 2,
      detail:
        title.length === 0
          ? "No title tag at all"
          : title.length > TITLE_MAX
            ? `Title is ${title.length} characters, so Google truncates it`
            : title.length < TITLE_MIN
              ? "Title is too short to say anything"
              : undefined,
    },
    {
      code: "description",
      label: "Meta description written",
      ok: description.length >= DESCRIPTION_MIN && description.length <= DESCRIPTION_MAX,
      weight: 2,
      detail:
        description.length === 0
          ? "No meta description, so Google writes the snippet itself"
          : description.length > DESCRIPTION_MAX
            ? `Description is ${description.length} characters and will be cut off`
            : description.length < DESCRIPTION_MIN
              ? "Description is too short to earn the click"
              : undefined,
    },
    {
      code: "h1",
      label: "Exactly one main heading",
      ok: probe.h1Count === 1,
      weight: 2,
      detail: probe.h1Count === 0 ? "No h1 on the page" : probe.h1Count > 1 ? `${probe.h1Count} h1 headings` : undefined,
    },
    {
      code: "viewport",
      label: "Mobile viewport set",
      ok: probe.hasViewport,
      weight: 2,
      detail: probe.hasViewport ? undefined : "The page is not set up for phones, where local search happens",
    },
    {
      code: "canonical",
      label: "Canonical URL declared",
      ok: probe.hasCanonical,
      weight: 1,
    },
    {
      code: "schema",
      label: "Local business structured data",
      ok: probe.structuredDataTypes.some((type) => LOCAL_TYPES.test(type)),
      weight: 2,
      detail: probe.structuredDataTypes.some((type) => LOCAL_TYPES.test(type))
        ? undefined
        : "No structured data telling Google what this business is",
    },
    {
      code: "speed",
      label: "Responds quickly",
      ok: probe.responseMs <= SLOW_MS,
      weight: 2,
      detail: probe.responseMs > SLOW_MS ? `Took ${(probe.responseMs / 1000).toFixed(1)}s to answer` : undefined,
    },
  ];

  return { pillar: "site_health", status: "ok", score: checklistScore(findings), findings };
}
