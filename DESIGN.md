# Design

Yardstick's visual system. Strategy and audience live in [PRODUCT.md](PRODUCT.md); this
file is how it looks and the rules that keep it consistent. Tokens are defined once in
`src/app/globals.css` and exposed to Tailwind through `@theme inline`, so a colour or a
radius is never hard-coded in a component.

## Theme

**A measuring instrument, not a platform.** Cool graphite neutrals for the body of the
tool, one brass accent for its structure, and the red-amber-green vocabulary reserved
entirely for readings. The feel to aim for is a well-made gauge: steel housing, brass
fittings, a scale you can read at a glance and trust at a distance.

Light is the default because the product gets turned around on a desk in a bright room.
Dark is a real second design that follows `prefers-color-scheme`, not an inversion.

## Color

OKLCH throughout. Strategy is **restrained**: tinted neutrals plus one structural accent
under ten per cent of any screen.

### Neutrals (cool graphite, hue 258)

The tint is toward the blue end, deliberately, so that brass and the score colours are the
only warmth on screen and both read as signal.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `oklch(0.985 0.002 258)` | `oklch(0.186 0.008 258)` | page ground |
| `--surface` | `oklch(1 0 0)` | `oklch(0.225 0.009 258)` | panels, cards, rows |
| `--surface-2` | `oklch(0.966 0.004 258)` | `oklch(0.262 0.010 258)` | header, toolbars, sunken wells |
| `--line` | `oklch(0.906 0.006 258)` | `oklch(0.318 0.012 258)` | hairlines and borders |
| `--line-strong` | `oklch(0.845 0.008 258)` | `oklch(0.40 0.014 258)` | control borders, dividers that matter |
| `--ink` | `oklch(0.225 0.015 258)` | `oklch(0.945 0.004 258)` | body text |
| `--ink-muted` | `oklch(0.465 0.012 258)` | `oklch(0.735 0.008 258)` | captions, secondary text |
| `--ink-faint` | `oklch(0.575 0.010 258)` | `oklch(0.640 0.008 258)` | tick labels, placeholders |

`--ink-muted` on `--bg` is roughly 7:1 and `--ink-faint` roughly 4.6:1, so even the
quietest text clears AA for body copy. There is no lighter grey than `--ink-faint`; if
something needs to recede further, make it smaller or move it, do not fade it.

### Accent (brass, hue 70)

| Token | Light | Dark |
|---|---|---|
| `--brass` | `oklch(0.605 0.098 70)` | `oklch(0.735 0.098 74)` |
| `--brass-ink` | `oklch(0.475 0.085 68)` | `oklch(0.800 0.090 76)` |
| `--brass-soft` | `oklch(0.955 0.028 74)` | `oklch(0.300 0.032 70)` |

**Brass never encodes state.** It appears in six places, all of them structure: the
wordmark rule, the tick marks on a scale, the underline on the current nav item, the focus
ring, the leading rule on a section heading, and the weight bars on the landing page,
which show how much each pillar counts toward a score. That last one is still calibration
rather than a reading, which is the line brass does not cross. It is structure, so it is never confused with a reading
even though it sits near amber on the wheel.

### Action

The primary action is always the highest-contrast thing available, which inverts between
themes: near-black on white in light, near-white on graphite in dark.

| Token | Light | Dark |
|---|---|---|
| `--action` | `oklch(0.255 0.020 258)` | `oklch(0.935 0.005 258)` |
| `--action-hover` | `oklch(0.340 0.020 258)` | `oklch(0.860 0.006 258)` |
| `--action-ink` | `oklch(0.99 0 0)` | `oklch(0.200 0.010 258)` |

### Semantic, for readings only

Four score bands, matching `band()` in `src/lib/scans/score.ts`, plus a neutral for
"not measured". Each has an ink, a soft background and a border. Colour is never the only
carrier: the band's word and its number are always present.

| Band | Hue | Range | The word shown |
|---|---|---|---|
| `strong` | 152 (green) | 80 and above | Strong |
| `fair` | 85 (amber) | 60 to 79 | Needs work |
| `weak` | 45 (orange) | 40 to 59 | Falling behind |
| `critical` | 25 (red) | below 40 | Critical |
| `neutral` | 258 (graphite) | not measured | Not scored |

The words are the reading, not the band's internal name. "Fair" and "Weak" describe a
category; "Needs work" and "Falling behind" tell the person across the desk what to do
about it, which is the only reason the screen is turned toward them. They are too long to
sit inside a table chip, so a chip in a list carries the number and the word arrives on
hover through `title`; every full-size reading shows both.

## Typography

One family, two roles. **Geist Sans** carries everything; **Geist Mono** carries numerals,
scale labels and anything that has to line up in a column. No display face: this is a tool.

Fixed rem scale at a 1.15 to 1.2 ratio, never fluid. Product UI is read at a consistent
distance, and a heading that shrinks inside a panel looks broken rather than responsive.

The steps keep Tailwind's own names, redefined in `@theme inline`, so `text-sm` anywhere
in the codebase already means this scale and nothing has to be swept twice. `--text-md` is
the one addition, and it is the step Tailwind leaves out between `base` and `lg`.

| Step | Size | Use |
|---|---|---|
| `--text-2xs` | 0.6875rem | scale labels, tick numerals |
| `--text-xs` | 0.75rem | metadata, chips |
| `--text-sm` | 0.8125rem | dense table text |
| `--text-base` | 0.875rem | body, controls, most of the app |
| `--text-md` | 1rem | prose and public-facing pages |
| `--text-lg` | 1.125rem | panel headings |
| `--text-xl` | 1.375rem | page titles |
| `--text-2xl` | 1.75rem | public report title |
| `--text-3xl` | 2.25rem | the reading itself |

Every step carries its own line height, tightening as the size grows: 1.55 at body,
1.15 at the reading. Weights are 400 body, 500 labels and buttons, 600 headings. Tracking
is `-0.011em` on `h1` to `h3` and `0` everywhere else, so it tracks the role rather than
the size. `text-wrap: balance` on headings, `pretty` on prose.

**No uppercase tracked eyebrows.** Section headings are sentence case at `--text-base`,
weight 600, preceded by a short brass rule. The all-caps kicker is the single most
common generated-UI tell and it was in this codebase on nine screens.

Numerals: `font-variant-numeric: tabular-nums` on every score, money figure, count and
date, so columns line up and a changing number does not shift the layout.

## Layout

- Content width: `max-w-6xl` for lists and dashboards, `max-w-3xl` for single-record and
  public pages, `max-w-sm` to `max-w-lg` for forms. Widths stay Tailwind's, because a
  second private scale for the same thing is how two containers end up 2rem apart for no
  reason.
- Page gutter: 1rem below 640px, 1.5rem above, via `px-4 sm:px-6`.
- Section rhythm: 1.5rem apart on phones, 2rem on desktop. Related items sit at 0.75rem,
  which is the gap that does the actual grouping work.
- Radii: `--r-sm` 6px on controls, `--r-md` 10px on panels, fully round on chips only.
  Both are mapped onto Tailwind's `--radius*` tokens, so `rounded` and `rounded-md` mean
  these and nothing else. Instruments are precise, so nothing is pillowy.
- Elevation: borders do the work. One `--shadow-1`, on the sticky header and nowhere
  else.

### Responsive structure

Breakpoints are structural, never typographic.

- **Navigation.** Eight destinations. One `<nav>` in the DOM at every size: a horizontal
  strip that scrolls on small screens with the scrollbar hidden and a fade at the edges,
  a plain row above 768px. The current item carries `aria-current="page"` and a brass
  underline. No hamburger, no duplicated markup, so nothing is hidden from assistive tech
  or from a test.
- **Tables.** Every table lives in a `.table-scroll` container, so a wide table scrolls
  inside its own panel and the page body never moves sideways. `.list-table` holds a
  `min-width` and stops its cells wrapping, except the first column, which is the name and
  is allowed to run onto a second line. A table the client sees rather than works in opts
  out with `.list-table-fit` and drops its quieter columns below 640px instead, re-hanging
  them as a sub-line under the name so nothing is lost. Restacking every list into labelled
  pairs was the other option and it was rejected: it doubles the markup, it hides columns
  from tests and assistive tech, and an agency scanning a queue reads down a column.
- **Panels.** Two-up grids collapse to one column at 768px. Forms are single column
  throughout except for genuinely paired fields.
- **Targets.** Anything tappable is at least 44px tall in the phone contexts, which is the
  nav, the score screens, the checklist, the proposal and the portal.

## Components

Vocabulary is defined once as component classes in `globals.css` so two buttons cannot
drift apart. Every interactive component ships default, hover, focus-visible, active and
disabled; forms add error, and anything that loads adds a skeleton.

| Class | What it is |
|---|---|
| `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-danger` / `.btn-sm` | the only buttons |
| `.control` | input, select and textarea share one border, radius and focus ring |
| `.panel`, `.panel-pad` | bordered surface, and the same with its standard padding |
| `.chip` + `.chip-strong` / `-fair` / `-weak` / `-critical` | status and score bands |
| `.section-title` | heading with its brass rule |
| `.data` | tabular mono numerals |
| `.list-table`, `.list-table-fit`, `.table-scroll` | the list table and its scroller |
| `.nav-strip`, `.nav-link` | the one navigation, and its current-page underline |
| `.back-link`, `.link` | the two link shapes |
| `.skeleton` | loading placeholder |

Under `pointer: coarse` every `.btn` grows to a 44px minimum height, so touch targets are
a property of the input device rather than a breakpoint. A mouse keeps the compact
control.

**The gauge.** A score renders as a large number in its band's colour, the words "out of
100" and the band beside it, and beneath that a track filled to the reading with a brass
tick row labelled 0, 50 and 100 sitting under it. The ticks are below the track rather than
over it, because a fill in the band colour paints straight over anything drawn on top of
it and a reading of 78 hid the middle tick completely. This is the one piece of real
identity in the product. At list size it collapses to a chip: the number, the band's
colour, no scale, because a scale that small is decoration.

## Motion

150 to 200ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Motion conveys state and nothing else:
a gauge marker easing to its position, a row settling after a status change, a chip
crossfading. There is no page-load choreography, because the user arrived to do something.

`prefers-reduced-motion: reduce` turns every transition instant. Nothing that moves is
load-bearing, so the reduced path loses no information.
