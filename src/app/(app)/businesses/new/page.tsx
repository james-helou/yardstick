import Link from "next/link";
import { createBusinessAction } from "../actions";
import { BusinessForm } from "../BusinessForm";

export const metadata = { title: "Add a business" };

export default function NewBusinessPage() {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/businesses" className="text-sm text-neutral-600 hover:underline">
          Back to businesses
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Add a business</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Only the name is required. Everything else can wait until after the first scan.
        </p>
      </div>

      <BusinessForm action={createBusinessAction} submitLabel="Add business" />
    </section>
  );
}
