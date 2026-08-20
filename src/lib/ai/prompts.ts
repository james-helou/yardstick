export type PromptVars = {
  name: string;
  category: string;
  /** The town or city a searcher would say out loud. */
  place: string;
};

/**
 * Discovery asks the question a buyer asks, with no business named: being absent from
 * the answer is the finding. Brand names the business outright and asks what the
 * assistant knows, which measures something different and is scored more lightly.
 */
export type PromptIntent = "discovery" | "brand";

export type PromptTemplate = {
  key: string;
  intent: PromptIntent;
  /** Relative weight in the pillar score. */
  weight: number;
  render: (vars: PromptVars) => string;
};

export type PromptSet = {
  version: string;
  notes: string;
  prompts: readonly PromptTemplate[];
};

/**
 * A visibility score is only comparable to another score from the same questions, so
 * the set is versioned and every stored probe carries its version. Reword a prompt and
 * you publish a new version rather than silently breaking every trend line drawn
 * through the old answers.
 */
export const PROMPT_SET_V1: PromptSet = {
  version: "v1",
  notes:
    "Four discovery questions in the words a buyer actually uses, plus one brand recall check. " +
    "Each asks for names, because a list of names is the thing we can measure.",
  prompts: [
    {
      key: "best",
      intent: "discovery",
      weight: 3,
      render: ({ category, place }) =>
        `Who are the best ${category} in ${place}? List the top five by name, best first.`,
    },
    {
      key: "recommend",
      intent: "discovery",
      weight: 3,
      render: ({ category, place }) =>
        `I need a ${category} in ${place} this week. Which local businesses would you recommend? Name them in order.`,
    },
    {
      key: "near_me",
      intent: "discovery",
      weight: 3,
      render: ({ category, place }) =>
        `List the ${category} businesses that serve ${place}. Names only, most prominent first.`,
    },
    {
      key: "trusted",
      intent: "discovery",
      weight: 3,
      render: ({ category, place }) =>
        `Which ${category} in ${place} have the strongest reputation with local customers? List them by name.`,
    },
    {
      key: "brand",
      intent: "brand",
      weight: 1,
      render: ({ name, category, place }) =>
        `What can you tell me about ${name}, a ${category} in ${place}? If you have not heard of them, say so plainly.`,
    },
  ],
};

export const PROMPT_SETS: readonly PromptSet[] = [PROMPT_SET_V1];

/** What a scan run today uses. Older versions stay readable for the rows that used them. */
export const CURRENT_PROMPT_SET = PROMPT_SET_V1;

export function promptSet(version: string): PromptSet | null {
  return PROMPT_SETS.find((set) => set.version === version) ?? null;
}

/**
 * The place a searcher would name. A locality if we have one, otherwise the region:
 * "plumber in Westmount" is a question people ask, "plumber in 3400 Rue" is not.
 */
export function placeLabel(input: { locality: string | null; region: string | null }): string | null {
  const locality = input.locality?.trim();
  const region = input.region?.trim();
  if (locality && region) return `${locality}, ${region}`;
  return locality || region || null;
}
