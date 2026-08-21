import type { ProposalStatus } from "@/lib/db/repos/proposals";

const LOOK: Record<ProposalStatus, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-blue-50 text-blue-800",
  accepted: "bg-emerald-50 text-emerald-800",
  declined: "bg-rose-50 text-rose-800",
  expired: "bg-amber-50 text-amber-900",
};

const WORDS: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

/** Where the deal stands, in one word. */
export function StatusChip({ status }: { status: ProposalStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${LOOK[status]}`}>
      {WORDS[status]}
    </span>
  );
}
