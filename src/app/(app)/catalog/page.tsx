import { headers } from "next/headers";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listServiceItems } from "@/lib/db/repos/catalog";
import { formatMoney } from "@/lib/money";
import { amountToInput } from "@/lib/proposals/schema";
import { archiveServiceItemAction, createServiceItemAction } from "./actions";
import { CatalogForm } from "./CatalogForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalogue" };

/** The one place a price is allowed to change. Nothing already quoted moves with it. */
async function Catalog() {
  const { scope } = await resolveWorkspace(await headers());
  const items = await listServiceItems(scope);
  const currency = items[0]?.unitPrice.currency ?? "CAD";

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Catalogue</h1>
        <p className="mt-1 text-sm text-ink-muted">
          What you sell, at your prices. A proposal copies the price the moment a line is added, so
          changing something here never rewrites a quote you have already sent.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong px-3 py-6 text-center text-ink-muted">
          Nothing in the catalogue yet. Add the thing you sell most often first.
        </p>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th scope="col">
                Item
              </th>
              <th scope="col">
                Billing
              </th>
              <th scope="col" className="text-right">
                Price
              </th>
              <th scope="col" className="text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">
                  <span className="font-medium">{item.name}</span>
                  {item.description ? (
                    <span className="block text-xs text-ink-muted">{item.description}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-ink-muted">
                  {item.billing === "monthly" ? "Every month" : "One time"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(item.unitPrice)}
                  <span className="block text-xs text-ink-faint">{amountToInput(item.unitPrice)}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <form action={archiveServiceItemAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Archive
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CatalogForm action={createServiceItemAction} currency={currency} />
    </section>
  );
}

export default function CatalogPage() {
  return (
    <GuardedSuspense
      label="Catalogue"
      fallback={<div className="skeleton h-64" aria-hidden="true" />}
    >
      <Catalog />
    </GuardedSuspense>
  );
}
