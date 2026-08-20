"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { SearchInput } from "./SearchInput";

/**
 * Binds the debounced input to the URL, so a filtered list is linkable and survives a
 * refresh. A new term always returns to page one — page 4 of the previous result set
 * means nothing against a new one.
 */
export function UrlSearchInput({ label, placeholder }: { label: string; placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onSearch = useCallback(
    (term: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (term) params.set("q", term);
      else params.delete("q");
      params.delete("page");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <SearchInput
      label={label}
      placeholder={placeholder}
      defaultValue={searchParams.get("q") ?? ""}
      onSearch={onSearch}
    />
  );
}
