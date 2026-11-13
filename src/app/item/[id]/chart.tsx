"use client";

import { useMemo, useState } from "react";
import { formatCopper } from "@/lib/money";
import { Money } from "@/components/ui";

type Point = { t: number; minBuyout: number | null; marketValue: number | null };

const W = 720;
const H = 240;
const PAD = { l: 64, r: 16, t: 12, b: 28 };
const SERIES = [
  { key: "minBuyout" as const, label: "Cheapest listing", color: "var(--series-cheapest)" },
  { key: "marketValue" as const, label: "Market value", color: "var(--series-value)" },
];

const fmtTime = (t: number) => new Date(t).toISOString().slice(5, 16).replace("T", " ");

// Price history on one copper axis. Hover or tap for exact values.
export function PriceChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { x, y, ticks, t0, t1 } = useMemo(() => {
    const vals = points.flatMap((p) => [p.minBuyout, p.marketValue]).filter((v): v is number => v !== null);
    const max = Math.max(...vals, 1) * 1.08;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const x = (t: number) => PAD.l + (t1 === t0 ? (W - PAD.l - PAD.r) / 2 : ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
    const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
    return { x, y, ticks, t0, t1 };
  }, [points]);

  const path = (key: "minBuyout" | "marketValue") => {
    let d = "";
    let pen = false;
    for (const p of points) {
      const v = p[key];
      if (v === null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    }
    return d;
  };

  const last = points[points.length - 1];
  const h = hover !== null ? points[hover] : null;

  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span>Copper per unit, UTC</span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Price history from ${fmtTime(t0)} to ${fmtTime(t1)}. Latest cheapest ${formatCopper(last.minBuyout)}, market value ${formatCopper(last.marketValue)}.`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].t) - px) < Math.abs(x(points[best].t) - px)) best = i;
            setHover(best);
          }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
                {formatCopper(v)}
              </text>
            </g>
          ))}
          <text x={PAD.l} y={H - 8} fontSize="11" fill="var(--muted)">{fmtTime(t0)}</text>
          <text x={W - PAD.r} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="end">{fmtTime(t1)}</text>
          {SERIES.map((s) => (
            <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {points.length === 1 || points.length < 4
            ? points.flatMap((p, i) =>
                SERIES.map((s) =>
                  p[s.key] !== null ? (
                    <circle key={`${s.key}${i}`} cx={x(p.t)} cy={y(p[s.key]!)} r="4" fill={s.color} stroke="var(--panel)" strokeWidth="2" />
                  ) : null,
                ),
              )
            : null}
          {h ? (
            <g>
              <line x1={x(h.t)} x2={x(h.t)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
              {SERIES.map((s) =>
                h[s.key] !== null ? (
                  <circle key={s.key} cx={x(h.t)} cy={y(h[s.key]!)} r="5" fill={s.color} stroke="var(--panel)" strokeWidth="2" />
                ) : null,
              )}
            </g>
          ) : null}
        </svg>
        {h ? (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs shadow-[0_12px_28px_rgba(0,0,0,.35)]"
            style={{ left: `${(x(h.t) / W) * 100}%`, transform: x(h.t) > W / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)" }}
          >
            <div className="text-muted">{fmtTime(h.t)} UTC</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                <span className="text-muted">{s.label}</span>
                <span className="num ml-auto text-text"><Money c={h[s.key]} /></span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Scan (UTC)</th>
              <th className="py-1 text-right font-medium">Cheapest</th>
              <th className="py-1 text-right font-medium">Market value</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.t} className="border-t border-line">
                <td className="py-1">{fmtTime(p.t)}</td>
                <td className="num py-1 text-right text-text"><Money c={p.minBuyout} /></td>
                <td className="num py-1 text-right text-text"><Money c={p.marketValue} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
