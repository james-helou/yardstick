import Link from "next/link";
import { APP_NAME } from "@/lib/version";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Local SEO diagnostics for agencies. Measure a prospect&rsquo;s visibility, show them
          the gap, and win the work.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/sign-up"
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Create a workspace
        </Link>
        <Link href="/sign-in" className="rounded border px-4 py-2 text-sm font-medium hover:bg-neutral-50">
          Sign in
        </Link>
      </div>

      <nav className="text-sm">
        <Link className="text-neutral-600 underline underline-offset-4" href="/health">
          System health
        </Link>
      </nav>
    </main>
  );
}
