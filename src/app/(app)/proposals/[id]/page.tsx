import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { QuoteTotals, StatusChip } from "@/components/proposal";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listBusinessOptions } from "@/lib/db/repos/businesses";
import { listServiceItems } from "@/lib/db/repos/catalog";
import { getProposal, isEditable, listProposalLines, quoteOf } from "@/lib/db/repos/proposals";
import { formatMoney } from "@/lib/money";
import { addCatalogLineAction, addLineAction, removeLineAction, sendProposalAction, updateProposalAction } from "../actions";
import { ProposalForm } from "../ProposalForm";
import { LineForm } from "./LineForm";
import { SendProposal } from "./SendProposal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposal" };

async function ProposalDetail({ id }: { id: string }) {
  const { scope } = await resolveWorkspace(await headers());
  const proposal = await getProposal(scope, id);
  // Another workspace's proposal is a 404, not a permission error: there is nothing here
  // to have permission for.
  if (!proposal) notFound();

  const [lines, catalog, businesses] = await Promise.all([
    listProposalLines(scope, proposal.id),
    listServiceItems(scope),
    listBusinessOptions(scope),
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
        <Link href="/proposals" className="text-sm text-neutral-600 hover:underline">
          Back to proposals
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{proposal.title}</h1>
          <StatusChip status={proposal.status} />
        </div>
        <p className="mt-1 text-sm text-neutral-600">
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
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-neutral-50">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Line
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
                  {editable ? (
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      <span className="sr-only">Remove</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {live.lines.length === 0 ? (
                  <tr>
                    <td colSpan={editable ? 5 : 4} className="px-3 py-6 text-center text-neutral-600">
                      Nothing on this proposal yet.
                    </td>
                  </tr>
                ) : null}

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
                    {editable ? (
                      <td className="px-3 py-2 text-right">
                        <form action={removeLineAction}>
                          <input type="hidden" name="proposalId" value={proposal.id} />
                          <input type="hidden" name="lineId" value={line.key} />
                          <button type="submit" className="rounded border px-2 py-1 text-xs hover:bg-neutral-50">
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
            <form action={addCatalogLineAction} className="flex flex-wrap items-end gap-3 rounded-md border p-4">
              <input type="hidden" name="proposalId" value={proposal.id} />
              <div className="flex flex-col gap-1">
                <label htmlFor="serviceItemId" className="text-sm font-medium">
                  From the catalogue
                </label>
                <select
                  id="serviceItemId"
                  name="serviceItemId"
                  className="rounded border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2"
                >
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatMoney(item.unitPrice)}
                      {item.billing === "monthly" ? " a month" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
                Add
              </button>
              <p className="w-full text-xs text-neutral-500">
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
            <p className="rounded-md border px-3 py-2 text-sm text-neutral-600">
              These totals were written when it was sent. They do not move again.
            </p>
          )}

          {proposal.notes ? (
            <div className="rounded-md border p-4 text-sm">
              <h2 className="font-semibold">Notes</h2>
              <p className="mt-1 whitespace-pre-line text-neutral-700">{proposal.notes}</p>
            </div>
          ) : null}
        </div>
      </div>

      {editable ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Terms</h2>
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
      fallback={<div className="h-64 animate-pulse rounded-md bg-neutral-100" aria-hidden="true" />}
    >
      <ProposalDetail id={id} />
    </GuardedSuspense>
  );
}
