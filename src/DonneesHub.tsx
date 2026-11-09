import { dataFetch } from "./api";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import { Database, MapPinned, Layers, Users, Grid3x3, Building2, Archive, Landmark, Route as RouteIcon, Loader2, ClipboardCheck, Sigma, Gauge } from "lucide-react";
import JSZip from "jszip";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Reveal, Counter } from "./ui";
import { INFRA_FAMILIES } from "./Geoportail";

type Q = { geometry: any; population: number; nom: string; commune: string };
export type DS = { id: string; name: string; kind: string; scale: string; count: number; file: string; formats: string[]; bytes: number };

export const CATEGORIES = [
  { key: "Toutes les données", icon: Database, color: "#38bdf8" },
  { key: "Limites administratives", icon: Landmark, color: "#22d3ee" },
  { key: "Population", icon: Users, color: "#a78bfa" },
  { key: "Infrastructures", icon: Building2, color: "#fb923c" },
  { key: "Accessibilité", icon: Grid3x3, color: "#2dd4bf" },
  { key: "Résultats de l'analyse", icon: Sigma, color: "#f43f5e" },
] as const;
export function categoryOf(d: { id: string }): string {
  if (d.id === "quartiers" || d.id === "communes") return "Limites administratives";
  if (d.id === "census_localites") return "Population";
  if (d.id.startsWith("resultats_")) return "Résultats de l'analyse";
  if (d.id.startsWith("infra_")) return "Infrastructures";
  return "Accessibilité";
}
const fmt = (n: number) => n.toLocaleString("fr-FR");

/* ----- Carte multi-couches Leaflet : fonds + couches + legende ----- */
const BASEMAPS = [
  { key: "sat", label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imagerie © Esri, Maxar, Earthstar Geographics" },
  { key: "osm", label: "Plan", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap" },
  { key: "dark", label: "Sombre", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: "© OpenStreetMap, © CARTO" },
  { key: "none", label: "Sans fond", url: "", attr: "" },
] as const;
const rings = (g: any): number[][][] => (!g ? [] : g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p: any) => p[0]) : []);
const POP_RAMP = ["#e0f2fe", "#7dd3fc", "#38bdf8", "#0284c7", "#075985"];
const ACC_RAMP = ["#fde68a", "#fbbf24", "#a3e635", "#22c55e", "#047857"];
const quint = (vals: number[]) => { const v = vals.filter(Number.isFinite).sort((a, b) => a - b); return [0.2, 0.4, 0.6, 0.8].map(p => v[Math.floor(p * (v.length - 1))]); };
const cls = (x: number, br: number[]) => br.filter(b => x > b).length;
const rangeLabels = (br: number[], min: number, max: number, d = 0) => { const f = (v: number | undefined) => (v ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: d }); const e = [min, ...br, max]; return e.slice(0, 5).map((lo, i) => `${f(lo)} – ${f(e[i + 1])}`); };

function FitTo({ quartiers }: { quartiers: Q[] }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    quartiers.forEach(q => rings(q.geometry).forEach(r => r.forEach(([x, y]) => pts.push([y, x]))));
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [10, 10] });
  }, [map, quartiers]);
  return null;
}

function OverviewMap({ quartiers }: { quartiers: Q[] }) {
  const cache = useRef<Record<string, any>>({});
  const [, setTick] = useState(0);
  const [base, setBase] = useState<string>("sat");
  const [opacity, setOpacity] = useState(0.55);
  const [loading, setLoading] = useState(false);
  const [legend, setLegend] = useState(true);
  const [on, setOn] = useState<Record<string, boolean>>({ communes: true, quartiers: true, grille: false, reseau: false, sante: true, education: true, sport: false, transport: false, banque: false, assurance: false, religion: false, commerce: false });

  useEffect(() => {
    const url = (k: string) => k === "reseau" ? "/data/reseau_routier.geojson" : k === "grille" ? "/data/grille_200m.geojson" : k === "communes" ? "/data/communes_thies.geojson" : `/data/infrastructures/infra_${k}.geojson`;
    const need = Object.keys(on).filter(k => on[k] && k !== "quartiers" && !cache.current[k]);
    if (!need.length) return; setLoading(true);
    Promise.all(need.map(k => dataFetch(url(k)).then(r => r.json()).then(j => { cache.current[k] = j; }).catch(() => { cache.current[k] = { type: "FeatureCollection", features: [] }; })))
      .then(() => { setLoading(false); setTick(t => t + 1); });
  }, [on]);

  const popBr = useMemo(() => quint(quartiers.map(q => q.population).filter(p => p > 0)), [quartiers]);
  const popMax = Math.max(...quartiers.map(q => q.population), 1);
  const popMin = Math.min(...quartiers.map(q => q.population).filter(p => p > 0), 0);
  const qGeo = useMemo(() => ({ type: "FeatureCollection" as const, features: quartiers.map(q => ({ type: "Feature" as const, properties: { nom: q.nom, commune: q.commune, population: q.population }, geometry: q.geometry })) }), [quartiers]);
  const grid = cache.current.grille;
  const accVals: number[] = useMemo(() => (grid?.features || []).map((f: any) => f.properties.acc_globale), [grid]);
  const accBr = useMemo(() => (accVals.length ? quint(accVals) : [0, 0, 0, 0]), [accVals]);
  const accMin = accVals.length ? Math.min(...accVals) : 0, accMax = accVals.length ? Math.max(...accVals) : 0;
  const bm = BASEMAPS.find(b => b.key === base)!;
  const layerList = [{ key: "communes", label: "Communes", color: "#fde047" }, { key: "quartiers", label: "Quartiers (population)", color: "#38bdf8" }, { key: "grille", label: "Grille 200 m (accessibilité)", color: "#22c55e" }, { key: "reseau", label: "Réseau routier", color: "#93c5fd" }, ...INFRA_FAMILIES.map(f => ({ key: f.key as string, label: f.label, color: f.color }))];
  const activeInfra = INFRA_FAMILIES.filter(f => on[f.key]);

  return (
    <div className="dh-mapwrap">
      <div className="dh-map">
        <MapContainer center={[14.79, -16.93]} zoom={12} preferCanvas scrollWheelZoom className="dh-leaflet" attributionControl>
          {bm.url && <TileLayer key={bm.key} url={bm.url} attribution={bm.attr} maxZoom={19} />}
          <FitTo quartiers={quartiers} />
          {on.quartiers && <GeoJSON key={`q${opacity}`} data={qGeo as any} style={(f: any) => ({ color: "#ffffff", weight: 1, fillColor: f.properties.population > 0 ? POP_RAMP[cls(f.properties.population, popBr)] : "#94a3b8", fillOpacity: f.properties.population > 0 ? opacity : opacity * 0.5 })} onEachFeature={(f: any, l: any) => l.bindTooltip(`${f.properties.nom} • ${f.properties.commune} • ${f.properties.population > 0 ? f.properties.population.toLocaleString("fr-FR") + " hab." : "population non renseignée"}`, { sticky: true })} />}
          {on.grille && grid && <GeoJSON key={`g${opacity}`} data={grid} style={(f: any) => ({ stroke: false, fillColor: ACC_RAMP[cls(f.properties.acc_globale, accBr)], fillOpacity: Math.min(0.9, opacity + 0.15) })} onEachFeature={(f: any, l: any) => l.bindTooltip(`Cellule ${f.properties.cell_id} • accessibilité globale ${f.properties.acc_globale.toFixed(2)}`, { sticky: true })} />}
          {on.reseau && cache.current.reseau && <GeoJSON key="r" data={cache.current.reseau} style={{ color: "#e2e8f0", weight: 1, opacity: 0.8 }} />}
          {on.communes && cache.current.communes && <GeoJSON key="c" data={cache.current.communes} style={{ color: "#fde047", weight: 2.5, fillOpacity: 0, dashArray: "6 4" }} />}
          {INFRA_FAMILIES.map(f => on[f.key] && cache.current[f.key] ? <GeoJSON key={f.key} data={cache.current[f.key]} pointToLayer={(_, ll) => L.circleMarker(ll, { radius: 3.5, color: "#fff", weight: 0.8, fillColor: f.color, fillOpacity: 0.95 })} onEachFeature={(ft: any, l: any) => l.bindTooltip(`${f.label} • ${ft.properties.nom || "sans nom"}`)} /> : null)}
        </MapContainer>
        <button className="dh-lgbtn" onClick={() => setLegend(!legend)}>{legend ? "Masquer la légende" : "Légende"}</button>
        {legend && <div className="dh-legend">
          <b>Légende</b>
          {on.quartiers && <div className="dh-lg"><span>Population par quartier (hab.)</span>{rangeLabels(popBr, popMin, popMax).map((t, i) => <p key={i}><i style={{ background: POP_RAMP[i] }} />{t}</p>)}<p><i style={{ background: "#94a3b8" }} />Non renseignée</p></div>}
          {on.grille && accVals.length > 0 && <div className="dh-lg"><span>Accessibilité globale (grille 200 m)</span>{rangeLabels(accBr, accMin, accMax, 1).map((t, i) => <p key={i}><i style={{ background: ACC_RAMP[i] }} />{t}</p>)}<small>score standardisé : plus haut = mieux desservi</small></div>}
          {activeInfra.length > 0 && <div className="dh-lg"><span>Équipements</span><div className="dh-lg-dots">{activeInfra.map(f => <p key={f.key}><i className="dot" style={{ background: f.color }} />{f.label}</p>)}</div></div>}
          {on.reseau && <p><i className="line" style={{ background: "#e2e8f0" }} />Réseau routier</p>}
          {on.communes && <p><i className="line dash" />Limites communales</p>}
        </div>}
      </div>
      <div className="dh-controls">
        <div className="dh-bases"><b>Fond de carte</b>{BASEMAPS.map(b => <button key={b.key} className={base === b.key ? "on" : ""} onClick={() => setBase(b.key)}>{b.label}</button>)}
          <label className="dh-op">Opacité<input type="range" min="0.2" max="0.9" step="0.05" value={opacity} onChange={e => setOpacity(+e.target.value)} /></label></div>
        <div className="dh-layers"><b>Couches</b>
          {layerList.map(l => <label key={l.key}><input type="checkbox" checked={!!on[l.key]} onChange={e => setOn({ ...on, [l.key]: e.target.checked })} /><i style={{ background: l.color }} />{l.label}</label>)}
          {loading && <span className="dh-load"><Loader2 size={12} className="dh-spin" /> chargement…</span>}</div>
      </div>
    </div>
  );
}

/* ----- Hub complet ----- */
export default function DonneesHub({ catalog, quartiers, census, cat, setCat }: { catalog: any[] | null; quartiers: Q[]; census: any; cat: string; setCat: (c: string) => void }) {
  const [zipping, setZipping] = useState(false); const [zipMsg, setZipMsg] = useState("");
  const cnt = (c: string) => (catalog || []).filter(d => c === "Toutes les données" || categoryOf(d) === c).length;
  const pie = CATEGORIES.slice(1).map(c => ({ name: c.key, value: cnt(c.key), color: c.color }));
  const fmts = useMemo(() => { const m: Record<string, number> = {}; (catalog || []).forEach(d => d.formats.forEach((f: string) => { m[f] = (m[f] || 0) + 1; })); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [catalog]);
  const grid = catalog?.find(d => d.id === "grille")?.count ?? 0;
  const qPop = quartiers.reduce((s, q) => s + (q.population || 0), 0);

  const zipAll = async () => {
    if (!catalog) return; setZipping(true); setZipMsg("");
    try {
      const zip = new JSZip(); let done = 0;
      for (const d of catalog) { const r = await fetch(d.file); zip.file(d.file.split("/").pop()!, await r.blob()); setZipMsg(`${++done}/${catalog.length} fichiers…`); }
      zip.file("LISEZMOI.txt", "Thiès — Ségrégation socio-spatiale : données du projet.\nFichiers GeoJSON/JSON tels que publiés dans l'application (onglet Données).\nPopulation : ANSD, RGPH-5 (2023). Voir la page Données pour les sources, limites et l'appariement des localités.\n");
      const blob = await zip.generateAsync({ type: "blob" }); const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "donnees_thies_segregation.zip"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 800); setZipMsg("Archive téléchargée");
    } catch { setZipMsg("Échec du téléchargement"); }
    setZipping(false);
  };
  const MAXF = Math.max(1, ...fmts.map(f => f[1]));
  const kpis: [any, number, string, string, string][] = [
    [<Database />, catalog?.length ?? 0, "Jeux de données", "#38bdf8", ""], [<MapPinned />, quartiers.length, "Quartiers couverts", "#f87171", ""],
    [<Layers />, CATEGORIES.length - 1, "Catégories principales", "#2dd4bf", ""], [<Grid3x3 />, grid, "Cellules de grille 200 m", "#a78bfa", ""],
  ];
  return (
    <>
      <header className="dh-hero">
        <div className="dh-hero-in">
          <Reveal><div className="dh-eyebrow"><i />DONNÉES & MÉTHODOLOGIE</div></Reveal>
          <Reveal delay={80}><h1>Centre de données</h1></Reveal>
          <Reveal delay={160}><p>Accédez aux données géospatiales, statistiques et indicateurs utilisés pour l'analyse de la ségrégation socio-spatiale à Thiès — avec leurs sources, leurs limites et seulement les formats qui existent.</p></Reveal>
          <div className="dh-kpis">{kpis.map(([ic, v, l, c], i) => <Reveal key={l} delay={i * 70}><div className="dh-kpi"><span style={{ background: c }}>{ic}</span><div><strong>{catalog ? <Counter value={v} /> : "—"}</strong><small>{l}</small></div></div></Reveal>)}</div>
        </div>
      </header>
      <section className="dh-grid">
        <aside className="dh-panel dh-cats">
          <h3>Catégories</h3>
          {CATEGORIES.map(c => { const I = c.icon; return <button key={c.key} className={cat === c.key ? "on" : ""} style={{ ["--c" as any]: c.color }} onClick={() => setCat(c.key)}><I size={16} /><span>{c.key}</span><b>{cnt(c.key)}</b></button>; })}
          <div className="dh-bulk"><div><Archive size={16} /><b>Téléchargement groupé</b></div>
            <p>Tous les fichiers du catalogue ({catalog?.length ?? 0}) dans une archive ZIP, avec un fichier LISEZMOI.</p>
            <button onClick={zipAll} disabled={zipping || !catalog}>{zipping ? <Loader2 size={14} className="dh-spin" /> : <Archive size={14} />} {zipping ? "Préparation…" : "Télécharger tout (ZIP)"}</button>
            {zipMsg && <small>{zipMsg}</small>}</div>
        </aside>
        <div className="dh-panel dh-mapcard"><h3>Aperçu spatial des données</h3><OverviewMap quartiers={quartiers} /></div>
        <aside className="dh-panel dh-stats">
          <h3>Statistiques des données</h3>
          <div className="dh-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="value" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="none">{pie.map(p => <Cell key={p.name} fill={p.color} />)}</Pie></PieChart></ResponsiveContainer>
            <div className="dh-donut-c"><strong>{catalog?.length ?? "—"}</strong><small>jeux de données</small></div></div>
          <ul className="dh-pie-leg">{pie.map(p => <li key={p.name}><i style={{ background: p.color }} />{p.name}<b>{p.value} ({catalog?.length ? Math.round((p.value / catalog.length) * 100) : 0} %)</b></li>)}</ul>
          <h4>Formats de fichiers</h4>
          {fmts.map(([f, n]) => <div key={f} className="dh-fmt"><span>{f}</span><div><i style={{ width: `${(n / MAXF) * 100}%` }} /></div><b>{n}</b></div>)}
          <small className="dh-note">Nombre de jeux de données proposés dans chaque format.</small>
        </aside>
      </section>
      <section className="dh-updates">
        <h3>Dernières mises à jour des données</h3>
        <div>
          {[[<ClipboardCheck />, "#34d399", "Appariement RGPH-5 ↔ quartiers", `${fmt(qPop)} habitants rattachés sur ${census ? fmt(census.population) : "—"}`, "oct. 2026"],
            [<Sigma />, "#38bdf8", "Densité des lieux de culte", "calculée : nb_religion / surface_km²", "oct. 2026"],
            [<Gauge />, "#fbbf24", "Accessibilités à l'échelle de la grille", "8 familles + globale + routière (2 170 cellules)", "oct. 2026"],
            [<RouteIcon />, "#f87171", "Réseau routier", "4 658 tronçons (OpenStreetMap)", "oct. 2026"]].map(([ic, c, t, d, m], i) =>
            <div key={i} className="dh-upd"><span style={{ color: c as string, background: `${c}22` }}>{ic}</span><div><b>{t}</b><small>{d}</small></div><em>{m}</em></div>)}
        </div>
      </section>
    </>
  );
}
