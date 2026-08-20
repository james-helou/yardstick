/**
 * Turning prose into a measurement. The assistant is asked an ordinary question and
 * answers in ordinary language, because that is the thing a buyer would see; the
 * measuring happens here, in pure string handling, so every branch is testable.
 */

/** Words that appear in a legal name and never in the way a person says it out loud. */
const SUFFIXES = new Set(["llc", "l l c", "inc", "incorporated", "ltd", "limited", "co", "corp", "corporation", "plc", "gmbh", "srl", "bv", "pty", "llp"]);

/** Casefolds, strips accents and punctuation, and drops the legal suffix. */
export function normaliseName(value: string): string {
  const base = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    // An apostrophe closes up rather than splitting: "Joe's" is one word said out loud.
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const words = base.split(" ").filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && words[0] === "the") words.shift();
  return words.join(" ");
}

/** Too short to match on: "Co" would hit half the answer by accident. */
const MIN_MATCHABLE = 3;

/**
 * Whether the answer names this business. Both sides are normalised, so "Joe's
 * Plumbing, Inc." in the record matches "Joes Plumbing" in the answer.
 */
export function namesBusiness(text: string, businessName: string): boolean {
  const needle = normaliseName(businessName);
  if (needle.length < MIN_MATCHABLE) return false;
  // Padded on both sides so the match lands on word boundaries: "Acme Dental" is found
  // inside "Acme Dental Group" but not inside "Pacific Acme Dentalworks".
  return ` ${normaliseName(text)} `.includes(` ${needle} `);
}

const LIST_LINE = /^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/;
const HEADING_LINE = /^\s*(?:#{1,6}\s+|\*\*)(.*\S)\s*$/;
/** Where a name stops and the sales copy starts. */
const NAME_STOP = /\s+(?:[-–—]|–|—)\s+|:\s+|\s+\(/;

function cleanName(raw: string): string | null {
  let name = raw.trim();

  // A bolded run is the name whenever there is one: "**Joe's Plumbing** - great rates".
  const bold = name.match(/\*\*(.+?)\*\*/);
  if (bold) name = bold[1];
  else name = name.split(NAME_STOP)[0];

  name = name
    .replace(/[*_`]/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[.,;:!?]+$/g, "")
    .trim();

  if (name.length < 2 || name.length > 120) return null;
  // A sentence is not a name. Real business names are short.
  if (name.split(/\s+/).length > 8) return null;
  return name;
}

/**
 * The names an answer puts in a list, in the order it listed them. Prose around the
 * list is ignored on purpose: the ranking is what a buyer reads, and a name buried in a
 * closing paragraph is not a recommendation.
 */
export function listedNames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(LIST_LINE) ?? line.match(HEADING_LINE);
    if (!match) continue;
    const name = cleanName(match[1]);
    if (!name) continue;
    const key = normaliseName(name);
    if (key.length < MIN_MATCHABLE || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }

  return out;
}

export type Mention = {
  mentioned: boolean;
  /** 1-based place in the answer's list. Null while mentioned means named, not ranked. */
  position: number | null;
  /** Everyone else the answer named, in order, which is the sales conversation. */
  competitors: string[];
};

export function detectMention(text: string, businessName: string): Mention {
  const listed = listedNames(text);
  const needle = normaliseName(businessName);

  const index = listed.findIndex((name) => {
    const candidate = normaliseName(name);
    return candidate === needle || candidate.includes(needle) || needle.includes(candidate);
  });

  const competitors = listed.filter((_, i) => i !== index);

  return {
    mentioned: index >= 0 || namesBusiness(text, businessName),
    position: index >= 0 ? index + 1 : null,
    competitors,
  };
}
