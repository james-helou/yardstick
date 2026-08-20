import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Yardstick</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Local SEO diagnostics for agencies. Measure a prospect&rsquo;s visibility, show them
          the gap, and win the work.
        </p>
      </div>
      <nav className="flex gap-4 text-sm">
        <Link className="underline underline-offset-4" href="/health">
          System health
        </Link>
      </nav>
    </main>
  );
}
