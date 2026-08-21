import type { FollowUpState } from "@/lib/followups/rank";

/** One word for what the proposal is doing, so a row reads before it is read. */
const LOOK: Record<FollowUpState, { label: string; className: string }> = {
  reading: { label: "Reading", className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  opened: { label: "Opened", className: "border-sky-300 bg-sky-50 text-sky-900" },
  unopened: { label: "Unopened", className: "border-amber-300 bg-amber-50 text-amber-900" },
  cold: { label: "Gone quiet", className: "border-neutral-300 bg-neutral-50 text-neutral-700" },
  waiting: { label: "Waiting", className: "border-neutral-300 bg-neutral-50 text-neutral-700" },
  fresh: { label: "Just sent", className: "border-neutral-200 bg-white text-neutral-600" },
};

export function StateChip({ state }: { state: FollowUpState }) {
  const look = LOOK[state];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${look.className}`}>
      {look.label}
    </span>
  );
}
