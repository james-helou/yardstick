# Product

## Register

product

## Users

Small SEO agencies, usually one to five people, most often the owner who also sells. Two
contexts, and the second one is the reason this document exists:

1. **At a desk, working.** Running scans, watching the follow-up queue, writing a quote,
   ticking off delivery work. Dense, repetitive, keyboard-adjacent. Familiarity wins.
2. **On a phone, in front of somebody.** Sitting across from a dentist or a plumber with
   the screen turned around, showing them a score and what moved. Bright room, one hand,
   no time to hunt. This is where the product either earns the deal or does not.

There is also a third, quieter user: the agency's own client, who only ever sees a public
report, a signing page, or the portal. They are not in a workflow. They are deciding
whether to believe a number.

## Product Purpose

Yardstick measures a local business's search presence across five pillars, turns the
measurement into something a prospect will pay for, and then proves the work moved it.
Scan, report, quote, sign, deliver, track.

Success is that an agency can walk into a room with nothing but a phone and leave with a
signed proposal, and that three months later the same screen shows the client why they are
still paying.

## Brand Personality

**Measured, plain-spoken, exacting.** A yardstick has no opinion; it just tells you where
you stand. The product should feel like an instrument rather than a platform: it produces
readings, states them in English, and says what it could not measure instead of guessing.

Voice: short declarative sentences, no jargon, no hype, no exclamation marks. The interface
already talks like this ("Call now. They have it open.", "Not measured yet.", "Nothing is
waiting on an answer."). Keep that.

## Anti-references

- **The SaaS dashboard reflex.** Indigo-to-violet gradients, a hero row of four identical
  metric cards, a purple avatar, rounded-2xl everything. It is what every AI generates for
  "agency tool" and it makes a measuring instrument look like a startup pitch.
- **The SEO-tool reflex one tier down.** Terminal-green-on-black, monospace everywhere,
  fake-technical density. Avoiding the first cliché by running into the second one.
- **Cream and serif "editorial warmth."** Wrong register. This is a tool, not a magazine.
- **Chart junk.** Donut charts for two numbers, sparklines with no scale, a gauge whose
  needle means nothing. Every mark on screen has to be readable as a quantity.
- **Colour as decoration.** In this product red, amber and green mean something specific
  and permanent. Spending them on a button or a heading is spending the vocabulary the
  scores need.

## Design Principles

1. **The reading is the interface.** Scores, movement and money are the content. Everything
   else is chrome and should recede. Numbers get tabular figures, a scale to sit against,
   and enough size to read from across a desk.
2. **Practise what it preaches.** A product that audits other people's websites cannot ship
   an interface that fails its own checks. Contrast, touch targets, focus states and
   responsive behaviour are table stakes, not polish.
3. **Say what you could not measure.** Every pillar, every dormant integration and every
   empty state states its own reason. Never a blank panel, never a silent zero.
4. **One colour vocabulary, spent on state only.** Red, amber and green belong to the
   score bands and to status. Identity is carried by type, spacing and one structural
   accent, never by tinting a card.
5. **The phone is the demo.** Any screen an agency might turn toward a prospect has to be
   complete at 390px wide with one thumb. That includes the report, the proposal, the
   portal and the business page.

## Accessibility & Inclusion

- WCAG 2.2 AA. Body text at or above 4.5:1, large text and UI boundaries at or above 3:1,
  and that includes placeholder text and muted captions.
- Score bands are never colour alone. Every band carries its word ("Strong", "Needs work",
  "Falling behind", "Critical") and its number, so a red-green colour-blind reader loses
  nothing.
- Visible focus on everything focusable, using a ring that survives both themes.
- Touch targets at least 44px in the phone contexts above.
- `prefers-reduced-motion` respected everywhere: transitions become instant, nothing that
  moves is load-bearing.
- The whole app works without JavaScript where it reasonably can. Server actions post
  natively, and several panels are deliberately plain forms for that reason.
