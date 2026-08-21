/**
 * WCAG contrast, computed over the OKLCH tokens the product is actually built from.
 *
 * Yardstick tells other people their site fails its checks. It cannot ship an interface
 * that fails the same kind of check, and "we eyeballed it" is not a gate. Everything here
 * is pure so the design system can be asserted in the test suite rather than reviewed by
 * hand every time somebody nudges a lightness.
 */

/** A colour as authored in `globals.css`: lightness, chroma, hue. */
export type Oklch = { l: number; c: number; h: number };

/** Linear-light sRGB, each channel clamped to the gamut. */
export type LinearRgb = readonly [number, number, number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * OKLCH to linear sRGB, via OKLab.
 *
 * Out-of-gamut results are clamped per channel, which is what a browser does when it
 * paints one, so the ratio we compute is the ratio a reader sees.
 */
export function oklchToLinearRgb({ l, c, h }: Oklch): LinearRgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    clamp01(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
    clamp01(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    clamp01(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
  ] as const;
}

/** WCAG relative luminance. The input is already linear, so there is no gamma step. */
export function relativeLuminance(rgb: LinearRgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** The WCAG 2.x contrast ratio between two colours, from 1:1 to 21:1. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const [lighter, darker] = [
    relativeLuminance(oklchToLinearRgb(a)),
    relativeLuminance(oklchToLinearRgb(b)),
  ].sort((x, y) => y - x);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Every `--token: oklch(...)` declaration in a block of CSS.
 *
 * Deliberately dumb: it reads the same text a browser reads, so a token that was renamed
 * or deleted goes missing here too instead of quietly passing against a stale copy.
 * Alpha (`oklch(... / 0.4)`) is skipped, because a ratio needs to know what is behind it
 * and these tokens never sit on a single known ground.
 */
export function parseOklchTokens(css: string): Record<string, Oklch> {
  const tokens: Record<string, Oklch> = {};

  for (const match of css.matchAll(/--([a-z0-9-]+):\s*oklch\(([^)/]*)\)\s*;/gi)) {
    const parts = match[2].trim().split(/\s+/).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) continue;
    tokens[match[1]] = { l: parts[0], c: parts[1], h: parts[2] };
  }

  return tokens;
}

/**
 * The light and dark palettes, read out of `globals.css` the way the cascade builds them.
 *
 * Dark is a set of overrides rather than a whole palette, so it starts as a copy of light
 * and takes what the media query redefines. That mirrors the CSS exactly: a token the dark
 * block forgets keeps its light value, and this will report it against the dark grounds,
 * which is precisely the bug worth catching.
 */
export function readPalettes(css: string): { light: Record<string, Oklch>; dark: Record<string, Oklch> } {
  const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
  const themeStart = css.indexOf("@theme inline");
  if (darkStart === -1 || themeStart === -1) {
    throw new Error("globals.css no longer has the dark block and @theme inline this reads");
  }

  const light = parseOklchTokens(css.slice(0, darkStart));
  return { light, dark: { ...light, ...parseOklchTokens(css.slice(darkStart, themeStart)) } };
}
