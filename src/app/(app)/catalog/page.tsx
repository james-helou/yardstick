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
        <p className="mt-1 text-sm text-neutral-600">
          What you sell, at your prices. A proposal copies the price the moment a line is added, so
          changing something here never rewrites a quote you have already sent.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-neutral-600">
          Nothing in the catalogue yet. Add the thing you sell most often first.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Item
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Billing
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Price
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <span className="font-medium">{item.name}</span>
                  {item.description ? (
                    <span className="block text-xs text-neutral-600">{item.description}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-neutral-600">
                  {item.billing === "monthly" ? "Every month" : "One time"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(item.unitPrice)}
                  <span className="block text-xs text-neutral-500">{amountToInput(item.unitPrice)}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <form action={archiveServiceItemAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="rounded border px-2 py-1 text-xs hover:bg-neutral-50">
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
      fallback={<div className="h-64 animate-pulse rounded-md bg-neutral-100" aria-hidden="true" />}
    >
      <Catalog />
    </GuardedSuspense>
  );
}
