import { CircleMarker, Tooltip } from "react-leaflet";
import type { Q } from "./geoQuery";

/** Cercles proportionnels : la SURFACE du cercle est proportionnelle a la valeur (rayon ∝ √valeur). */
export const R_MAX = 34; // px, rayon du plus grand cercle
export const circleRadius = (v: number | null | undefined, max: number) => (v && v > 0 && max > 0 ? Math.max(1.5, R_MAX * Math.sqrt(v / max)) : 0);
const nice = (v: number) => { if (v <= 0) return 0; const e = 10 ** Math.floor(Math.log10(v)); const m = v / e; return (m >= 7.5 ? 10 : m >= 3.5 ? 5 : m >= 1.5 ? 2 : 1) * e; };
const fmt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: v < 10 ? 2 : 0 });

type LayerProps = {
  quartiers: Q[]; centroids: Map<number, [number, number]>; get: (q: Q) => number | null; max: number; color: string;
  label: string; unit: string; match: Set<number> | null; onPick: (q: Q) => void; enabled: boolean;
};
export function CircleLayer({ quartiers, centroids, get, max, color, label, unit, match, onPick, enabled }: LayerProps) {
  if (!enabled) return null;
  const rows = quartiers.map(q => ({ q, v: get(q), c: centroids.get(q.quartier_id) })).filter(x => x.v && x.v > 0 && x.c)
    .sort((a, b) => (b.v as number) - (a.v as number)); // grands d'abord : les petits restent visibles par-dessus
  return <>{rows.map(({ q, v, c }) => {
    const on = !match || match.has(q.quartier_id);
    return (
      <CircleMarker key={`${q.quartier_id}-${on}`} center={[c![1], c![0]]} radius={circleRadius(v, max)}
        pathOptions={{ color: on && match ? "#fde047" : "#ffffff", weight: on && match ? 2.2 : 1.2, fillColor: color, fillOpacity: on ? 0.62 : 0.12, opacity: on ? 1 : 0.35 }}
        eventHandlers={{ click: () => onPick(q) }}>
        <Tooltip sticky><strong>{q.nom}</strong><br />{q.commune}<br />{label} : {fmt(v as number)} {unit}</Tooltip>
      </CircleMarker>
    );
  })}</>;
}

export function CircleLegend({ label, unit, max, color, count }: { label: string; unit: string; max: number; color: string; count: number }) {
  const vals = [nice(max), nice(max / 4), nice(max / 20)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  const R = circleRadius(nice(max), max), W = R * 2 + 4, H = R * 2 + 12;
  return (
    <div className="gx-clegend">
      <div className="gx-clegend-title">{label}</div>
      <svg width={W + 78} height={H} role="img" aria-label={`Légende des cercles proportionnels : ${vals.map(fmt).join(", ")} ${unit}`}>
        {vals.map((v, i) => { const r = circleRadius(v, max); const cy = H - 2 - r; return (
          <g key={i}><circle cx={R + 2} cy={cy} r={r} fill={color} fillOpacity={0.35} stroke="currentColor" strokeWidth={1} />
            <line x1={R + 2} x2={W + 6} y1={cy - r} y2={cy - r} stroke="currentColor" strokeOpacity={0.5} strokeWidth={0.8} />
            <text x={W + 9} y={cy - r + 3.5} fontSize="10.5" fill="currentColor">{fmt(v)}</text></g>); })}
      </svg>
      <div className="gx-legend-meta">Surface du cercle ∝ valeur ({unit}) · {count} quartiers</div>
    </div>
  );
}
