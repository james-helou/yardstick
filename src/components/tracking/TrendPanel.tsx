import { sparkline, type Trend } from "@/lib/tracking/trend";

/**
 * Movement, drawn. The line is a plain SVG polyline built from a pure function, so there
 * is no charting library, nothing to hydrate, and the same numbers a client reads are the
 * ones the test asserts on.
 */

const WIDTH = 320;
const HEIGHT = 64;

const ARROW: Record<Trend["direction"], string> = { up: "▲", down: "▼", flat: "→" };
const TONE: Record<Trend["direction"], string> = {
  up: "text-emerald-700",
  down: "text-red-700",
  flat: "text-neutral-600",
};

export function TrendPanel({ trend, title = "Since we started" }: { trend: Trend; title?: string }) {
  const line = sparkline(trend.points, WIDTH, HEIGHT);

  return (
    <section className="rounded-md border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {trend.latest ? (
          <p className={`text-sm font-medium ${TONE[trend.direction]}`}>
            {ARROW[trend.direction]} {trend.change > 0 ? `+${trend.change}` : trend.change} points
          </p>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-neutral-700">{trend.headline}</p>

      {trend.points.length > 1 ? (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mt-3 h-16 w-full"
          role="img"
          aria-label={`Score from ${Math.round(trend.first!.score)} to ${Math.round(trend.latest!.score)}`}
          preserveAspectRatio="none"
        >
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className={TONE[trend.direction]}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}

      {trend.movers.length > 0 ? (
        <dl className="mt-3 flex flex-col gap-1 text-sm">
          {trend.movers.map((mover) => (
            <div key={mover.pillar} className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-700">{mover.label}</dt>
              <dd className="tabular-nums">
                <span className="text-neutral-500">
                  {Math.round(mover.from)} → {Math.round(mover.to)}
                </span>{" "}
                <span
                  className={mover.change > 0 ? "text-emerald-700" : mover.change < 0 ? "text-red-700" : ""}
                >
                  {mover.change > 0 ? `+${mover.change}` : mover.change}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {trend.points.length > 1 ? (
        <p className="mt-3 text-xs text-neutral-500">
          {trend.points.length} measurements, {trend.first!.at.toISOString().slice(0, 10)} to{" "}
          {trend.latest!.at.toISOString().slice(0, 10)}.
        </p>
      ) : null}
    </section>
  );
}
