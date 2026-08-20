import Link from "next/link";
import { placesProvider } from "@/lib/places";
import { createBusinessAction } from "../actions";
import { BusinessForm } from "../BusinessForm";
import { PlaceSearch } from "../PlaceSearch";
import { importPlaceAction, searchPlacesAction } from "../places-actions";

export const metadata = { title: "Add a business" };

export default function NewBusinessPage() {
  // Dormant without a key. The page is complete without it, so nothing degrades.
  const placesEnabled = placesProvider() !== null;

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

      {placesEnabled ? (
        <PlaceSearch search={searchPlacesAction} importPlace={importPlaceAction} />
      ) : null}

      <BusinessForm action={createBusinessAction} submitLabel="Add business" />
    </section>
  );
}
