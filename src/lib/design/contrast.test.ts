import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  oklchToLinearRgb,
  parseOklchTokens,
  readPalettes,
  relativeLuminance,
} from "./contrast";

const BLACK = { l: 0, c: 0, h: 0 };
const WHITE = { l: 1, c: 0, h: 0 };

describe("the maths", () => {
  it("puts black and white at the top of the scale", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
  });

  it("puts a colour against itself at the bottom of it", () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it("does not care which colour is named first", () => {
    const ink = { l: 0.225, c: 0.015, h: 258 };
    expect(contrastRatio(ink, WHITE)).toBeCloseTo(contrastRatio(WHITE, ink), 10);
  });

  it("reads sRGB primaries back at their known luminance", () => {
    // Pure red in OKLCH, to three decimals. Green is the channel that carries luminance,
    // so red must land well below it; getting the matrix transposed shows up here first.
    const red = relativeLuminance(oklchToLinearRgb({ l: 0.628, c: 0.258, h: 29.23 }));
    const green = relativeLuminance(oklchToLinearRgb({ l: 0.866, c: 0.295, h: 142.5 }));
    expect(red).toBeCloseTo(0.2126, 2);
    expect(green).toBeCloseTo(0.7152, 2);
  });
});

describe("reading the tokens", () => {
  it("takes the value, the chroma and the hue off a declaration", () => {
    expect(parseOklchTokens("--ink: oklch(0.225 0.015 258);")).toEqual({
      ink: { l: 0.225, c: 0.015, h: 258 },
    });
  });

  it("skips a token with alpha, because a ratio needs to know what is behind it", () => {
    expect(parseOklchTokens("--veil: oklch(0.2 0.02 258 / 0.06);")).toEqual({});
  });

  it("lets the dark block override the light one, and inherit what it leaves alone", () => {
    const { light, dark } = readPalettes(`
      :root { --bg: oklch(0.985 0.002 258); --ink: oklch(0.225 0.015 258); }
      @media (prefers-color-scheme: dark) { :root { --bg: oklch(0.186 0.008 258); } }
      @theme inline { --color-bg: var(--bg); }
    `);

    expect(light.bg.l).toBe(0.985);
    expect(dark.bg.l).toBe(0.186);
    // Not redefined in the dark block, so the cascade keeps the light value. If that is
    // wrong it is wrong in the browser too, and the table below will say so.
    expect(dark.ink.l).toBe(0.225);
  });
});

/**
 * The contract, in both themes.
 *
 * Text owes 4.5:1 (WCAG 1.4.3). Anything whose job is to identify a control or a boundary
 * owes 3:1 (WCAG 1.4.11). Placeholders and tick labels are text and get no discount for
 * being quiet, which is the rule that caught `--ink-faint` sitting at 3.96:1.
 */
const PAIRS: ReadonlyArray<readonly [string, string, number, string]> = [
  ["ink", "bg", 4.5, "body text on the page"],
  ["ink", "surface", 4.5, "body text in a panel"],
  ["ink", "surface-2", 4.5, "body text in the header"],
  ["ink-muted", "bg", 4.5, "captions on the page"],
  ["ink-muted", "surface", 4.5, "captions in a panel"],
  ["ink-muted", "surface-2", 4.5, "captions in the header"],
  ["ink-faint", "bg", 4.5, "placeholders and tick labels on the page"],
  ["ink-faint", "surface", 4.5, "placeholders in a panel"],
  ["ink-faint", "surface-2", 4.5, "placeholders in a sunken well"],
  ["action-ink", "action", 4.5, "the primary button's label"],
  ["action-ink", "action-hover", 4.5, "the primary button's label, hovered"],
  ["brass-ink", "surface", 4.5, "brass text"],
  ["brass", "surface", 3, "the focus ring and tick marks in a panel"],
  ["brass", "bg", 3, "the focus ring on the page"],
  ["brass", "surface-2", 3, "the focus ring in the header"],
  ["line-strong", "surface", 3, "a control's border, and its own fill"],
  ["line-strong", "bg", 3, "a control's border against the page"],
  ["line-strong", "surface-2", 3, "a control's border in a toolbar well"],
  ["strong", "strong-soft", 4.5, "the Strong chip"],
  ["fair", "fair-soft", 4.5, "the Needs work chip"],
  ["weak", "weak-soft", 4.5, "the Falling behind chip"],
  ["critical", "critical-soft", 4.5, "the Critical chip"],
  ["strong", "surface", 4.5, "a Strong reading in a panel"],
  ["fair", "surface", 4.5, "a Needs work reading in a panel"],
  ["weak", "surface", 4.5, "a Falling behind reading in a panel"],
  ["critical", "surface", 4.5, "a Critical reading in a panel"],
  ["strong", "bg", 4.5, "a Strong reading on the page"],
  ["fair", "bg", 4.5, "a Needs work reading on the page"],
  ["weak", "bg", 4.5, "a Falling behind reading on the page"],
  ["critical", "bg", 4.5, "a Critical reading on the page"],
  ["ink", "brass-soft", 4.5, "text inside a selection"],
];

/**
 * `--line` is deliberately not in the table above.
 *
 * WCAG 1.4.11 covers what is *required* to identify a component. A panel edge and a table
 * row divider separate things that are already distinguishable by their content, so a
 * hairline there is decoration and holding it to 3:1 would turn a quiet instrument into a
 * grid of boxes. `--line-strong` carries every boundary that actually has to be seen, and
 * it is in the table. That split is the whole reason there are two border tokens.
 */
const EXEMPT = ["line"];

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const PALETTES = readPalettes(CSS);

describe.each(["light", "dark"] as const)("the %s palette", (theme) => {
  const tokens = PALETTES[theme];

  it.each(PAIRS)("%s on %s clears %s to 1, for %s", (fg, bg, minimum, what) => {
    expect(tokens[fg], `--${fg} is gone from globals.css`).toBeDefined();
    expect(tokens[bg], `--${bg} is gone from globals.css`).toBeDefined();

    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    expect(
      Number(ratio.toFixed(2)),
      `--${fg} on --${bg} is ${ratio.toFixed(2)}:1, under the ${minimum}:1 that ${what} owes`,
    ).toBeGreaterThanOrEqual(minimum);
  });

  it("holds every colour token to the table or to a written exemption", () => {
    const covered = new Set([...PAIRS.flatMap(([fg, bg]) => [fg, bg]), ...EXEMPT]);
    // Only tokens that could carry contrast. Sizes, durations and shadows are not colours,
    // and the soft/line halves of a band are only ever grounds, which the table covers.
    const colours = Object.keys(tokens).filter(
      (name) => !name.endsWith("-soft") && !name.endsWith("-line") && !name.startsWith("shadow"),
    );

    expect(colours.filter((name) => !covered.has(name))).toEqual([]);
  });
});
