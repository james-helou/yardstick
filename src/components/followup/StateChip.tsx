import type { FollowUpState } from "@/lib/followups/rank";

/**
 * One word for what the proposal is doing, so a row reads before it is read.
 *
 * The fill encodes urgency rather than the state itself: something going quiet is
 * where the colour vocabulary earns its place, and a proposal that is being read
 * right now needs no chasing at all.
 */
const LOOK: Record<FollowUpState, { label: string; className: string }> = {
  reading: { label: "Reading", className: "chip-strong" },
  opened: { label: "Opened", className: "" },
  unopened: { label: "Unopened", className: "chip-fair" },
  cold: { label: "Gone quiet", className: "chip-weak" },
  waiting: { label: "Waiting", className: "" },
  fresh: { label: "Just sent", className: "" },
};

export function StateChip({ state }: { state: FollowUpState }) {
  const look = LOOK[state];
  return <span className={`chip ${look.className}`}>{look.label}</span>;
}
