import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiAnswers, type AiAnswer } from "./AiAnswers";

const answer = (over: Partial<AiAnswer> = {}): AiAnswer => ({
  id: "1",
  promptKey: "best",
  prompt: "Who are the best dentists in Montreal, QC?",
  response: "1. Plateau Dental Care\n2. Bright Smile Dental",
  model: "test-model",
  promptSetVersion: "v1",
  mentioned: true,
  position: 2,
  competitors: ["Plateau Dental Care"],
  ...over,
});

describe("AiAnswers", () => {
  it("shows the question, the verdict and the answer verbatim", () => {
    const { container } = render(<AiAnswers answers={[answer()]} />);

    expect(screen.getByText(/Named 2nd/)).toBeDefined();
    expect(screen.getByText(/Who are the best dentists/)).toBeDefined();
    // Verbatim means the line breaks too: the answer is the evidence, not a paraphrase.
    expect(container.querySelector("pre")?.textContent).toBe(answer().response);
  });

  it("says plainly when the business was not named", () => {
    render(<AiAnswers answers={[answer({ mentioned: false, position: null })]} />);
    expect(screen.getByText("Not named")).toBeDefined();
  });

  it("separates being named in the prose from being ranked", () => {
    render(<AiAnswers answers={[answer({ position: null })]} />);
    expect(screen.getByText("Named, not ranked")).toBeDefined();
  });

  it("gets the ordinal right past the teens", () => {
    render(<AiAnswers answers={[answer({ position: 11 }), answer({ id: "2", position: 3 })]} />);
    expect(screen.getByText("Named 11th")).toBeDefined();
    expect(screen.getByText("Named 3rd")).toBeDefined();
  });

  it("stamps the prompt set and model once, since a score only means anything within them", () => {
    render(<AiAnswers answers={[answer(), answer({ id: "2" })]} />);
    expect(screen.getAllByText(/Prompt set v1/)).toHaveLength(1);
  });

  it("renders nothing at all when no answers were stored", () => {
    const { container } = render(<AiAnswers answers={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
