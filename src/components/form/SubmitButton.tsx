"use client";

import { useFormStatus } from "react-dom";

export type SubmitVariant = "primary" | "secondary" | "danger";

/** Says what is happening while it happens, and cannot be submitted twice. */
export function SubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  size,
}: {
  label: string;
  pendingLabel?: string;
  /** Anything that takes something away is never the loudest button on the page. */
  variant?: SubmitVariant;
  size?: "sm";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn btn-${variant}${size === "sm" ? " btn-sm" : ""}`}
    >
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  );
}
