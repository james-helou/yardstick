"use client";

import { useEffect, useRef, useState } from "react";

export type SearchInputProps = {
  label: string;
  defaultValue?: string;
  onSearch: (term: string) => void;
  /** Long enough that typing a word costs one query, short enough to feel immediate. */
  delayMs?: number;
  placeholder?: string;
};

const normalise = (value: string) => value.trim().replace(/\s+/g, " ");

/**
 * Debounced search. Takes `onSearch` rather than reaching for the router, so the
 * debounce is testable on its own and the same input can drive a URL, a filter, or a
 * dialog. `UrlSearchInput` is the router-bound wrapper.
 */
export function SearchInput({
  label,
  defaultValue = "",
  onSearch,
  delayMs = 300,
  placeholder,
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);

  // What the caller has already been told. Prevents a round-trip when the reader
  // types and then deletes back to the term that is already applied.
  const lastSearched = useRef(normalise(defaultValue));

  useEffect(() => {
    const term = normalise(value);
    if (term === lastSearched.current) return;

    const timer = setTimeout(() => {
      lastSearched.current = term;
      onSearch(term);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs, onSearch]);

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        className="rounded border px-3 py-1.5"
      />
    </label>
  );
}
