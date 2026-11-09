import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Activity, Building2, LayoutDashboard, MapPinned, Route, Users, GraduationCap, Wallet, TrendingUp, Scale, Sparkles,
  Home, Gauge, Grid3x3, ShieldQuestion, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { INFRA_FAMILIES, ACCESS_INDICATORS, computeStats, quartileClass, RAMP_POPULATION, RAMP_DENSITE, RAMP_ACCESS, RAMP_INSTRUCTION, RAMP_NIVEAUVIE } from "./Geoportail";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip, BarChart as RBarChart, Bar as RBar, XAxis, YAxis,
  CartesianGrid, AreaChart, Area, ScatterChart, Scatter, ZAxis, LineChart, Line,
} from "recharts";
import { POP as POP_HISTORY } from "./Histoire";
import "./Dashboard.css";
import type { QuartierFull } from "./Geoportail";

type Quartier = QuartierFull & { annee: number; geometry?: any };

type CensusSummary = {
  annee: number; localites_recensees: number; population: number; menages: number; hommes: number; femmes: number;
  par_commune: Record<string, { population: number; menages: number; hommes: number; femmes: number }>;
};

const THIES_COMMUNES = ["THIES EST", "THIES OUEST", "THIES NORD"] as const;
// Les couleurs passent par des variables CSS : le meme graphique suit le mode clair / sombre.
const TIP = { background: "var(--db-tip)", border: "1px solid var(--db-line)", borderRadius: 10, color: "var(--db-ink)", fontSize: 11 } as const;
const fmtInt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

function Eyebrow({ text }: { text: string }) {
  return <small className="dashboard-eyebrow">{text}</small>;
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="dashboard-kpi">
      <span className="kpi-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

/* ------------------------------------------------------------------
   Carte choroplethe interactive par quartier (indicateur au choix)
   ------------------------------------------------------------------ */
type MapInd = { id: string; label: string; unit: string; ramp: string[]; get: (q: Quartier) => number | null };
const MAP_INDICATORS: MapInd[] = [
  { id: "population", label: "Population", unit: "habitants", ramp: RAMP_POPULATION, get: q => (q.population > 0 ? q.population : null) },
  { id: "densite_pop", label: "Densité de population", unit: "hab./km²", ramp: RAMP_POPULATION, get: q => (q.surface_km2 && q.population > 0 ? q.population / q.surface_km2 : null) },
  { id: "acc_globale", label: "Accessibilité globale", unit: "indice", ramp: RAMP_ACCESS, get: q => q.acc_globale },
  { id: "niveau_vie", label: "Richesse matérielle", unit: "indice 0–1", ramp: RAMP_NIVEAUVIE, get: q => q.ind_niveau_vie_0_1 },
  { id: "instruction", label: "Niveau d'instruction", unit: "indice 0–1", ramp: RAMP_INSTRUCTION, get: q => q.ind_instruction_0_1 },
  ...INFRA_FAMILIES.map(f => ({ id: `dens_${f.key}`, label: `Densité — ${f.label}`, unit: "éq./km²", ramp: RAMP_DENSITE, get: (q: Quartier) => (q as any)[`dens_${f.key}`] as number | null })),
];
const BASES = [
  { key: "sat", label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imagerie © Esri" },
  { key: "plan", label: "Plan", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap" },
  { key: "none", label: "Sans fond", url: "", attr: "" },
] as const;
const nf = (v: number) => (Math.abs(v) >= 100 ? fmtInt(v) : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

function FitQ({ qs }: { qs: Quartier[] }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    qs.forEach(q => {
      const g = q.geometry; if (!g) return;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      polys.forEach((p: any) => p[0].forEach(([x, y]: number[]) => pts.push([y, x])));
    });
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [8, 8] });
  }, [map, qs]);
  return null;
}

import { askAssistant, assistantStore } from "./assistant/store";
function DashMap({ quartiers }: { quartiers: Quartier[] }) {
  const [ind, setInd] = useState("population");
  const [base, setBase] = useState<string>("sat");
  const def = MAP_INDICATORS.find(i => i.id === ind)!;
  const withGeo = useMemo(() => quartiers.filter(q => q.geometry), [quartiers]);
  const stats = useMemo(() => computeStats(withGeo.map(def.get).filter((v): v is number => v !== null && Number.isFinite(v))), [withGeo, def]);
  const fc = useMemo(() => ({ type: "FeatureCollection" as const, features: withGeo.map(q => ({ type: "Feature" as const, properties: q, geometry: q.geometry })) }), [withGeo]);
  const bm = BASES.find(b => b.key === base)!;
  useEffect(() => { assistantStore.setMap({ source: "dashboard", indicatorId: ind, layer: "quartiers" }); return () => assistantStore.setMap(null); }, [ind]);
  const colorOf = (q: Quartier) => { const c = quartileClass(def.get(q), stats); return c === null ? "#9aa7b1" : def.ramp[c]; };
  const edges = stats ? [stats.min, stats.q1, stats.q2, stats.q3, stats.max] : [];
  return (
    <div className="dm">
      <div className="dm-bar">
        <select value={ind} onChange={e => setInd(e.target.value)} aria-label="Indicateur affiché">
          {MAP_INDICATORS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
        <button className="geo-analyze-btn dm-analyze" onClick={() => askAssistant({ type: "analyze", ctx: { source: "dashboard", indicatorId: ind, layer: "quartiers" } })}>✨ Analyser cette carte</button>
        <div className="dm-bases">{BASES.map(b => <button key={b.key} className={base === b.key ? "on" : ""} onClick={() => setBase(b.key)}>{b.label}</button>)}</div>
      </div>
      <div className="dm-map">
        <MapContainer center={[14.79, -16.93]} zoom={12} preferCanvas scrollWheelZoom={false} className="dm-leaflet">
          {bm.url && <TileLayer key={bm.key} url={bm.url} attribution={bm.attr} maxZoom={19} />}
          <GeoJSON key={ind + base} data={fc as any}
            style={f => ({ color: base === "none" ? "#64748b" : "#ffffff", weight: 1, fillColor: colorOf(f!.properties as Quartier), fillOpacity: base === "none" ? 0.95 : 0.78 })}
            onEachFeature={(f, layer) => {
              const q = f.properties as Quartier; const v = def.get(q);
              layer.bindTooltip(`<b>${q.nom}</b><br/>${q.commune.replace("Thies", "Thiès")}<br/>${def.label} : ${v === null ? "non renseignée" : `${nf(v)} ${def.unit}`}`, { sticky: true });
            }} />
          <FitQ qs={withGeo} />
        </MapContainer>
        <div className="dm-legend">
          <b>{def.label}</b><small>{def.unit} · quartiles</small>
          {[3, 2, 1, 0].map(i => (
            <div key={i}><i style={{ background: def.ramp[i] }} />Q{i + 1} · {edges.length ? `${nf(edges[i])} – ${nf(edges[i + 1])}` : "—"}</div>
          ))}
          <div><i style={{ background: "#9aa7b1" }} />Non renseigné</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */
export default function Dashboard({ quartiers, census }: { quartiers: Quartier[]; census: CensusSummary | null }) {
  const [tab, setTab] = useState("apercu");
  const [giniInstr, setGiniInstr] = useState<number | null>(null);
  useEffect(() => { fetch("/data/resultats_indices.json").then(r => r.json()).then(j => setGiniInstr(j.indices.find((i: any) => String(i.indicateur).startsWith("Niveau d’instruction"))?.gini ?? null)).catch(() => {}); }, []);
  const tabs = [
    { id: "apercu", label: "Vue d'ensemble", icon: <LayoutDashboard size={17} /> },
    { id: "population", label: "Population", icon: <Users size={17} /> },
    { id: "habitat", label: "Richesse matérielle & instruction", icon: <GraduationCap size={17} /> },
    { id: "equipements", label: "Équipements", icon: <Building2 size={17} /> },
    { id: "accessibilite", label: "Accessibilité", icon: <Route size={17} /> },
    { id: "inegalites", label: "Inégalités & ségrégation", icon: <Activity size={17} /> },
  ];

  const valid = useMemo(() => quartiers.filter(q => q.population > 0), [quartiers]);
  const attached = valid.reduce((s, q) => s + q.population, 0);
  const totalPop = census?.population ?? attached;
  const totalMenages = census?.menages ?? valid.reduce((s, q) => s + q.menages, 0);
  const totalHommes = census?.hommes ?? valid.reduce((s, q) => s + q.hommes, 0);
  const totalFemmes = census?.femmes ?? valid.reduce((s, q) => s + q.femmes, 0);
  const surf = quartiers.reduce((s, q) => s + (q.surface_km2 || 0), 0);

  const families = useMemo(() => INFRA_FAMILIES.map(f => ({ ...f, n: quartiers.reduce((s, q) => s + (((q as any)[`nb_${f.key}`] as number) || 0), 0) })), [quartiers]);
  const equipTotal = families.reduce((s, f) => s + f.n, 0);
  const top10 = useMemo(() => [...valid].sort((a, b) => b.population - a.population).slice(0, 10), [valid]);
  const topMax = top10[0]?.population || 1;
  const communeData = THIES_COMMUNES.map(c => ({ name: c === "THIES EST" ? "Thiès Est" : c === "THIES OUEST" ? "Thiès Ouest" : "Thiès Nord", value: census?.par_commune?.[c]?.population ?? 0 }));
  const ranked = useMemo(() => quartiers.filter(q => q.acc_globale !== null).sort((a, b) => (b.acc_globale as number) - (a.acc_globale as number)), [quartiers]);
  const best = ranked.slice(0, 6), worst = ranked.slice(-6).reverse();
  const histData = POP_HISTORY.map(p => ({ y: p.y, v: p.v }));

  return (
    <section className="dashboard-page">
      <header className="db-hero">
        <div className="db-hero-copy">
          <small className="db-hero-eyebrow">Thiès GéoPortail</small>
          <h1>Tableau de Bord</h1>
          <p>Ségrégation socio-spatiale dans la ville de Thiès. Visualisez les principaux indicateurs, explorez les disparités territoriales et comparez les quartiers.</p>
        </div>
      </header>

      <div className="dashboard-shell">
        <aside className="dashboard-sidebar">
          {tabs.map(item => (
            <button key={item.id} className={tab === item.id ? "dashboard-tab active" : "dashboard-tab"} onClick={() => setTab(item.id)}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
          <div className="sidebar-spacer" />
          <div className="sidebar-summary-note">Recensement RGPH-5 • ANSD • 2023<br />{quartiers.length} quartiers • 3 communes</div>
        </aside>

        <main className="dashboard-main">
          {tab === "apercu" && (
            <>
              <div className="db-kpis">
                <div className="db-kpi" style={{ ["--k" as any]: "#0f766e" }}><span className="db-kpi-ic"><Users size={20} /></span><div><small>Population recensée</small><b>{fmtInt(totalPop)}</b><em>{fmtInt(attached)} rattachés aux quartiers</em></div></div>
                <div className="db-kpi" style={{ ["--k" as any]: "#7c3aed" }}><span className="db-kpi-ic"><MapPinned size={20} /></span><div><small>Quartiers analysés</small><b>{quartiers.length}</b><em>3 communes · {nf(surf)} km²</em></div></div>
                <div className="db-kpi" style={{ ["--k" as any]: "#16a34a" }}><span className="db-kpi-ic"><Building2 size={20} /></span><div><small>Équipements</small><b>{fmtInt(equipTotal)}</b><em>8 familles recensées</em></div></div>
                <div className="db-kpi" style={{ ["--k" as any]: "#ea580c" }}><span className="db-kpi-ic"><Home size={20} /></span><div><small>Ménages</small><b>{fmtInt(totalMenages)}</b><em>{totalMenages ? (totalPop / totalMenages).toFixed(1) : "—"} pers. / ménage</em></div></div>
                <div className="db-kpi" style={{ ["--k" as any]: "#e11d48" }}><span className="db-kpi-ic"><ShieldQuestion size={20} /></span><div><small>Gini · niveau d’instruction</small><b>{giniInstr == null ? "—" : giniInstr.toFixed(3).replace(".", ",")}</b><em>Résultat validé · 68 quartiers</em></div></div>
              </div>

              <div className="db-row db-row-a">
                <div className="dashboard-chart-card">
                  <div className="dashboard-card-head"><h3>Carte des quartiers</h3><Grid3x3 size={18} /></div>
                  <DashMap quartiers={quartiers} />
                </div>
                <div className="dashboard-chart-card">
                  <div className="dashboard-card-head"><h3>Population par quartier <span>(Top 10)</span></h3><Users size={18} /></div>
                  <div className="db-hbars">
                    {top10.map((q, i) => (
                      <div key={q.quartier_id} className="db-hbar">
                        <span title={q.nom}>{q.nom}</span>
                        <div><i style={{ width: `${(q.population / topMax) * 100}%`, animationDelay: `${i * 50}ms` }} /></div>
                        <b>{fmtInt(q.population)}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="db-row db-row-b">
                <div className="dashboard-chart-card">
                  <div className="dashboard-card-head"><h3>Répartition des infrastructures</h3><Building2 size={18} /></div>
                  <div className="db-donut">
                    <div className="db-donut-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={families} dataKey="n" nameKey="label" innerRadius="62%" outerRadius="94%" paddingAngle={2} stroke="none">
                            {families.map(f => <Cell key={f.key} fill={f.color} />)}
                          </Pie>
                          <RTooltip contentStyle={TIP} formatter={(v: any, n: any) => [fmtInt(v), n]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="db-donut-c"><b>{fmtInt(equipTotal)}</b><small>équipements</small></div>
                    </div>
                    <ul className="db-donut-leg">
                      {families.map(f => <li key={f.key}><i style={{ background: f.color }} />{f.label}<b>{fmtInt(f.n)}<small>{equipTotal ? ` · ${Math.round((f.n / equipTotal) * 100)} %` : ""}</small></b></li>)}
                    </ul>
                  </div>
                </div>

                <div className="dashboard-chart-card">
                  <div className="dashboard-card-head"><h3>Évolution de la population de Thiès</h3><TrendingUp size={18} /></div>
                  <div className="dashboard-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={histData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--db-grid)" />
                        <XAxis dataKey="y" tick={{ fontSize: 10, fill: "var(--db-tick)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--db-tick)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={38} />
                        <RTooltip contentStyle={TIP} formatter={(v: any) => [fmtInt(v) + " hab.", "Population"]} labelFormatter={(l: any) => `Année ${l}`} />
                        <Line type="monotone" dataKey="v" stroke="var(--db-accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--db-accent)" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="chart-caption">Sources historiques détaillées dans la page Histoire (Wikipédia, Le Soleil, ANSD).</p>
                </div>

                <div className="dashboard-chart-card">
                  <div className="dashboard-card-head"><h3>Quartiers les plus et moins accessibles</h3><Gauge size={18} /></div>
                  <div className="db-duo">
                    <div>
                      <div className="db-duo-h up"><ArrowUpRight size={14} /> Les mieux desservis</div>
                      {best.map((q, i) => <div key={q.quartier_id} className="db-duo-r"><span>{i + 1}</span><em>{q.nom}</em><b>{nf(q.acc_globale as number)}</b></div>)}
                    </div>
                    <div>
                      <div className="db-duo-h down"><ArrowDownRight size={14} /> Les moins desservis</div>
                      {worst.map((q, i) => <div key={q.quartier_id} className="db-duo-r"><span>{i + 1}</span><em>{q.nom}</em><b>{nf(q.acc_globale as number)}</b></div>)}
                    </div>
                  </div>
                  <p className="chart-caption">Accessibilité globale (score standardisé, moyenne des cellules de la grille 200 m par quartier).</p>
                </div>
              </div>

              <div className="db-row db-row-c">
                <div className="dashboard-chart-card">
                  <div className="dashboard-card-head"><h3>Population par commune</h3><MapPinned size={18} /></div>
                  <div className="dashboard-chart db-short">
                    <ResponsiveContainer width="100%" height="100%">
                      <RBarChart data={communeData} layout="vertical" margin={{ left: 4, right: 24, top: 6, bottom: 6 }}>
                        <CartesianGrid horizontal={false} stroke="var(--db-grid)" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "var(--db-tick)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--db-ink)" }} axisLine={false} tickLine={false} width={92} />
                        <RTooltip contentStyle={TIP} formatter={(v: any) => [fmtInt(v) + " hab.", "Population"]} />
                        <RBar dataKey="value" radius={[0, 8, 8, 0]} fill="var(--db-accent)" />
                      </RBarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="dashboard-chart-card">
                  <div className="dashboard-card-head"><h3>Répartition par sexe</h3><Users size={18} /></div>
                  <div className="db-sex">
                    <div className="db-sex-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[{ name: "Hommes", value: totalHommes }, { name: "Femmes", value: totalFemmes }]} dataKey="value" innerRadius="60%" outerRadius="92%" paddingAngle={3} stroke="none">
                            <Cell fill="#0ea5e9" /><Cell fill="#f472b6" />
                          </Pie>
                          <RTooltip contentStyle={TIP} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="dashboard-legend">
                      <span><i style={{ background: "#0ea5e9" }} />Hommes {fmtInt(totalHommes)}<small> · {Math.round((totalHommes / Math.max(1, totalHommes + totalFemmes)) * 100)} %</small></span>
                      <span><i style={{ background: "#f472b6" }} />Femmes {fmtInt(totalFemmes)}<small> · {Math.round((totalFemmes / Math.max(1, totalHommes + totalFemmes)) * 100)} %</small></span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          {tab === "population" && <PopulationTab quartiers={quartiers} />}
          {tab === "habitat" && <NiveauVieTab quartiers={quartiers} />}
          {tab === "equipements" && <EquipementsTab quartiers={quartiers} />}
          {tab === "accessibilite" && <AccessibiliteTab quartiers={quartiers} />}
          {tab === "inegalites" && <InegalitesTab quartiers={quartiers} />}
        </main>
      </div>
    </section>
  );
}

// ============================================================
// UTILITAIRES PARTAGES ENTRE LES ONGLETS
// ============================================================
function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function StatTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="stat-table">
      {rows.map(r => <div className="stat-table-row" key={r.label}><span>{r.label}</span><b>{r.value}</b></div>)}
    </div>
  );
}

// Visualisation compacte de distribution (min - Q1 - mediane - Q3 - max),
// en l'absence d'une vraie librairie de boxplot : une barre segmentee suffit
// a montrer l'etalement et l'asymetrie de la serie.
function DistributionBar({ stats, color }: { stats: ReturnType<typeof computeStats>; color: string }) {
  if (!stats) return null;
  const range = stats.max - stats.min || 1;
  const pct = (v: number) => ((v - stats.min) / range) * 100;
  return (
    <div className="dist-bar-wrap">
      <div className="dist-bar-track">
        <div className="dist-bar-box" style={{ left: `${pct(stats.q1)}%`, width: `${pct(stats.q3) - pct(stats.q1)}%`, background: color }} />
        <div className="dist-bar-median" style={{ left: `${pct(stats.median)}%` }} />
      </div>
      <div className="dist-bar-labels"><span>{fmt(stats.min)}</span><span>Q1 {fmt(stats.q1)}</span><span>Méd. {fmt(stats.median)}</span><span>Q3 {fmt(stats.q3)}</span><span>{fmt(stats.max)}</span></div>
    </div>
  );
}

function RankingList({ title, items, color, unit }: { title: string; items: { nom: string; commune: string; value: number }[]; color: string; unit?: string }) {
  return (
    <div className="ranking-list">
      <div className="ranking-title">{title}</div>
      {items.map((it, i) => (
        <div className="ranking-row" key={it.nom + i}>
          <span className="ranking-rank" style={{ background: color }}>{i + 1}</span>
          <div className="ranking-info"><b>{it.nom}</b><small>{it.commune}</small></div>
          <span className="ranking-value">{fmt(it.value, 1)}{unit || ""}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// ONGLET POPULATION
// ============================================================
function PopulationTab({ quartiers: allQ }: { quartiers: Quartier[] }) {
  // Les quartiers sans population appariée (0) sont exclus : ils fausseraient moyennes et classements.
  const quartiers = useMemo(() => allQ.filter(q => q.population > 0), [allQ]);
  const popStats = useMemo(() => computeStats(quartiers.map(q => q.population)), [quartiers]);
  const tailleMenageStats = useMemo(() => computeStats(quartiers.map(q => q.population / Math.max(1, q.menages))), [quartiers]);
  const sorted = useMemo(() => [...quartiers].sort((a, b) => b.population - a.population), [quartiers]);
  const totalH = quartiers.reduce((s, q) => s + q.hommes, 0);
  const totalF = quartiers.reduce((s, q) => s + q.femmes, 0);

  const binData = useMemo(() => {
    if (!popStats) return [];
    const nBins = 8;
    const step = (popStats.max - popStats.min) / nBins || 1;
    const bins = Array.from({ length: nBins }, (_, i) => ({
      label: `${Math.round(popStats.min + i * step)}`,
      count: 0,
    }));
    quartiers.forEach(q => {
      const idx = Math.min(nBins - 1, Math.floor((q.population - popStats.min) / step));
      bins[idx].count++;
    });
    return bins;
  }, [quartiers, popStats]);

  return (
    <div className="tab-content">
      <div className="dashboard-kpi-grid">
        <Kpi label="Population totale" value={quartiers.reduce((s, q) => s + q.population, 0).toLocaleString("fr-FR")} note="3 communes, RGPH-5 2023" />
        <Kpi label="Population moyenne / quartier" value={fmt(popStats?.mean, 0)} note={`Médiane : ${fmt(popStats?.median, 0)}`} />
        <Kpi label="Taille moyenne du ménage" value={fmt(tailleMenageStats?.mean, 1)} note="Personnes par ménage" />
        <Kpi label="Sex-ratio (H/F)" value={fmt((totalH / Math.max(1, totalF)) * 100, 1)} note="Hommes pour 100 femmes" />
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-chart-card">
          <Eyebrow text="DISTRIBUTION" />
          <h3>Répartition de la population par quartier</h3>
          <ResponsiveContainer width="100%" height={220}>
            <RBarChart data={binData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--db-grid)" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--db-tick)" }} />
              <YAxis tick={{ fontSize: 9, fill: "var(--db-tick)" }} allowDecimals={false} />
              <RTooltip contentStyle={TIP} />
              <RBar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} name="Nb. quartiers" />
            </RBarChart>
          </ResponsiveContainer>
          <DistributionBar stats={popStats} color="#22d3ee" />
        </div>

        <div className="dashboard-chart-card">
          <Eyebrow text="RÉPARTITION H / F" />
          <h3>Population par sexe</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <Pie data={[{ name: "Hommes", value: totalH }, { name: "Femmes", value: totalF }]} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={3}>
                <Cell fill="#22d3ee" /><Cell fill="#f472b6" />
              </Pie>
              <RTooltip contentStyle={TIP} />
            </PieChart>
          </ResponsiveContainer>
          <div className="dashboard-legend">
            <span><i style={{ background: "#22d3ee" }} /> Hommes — {totalH.toLocaleString("fr-FR")}</span>
            <span><i style={{ background: "#f472b6" }} /> Femmes — {totalF.toLocaleString("fr-FR")}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <RankingList title="5 quartiers les plus peuplés" color="#22d3ee" items={sorted.slice(0, 5).map(q => ({ nom: q.nom, commune: q.commune, value: q.population }))} />
        <RankingList title="5 quartiers les moins peuplés" color="#f59e0b" items={sorted.slice(-5).reverse().map(q => ({ nom: q.nom, commune: q.commune, value: q.population }))} />
      </div>

      <div className="dashboard-chart-card">
        <Eyebrow text="COURBE CUMULÉE" />
        <h3>Part cumulée de la population, des quartiers les moins aux plus peuplés</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={useMemo(() => {
            const asc = [...quartiers].sort((a, b) => a.population - b.population);
            const total = asc.reduce((s, q) => s + q.population, 0) || 1;
            let cum = 0;
            return asc.map((q, i) => { cum += q.population; return { i: i + 1, pct: Math.round((cum / total) * 1000) / 10 }; });
          }, [quartiers])}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-grid)" />
            <XAxis dataKey="i" tick={{ fontSize: 9, fill: "var(--db-tick)" }} label={{ value: "Quartiers (triés, croissant)", position: "insideBottom", offset: -5, fill: "#71899b", fontSize: 10 }} />
            <YAxis tick={{ fontSize: 9, fill: "var(--db-tick)" }} unit="%" />
            <RTooltip contentStyle={TIP} formatter={(v: any) => [`${v}%`, "Cumul"]} />
            <Area type="monotone" dataKey="pct" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.22} />
          </AreaChart>
        </ResponsiveContainer>
        <p className="chart-caption">Une courbe proche de la diagonale indiquerait une population également répartie entre quartiers ; plus elle s'en éloigne, plus la population est concentrée dans un petit nombre de quartiers.</p>
      </div>
    </div>
  );
}

// ============================================================
// ONGLET NIVEAU DE VIE & INSTRUCTION
// ============================================================
function NiveauVieTab({ quartiers }: { quartiers: Quartier[] }) {
  const instrStats = useMemo(() => computeStats(quartiers.map(q => q.ind_instruction_0_1).filter((v): v is number => v !== null)), [quartiers]);
  const vieStats = useMemo(() => computeStats(quartiers.map(q => q.ind_niveau_vie_0_1).filter((v): v is number => v !== null)), [quartiers]);
  const sortedInstr = useMemo(() => [...quartiers].filter(q => q.ind_instruction_0_1 !== null).sort((a, b) => (b.ind_instruction_0_1! - a.ind_instruction_0_1!)), [quartiers]);
  const sortedVie = useMemo(() => [...quartiers].filter(q => q.ind_niveau_vie_0_1 !== null).sort((a, b) => (b.ind_niveau_vie_0_1! - a.ind_niveau_vie_0_1!)), [quartiers]);

  // Correlation simple (Pearson) entre instruction et richesse matérielle, a titre indicatif
  const correlation = useMemo(() => {
    const pairs = quartiers.filter(q => q.ind_instruction_0_1 !== null && q.ind_niveau_vie_0_1 !== null)
      .map(q => [q.ind_instruction_0_1!, q.ind_niveau_vie_0_1!] as [number, number]);
    if (pairs.length < 2) return null;
    const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
    const my = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
    const num = pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
    const den = Math.sqrt(pairs.reduce((s, p) => s + (p[0] - mx) ** 2, 0) * pairs.reduce((s, p) => s + (p[1] - my) ** 2, 0));
    return den ? num / den : null;
  }, [quartiers]);

  return (
    <div className="tab-content">
      <div className="dashboard-note">
        <Sparkles size={13} />
        <span>Indices calculés par Analyse en Composantes Principales (ACP) sur les données du recensement — non recalculés ici, affichés tels que fournis.</span>
      </div>

      <div className="dashboard-kpi-grid">
        <Kpi label="Instruction — moyenne" value={fmt(instrStats?.mean)} note="Indice ACP (0 à 1)" />
        <Kpi label="Instruction — écart min/max" value={`${fmt(instrStats?.min)} – ${fmt(instrStats?.max)}`} note={`Médiane : ${fmt(instrStats?.median)}`} />
        <Kpi label="Richesse matérielle — moyenne" value={fmt(vieStats?.mean)} note="Indice ACP (0 à 1)" />
        <Kpi label="Corrélation instruction / richesse matérielle" value={correlation !== null ? fmt(correlation, 2) : "—"} note="Coefficient de Pearson" />
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-chart-card">
          <Eyebrow text="DISTRIBUTION" />
          <h3><GraduationCap size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Niveau d'instruction (IND_INSTRUCTION_0_1)</h3>
          <DistributionBar stats={instrStats} color="#a78bfa" />
          <StatTable rows={[
            { label: "Minimum", value: fmt(instrStats?.min) }, { label: "Maximum", value: fmt(instrStats?.max) },
            { label: "Moyenne", value: fmt(instrStats?.mean) }, { label: "Médiane", value: fmt(instrStats?.median) },
            { label: "Nb. quartiers", value: String(instrStats?.count ?? 0) },
          ]} />
        </div>
        <div className="dashboard-chart-card">
          <Eyebrow text="DISTRIBUTION" />
          <h3><Wallet size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Richesse matérielle (IND_NIVEAU_VIE_0_1)</h3>
          <DistributionBar stats={vieStats} color="#f472b6" />
          <StatTable rows={[
            { label: "Minimum", value: fmt(vieStats?.min) }, { label: "Maximum", value: fmt(vieStats?.max) },
            { label: "Moyenne", value: fmt(vieStats?.mean) }, { label: "Médiane", value: fmt(vieStats?.median) },
            { label: "Nb. quartiers", value: String(vieStats?.count ?? 0) },
          ]} />
        </div>
      </div>

      <div className="dashboard-grid">
        <RankingList title="Instruction la plus élevée" color="#a78bfa" items={sortedInstr.slice(0, 5).map(q => ({ nom: q.nom, commune: q.commune, value: q.ind_instruction_0_1! }))} />
        <RankingList title="Richesse matérielle la plus élevée" color="#f472b6" items={sortedVie.slice(0, 5).map(q => ({ nom: q.nom, commune: q.commune, value: q.ind_niveau_vie_0_1! }))} />
      </div>

      <div className="dashboard-chart-card">
        <Eyebrow text="NUAGE DE POINTS" />
        <h3>Instruction vs. richesse matérielle — un point = un quartier</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-grid)" />
            <XAxis type="number" dataKey="x" name="Instruction" domain={[0, 1]} tick={{ fontSize: 9, fill: "var(--db-tick)" }} label={{ value: "Instruction", position: "insideBottom", offset: -5, fill: "#71899b", fontSize: 10 }} />
            <YAxis type="number" dataKey="y" name="Richesse matérielle" domain={[0, 1]} tick={{ fontSize: 9, fill: "var(--db-tick)" }} label={{ value: "Richesse matérielle", angle: -90, position: "insideLeft", fill: "#71899b", fontSize: 10 }} />
            <ZAxis range={[60, 60]} />
            <RTooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={TIP}
              formatter={(v: any) => fmt(v, 2)}
              labelFormatter={() => ""} />
            <Scatter data={quartiers.filter(q => q.ind_instruction_0_1 !== null && q.ind_niveau_vie_0_1 !== null)
              .map(q => ({ x: q.ind_instruction_0_1, y: q.ind_niveau_vie_0_1, nom: q.nom }))} fill="#f472b6" fillOpacity={0.75} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================
// ONGLET EQUIPEMENTS (8 FAMILLES)
// ============================================================
function EquipementsTab({ quartiers }: { quartiers: Quartier[] }) {
  const [selected, setSelected] = useState<string>("sante");

  const perFamily = useMemo(() => INFRA_FAMILIES.map(f => {
    const counts = quartiers.map(q => (q as any)[`nb_${f.key}`] as number);
    const densities = quartiers.map(q => (q as any)[`dens_${f.key}`] as number | null).filter((v): v is number => v !== null);
    const total = counts.reduce((s, v) => s + v, 0);
    const densStats = computeStats(densities);
    let maxQ: Quartier | null = null, maxD = -Infinity;
    quartiers.forEach(q => { const d = (q as any)[`dens_${f.key}`]; if (d !== null && d > maxD) { maxD = d; maxQ = q; } });
    return { ...f, total, densStats, maxQ, maxD };
  }), [quartiers]);

  const totalAll = perFamily.reduce((s, f) => s + f.total, 0);
  const chartData = perFamily.map(f => ({ name: f.label, total: f.total, color: f.color }));
  const current = perFamily.find(f => f.key === selected)!;

  return (
    <div className="tab-content">
      <div className="dashboard-kpi-grid">
        <Kpi label="Équipements recensés (8 familles)" value={totalAll.toLocaleString("fr-FR")} note="Toutes familles confondues" />
        <Kpi label="Famille la plus représentée" value={[...perFamily].sort((a, b) => b.total - a.total)[0]?.label ?? "—"} note={`${[...perFamily].sort((a, b) => b.total - a.total)[0]?.total ?? 0} points`} />
        <Kpi label="Densité max. observée" value={fmt(current.densStats?.max, 1)} note={`${current.label} — ${(current.maxQ as any)?.nom ?? "—"}`} />
        <Kpi label="Quartiers couverts (≥1 équip.)" value={String(quartiers.filter(q => (q as any)[`nb_${selected}`] > 0).length)} note={`sur ${quartiers.length} — ${current.label}`} />
      </div>

      <div className="dashboard-chart-card">
        <Eyebrow text="COMPARAISON DES 8 FAMILLES" />
        <h3>Nombre total d'équipements par famille</h3>
        <ResponsiveContainer width="100%" height={260}>
          <RBarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-grid)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9, fill: "var(--db-tick)" }} />
            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "#cfe3ee" }} />
            <RTooltip contentStyle={TIP} />
            <RBar dataKey="total" radius={[0, 4, 4, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </RBar>
          </RBarChart>
        </ResponsiveContainer>
      </div>

      <div className="family-selector">
        {perFamily.map(f => (
          <button key={f.key} className={`family-chip ${selected === f.key ? "active" : ""}`}
            style={{ ["--fc" as any]: f.color }} onClick={() => setSelected(f.key)}>
            {f.label} <small>{f.total}</small>
          </button>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-chart-card">
          <Eyebrow text={current.label.toUpperCase()} />
          <h3>Densité par quartier (/ km²)</h3>
          <DistributionBar stats={current.densStats} color={current.color} />
          <StatTable rows={[
            { label: "Total recensé", value: String(current.total) },
            { label: "Densité moyenne", value: fmt(current.densStats?.mean, 2) },
            { label: "Densité médiane", value: fmt(current.densStats?.median, 2) },
            { label: "Densité maximale", value: `${fmt(current.densStats?.max, 2)} (${(current.maxQ as any)?.nom ?? "—"})` },
            { label: "Part dans l'ensemble des 8 familles", value: `${fmt((current.total / Math.max(1, totalAll)) * 100, 1)} %` },
          ]} />
        </div>
        <RankingList title={`Quartiers les mieux dotés — ${current.label}`} color={current.color}
          items={[...quartiers].sort((a, b) => ((b as any)[`dens_${selected}`] ?? -1) - ((a as any)[`dens_${selected}`] ?? -1)).slice(0, 6)
            .map(q => ({ nom: q.nom, commune: q.commune, value: (q as any)[`dens_${selected}`] ?? 0 }))} unit=" /km²" />
      </div>
    </div>
  );
}

// ============================================================
// ONGLET ACCESSIBILITE (8 TYPES + GLOBALE)
// ============================================================
function AccessibiliteTab({ quartiers }: { quartiers: Quartier[] }) {
  const [selected, setSelected] = useState<string>("acc_globale");

  const perType = useMemo(() => ACCESS_INDICATORS.map(ind => {
    const values = quartiers.map(ind.get).filter((v): v is number => v !== null);
    return { ...ind, stats: computeStats(values) };
  }), [quartiers]);

  const current = perType.find(t => t.id === selected)!;
  const routeStats = useMemo(() => computeStats(quartiers.map(q => q.acc_routiere_indice).filter((v): v is number => v !== null)), [quartiers]);

  const chartData = perType.filter(t => t.id !== "acc_globale").map(t => ({ name: t.label, moyenne: t.stats?.mean ?? 0 }));

  return (
    <div className="tab-content">
      <div className="dashboard-note">
        <Route size={13} />
        <span>Les 8 accessibilités par type et l'accessibilité routière sont calculées à l'échelle de la grille de 200 m — moyennées ici par quartier pour la lecture statistique uniquement.</span>
      </div>

      <div className="dashboard-kpi-grid">
        <Kpi label="Accessibilité globale — moyenne" value={fmt(perType.find(t => t.id === "acc_globale")?.stats?.mean)} note="Tous types confondus" />
        <Kpi label="Accessibilité routière — moyenne" value={fmt(routeStats?.mean, 2)} note="Indice 0 à 1, grille 200 m" />
        <Kpi label="Type le mieux desservi" value={[...perType].filter(t => t.id !== "acc_globale").sort((a, b) => (b.stats?.mean ?? 0) - (a.stats?.mean ?? 0))[0]?.label ?? "—"} note="Moyenne la plus élevée" />
        <Kpi label="Type le moins desservi" value={[...perType].filter(t => t.id !== "acc_globale").sort((a, b) => (a.stats?.mean ?? 0) - (b.stats?.mean ?? 0))[0]?.label ?? "—"} note="Moyenne la plus faible" />
      </div>

      <div className="dashboard-chart-card">
        <Eyebrow text="COMPARAISON DES 8 TYPES" />
        <h3>Accessibilité moyenne par type d'équipement</h3>
        <ResponsiveContainer width="100%" height={240}>
          <RBarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-grid)" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--db-tick)" }} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 9, fill: "var(--db-tick)" }} />
            <RTooltip contentStyle={TIP} />
            <RBar dataKey="moyenne" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
          </RBarChart>
        </ResponsiveContainer>
      </div>

      <div className="family-selector">
        {perType.map(t => (
          <button key={t.id} className={`family-chip ${selected === t.id ? "active" : ""}`}
            style={{ ["--fc" as any]: "#2dd4bf" }} onClick={() => setSelected(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-chart-card">
          <Eyebrow text={current.label.toUpperCase()} />
          <h3>Distribution de l'accessibilité</h3>
          <DistributionBar stats={current.stats} color="#2dd4bf" />
          <StatTable rows={[
            { label: "Minimum", value: fmt(current.stats?.min) }, { label: "Maximum", value: fmt(current.stats?.max) },
            { label: "Moyenne", value: fmt(current.stats?.mean) }, { label: "Médiane", value: fmt(current.stats?.median) },
            { label: "Q1 / Q3", value: `${fmt(current.stats?.q1)} / ${fmt(current.stats?.q3)}` },
          ]} />
        </div>
        <RankingList title={`Quartiers les mieux desservis — ${current.label}`} color="#2dd4bf"
          items={[...quartiers].sort((a, b) => (current.get(b) ?? -Infinity) - (current.get(a) ?? -Infinity)).slice(0, 6)
            .map(q => ({ nom: q.nom, commune: q.commune, value: current.get(q) ?? 0 }))} />
      </div>
    </div>
  );
}

// ============================================================
// ONGLET INEGALITES (QUARTILES + PREPARATION INDICES DE SEGREGATION)
// ============================================================
const INEGALITES_INDICATORS = [
  { id: "population", label: "Population", get: (q: Quartier) => q.population },
  { id: "ind_niveau_vie_0_1", label: "Richesse matérielle", get: (q: Quartier) => q.ind_niveau_vie_0_1 },
  { id: "ind_instruction_0_1", label: "Instruction", get: (q: Quartier) => q.ind_instruction_0_1 },
  { id: "acc_globale", label: "Accessibilité globale", get: (q: Quartier) => q.acc_globale },
  { id: "dens_sante", label: "Densité santé", get: (q: Quartier) => q.dens_sante },
  { id: "dens_education", label: "Densité éducation", get: (q: Quartier) => q.dens_education },
];

function InegalitesTab({ quartiers }: { quartiers: Quartier[] }) {
  const [selected, setSelected] = useState("ind_niveau_vie_0_1");
  const ind = INEGALITES_INDICATORS.find(i => i.id === selected)!;

  const stats = useMemo(() => computeStats(quartiers.map(ind.get).filter((v): v is number => v !== null && v !== undefined)), [quartiers, ind]);

  const groups = useMemo(() => {
    const g: Record<number, Quartier[]> = { 0: [], 1: [], 2: [], 3: [] };
    quartiers.forEach(q => {
      const v = ind.get(q);
      const cls = quartileClass(v ?? null, stats);
      if (cls !== null) g[cls].push(q);
    });
    return g;
  }, [quartiers, ind, stats]);

  const communeAgg = useMemo(() => {
    const byCommune: Record<string, number[]> = {};
    quartiers.forEach(q => {
      const v = ind.get(q);
      if (v !== null && v !== undefined) (byCommune[q.commune] ||= []).push(v);
    });
    return Object.entries(byCommune).map(([commune, values]) => ({ commune, stats: computeStats(values) }));
  }, [quartiers, ind]);

  const QUARTILE_LABELS = ["Groupe 1 — Q1 (faible)", "Groupe 2 — Q2", "Groupe 3 — Q3", "Groupe 4 — Q4 (élevé)"];
  const QUARTILE_COLORS = ["#fde68a", "#fbbf24", "#f97316", "#dc2626"];

  return (
    <div className="tab-content">
      <div className="dashboard-note">
        <Scale size={13} />
        <span>Classification en 4 groupes (quartiles) de la variable sélectionnée — base méthodologique commune aux futurs indices de ségrégation.</span>
      </div>

      <div className="family-selector">
        {INEGALITES_INDICATORS.map(i => (
          <button key={i.id} className={`family-chip ${selected === i.id ? "active" : ""}`}
            style={{ ["--fc" as any]: "#dc2626" }} onClick={() => setSelected(i.id)}>
            {i.label}
          </button>
        ))}
      </div>

      <div className="dashboard-kpi-grid">
        <Kpi label="Seuil Q1" value={fmt(stats?.q1)} note={ind.label} />
        <Kpi label="Seuil médian (Q2)" value={fmt(stats?.median)} note={ind.label} />
        <Kpi label="Seuil Q3" value={fmt(stats?.q3)} note={ind.label} />
        <Kpi label="Rapport max / min" value={stats && stats.min ? fmt(stats.max / stats.min, 1) : "—"} note="Amplitude de la disparité" />
      </div>

      <div className="quartile-groups">
        {[0, 1, 2, 3].map(g => (
          <div className="quartile-group-card" key={g} style={{ ["--qc" as any]: QUARTILE_COLORS[g] }}>
            <div className="quartile-group-head"><span>{QUARTILE_LABELS[g]}</span><b>{groups[g]?.length ?? 0} quartiers</b></div>
            <div className="quartile-group-list">
              {(groups[g] || []).slice(0, 6).map(q => <span key={q.quartier_id}>{q.nom}</span>)}
              {(groups[g]?.length ?? 0) > 6 && <small>+ {groups[g].length - 6} autres</small>}
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-chart-card">
        <Eyebrow text="COMPARAISON ENTRE COMMUNES" />
        <h3>Distribution de « {ind.label} » par commune</h3>
        {communeAgg.map(c => (
          <div key={c.commune} className="commune-dist-row">
            <span>{c.commune}</span>
            <DistributionBar stats={c.stats} color="#dc2626" />
          </div>
        ))}
      </div>

      <div className="dashboard-chart-card segregation-preview">
        <Eyebrow text="À VENIR" />
        <h3>Indices de ségrégation spatiale</h3>
        <p className="segregation-note">Architecture prête pour l'intégration directe dès réception des données calculées — aucun résultat n'est fabriqué ici.</p>
        <div className="segregation-grid">
          {["Indice de Gini spatial", "LISA (autocorrélation locale)", "Indice de dissimilarité", "Indice de ségrégation", "Entropie de taille", "Coefficient de localisation"].map(name => (
            <div className="segregation-card" key={name}>
              <TrendingUp size={16} />
              <span>{name}</span>
              <small>Données non encore fournies</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}