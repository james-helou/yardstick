import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { getBusiness } from "@/lib/db/repos/businesses";
import { updateBusinessAction } from "../actions";
import { BusinessForm } from "../BusinessForm";

export const dynamic = "force-dynamic";

const STATUS_LABEL = { prospect: "Prospect", client: "Client", archived: "Archived" } as const;

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { scope } = await resolveWorkspace(await headers());
  const business = await getBusiness(scope, id);

  // A business in another workspace is not "forbidden", it does not exist here. Saying
  // so gives away nothing about what other workspaces hold.
  if (!business) notFound();

  const place = [business.addressLine, business.locality, business.region, business.postalCode, business.country]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="flex flex-col gap-8">
      <div>
        <Link href="/businesses" className="text-sm text-neutral-600 hover:underline">
          Back to businesses
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{business.name}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {STATUS_LABEL[business.status]}
          {place ? ` · ${place}` : ""}
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Details</h2>
        <BusinessForm
          action={updateBusinessAction}
          submitLabel="Save changes"
          defaults={{
            id: business.id,
            name: business.name,
            status: business.status,
            addressLine: business.addressLine,
            locality: business.locality,
            region: business.region,
            postalCode: business.postalCode,
            country: business.country,
            latitude: business.latitude,
            longitude: business.longitude,
            primaryCategory: business.primaryCategory,
            websiteUrl: business.websiteUrl,
            phone: business.phone,
          }}
        />
      </div>
    </section>
  );
}
