// ============================================================
// Charts
// ------------------------------------------------------------
// Single-series charts in the accent hue. Marks follow fixed specs: columns
// ≤ 24px wide with a 4px rounded data-end, hairline gridlines, a hover /
// focus tooltip on every mark, and a visually hidden table so the data is
// never available by sight alone.
// ============================================================
import { useId, useState } from 'react';

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

export interface ColumnDatum {
  key: string;
  label: string;
  /** full label for tooltip / table */
  title: string;
  value: number;
  detail?: string;
  highlight?: boolean;
}

export function ColumnChart({ data, unit, height = 160, caption }: { data: ColumnDatum[]; unit: string; height?: number; caption: string }) {
  const [active, setActive] = useState<string | null>(null);
  const id = useId();
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [max, max / 2, 0];
  const activeDatum = data.find((d) => d.key === active);

  return (
    <figure className="chart" aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="sr-only">{caption}</figcaption>
      <div className="chart__plot" style={{ height }} onMouseLeave={() => setActive(null)}>
        <div className="chart__grid" aria-hidden="true">
          {ticks.map((t) => (
            <div key={t} className="chart__gridline"><span className="chart__tick num">{Number.isInteger(t) ? t : t.toFixed(1)}</span></div>
          ))}
        </div>
        <div className="chart__cols">
          {data.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`chart__slot${active === d.key ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(d.key)}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive(null)}
              aria-label={`${d.title}: ${d.value} ${unit}${d.detail ? `, ${d.detail}` : ''}`}
            >
              <span
                className={`chart__col${d.highlight ? ' chart__col--hi' : ''}${d.value === 0 ? ' chart__col--zero' : ''}`}
                style={{ height: `${max ? (d.value / max) * 100 : 0}%` }}
              />
            </button>
          ))}
        </div>
        {activeDatum && (
          <div
            className="chart__tooltip"
            role="presentation"
            style={{ left: `${((data.indexOf(activeDatum) + 0.5) / data.length) * 100}%` }}
          >
            <div className="fw-600">{activeDatum.title}</div>
            <div className="num">{activeDatum.value} {unit}</div>
            {activeDatum.detail && <div className="text-3">{activeDatum.detail}</div>}
          </div>
        )}
      </div>
      <div className="chart__labels" aria-hidden="true">
        {data.map((d) => <span key={d.key}>{d.label}</span>)}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">{unit}</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.key}><th scope="row">{d.title}</th><td>{d.value}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export interface HeatCell { day: string; value: number; title: string }

/**
 * Calendar heatmap (weeks as columns, Monday first). Sequential single hue:
 * more practice is darker. Legend shows the steps.
 */
export function Heatmap({ weeks, caption, unit }: { weeks: Array<Array<HeatCell | null>>; caption: string; unit: string }) {
  const [active, setActive] = useState<HeatCell | null>(null);
  const all = weeks.flat().filter((c): c is HeatCell => !!c);
  const max = Math.max(1, ...all.map((c) => c.value));
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));

  return (
    <figure className="heatmap" aria-label={caption}>
      <div className="heatmap__grid" onMouseLeave={() => setActive(null)}>
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap__week">
            {week.map((c, di) =>
              c ? (
                <button
                  key={c.day}
                  type="button"
                  className={`heatmap__cell heatmap__cell--${level(c.value)}`}
                  aria-label={`${c.title}: ${c.value} ${unit}`}
                  onMouseEnter={() => setActive(c)}
                  onFocus={() => setActive(c)}
                />
              ) : <span key={`e${di}`} className="heatmap__cell heatmap__cell--empty" aria-hidden="true" />,
            )}
          </div>
        ))}
      </div>
      <div className="heatmap__foot">
        <span className="text-xs text-3" aria-live="polite">
          {active ? `${active.title}: ${active.value} ${unit}` : `Each square is a day`}
        </span>
        <span className="heatmap__legend" aria-hidden="true">
          <span className="text-xs text-3">Less</span>
          {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`heatmap__cell heatmap__cell--${l}`} />)}
          <span className="text-xs text-3">More</span>
        </span>
      </div>
    </figure>
  );
}

/** Horizontal meter for topic mastery; the track is a lighter step of the fill hue. */
export function Meter({ value, label, tone = 'primary' }: { value: number; label: string; tone?: 'neutral' | 'primary' | 'warning' | 'success' | 'danger' }) {
  return (
    <div className={`meter meter--${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <div className="meter__fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
