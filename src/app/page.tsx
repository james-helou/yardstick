import Link from "next/link";
import { APP_NAME } from "@/lib/version";
import { Mark } from "@/components/app/Mark";

/** The five things a scan measures, in the order they carry weight. */
const PILLARS = [
  { name: "Google Business Profile", weight: 27 },
  { name: "Reputation", weight: 22 },
  { name: "Map rankings", weight: 22 },
  { name: "Site health", weight: 16 },
  { name: "AI visibility", weight: 13 },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-8 px-5 py-14 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <Mark className="h-6 w-6" />
          {APP_NAME}
        </h1>
        <p className="mt-3 max-w-prose text-md text-ink-muted">
          Local SEO diagnostics for agencies. Measure a prospect&rsquo;s visibility, show them
          the gap, and win the work.
        </p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Link href="/sign-up" className="btn btn-primary">
          Create a workspace
        </Link>
        <Link href="/sign-in" className="btn btn-secondary">
          Sign in
        </Link>
      </div>

      {/* The weights are the product's opinion, so they are worth stating plainly
        * rather than hiding behind the word "proprietary". */}
      <section className="panel panel-pad">
        <h2 className="section-title">What a scan measures</h2>
        <dl className="mt-3 flex flex-col gap-2">
          {PILLARS.map((pillar) => (
            <div key={pillar.name} className="flex items-center gap-3">
              <dt className="w-44 shrink-0 text-ink-muted sm:w-52">{pillar.name}</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-brass"
                    style={{ width: `${(pillar.weight / 27) * 100}%` }}
                  />
                </span>
                <span className="data w-9 shrink-0 text-right text-xs text-ink-faint">
                  {pillar.weight}%
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <nav>
        <Link className="link text-xs text-ink-muted" href="/health">
          System health
        </Link>
      </nav>
    </main>
  );
}
