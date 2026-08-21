import type { ProposalStatus } from "@/lib/db/repos/proposals";

const LOOK: Record<ProposalStatus, string> = {
  draft: "",
  sent: "",
  accepted: "chip-strong",
  declined: "chip-critical",
  expired: "chip-fair",
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
  return <span className={`chip ${LOOK[status]}`}>{WORDS[status]}</span>;
}
