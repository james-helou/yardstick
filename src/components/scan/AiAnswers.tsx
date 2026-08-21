export type AiAnswer = {
  id: string;
  promptKey: string;
  prompt: string;
  response: string;
  model: string;
  promptSetVersion: string;
  mentioned: boolean;
  position: number | null;
  competitors: string[];
};

function verdict(answer: AiAnswer): string {
  if (!answer.mentioned) return "Not named";
  return answer.position === null ? "Named, not ranked" : `Named ${answer.position}${ordinal(answer.position)}`;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/**
 * The questions, and the answers verbatim. An agency telling a prospect "assistants do
 * not know you exist" needs to be able to show the answer that says so, not our summary
 * of it, so every probe is here to be opened and read.
 */
export function AiAnswers({ answers }: { answers: AiAnswer[] }) {
  if (answers.length === 0) return null;

  const stamp = answers[0];

  return (
    <section className="panel panel-pad">
      <h3 className="text-sm font-medium">What the assistant said</h3>
      <p className="mt-0.5 text-xs text-ink-muted">
        Prompt set {stamp.promptSetVersion} · {stamp.model}
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {answers.map((answer) => (
          <li key={answer.id}>
            <details className="rounded border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm">
                <span className={answer.mentioned ? "text-ink" : "font-medium"}>{verdict(answer)}</span>
                <span className="text-ink-muted"> · {answer.prompt}</span>
              </summary>
              <div className="border-t border-line px-3 py-2">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-sm text-ink">
                  {answer.response}
                </pre>
                {answer.competitors.length > 0 ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    Also named: {answer.competitors.join(", ")}
                  </p>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
