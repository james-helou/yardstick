import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { QuoteTotals } from "@/components/proposal";
import { findOrgById } from "@/lib/db/repos/orgs";
import { findSignature, recordProposalEvent } from "@/lib/db/repos/proposal-sharing";
import { quoteOf } from "@/lib/db/repos/proposals";
import { clientIp, hashIp } from "@/lib/http/client-ip";
import { formatMoney } from "@/lib/money";
import { shortFingerprint } from "@/lib/proposals/fingerprint";
import { openProposal } from "@/lib/proposals/sign";
import { answerProposalAction } from "./actions";
import { SignForm } from "./SignForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposal" };

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const opened = await openProposal(token);
  // Revoked, expired, still a draft and never-existed are all the same 404. Telling them
  // apart would confirm that a token was once real.
  if (!opened.ok) notFound();

  const { link, proposal, lines } = opened;
  const scope = { orgId: link.orgId };
  const [agency, signature] = await Promise.all([findOrgById(link.orgId), findSignature(scope, proposal.id)]);

  const requestHeaders = await headers();
  // Best effort: a view that cannot be written down must never stop the page rendering.
  await recordProposalEvent(scope, {
    proposalId: proposal.id,
    type: "viewed",
    ipHash: hashIp(clientIp(requestHeaders)),
    userAgent: requestHeaders.get("user-agent"),
  });

  const live = quoteOf(proposal, lines);
  // What was sent is what is shown. The live quote is only used for the line breakdown,
  // and the totals come from the snapshot written when it was sent.
  const totals = proposal.totals
    ? {
        oneTimeTotal: proposal.totals.oneTime,
        monthlyTotal: proposal.totals.monthly,
        contractValue: proposal.totals.contractValue,
        termMonths: proposal.termMonths,
        freeMonths: proposal.freeMonths,
      }
    : {
        oneTimeTotal: live.oneTimeTotal,
        monthlyTotal: live.monthlyTotal,
        contractValue: live.contractValue,
        termMonths: live.termMonths,
        freeMonths: live.freeMonths,
      };

  const answered = proposal.status !== "sent";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold">{proposal.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {proposal.businessName ? `Prepared for ${proposal.businessName}. ` : ""}
          {agency ? `From ${agency.name}.` : ""}
        </p>
      </header>

      <div className="table-scroll panel">
        <table className="list-table list-table-fit">
          <thead>
            <tr>
              <th scope="col">
                What you get
              </th>
              <th scope="col" className="hidden text-right sm:table-cell">
                Qty
              </th>
              <th scope="col" className="hidden text-right sm:table-cell">
                Price
              </th>
              <th scope="col" className="text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {live.lines.map((line) => (
              <tr key={line.key}>
                <td className="px-3 py-2">
                  <span className="font-medium">{line.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {line.billing === "monthly" ? "Every month" : "One time"}
                    {line.discountPercent ? ` · ${line.discountPercent}% off` : ""}
                  </span>
                  {/* The two columns the phone drops, said in words under the name. */}
                  <span className="block text-xs text-ink-muted sm:hidden">
                    <span className="data">{line.quantity}</span> ×{" "}
                    <span className="data">{formatMoney(line.unitPrice)}</span>
                  </span>
                </td>
                <td className="hidden text-right sm:table-cell">
                  <span className="data">{line.quantity}</span>
                </td>
                <td className="hidden text-right sm:table-cell">
                  <span className="data">{formatMoney(line.unitPrice)}</span>
                </td>
                <td className="text-right">
                  <span className="data">{formatMoney(line.net)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <QuoteTotals totals={totals} />

      {proposal.notes ? (
        <div className="panel panel-pad">
          <h2 className="section-title">Notes</h2>
          <p className="mt-1 whitespace-pre-line text-ink">{proposal.notes}</p>
        </div>
      ) : null}

      {signature ? (
        <div className="rounded-md border border-band-strong-line bg-band-strong-soft p-4 text-band-strong">
          <h2 className="section-title">Signed</h2>
          <p className="mt-1">
            {signature.signerName} accepted these terms on {signature.signedAt.toISOString().slice(0, 10)}.
          </p>
          <p className="mt-2 text-xs text-band-strong">
            Reference {shortFingerprint(signature.termsFingerprint)}. It covers every line, price and month
            on this page, so this copy can always be checked against what was signed.
          </p>
        </div>
      ) : answered ? (
        <p className="panel px-3 py-2 text-ink-muted">
          This proposal has already been answered.
        </p>
      ) : (
        <SignForm action={answerProposalAction} token={token} />
      )}

      {proposal.termsFingerprint ? (
        <p className="text-xs text-ink-faint">
          Terms reference {shortFingerprint(proposal.termsFingerprint)}, fixed when this was sent.
        </p>
      ) : null}
    </main>
  );
}
