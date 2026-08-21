import type { ReactNode } from "react";

export type FieldProps = {
  name: string;
  /** Defaults to the name. Set it when two forms on one page share a field name. */
  id?: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
  children?: ReactNode;
};

/**
 * One labelled control. The error is tied to the input with `aria-describedby` so it is
 * announced rather than only seen, and the field keeps what the user typed after a
 * failed submit.
 */
export function Field({
  name,
  id,
  label,
  type = "text",
  required,
  defaultValue,
  placeholder,
  autoComplete,
  error,
  hint,
  children,
}: FieldProps) {
  const fieldId = id ?? name;
  const describedBy = [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium">
        {label}
        {required ? <span className="text-neutral-500"> (required)</span> : null}
      </label>

      {children ?? (
        <input
          id={fieldId}
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue ?? undefined}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="rounded border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2"
        />
      )}

      {hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-neutral-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
