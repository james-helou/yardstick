/**
 * The AI visibility eval harness.
 *
 * Asks the current prompt set about each business in `eval/ai-visibility.json` several
 * times and reports whether the score held still. Read-only by construction: it never
 * opens a database connection and never writes a row. Nothing here is a customer.
 *
 *   npm run ai:eval                 # the whole fixture file, three runs each
 *   npm run ai:eval -- --runs 5     # more runs, tighter evidence, more spend
 *   npm run ai:eval -- --name "Acme Dental" --category dentist --place "Montreal, QC"
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { aiProvider } from "../src/lib/ai";
import { evaluateCase, type EvalCase } from "../src/lib/ai/eval";
import { CURRENT_PROMPT_SET } from "../src/lib/ai/prompts";
import { SCORE_TOLERANCE } from "../src/lib/ai/stability";

const FIXTURES = path.join(process.cwd(), "eval", "ai-visibility.json");

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function cases(): Promise<EvalCase[]> {
  const name = flag("name");
  if (name) {
    return [
      {
        name,
        category: flag("category") ?? "business",
        place: flag("place") ?? "Montreal, QC",
        expect: "either",
      },
    ];
  }

  const file = JSON.parse(await readFile(FIXTURES, "utf8")) as { cases: EvalCase[] };
  return file.cases;
}

async function main() {
  const provider = aiProvider();
  if (!provider) {
    console.error("ANTHROPIC_API_KEY is not set, so there is nothing to ask. Set it and rerun.");
    process.exit(2);
  }

  const runs = Number(flag("runs") ?? 3);
  const tolerance = Number(flag("tolerance") ?? SCORE_TOLERANCE);
  const subjects = await cases();

  console.log(
    `prompt set ${CURRENT_PROMPT_SET.version} · model ${provider.model} · ${runs} runs · tolerance ${tolerance}\n`,
  );

  let failed = 0;
  for (const subject of subjects) {
    const result = await evaluateCase(provider, subject, { runs, tolerance });
    const { stability } = result;

    console.log(`${result.passed ? "pass" : "FAIL"}  ${subject.name} (${subject.category}, ${subject.place})`);
    console.log(
      `      score ${stability.minScore}-${stability.maxScore} mean ${stability.meanScore} spread ${stability.spread}`,
    );
    if (stability.disagreements.length) {
      console.log(`      answered differently between runs: ${stability.disagreements.join(", ")}`);
    }
    if (result.expectationMet === false) {
      console.log(`      expected to be ${subject.expect}, and was not`);
    }
    if (!result.passed) failed++;
  }

  console.log(`\n${subjects.length - failed}/${subjects.length} cases held still.`);
  // A non-zero exit is the point: this is a gate, not a report.
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
