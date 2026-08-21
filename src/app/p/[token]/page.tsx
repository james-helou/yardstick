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
        <p className="mt-1 text-sm text-neutral-600">
          {proposal.businessName ? `Prepared for ${proposal.businessName}. ` : ""}
          {agency ? `From ${agency.name}.` : ""}
        </p>
      </header>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                What you get
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Qty
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Price
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {live.lines.map((line) => (
              <tr key={line.key} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <span className="font-medium">{line.name}</span>
                  <span className="block text-xs text-neutral-600">
                    {line.billing === "monthly" ? "Every month" : "One time"}
                    {line.discountPercent ? ` · ${line.discountPercent}% off` : ""}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.unitPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <QuoteTotals totals={totals} />

      {proposal.notes ? (
        <div className="rounded-md border p-4 text-sm">
          <h2 className="font-semibold">Notes</h2>
          <p className="mt-1 whitespace-pre-line text-neutral-700">{proposal.notes}</p>
        </div>
      ) : null}

      {signature ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <h2 className="font-semibold">Signed</h2>
          <p className="mt-1">
            {signature.signerName} accepted these terms on {signature.signedAt.toISOString().slice(0, 10)}.
          </p>
          <p className="mt-2 text-xs text-emerald-800">
            Reference {shortFingerprint(signature.termsFingerprint)}. It covers every line, price and month
            on this page, so this copy can always be checked against what was signed.
          </p>
        </div>
      ) : answered ? (
        <p className="rounded-md border px-3 py-2 text-sm text-neutral-600">
          This proposal has already been answered.
        </p>
      ) : (
        <SignForm action={answerProposalAction} token={token} />
      )}

      {proposal.termsFingerprint ? (
        <p className="text-xs text-neutral-500">
          Terms reference {shortFingerprint(proposal.termsFingerprint)}, fixed when this was sent.
        </p>
      ) : null}
    </main>
  );
}
