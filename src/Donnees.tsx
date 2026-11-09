import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Database, Search, Download, Table2, BarChart3, BookOpen, MapPinned, FileJson, FileSpreadsheet, FileText, ShieldAlert, CheckCircle2, AlertTriangle, HelpCircle, ChevronLeft, ChevronRight, ArrowUpDown, Layers, GitMerge, Quote, Server, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Reveal, ThemeCtx } from "./ui";
import { INFRA_FAMILIES, type QuartierFull } from "./Geoportail";
import DonneesHub, { categoryOf } from "./DonneesHub";
import "./Donnees.css";
import { dataFetch } from "./api";

type QGeo = QuartierFull & { geometry: any };
type Row = Record<string, any>;
type Dataset = {
  id: string; name: string; kind: string; geometry: string; scale: string; count: number; file: string; formats: string[]; bytes: number;
  columns: string[]; description: string; source: string; year: string; status: string; indicators: string[]; notes?: string;
};
type Census = { annee: number; localites_recensees: number; population: number; menages: number; par_commune: Record<string, { population: number; menages: number }> };
type Loc = { localite: string; commune: string; menages: number; population: number; statut: string; polygone?: string; polygone_commune?: string };

const fmtN = (n: number, d = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(b / 1e3))} ko`);

function colorOf(d: Dataset): string {
  if (d.id === "quartiers") return "#0891b2"; if (d.id === "communes") return "#64748b"; if (d.id === "grille") return "#0d9488";
  if (d.id === "reseau") return "#2563eb"; if (d.id === "census_localites") return "#a16207";
  const f = INFRA_FAMILIES.find(x => d.id === `infra_${x.key}`); return f?.color || "#7c3aed";
}
function iconOf(d: Dataset) {
  const f = INFRA_FAMILIES.find(x => d.id === `infra_${x.key}`); if (f) { const I = f.icon; return <I size={18} />; }
  if (d.kind === "lignes") return <Layers size={18} />; if (d.kind === "table") return <Table2 size={18} />; return <MapPinned size={18} />;
}
const kindLabel = (k: string) => ({ polygones: "Polygones", points: "Points", lignes: "Lignes", table: "Table" } as Record<string, string>)[k] || k;

/* ---------- Stats ---------- */
function numericStats(vals: number[]) {
  const v = vals.filter(x => Number.isFinite(x)).sort((a, b) => a - b); const n = v.length;
  if (!n) return null;
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const q = (p: number) => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return { n, min: v[0], max: v[n - 1], mean, median: q(0.5), q1: q(0.25), q3: q(0.75), sd };
}
function histogram(vals: number[], bins = 12) {
  const v = vals.filter(Number.isFinite); if (!v.length) return [];
  const mn = Math.min(...v), mx = Math.max(...v); if (mn === mx) return [{ label: fmtN(mn, 2), n: v.length }];
  const w = (mx - mn) / bins; const out = Array.from({ length: bins }, (_, i) => ({ label: fmtN(mn + i * w, Math.abs(w) < 1 ? 2 : 0), n: 0 }));
  v.forEach(x => { out[Math.min(bins - 1, Math.floor((x - mn) / w))].n++; });
  return out;
}

/* ---------- Apercu cartographique (canvas) ---------- */
const RAMP = ["#fff7ec", "#fdd49e", "#fc8d59", "#d7301f", "#7f0000"];
function SpatialPreview({ ds, features, quartiers, colorBy }: { ds: Dataset; features: any[]; quartiers: QGeo[]; colorBy: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dark = useContext(ThemeCtx);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const ctx = cv.getContext("2d"); if (!ctx) return;
    const W = cv.width = 760, H = cv.height = 520; ctx.clearRect(0, 0, W, H);
    const rings = (g: any): number[][][] => (!g ? [] : g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p: any) => p[0]) : []);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    quartiers.forEach(q => rings(q.geometry).forEach(r => r.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); })));
    const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180), pad = 14;
    const s = Math.min((W - 2 * pad) / ((maxX - minX) * k), (H - 2 * pad) / (maxY - minY));
    const ox = (W - (maxX - minX) * k * s) / 2, oy = (H - (maxY - minY) * s) / 2;
    const P = (x: number, y: number): [number, number] => [ox + (x - minX) * k * s, H - oy - (y - minY) * s];
    const path = (r: number[][]) => { r.forEach(([x, y], i) => { const [a, b] = P(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); };
    ctx.fillStyle = dark ? "#0b1b2b" : "#e9eef1"; ctx.fillRect(0, 0, W, H);
    quartiers.forEach(q => rings(q.geometry).forEach(r => { ctx.beginPath(); path(r); ctx.closePath(); ctx.fillStyle = dark ? "#13293d" : "#cdd8df"; ctx.fill(); ctx.strokeStyle = dark ? "#35506a" : "#9fb2bf"; ctx.lineWidth = 0.7; ctx.stroke(); }));
    const col = colorOf(ds);
    let breaks: number[] | null = null;
    if (colorBy && ds.kind === "polygones") {
      const v = features.map(f => Number(f.properties?.[colorBy])).filter(Number.isFinite).sort((a, b) => a - b);
      if (v.length) breaks = [0.2, 0.4, 0.6, 0.8].map(p => v[Math.floor(p * (v.length - 1))]);
    }
    features.forEach(f => {
      const g = f.geometry; if (!g) return;
      if (g.type === "Point") { const [a, b] = P(g.coordinates[0], g.coordinates[1]); ctx.beginPath(); ctx.arc(a, b, 2.2, 0, 7); ctx.fillStyle = col; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1; }
      else if (g.type === "LineString" || g.type === "MultiLineString") {
        (g.type === "LineString" ? [g.coordinates] : g.coordinates).forEach((l: number[][]) => { ctx.beginPath(); path(l); ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 0.9; ctx.stroke(); ctx.globalAlpha = 1; });
      } else {
        let fill = col + "55";
        if (breaks) { const x = Number(f.properties?.[colorBy!]); if (!Number.isFinite(x)) fill = "#cbd5e1"; else { const c = breaks.filter(b => x > b).length; fill = RAMP[Math.min(4, c)]; } }
        rings(g).forEach(r => { ctx.beginPath(); path(r); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = ds.id === "communes" ? "#334155" : "rgba(255,255,255,.7)"; ctx.lineWidth = ds.id === "communes" ? 2 : 0.5; ctx.stroke(); });
      }
    });
  }, [ds, features, quartiers, colorBy, dark]);
  return <canvas ref={ref} className="dn-canvas" aria-label={`Aperçu spatial : ${ds.name}`} />;
}

/* ---------- Telechargements ---------- */
function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}
function toCSV(cols: string[], rows: Row[]) {
  const esc = (v: any) => { if (v === null || v === undefined) return ""; const s = String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [cols.join(";"), ...rows.map(r => cols.map(c => esc(r[c])).join(";"))].join("\n");
}

/* ---------- Detail d'un jeu de donnees ---------- */
function DatasetDetail({ ds, quartiers, localites }: { ds: Dataset; quartiers: QGeo[]; localites: Loc[] | null }) {
  const [features, setFeatures] = useState<any[] | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<"apercu" | "table" | "stats" | "dico" | "dl">("apercu");
  const [col, setCol] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<string | null>(null);
  const [q, setQ] = useState(""); const [page, setPage] = useState(0); const [sort, setSort] = useState<{ c: string; d: 1 | -1 } | null>(null);
  const color = colorOf(ds);

  useEffect(() => {
    let alive = true; setFeatures(null); setErr(false); setTab("apercu"); setQ(""); setPage(0); setSort(null); setCol(null); setColorBy(null);
    dataFetch(ds.file).then(r => r.json()).then(j => {
      if (!alive) return;
      if (Array.isArray(j)) setFeatures(j.map(p => ({ properties: p, geometry: null }))); else setFeatures(j.features || []);
    }).catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [ds]);

  const cols = ds.columns;
  const rows: Row[] = useMemo(() => (features || []).map(f => {
    const r: Row = { ...(f.properties || {}) };
    if (f.geometry?.type === "Point") { r.lon = +f.geometry.coordinates[0].toFixed(6); r.lat = +f.geometry.coordinates[1].toFixed(6); }
    return r;
  }), [features]);
  const allCols = useMemo(() => (ds.kind === "points" ? [...cols, "lon", "lat"] : cols), [cols, ds.kind]);
  const meta = useMemo(() => allCols.map(c => {
    const vals = rows.map(r => r[c]); const filled = vals.filter(v => v !== null && v !== undefined && v !== "");
    const numeric = filled.length > 0 && filled.every(v => typeof v === "number");
    return { c, numeric, filled: filled.length, pct: rows.length ? (filled.length / rows.length) * 100 : 0, example: filled[0], stats: numeric ? numericStats(filled as number[]) : null };
  }), [allCols, rows]);
  const numericCols = meta.filter(m => m.numeric).map(m => m.c);
  const activeCol = col && allCols.includes(col) ? col : (meta.find(m => m.numeric && m.c === "population")?.c ?? meta.find(m => m.numeric && !/(^|_)(id|index)$|^row_|^col_|^lon$|^lat$/.test(m.c))?.c ?? allCols[0]);

  const filtered = useMemo(() => {
    let r = rows; const t = q.trim().toLowerCase();
    if (t) r = r.filter(x => allCols.some(c => String(x[c] ?? "").toLowerCase().includes(t)));
    if (sort) r = [...r].sort((a, b) => { const x = a[sort.c], y = b[sort.c]; if (x == null) return 1; if (y == null) return -1; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr")) * sort.d; });
    return r;
  }, [rows, q, sort, allCols]);
  const PAGE = 12; const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const shownCols = allCols.slice(0, 9);

  const tabs: [typeof tab, string, any][] = [["apercu", "Aperçu", <MapPinned size={14} />], ["table", "Table", <Table2 size={14} />], ["stats", "Statistiques", <BarChart3 size={14} />], ["dico", "Dictionnaire", <BookOpen size={14} />], ["dl", "Téléchargement", <Download size={14} />]];
  const am = meta.find(m => m.c === activeCol);
  const hist = useMemo(() => (am?.numeric ? histogram(rows.map(r => r[activeCol]).filter(v => typeof v === "number")) : []), [am, rows, activeCol]);
  const cat = useMemo(() => {
    if (!am || am.numeric) return [];
    const m = new globalThis.Map<string, number>(); rows.forEach(r => { const v = r[activeCol]; if (v !== null && v !== undefined && v !== "") m.set(String(v), (m.get(String(v)) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, n]) => ({ label: label.length > 22 ? label.slice(0, 21) + "…" : label, n }));
  }, [am, rows, activeCol]);

  return (
    <div className="dn-detail" style={{ ["--c" as any]: color }}>
      <div className="dn-detail-head">
        <span className="dn-ico">{iconOf(ds)}</span>
        <div><small>{kindLabel(ds.kind).toUpperCase()} • ÉCHELLE : {ds.scale.toUpperCase()}</small><h3>{ds.name}</h3><p>{ds.description}</p></div>
      </div>
      <div className="dn-tabs">{tabs.map(([k, l, i]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{i}{l}</button>)}</div>
      {err && <div className="dn-state"><AlertTriangle size={18} /> Impossible de charger ce fichier.</div>}
      {!features && !err && <div className="dn-state"><span className="dn-spin" /> Chargement de {fmtSize(ds.bytes)}…</div>}
      {features && tab === "apercu" && (
        <div className="dn-apercu">
          <div className="dn-map">
            {ds.kind === "table" ? <div className="dn-state"><Info size={18} /> Table sans géométrie : voir l'onglet « Table » et le panneau d'appariement ci-dessus.</div> : <SpatialPreview ds={ds} features={features} quartiers={quartiers} colorBy={colorBy} />}
            {ds.kind === "polygones" && numericCols.length > 0 && (
              <label className="dn-colorby">Colorier par
                <select value={colorBy ?? ""} onChange={e => setColorBy(e.target.value || null)}><option value="">Couleur unique</option>{numericCols.filter(c => !/_id|row_index|col_index/.test(c)).map(c => <option key={c} value={c}>{c}</option>)}</select>
                {colorBy && <span className="dn-ramp">{RAMP.map(c => <i key={c} style={{ background: c }} />)}<em>quintiles</em></span>}
              </label>
            )}
          </div>
          <dl className="dn-meta">
            {[["Entités", fmtN(ds.count)], ["Géométrie", ds.geometry], ["Champs", String(allCols.length)], ["Poids", fmtSize(ds.bytes)], ["Millésime", ds.year], ["Statut", ds.status]].map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
            <div className="wide"><dt>Source</dt><dd>{ds.source}</dd></div>
            {ds.indicators.length > 0 && <div className="wide"><dt>Indicateurs portés</dt><dd>{ds.indicators.join(" • ")}</dd></div>}
            {ds.notes && <div className="wide note"><dt>Note de traitement</dt><dd>{ds.notes}</dd></div>}
          </dl>
        </div>
      )}
      {features && tab === "table" && (
        <div className="dn-table-wrap">
          <div className="dn-table-tools">
            <label className="dn-search"><Search size={14} /><input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Rechercher dans la table…" /></label>
            <span>{fmtN(filtered.length)} ligne{filtered.length > 1 ? "s" : ""}{allCols.length > shownCols.length ? ` • ${shownCols.length} champs sur ${allCols.length} affichés` : ""}</span>
          </div>
          <div className="dn-scroll"><table className="dn-table"><thead><tr>{shownCols.map(c => <th key={c} onClick={() => { setSort(s => s?.c === c ? { c, d: (-s.d) as 1 | -1 } : { c, d: 1 }); setPage(0); }}>{c}<ArrowUpDown size={11} /></th>)}</tr></thead>
            <tbody>{shown.map((r, i) => <tr key={i}>{shownCols.map(c => <td key={c} className={typeof r[c] === "number" ? "num" : ""}>{r[c] === null || r[c] === undefined || r[c] === "" ? <em>—</em> : typeof r[c] === "number" ? (Number.isInteger(r[c]) ? String(r[c]) : fmtN(r[c], 3)) : String(r[c])}</td>)}</tr>)}</tbody></table></div>
          <div className="dn-pager"><button disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button><span>Page {page + 1} / {pages}</span><button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button></div>
        </div>
      )}
      {features && tab === "stats" && (
        <div className="dn-stats">
          <div className="dn-stats-pick"><label>Champ analysé<select value={activeCol} onChange={e => setCol(e.target.value)}>{allCols.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
            {am?.stats ? <div className="dn-kv">{[["Valeurs", fmtN(am.stats.n)], ["Minimum", fmtN(am.stats.min, 2)], ["Q1", fmtN(am.stats.q1, 2)], ["Médiane", fmtN(am.stats.median, 2)], ["Moyenne", fmtN(am.stats.mean, 2)], ["Q3", fmtN(am.stats.q3, 2)], ["Maximum", fmtN(am.stats.max, 2)], ["Écart-type", fmtN(am.stats.sd, 2)]].map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}</div> : <p className="dn-muted">Champ non numérique : répartition des 10 valeurs les plus fréquentes.</p>}
            {am && <p className="dn-muted">Complétude : <b>{am.pct.toFixed(1)} %</b> ({fmtN(am.filled)} / {fmtN(rows.length)} renseignées)</p>}</div>
          <div className="dn-chart"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={am?.numeric ? hist : cat} layout={am?.numeric ? "horizontal" : "vertical"} margin={{ top: 8, right: 12, left: am?.numeric ? 0 : 60, bottom: 4 }}>
              <CartesianGrid stroke="rgba(15,42,58,.08)" vertical={!!am?.numeric ? false : true} horizontal={!!am?.numeric} />
              {am?.numeric ? <><XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} width={36} /></> : <><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={120} /></>}
              <Tooltip formatter={(v: any) => [fmtN(Number(v)), "Entités"]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="n" fill={color} radius={am?.numeric ? [5, 5, 0, 0] : [0, 5, 5, 0]} />
            </BarChart></ResponsiveContainer></div>
        </div>
      )}
      {features && tab === "dico" && (
        <div className="dn-scroll"><table className="dn-table dico"><thead><tr><th>Champ</th><th>Type</th><th>Complétude</th><th>Exemple</th></tr></thead>
          <tbody>{meta.map(m => <tr key={m.c}><td><code>{m.c}</code></td><td>{m.numeric ? "numérique" : "texte"}</td><td><span className="dn-bar"><i style={{ width: `${m.pct}%`, background: m.pct > 95 ? "#16a34a" : m.pct > 60 ? "#f59e0b" : "#dc2626" }} /></span> {m.pct.toFixed(0)} %</td><td>{m.example === undefined ? <em>—</em> : String(m.example).slice(0, 40)}</td></tr>)}</tbody></table></div>
      )}
      {features && tab === "dl" && (
        <div className="dn-dl">
          <p>Seuls les formats réellement produits par le projet sont proposés. Le CSV (séparateur « ; », encodage UTF-8 avec BOM, lisible dans Excel) et le JSON sont générés à partir du fichier GeoJSON ou JSON source, sans modification des valeurs.</p>
          <div className="dn-dl-grid">
            {ds.formats.includes("GeoJSON") && <a className="dn-dl-card" href={ds.file} download><FileJson /><b>GeoJSON</b><small>Géométries + attributs • {fmtSize(ds.bytes)}</small></a>}
            {ds.formats.includes("CSV") && <button className="dn-dl-card" onClick={() => download(`${ds.id}.csv`, toCSV(allCols, rows), "text/csv;charset=utf-8")}><FileSpreadsheet /><b>CSV</b><small>Attributs{ds.kind === "points" ? " + lon/lat" : ""} • {fmtN(rows.length)} lignes</small></button>}
            {ds.formats.includes("JSON") && (ds.kind === "table" ? <a className="dn-dl-card" href={ds.file} download><FileText /><b>JSON</b><small>Table • {fmtSize(ds.bytes)}</small></a> : <button className="dn-dl-card" onClick={() => download(`${ds.id}.json`, JSON.stringify(rows, null, 1), "application/json")}><FileText /><b>JSON</b><small>Tableau d'attributs • {fmtN(rows.length)} objets</small></button>)}
          </div>
          <p className="dn-muted">Formats non proposés ici : Shapefile. Le classeur XLSX et le CSV des résultats sont téléchargeables depuis la page Ségrégation.</p>
          {ds.id === "census_localites" && localites && <p className="dn-muted">{localites.length} localités.</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- Page ---------- */
const STATUT: Record<string, { label: string; color: string; icon: any }> = {
  apparie: { label: "Apparié", color: "#16a34a", icon: CheckCircle2 },
  probable: { label: "Appariement probable", color: "#d97706", icon: HelpCircle },
  commune_differente: { label: "Commune différente", color: "#ea580c", icon: AlertTriangle },
  ambigu: { label: "Ambigu", color: "#dc2626", icon: HelpCircle },
  sans_polygone: { label: "Sans polygone", color: "#7f1d1d", icon: AlertTriangle },
};

export default function Donnees({ quartiers, census, navigate }: { quartiers: QGeo[]; census: Census | null; navigate: (p: string) => void }) {
  const [catalog, setCatalog] = useState<Dataset[] | null>(null);
  const [locs, setLocs] = useState<Loc[] | null>(null);
  const [sel, setSel] = useState("quartiers");
  const [cat, setCat] = useState("Toutes les données");
  const [q, setQ] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dataFetch("/data/datasets_catalog.json").then(r => r.json()).then(setCatalog).catch(() => setCatalog([]));
    dataFetch("/data/census_localites.json").then(r => r.json()).then(setLocs).catch(() => setLocs([]));
  }, []);

  const list = (catalog || []).filter(d => (cat === "Toutes les données" || categoryOf(d) === cat) && (!q || (d.name + d.description + d.source).toLowerCase().includes(q.toLowerCase())));
  const current = catalog?.find(d => d.id === sel);

  const match = useMemo(() => {
    if (!locs) return null;
    const by: Record<string, { n: number; pop: number }> = {};
    locs.forEach(l => { const b = (by[l.statut] ||= { n: 0, pop: 0 }); b.n++; b.pop += l.population; });
    const total = locs.reduce((s, l) => s + l.population, 0) || 1;
    return { by, total };
  }, [locs]);
  const qPop = quartiers.reduce((s, x) => s + (x.population || 0), 0);
  const qZero = quartiers.filter(x => !x.population).length;

  return (
    <div className="dn">
      <DonneesHub catalog={catalog} quartiers={quartiers as any} census={census} cat={cat} setCat={setCat} />

      {/* ===== FIABILITE : appariement RGPH-5 <-> quartiers ===== */}
      <section className="dn-sec dn-quality">
        <div className="dn-in">
          <Reveal><div className="dn-head"><ShieldAlert size={22} /><div><div className="dn-kick">QUALITÉ DES DONNÉES</div><h2>Population : ce que couvrent les quartiers</h2><p>Le recensement RGPH-5 (2023) compte {census ? fmtN(census.population) : "—"} habitants dans {census?.localites_recensees ?? 70} localités. La couche de quartiers n'en rattache pour l'instant que {fmtN(qPop)} ({census ? ((qPop / census.population) * 100).toFixed(1) : "—"} %) : {qZero} quartiers n'ont aucune population associée, faute de localité du recensement qui leur corresponde sans ambiguïté.</p></div></div></Reveal>
          {match && census && (
            <Reveal delay={100}><div className="dn-match">
              <div className="dn-stackbar">{Object.entries(STATUT).map(([k, s]) => { const b = match.by[k]; return b ? <div key={k} style={{ width: `${(b.pop / match.total) * 100}%`, background: s.color }} title={`${s.label} : ${fmtN(b.pop)} hab.`}><b>{((b.pop / match.total) * 100).toFixed(0)} %</b></div> : null; })}</div>
              <div className="dn-legend">{Object.entries(STATUT).map(([k, s]) => { const b = match.by[k]; if (!b) return null; const I = s.icon; return <div key={k}><I size={16} color={s.color} /><b>{s.label}</b><span>{b.n} localité{b.n > 1 ? "s" : ""} • {fmtN(b.pop)} hab.</span></div>; })}</div>
              <details className="dn-details"><summary><GitMerge size={14} /> Voir les {locs!.filter(l => l.statut !== "apparie").length} localités à apparier</summary>
                <div className="dn-scroll"><table className="dn-table"><thead><tr><th>Localité (RGPH-5)</th><th>Commune</th><th>Population</th><th>Polygone proposé</th><th>Statut</th></tr></thead>
                  <tbody>{locs!.filter(l => l.statut !== "apparie").sort((a, b) => b.population - a.population).map(l => <tr key={l.localite}><td>{l.localite}</td><td>{l.commune}</td><td className="num">{fmtN(l.population)}</td><td>{l.polygone ? `${l.polygone}${l.polygone_commune ? ` (${l.polygone_commune})` : ""}` : <em>aucun</em>}</td><td><span className="dn-pill" style={{ background: STATUT[l.statut]?.color }}>{STATUT[l.statut]?.label}</span></td></tr>)}</tbody></table></div>
                <p className="dn-muted">Ces propositions n'ont <b>pas</b> été appliquées aux cartes : elles attendent une validation (variantes de numérotation 1/I, 2/II ; plusieurs unités regroupées en un polygone ; quartier présent sous deux communes).</p>
              </details>
            </div></Reveal>
          )}
        </div>
      </section>

      {/* ===== CATALOGUE ===== */}
      <section className="dn-sec dn-catalog">
        <div className="dn-in">
          <Reveal><div className="dn-head"><Database size={22} /><div><div className="dn-kick">CATALOGUE</div><h2>{list.length} jeu{list.length > 1 ? "x" : ""} de données à explorer</h2><p>Sélectionnez une couche pour ouvrir sa fiche : aperçu spatial, table, statistiques, dictionnaire et téléchargement.</p></div></div></Reveal>
          <div className="dn-filters">
            <label className="dn-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une couche, une source…" /></label>
            <div className="dn-chips"><span className="dn-catlabel">Catégorie : <b>{cat}</b></span>{cat !== "Toutes les données" && <button onClick={() => setCat("Toutes les données")}>Tout afficher</button>}</div>
          </div>
          <div className="dn-cards">
            {list.map((d, i) => (
              <Reveal key={d.id} delay={(i % 4) * 60}>
                <button className={`dn-card ${sel === d.id ? "on" : ""}`} style={{ ["--c" as any]: colorOf(d) }} onClick={() => { setSel(d.id); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>
                  <span className="dn-ico">{iconOf(d)}</span>
                  <b>{d.name}</b>
                  <small>{kindLabel(d.kind)} • {d.scale}</small>
                  <div className="dn-card-foot"><strong>{fmtN(d.count)}</strong><span>{d.formats.join(" · ")}</span></div>
                  <em>{d.year}</em>
                </button>
              </Reveal>
            ))}
            {catalog && list.length === 0 && <p className="dn-muted">Aucune couche ne correspond.</p>}
          </div>
          <div ref={detailRef} style={{ scrollMarginTop: 110 }}>{current && <DatasetDetail ds={current} quartiers={quartiers} localites={locs} />}</div>
        </div>
      </section>

      {/* ===== TRAITEMENTS ===== */}
      <section className="dn-sec dn-process">
        <div className="dn-in">
          <Reveal><div className="dn-head"><GitMerge size={22} /><div><div className="dn-kick">TRAITEMENTS</div><h2>De la donnée brute à la carte</h2><p>Les opérations appliquées avant publication, dans l'ordre.</p></div></div></Reveal>
          <div className="dn-steps">
            {[
              ["Lecture", "GeoPackage et shapefiles lus tels que fournis ; encodage des attributs corrigé lorsque nécessaire (cp1252 pour le réseau routier)."],
              ["Reprojection", "Coordonnées UTM 28N (EPSG:32628) converties en WGS 84 (EPSG:4326) pour l'affichage web."],
              ["Jointures", "Les couches sont reliées par l'identifiant de quartier (quartier_id), vérifié par nom et commune : 65 quartiers sur 65, 2 170 cellules de grille sur 2 170."],
              ["Calculs dérivés", "Densité Religion = nb_religion / surface_km² (même définition que les 7 autres densités). Aucun indice ACP n'est recalculé : les valeurs fournies sont reprises."],
              ["Classes", "Les cartes utilisent des quartiles (Q1–Q4) calculés sur les valeurs affichées ; les valeurs manquantes sont grisées, jamais remplacées par zéro."],
              ["Publication", "Fichiers GeoJSON statiques ; CSV et JSON générés à la demande à partir de ces fichiers."],
            ].map(([t, x], i) => <Reveal key={t} delay={i * 70}><div className="dn-step"><span>{i + 1}</span><h4>{t}</h4><p>{x}</p></div></Reveal>)}
          </div>
        </div>
      </section>

      {/* ===== LIMITES + CITATION + API ===== */}
      <section className="dn-sec dn-end">
        <div className="dn-in dn-three">
          <Reveal><div className="dn-box warn"><h4><AlertTriangle size={16} /> Limites connues</h4>
            <ul><li>Seule la population a un millésime connu (RGPH-5, 2023) ; les couches d'équipements et d'accessibilité sont marquées « Non précisée ».</li>
              <li>Trois localités du recensement (12 781 habitants) n'ont pas de polygone : la population des quartiers couvre donc 96,7 % du total RGPH-5.</li>
              <li>Les résultats de ségrégation couvrent les 65 quartiers (la couche d'origine comptait 68 polygones : trois polygones sans population ont été rattachés à Thialy, Diakhao et Nguinth). Cité Senghor II : superficie de 0,026 km² à vérifier ; Keur Mbaye Diakhaté, sans district de recensement, a ses valeurs d'instruction remplacées par la médiane dans la classification.</li></ul></div></Reveal>
          <Reveal delay={90}><div className="dn-box cite"><h4><Quote size={16} /> Comment citer</h4>
            <p>Dione, A. A. & Sissokho Sy, M. O. (2026). <i>Thiès — Ségrégation socio-spatiale : base de données et WebGIS</i>. UFR SI, Université Iba Der Thiam de Thiès. Population : ANSD, RGPH-5 (2023).</p>
            <small>Mentionnez la couche et la date de consultation.</small></div></Reveal>
          <Reveal delay={180}><div className="dn-box api"><h4><Server size={16} /> Accès programmatique</h4>
            <p>Les fichiers sont servis en statique à l'adresse <code>/data/…</code> (par exemple <code>/data/quartiers_thies.geojson</code>). Une API REST dédiée (quartiers, communes, infrastructures, indicateurs) est <b>prévue mais non encore disponible</b>.</p>
            <button onClick={() => navigate("/cartotheque")}>Voir les cartes <ChevronRight size={13} /></button></div></Reveal>
        </div>
      </section>
    </div>
  );
}
