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
  up: "text-band-strong",
  down: "text-band-critical",
  flat: "text-ink-muted",
};

export function TrendPanel({ trend, title = "Since we started" }: { trend: Trend; title?: string }) {
  const line = sparkline(trend.points, WIDTH, HEIGHT);

  return (
    <section className="panel panel-pad">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">{title}</h2>
        {trend.latest ? (
          <p className={`text-sm font-medium ${TONE[trend.direction]}`}>
            {ARROW[trend.direction]} {trend.change > 0 ? `+${trend.change}` : trend.change} points
          </p>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-ink">{trend.headline}</p>

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
              <dt className="text-ink">{mover.label}</dt>
              <dd className="tabular-nums">
                <span className="text-ink-faint">
                  {Math.round(mover.from)} → {Math.round(mover.to)}
                </span>{" "}
                <span
                  className={mover.change > 0 ? "text-band-strong" : mover.change < 0 ? "text-band-critical" : ""}
                >
                  {mover.change > 0 ? `+${mover.change}` : mover.change}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {trend.points.length > 1 ? (
        <p className="mt-3 text-xs text-ink-faint">
          {trend.points.length} measurements, {trend.first!.at.toISOString().slice(0, 10)} to{" "}
          {trend.latest!.at.toISOString().slice(0, 10)}.
        </p>
      ) : null}
    </section>
  );
}
