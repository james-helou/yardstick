import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { QuoteTotals, StatusChip } from "@/components/proposal";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listBusinessOptions } from "@/lib/db/repos/businesses";
import { listServiceItems } from "@/lib/db/repos/catalog";
import {
  countProposalViews,
  findSignature,
  getProposalLink,
} from "@/lib/db/repos/proposal-sharing";
import { getProposal, isEditable, listProposalLines, quoteOf } from "@/lib/db/repos/proposals";
import { absoluteUrl } from "@/lib/http/origin";
import { formatMoney } from "@/lib/money";
import { shortFingerprint } from "@/lib/proposals/fingerprint";
import {
  addCatalogLineAction,
  addLineAction,
  removeLineAction,
  revokeProposalLinkAction,
  sendProposalAction,
  shareProposalAction,
  updateProposalAction,
} from "../actions";
import { ProposalForm } from "../ProposalForm";
import { LineForm } from "./LineForm";
import { SendProposal } from "./SendProposal";
import { ShareProposal } from "./ShareProposal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposal" };

async function ProposalDetail({ id }: { id: string }) {
  const requestHeaders = await headers();
  const { scope } = await resolveWorkspace(requestHeaders);
  const proposal = await getProposal(scope, id);
  // Another workspace's proposal is a 404, not a permission error: there is nothing here
  // to have permission for.
  if (!proposal) notFound();

  const [lines, catalog, businesses, link, views, signature] = await Promise.all([
    listProposalLines(scope, proposal.id),
    listServiceItems(scope),
    listBusinessOptions(scope),
    getProposalLink(scope, proposal.id),
    countProposalViews(scope, proposal.id),
    findSignature(scope, proposal.id),
  ]);

  const editable = isEditable(proposal);
  const live = quoteOf(proposal, lines);

  // A draft is priced from its lines every time it is read. A sent proposal renders the
  // totals it was sent with, whatever the catalogue says today.
  const totals = editable
    ? {
        oneTimeSubtotal: live.oneTimeSubtotal,
        monthlySubtotal: live.monthlySubtotal,
        oneTimeDiscount: live.oneTimeDiscount,
        monthlyDiscount: live.monthlyDiscount,
        oneTimeTax: live.oneTimeTax,
        monthlyTax: live.monthlyTax,
        oneTimeTotal: live.oneTimeTotal,
        monthlyTotal: live.monthlyTotal,
        contractValue: live.contractValue,
        firstInvoice: live.firstInvoice,
        termMonths: live.termMonths,
        freeMonths: live.freeMonths,
      }
    : {
        oneTimeTotal: proposal.totals!.oneTime,
        monthlyTotal: proposal.totals!.monthly,
        contractValue: proposal.totals!.contractValue,
        termMonths: proposal.termMonths,
        freeMonths: proposal.freeMonths,
      };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/proposals" className="back-link">
          Back to proposals
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{proposal.title}</h1>
          <StatusChip status={proposal.status} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {proposal.businessName ? (
            <>
              For{" "}
              {proposal.businessId ? (
                <Link href={`/businesses/${proposal.businessId}`} className="hover:underline">
                  {proposal.businessName}
                </Link>
              ) : (
                proposal.businessName
              )}
              .{" "}
            </>
          ) : null}
          {proposal.sentAt
            ? `Sent ${proposal.sentAt.toISOString().slice(0, 10)}.`
            : "Still a draft, so every number here is live."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="table-scroll panel">
            <table className="list-table list-table-fit">
              <thead>
                <tr>
                  <th scope="col">
                    Line
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
                  {editable ? (
                    <th scope="col" className="text-right">
                      <span className="sr-only">Remove</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {live.lines.length === 0 ? (
                  <tr>
                    <td colSpan={editable ? 5 : 4} className="px-3 py-6 text-center text-ink-muted">
                      Nothing on this proposal yet.
                    </td>
                  </tr>
                ) : null}

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
                    {editable ? (
                      <td className="px-3 py-2 text-right">
                        <form action={removeLineAction}>
                          <input type="hidden" name="proposalId" value={proposal.id} />
                          <input type="hidden" name="lineId" value={line.key} />
                          <button type="submit" className="btn btn-secondary btn-sm">
                            Remove
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editable && catalog.length > 0 ? (
            <form action={addCatalogLineAction} className="flex flex-wrap items-end gap-3 panel panel-pad">
              <input type="hidden" name="proposalId" value={proposal.id} />
              <div className="flex flex-col gap-1">
                <label htmlFor="serviceItemId" className="text-sm font-medium">
                  From the catalogue
                </label>
                <select
                  id="serviceItemId"
                  name="serviceItemId"
                  className="control"
                >
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatMoney(item.unitPrice)}
                      {item.billing === "monthly" ? " a month" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-secondary">
                Add
              </button>
              <p className="w-full text-xs text-ink-faint">
                The price is copied onto the line. Changing the catalogue later leaves this quote alone.
              </p>
            </form>
          ) : null}

          {editable ? <LineForm action={addLineAction} proposalId={proposal.id} currency={proposal.currency} /> : null}
        </div>

        <div className="flex flex-col gap-4">
          <QuoteTotals totals={totals} />

          {editable ? (
            <SendProposal action={sendProposalAction} id={proposal.id} ready={lines.length > 0} />
          ) : (
            <p className="panel px-3 py-2 text-ink-muted">
              These totals were written when it was sent. They do not move again.
            </p>
          )}

          {editable ? null : (
            <ShareProposal
              proposalId={proposal.id}
              url={link ? absoluteUrl(requestHeaders, `/p/${link.token}`) : null}
              views={views}
              share={shareProposalAction}
              revoke={revokeProposalLinkAction}
            />
          )}

          {signature ? (
            <div className="rounded-md border border-band-strong-line bg-band-strong-soft p-4">
              <h2 className="font-semibold text-band-strong">Signed</h2>
              <p className="mt-1 text-band-strong">
                {signature.signerName} ({signature.signerEmail}) on{" "}
                {signature.signedAt.toISOString().slice(0, 10)}.
              </p>
              <p className="mt-2 text-xs text-band-strong">
                Terms {shortFingerprint(signature.termsFingerprint)}, checked against what was sent.
                {signature.termsFingerprint === proposal.termsFingerprint
                  ? " Still a match."
                  : " This no longer matches the proposal on file."}
              </p>
            </div>
          ) : null}

          {proposal.notes ? (
            <div className="panel panel-pad">
              <h2 className="section-title">Notes</h2>
              <p className="mt-1 whitespace-pre-line text-ink">{proposal.notes}</p>
            </div>
          ) : null}
        </div>
      </div>

      {editable ? (
        <div className="flex flex-col gap-2">
          <h2 className="section-title">Terms</h2>
          <ProposalForm
            action={updateProposalAction}
            submitLabel="Save terms"
            businesses={businesses}
            proposal={{
              id: proposal.id,
              title: proposal.title,
              businessId: proposal.businessId,
              currency: proposal.currency,
              termMonths: proposal.termMonths,
              freeMonths: proposal.freeMonths,
              discountPercent: proposal.discountPercent,
              taxPercent: proposal.taxPercent,
              notes: proposal.notes,
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <GuardedSuspense
      label="Proposal"
      fallback={<div className="skeleton h-64" aria-hidden="true" />}
    >
      <ProposalDetail id={id} />
    </GuardedSuspense>
  );
}
