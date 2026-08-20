"use client";

import { useFormStatus } from "react-dom";

/** Says what is happening while it happens, and cannot be submitted twice. */
export function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
    >
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  );
}
