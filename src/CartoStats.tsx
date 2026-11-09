import { useMemo, useState } from "react";
import { ChevronDown, TrendingUp, TrendingDown } from "lucide-react";
import { computeStats, quartileClass, INFRA_FAMILIES } from "./Geoportail";
import type { MapDef } from "./Cartotheque";

// ============================================================
// Statistiques reelles d'une carte : calculees sur les valeurs
// effectivement dessinees (aucune valeur saisie a la main).
// ============================================================
type Row = { v: number; name?: string; commune?: string };
export type MapStat = ReturnType<typeof buildStat>;

export const fmt = (v: number) =>
  Math.abs(v) >= 100 ? v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
  : Math.abs(v) >= 1 ? v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
  : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export function buildStat(def: MapDef, quartiers: any[], grid: any | null) {
  const rows: Row[] = [];
  let total = 0;
  if (def.layer === "quartiers") {
    total = quartiers.length;
    for (const q of quartiers) { const v = def.value(q); if (v !== null && v !== undefined && Number.isFinite(v)) rows.push({ v, name: q.nom, commune: q.commune }); }
  } else if (grid) {
    total = grid.features.length;
    for (const f of grid.features) { const v = def.value(f.properties); if (v !== null && v !== undefined && Number.isFinite(v)) rows.push({ v }); }
  }
  const st = computeStats(rows.map(r => r.v));
  if (!st) return null;
  const n = rows.length;
  const sd = Math.sqrt(rows.reduce((a, r) => a + (r.v - st.mean) ** 2, 0) / n);
  const BINS = 12, span = st.max - st.min || 1;
  const hist = Array<number>(BINS).fill(0);
  rows.forEach(r => { hist[Math.min(BINS - 1, Math.floor(((r.v - st.min) / span) * BINS))]++; });
  const classes = [0, 0, 0, 0];
  rows.forEach(r => { const c = quartileClass(r.v, st); if (c !== null) classes[c]++; });
  const sorted = [...rows].sort((a, b) => b.v - a.v);
  const sum = rows.reduce((a, r) => a + r.v, 0);
  const byCommune: { name: string; value: number; n: number }[] = [];
  if (def.layer === "quartiers") {
    for (const c of ["Thies Nord", "Thies Est", "Thies Ouest"]) {
      const rs = rows.filter(r => r.commune === c);
      if (rs.length) {
        const s = rs.reduce((a, r) => a + r.v, 0);
        byCommune.push({ name: c.replace("Thies", "Thiès"), value: def.id === "population" ? s : s / rs.length, n: rs.length });
      }
    }
  }
  return {
    st, n, total, sd, cv: st.mean ? (sd / Math.abs(st.mean)) * 100 : null, hist, classes, sum,
    top: sorted.slice(0, 3), bottom: sorted.slice(-3).reverse(),
    aboveMean: (rows.filter(r => r.v > st.mean).length / n) * 100,
    byCommune, communeIsSum: def.id === "population", bins: BINS, span,
  };
}

export function useMapStat(def: MapDef, quartiers: any[], grid: any | null) {
  return useMemo(() => (def.locked ? null : buildStat(def, quartiers, grid)), [def, quartiers, grid]);
}

function Hist({ s, ramp }: { s: NonNullable<MapStat>; ramp: string[] }) {
  const max = Math.max(...s.hist);
  return (
    <svg className="cs-hist" viewBox={`0 0 ${s.bins * 14} 52`} preserveAspectRatio="none" role="img" aria-label="Distribution des valeurs">
      {s.hist.map((c, i) => {
        const centre = s.st.min + ((i + 0.5) / s.bins) * s.span;
        const cl = quartileClass(centre, s.st);
        const h = max ? (c / max) * 46 : 0;
        return <rect key={i} x={i * 14 + 1} y={50 - h} width={12} height={Math.max(h, c ? 2 : 0)} rx={2} fill={cl === null ? "#b9c4cc" : ramp[cl]}><title>{c} unité{c > 1 ? "s" : ""}</title></rect>;
      })}
      <line x1="0" x2={s.bins * 14} y1="50.5" y2="50.5" stroke="#c9d8e1" />
    </svg>
  );
}

function Box({ s }: { s: NonNullable<MapStat> }) {
  const { min, max, q1, q3, median, mean } = s.st;
  const span = max - min || 1, x = (v: number) => 6 + ((v - min) / span) * 288;
  return (
    <svg className="cs-box" viewBox="0 0 300 40" role="img" aria-label="Boîte à moustaches">
      <line x1={x(min)} x2={x(max)} y1="20" y2="20" stroke="#8aa0af" strokeWidth="2" />
      <line x1={x(min)} x2={x(min)} y1="12" y2="28" stroke="#8aa0af" strokeWidth="2" />
      <line x1={x(max)} x2={x(max)} y1="12" y2="28" stroke="#8aa0af" strokeWidth="2" />
      <rect x={x(q1)} y="8" width={Math.max(2, x(q3) - x(q1))} height="24" rx="4" fill="#bfe3dc" stroke="#0f766e" strokeWidth="1.5" />
      <line x1={x(median)} x2={x(median)} y1="8" y2="32" stroke="#0b2a3b" strokeWidth="2.5" />
      <path d={`M${x(mean)} 13 l5 7 l-5 7 l-5 -7z`} fill="#ea580c" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

export function StatsPanel({ def, s }: { def: MapDef; s: MapStat }) {
  const [open, setOpen] = useState(false);
  if (!s) return <div className="cs-empty">Statistiques indisponibles</div>;
  const q = s.st;
  const edges = [q.min, q.q1, q.q2, q.q3, q.max];
  const cmax = Math.max(...s.byCommune.map(c => c.value), 1);
  return (
    <div className="cs">
      <div className="cs-kpis">
        <div><small>Moyenne</small><b>{fmt(q.mean)}</b></div>
        <div><small>Médiane</small><b>{fmt(q.median)}</b></div>
        <div><small>Écart-type</small><b>{fmt(s.sd)}</b></div>
        <div><small>Renseignés</small><b>{s.n}<i>/{s.total}</i></b></div>
      </div>
      <div className="cs-title">Distribution des valeurs</div>
      <Hist s={s} ramp={def.ramp} />
      <div className="cs-axis"><span>{fmt(q.min)}</span><span>{def.unit}</span><span>{fmt(q.max)}</span></div>

      <button className="cs-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? "Masquer" : "Toutes les statistiques"} <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div className="cs-more">
          <div className="cs-title">Dispersion (min · Q1 · médiane · Q3 · max)</div>
          <Box s={s} />
          <div className="cs-chips">
            <span>Coef. de variation <b>{s.cv === null ? "—" : `${fmt(s.cv)} %`}</b></span>
            <span>Valeurs &gt; moyenne <b>{fmt(s.aboveMean)} %</b></span>
            <span>Étendue <b>{fmt(q.max - q.min)}</b></span>
            {def.id === "population" && <span>Total <b>{fmt(s.sum)}</b></span>}
          </div>

          <div className="cs-title">Classes par quartiles</div>
          <div className="cs-classes">
            {[0, 1, 2, 3].map(i => (
              <div key={i}>
                <i style={{ background: def.ramp[i] }} />
                <span>Q{i + 1} · {fmt(edges[i])} – {fmt(edges[i + 1])}</span>
                <em>{s.classes[i]} <small>({fmt((s.classes[i] / s.n) * 100)} %)</small></em>
              </div>
            ))}
          </div>

          {def.layer === "quartiers" && (
            <>
              <div className="cs-tb">
                <div>
                  <div className="cs-title up"><TrendingUp size={13} /> Les plus élevés</div>
                  {s.top.map((r, i) => <p key={i}><span>{r.name}</span><b>{fmt(r.v)}</b></p>)}
                </div>
                <div>
                  <div className="cs-title down"><TrendingDown size={13} /> Les plus faibles</div>
                  {s.bottom.map((r, i) => <p key={i}><span>{r.name}</span><b>{fmt(r.v)}</b></p>)}
                </div>
              </div>
              <div className="cs-title">{s.communeIsSum ? "Population par commune" : "Moyenne des quartiers par commune"}</div>
              <div className="cs-communes">
                {s.byCommune.map(c => (
                  <div key={c.name}>
                    <span>{c.name} <small>{c.n} quartiers</small></span>
                    <div className="cs-bar"><i style={{ width: `${(c.value / cmax) * 100}%` }} /></div>
                    <b>{fmt(c.value)}</b>
                  </div>
                ))}
              </div>
            </>
          )}
          {s.n < s.total && <p className="cs-foot">{s.total - s.n} unité{s.total - s.n > 1 ? "s" : ""} sans valeur renseignée (en gris sur la carte) : exclue{s.total - s.n > 1 ? "s" : ""} des statistiques.</p>}
          {def.layer === "grille" && <p className="cs-foot">Statistiques calculées sur les {s.total.toLocaleString("fr-FR")} cellules de 200 m. Les valeurs sont celles fournies, non recalculées.</p>}
        </div>
      )}
    </div>
  );
}

// Chiffres cles du territoire (calcules sur les quartiers)
export function TerritoryFacts({ quartiers }: { quartiers: any[] }) {
  const f = useMemo(() => {
    const pop = quartiers.reduce((a, q) => a + (q.population || 0), 0);
    const surf = quartiers.reduce((a, q) => a + (q.surface_km2 || 0), 0);
    const top = [...quartiers].sort((a, b) => b.population - a.population)[0];
    const communes = ["Thies Nord", "Thies Est", "Thies Ouest"].map(c => ({
      name: c.replace("Thies", "Thiès"),
      pop: quartiers.filter(q => q.commune === c).reduce((a, q) => a + (q.population || 0), 0),
      nq: quartiers.filter(q => q.commune === c).length,
    }));
    const fam = INFRA_FAMILIES.map(x => ({ ...x, n: quartiers.reduce((a, q) => a + (q[`nb_${x.key}`] || 0), 0) }));
    return { pop, surf, top, communes, fam, equip: fam.reduce((a, x) => a + x.n, 0) };
  }, [quartiers]);
  const cmax = Math.max(...f.communes.map(c => c.pop), 1), fmax = Math.max(...f.fam.map(x => x.n), 1);
  const kp: [string, string, string][] = [
    ["Quartiers", String(quartiers.length), "3 communes"],
    ["Population rattachée", fmt(f.pop), "habitants (RGPH-5)"],
    ["Superficie", fmt(f.surf), "km² cartographiés"],
    ["Densité moyenne", fmt(f.pop / f.surf), "hab./km²"],
    ["Équipements recensés", fmt(f.equip), "8 familles"],
    ["Quartier le plus peuplé", f.top?.nom ?? "—", `${fmt(f.top?.population ?? 0)} hab.`],
  ];
  return (
    <div className="ct-facts">
      <div className="ct-kpis">{kp.map(([a, b, c]) => <div key={a}><small>{a}</small><b>{b}</b><span>{c}</span></div>)}</div>
      <div className="ct-facts-grid">
        <div className="ct-fcard">
          <h3>Population par commune</h3>
          {f.communes.map(c => (
            <div className="cs-communes-row" key={c.name}>
              <span>{c.name}<small>{c.nq} quartiers</small></span>
              <div className="cs-bar"><i style={{ width: `${(c.pop / cmax) * 100}%` }} /></div>
              <b>{fmt(c.pop)} <small>{fmt((c.pop / f.pop) * 100)} %</small></b>
            </div>
          ))}
        </div>
        <div className="ct-fcard">
          <h3>Équipements par famille</h3>
          {f.fam.map(x => (
            <div className="cs-communes-row" key={x.key}>
              <span>{x.label}</span>
              <div className="cs-bar"><i style={{ width: `${(x.n / fmax) * 100}%`, background: x.color }} /></div>
              <b>{fmt(x.n)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
