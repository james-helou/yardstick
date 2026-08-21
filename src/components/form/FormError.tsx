/** A whole-form failure, as opposed to one bad field. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-sm border border-band-critical-line bg-band-critical-soft px-3 py-2 text-band-critical">
      {message}
    </p>
  );
}
