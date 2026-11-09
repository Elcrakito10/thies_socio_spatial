import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Download, Lock, FileDown, Layers, Sparkles, Users, Store, Footprints, GraduationCap, Scale, Search, Columns2, FileText, X, Eye } from "lucide-react";
import {
  INFRA_FAMILIES, RAMP_DENSITE, RAMP_ACCESS, RAMP_INSTRUCTION, RAMP_NIVEAUVIE, RAMP_ROUTIER, RAMP_POPULATION,
  type QuartierFull,
} from "./Geoportail";
import { Reveal, Counter, useInView } from "./ui";
import {
  prepare, drawAnimated, drawStatic, exportPng, loadGrid, type Prepared,
} from "./mapdraw";
import "./Pages.css";
import "./Cartotheque.css";
import { StatsPanel, TerritoryFacts, useMapStat, fmt as fmtS } from "./CartoStats";

// ============================================================
// Catalogue des cartes (une carte = un indicateur reel des donnees)
// ============================================================
export type FamilyId = "socio" | "densite" | "access" | "eco" | "segreg";
export const FAMILIES: Record<FamilyId, { label: string; color: string }> = {
  socio: { label: "Socio-démographie", color: "#22d3ee" },
  densite: { label: "Densités d'équipements", color: "#fb923c" },
  access: { label: "Accessibilité", color: "#2dd4bf" },
  eco: { label: "Instruction & richesse matérielle", color: "#c084fc" },
  segreg: { label: "Ségrégation", color: "#f87171" },
};

export type MapDef = {
  id: string; family: FamilyId; title: string; desc: string; indicator: string;
  layer: "quartiers" | "grille"; value: (p: any) => number | null; ramp: string[]; unit: string;
  scale: string; source: string; year: string; file: string; locked?: boolean;
};

const SRC_RGPH = "RGPH-5 — ANSD";
const SRC_APP = "Données application (couches thématiques)";
const SCALE_Q = "Quartier • 65 unités";
const SCALE_G = "Grille 200 m • 2 170 cellules";

export function buildMaps(): MapDef[] {
  const maps: MapDef[] = [
    { id: "population", family: "socio", title: "Population par quartier", indicator: "population",
      desc: "Nombre d'habitants recensés dans chaque quartier de Thiès.",
      layer: "quartiers", value: p => (p.population > 0 ? p.population : null), ramp: RAMP_POPULATION, unit: "habitants",
      scale: SCALE_Q, source: SRC_RGPH, year: "2023", file: "/data/quartiers_thies.geojson" },
    { id: "densite_pop", family: "socio", title: "Densité de population", indicator: "densite_pop",
      desc: "Habitants par km², calculé en rapportant la population de chaque quartier à sa surface.",
      layer: "quartiers", value: p => (p.surface_km2 && p.population > 0 ? p.population / p.surface_km2 : null), ramp: RAMP_POPULATION, unit: "hab./km²",
      scale: SCALE_Q, source: `${SRC_RGPH} • surface des quartiers (calcul)`, year: "2023", file: "/data/quartiers_thies.geojson" },
  ];
  INFRA_FAMILIES.forEach(f => maps.push({
    id: `dens_${f.key}`, family: "densite", title: `Densité — ${f.label}`, indicator: `dens_${f.key}`,
    desc: `Nombre d'équipements de la famille « ${f.label} » par km² dans chaque quartier.`,
    layer: "quartiers", value: p => p[`dens_${f.key}`], ramp: RAMP_DENSITE, unit: "équipements / km²",
    scale: SCALE_Q, source: SRC_APP, year: "Non précisée", file: "/data/quartiers_thies.geojson",
  }));
  INFRA_FAMILIES.forEach(f => maps.push({
    id: `acc_${f.key}`, family: "access", title: `Accessibilité — ${f.label}`, indicator: `acc_${f.key}`,
    desc: `Indice d'accessibilité aux équipements « ${f.label} », calculé cellule par cellule sur la grille de 200 m.`,
    layer: "grille", value: p => p[`acc_${f.key}`], ramp: RAMP_ACCESS, unit: "indice",
    scale: SCALE_G, source: "Calculs d'accessibilité (données application)", year: "Non précisée", file: "/data/grille_200m.geojson",
  }));
  maps.push(
    { id: "acc_globale", family: "access", title: "Accessibilité globale aux infrastructures", indicator: "acc_globale",
      desc: "Indice composite d'accessibilité synthétisant l'ensemble des équipements, à l'échelle de la grille de 200 m.",
      layer: "grille", value: p => p.acc_globale, ramp: RAMP_ACCESS, unit: "indice composite",
      scale: SCALE_G, source: "Calculs d'accessibilité (données application)", year: "Non précisée", file: "/data/grille_200m.geojson" },
    { id: "routier", family: "access", title: "Accessibilité routière", indicator: "routier",
      desc: "Indice d'accessibilité au réseau routier, calculé sur la grille de 200 m à partir de la distance au nœud le plus proche.",
      layer: "grille", value: p => p.acc_routiere_indice, ramp: RAMP_ROUTIER, unit: "indice 0–1",
      scale: SCALE_G, source: "Réseau routier OpenStreetMap • calcul sur grille", year: "Non précisée", file: "/data/grille_200m.geojson" },
    { id: "instruction", family: "eco", title: "Niveau d'instruction", indicator: "ind_instruction_0_1",
      desc: "Score d'instruction issu d'une ACP (IND_INSTRUCTION_0_1) : indice synthétique tel que fourni, non recalculé.",
      layer: "quartiers", value: p => p.ind_instruction_0_1, ramp: RAMP_INSTRUCTION, unit: "indice 0–1",
      scale: SCALE_Q, source: "Analyse en composantes principales (données application)", year: "2023", file: "/data/quartiers_thies.geojson" },
    { id: "niveau_vie", family: "eco", title: "Richesse matérielle", indicator: "ind_niveau_vie_0_1",
      desc: "Score de richesse matérielle issu d'une ACP (IND_NIVEAU_VIE_0_1) : indice synthétique tel que fourni, non recalculé.",
      layer: "quartiers", value: p => p.ind_niveau_vie_0_1, ramp: RAMP_NIVEAUVIE, unit: "indice 0–1",
      scale: SCALE_Q, source: "Analyse en composantes principales (données application)", year: "2023", file: "/data/quartiers_thies.geojson" },
  );
  const SRC_SEG = "Analyse de la ségrégation (résultats validés)";
  const seg = (id: string, title: string, desc: string, key: string, ramp: string[], unit: string) => maps.push({
    id, family: "segreg", title, desc, indicator: key, layer: "quartiers", value: p => (typeof p[key] === "number" ? p[key] : null),
    ramp, unit, scale: SCALE_Q, source: SRC_SEG, year: "2023", file: "/data/quartiers_thies.geojson",
  });
  seg("offre_infra", "Offre d'infrastructures", "Indicateur synthétique (ACP des 8 densités d'équipements), de 0 à 1.", "offre_infra_0_1", ["#fff7e6", "#fdd49e", "#fc8d59", "#b30000"], "indice 0–1");
  seg("LQ_superieur", "Coefficient de localisation — supérieur", "Part des diplômés du supérieur dans le quartier rapportée à celle de la ville (1 = identique).", "LQ_superieur", ["#f7fcf5", "#c7e9c0", "#74c476", "#00441b"], "ratio");
  seg("LQ_sans_niveau", "Coefficient de localisation — sans niveau", "Part des personnes sans niveau d'instruction dans le quartier rapportée à celle de la ville.", "LQ_sans_niveau", ["#f7fcf5", "#c7e9c0", "#74c476", "#00441b"], "ratio");
  seg("entropie", "Diversité scolaire locale (entropie)", "Mélange des six niveaux d'instruction dans le quartier (maximum 1,79).", "entropie_scolaire_locale", ["#eff3ff", "#bdd7e7", "#6baed6", "#08519c"], "nats");
  seg("attractivite", "Indice d'attractivité", "Solde des flux / volume des flux : de −1 (quartier émetteur) à +1 (quartier attractif).", "indice_attractivite", ["#d73027", "#fdae61", "#abd9e9", "#2c7bb6"], "−1 à +1");
  seg("flux_emis", "Flux émis", "Flux de déplacements émis par chaque quartier.", "flux_emis", ["#edf8fb", "#b3cde3", "#8c96c6", "#6e016b"], "flux");
  seg("flux_recus", "Flux reçus", "Flux de déplacements reçus par chaque quartier.", "flux_recus", ["#edf8fb", "#b3cde3", "#8c96c6", "#6e016b"], "flux");
  return maps;
}

// ============================================================
// Preparation des donnees + canevas d'une carte
// ============================================================
type QGeo = QuartierFull & { geometry: any };
const toFeatures = (qs: QGeo[]) => qs.map(q => ({ properties: q, geometry: q.geometry }));

export function useMapPrep(def: MapDef, quartiers: QGeo[], grid: any | null) {
  return useMemo<{ prep: Prepared | null; base: Prepared | null }>(() => {
    if (def.locked) return { prep: null, base: null };
    if (def.layer === "quartiers") return { prep: prepare(toFeatures(quartiers), def.value), base: null };
    if (!grid) return { prep: null, base: null };
    return { prep: prepare(grid.features, def.value), base: prepare(toFeatures(quartiers), () => null) };
  }, [def, quartiers, grid]);
}

export function MapCanvas({ def, prep, base, aspect = 0.74, animate = true }: { def: MapDef; prep: Prepared | null; base: Prepared | null; aspect?: number; animate?: boolean }) {
  const [wrapRef, seen] = useInView<HTMLDivElement>(0.2);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, [wrapRef]);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !prep || !w || !seen) return;
    const h = Math.round(w * aspect);
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const stroke = def.layer === "quartiers";
    if (animate) return drawAnimated(cv, prep, def.ramp, w, h, { base, stroke });
    drawStatic(cv, prep, def.ramp, w, h, { base, stroke });
  }, [prep, base, w, seen, def, animate, aspect]);
  return (
    <div ref={wrapRef} className="mapcanvas-wrap" style={{ minHeight: w ? undefined : 160 }}>
      {!prep && <div className="mapcanvas-loading"><i /><span>Chargement de la grille…</span></div>}
      <canvas ref={canvasRef} className="mapcanvas" />
    </div>
  );
}

const fmtN = (v: number) => (Math.abs(v) >= 100 ? v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

export function LegendBar({ def, prep }: { def: MapDef; prep: Prepared | null }) {
  const st = prep?.stats;
  return (
    <div className="map-legend-bar">
      <div className="map-legend-swatches">{def.ramp.map((c, i) => <i key={i} style={{ background: c }} />)}</div>
      <div className="map-legend-scale"><span>{st ? fmtN(st.min) : "—"}</span><em>{def.unit}</em><span>{st ? fmtN(st.max) : "—"}</span></div>
    </div>
  );
}

// ============================================================
// Carte de la cartotheque
// ============================================================
import { askAssistant } from "./assistant/store";
function MapCard({ def, quartiers, grid, index, onExplore }: { def: MapDef; quartiers: QGeo[]; grid: any | null; index: number; onExplore: (id: string) => void }) {
  const fam = FAMILIES[def.family];
  const { prep, base } = useMapPrep(def, quartiers, grid);
  const stat = useMapStat(def, quartiers, grid);
  const ref = useRef<HTMLElement>(null);
  const tilt = (e: MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--rx", `${(((e.clientY - r.top) / r.height) - 0.5) * -5}deg`);
    el.style.setProperty("--ry", `${(((e.clientX - r.left) / r.width) - 0.5) * 6}deg`);
  };
  const reset = () => { ref.current?.style.setProperty("--rx", "0deg"); ref.current?.style.setProperty("--ry", "0deg"); };
  return (
    <Reveal delay={Math.min(index % 3, 2) * 90} className="map-card-slot">
      <article ref={ref} className={`map-card ${def.locked ? "locked" : ""}`} style={{ ["--accent" as any]: fam.color }} onMouseMove={tilt} onMouseLeave={reset}>
        <div className="map-card-plate">
          {def.locked ? (
            <div className="map-card-locked"><Lock size={26} /><b>À venir</b><span>Disponible dès réception des résultats calculés</span></div>
          ) : <MapCanvas def={def} prep={prep} base={base} />}
          <span className="map-card-scale">{def.layer === "grille" ? "GRILLE 200 m" : "QUARTIERS"}</span>
        </div>
        <div className="map-card-body">
          <small className="map-card-family"><i />{fam.label}</small>
          <h3>{def.title}</h3>
          <p>{def.desc}</p>
          {!def.locked && <LegendBar def={def} prep={prep} />}
          {!def.locked && <StatsPanel def={def} s={stat} />}
          <dl className="map-card-meta">
            <div><dt>Indicateur</dt><dd>{def.locked ? "—" : def.indicator}</dd></div>
            <div><dt>Échelle</dt><dd>{def.scale}</dd></div>
            <div><dt>Source</dt><dd>{def.source}</dd></div>
            <div><dt>Année</dt><dd>{def.year}</dd></div>
          </dl>
          <div className="map-card-actions">
            <button className="mc-btn primary" disabled={def.locked} onClick={() => onExplore(def.indicator)}>Explorer <ArrowRight size={13} /></button>
            <button className="mc-btn" disabled={def.locked} title="Faire analyser cette carte par l'assistant" onClick={() => askAssistant({ type: "analyze", ctx: { source: "cartotheque", indicatorId: def.indicator, layer: def.layer === "grille" ? "grille" : "quartiers" } })}>✨ Analyser</button>
            <button className="mc-btn" disabled={def.locked || !prep} title="Télécharger la carte (PNG, haute résolution)"
              onClick={() => prep && exportPng(prep, def.ramp, { title: def.title, subtitle: `${def.scale} — ${def.unit}`, source: def.source, base, stroke: def.layer === "quartiers", unit: def.unit })}>
              <Download size={13} /> PNG
            </button>
            {!def.locked && <a className="mc-btn" href={def.file} download title="Télécharger la couche source (GeoJSON)"><FileDown size={13} /> GeoJSON</a>}
          </div>
        </div>
      </article>
    </Reveal>
  );
}

// ============================================================
// Vitrine animee (reutilisee sur la page d'accueil)
// ============================================================
export function MapShowcase({ defs, quartiers, grid, interval = 5200, onExplore }: { defs: MapDef[]; quartiers: QGeo[]; grid: any | null; interval?: number; onExplore?: (id: string) => void }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setI(x => (x + 1) % defs.length), interval);
    return () => clearInterval(t);
  }, [auto, defs.length, interval]);
  const def = defs[i];
  const { prep, base } = useMapPrep(def, quartiers, grid);
  const fam = FAMILIES[def.family];
  const stat = useMapStat(def, quartiers, grid);
  return (
    <div className="showcase" style={{ ["--accent" as any]: fam.color }}>
      <div className="showcase-map"><MapCanvas def={def} prep={prep} base={base} aspect={0.78} /></div>
      <div className="showcase-info">
        <small className="map-card-family"><i />{fam.label}</small>
        <h3 key={def.id} className="showcase-title">{def.title}</h3>
        <p>{def.desc}</p>
        <LegendBar def={def} prep={prep} />
        {stat && <div className="sc-stats"><div><small>Moyenne</small><b>{fmtS(stat.st.mean)}</b></div><div><small>Médiane</small><b>{fmtS(stat.st.median)}</b></div><div><small>Maximum</small><b>{fmtS(stat.st.max)}</b></div></div>}
        <div className="showcase-dots">
          {defs.map((d, k) => (
            <button key={d.id} className={k === i ? "on" : ""} title={d.title} aria-label={d.title}
              onClick={() => { setI(k); setAuto(false); }} />
          ))}
        </div>
        {onExplore && <button className="mc-btn primary" onClick={() => onExplore(def.indicator)}>Explorer cette carte <ArrowRight size={13} /></button>}
      </div>
    </div>
  );
}

// ============================================================
// Page Cartotheque (modele « clair » : hero photo, familles, vitrine animee, catalogue)
// ============================================================
const FAM_ICON: Record<FamilyId, any> = { socio: Users, densite: Store, access: Footprints, eco: GraduationCap, segreg: Scale };

function MiniCard({ def, quartiers, grid, onExplore }: { def: MapDef; quartiers: QGeo[]; grid: any | null; onExplore: (id: string) => void }) {
  const { prep, base } = useMapPrep(def, quartiers, grid);
  const fam = FAMILIES[def.family];
  const stat = useMapStat(def, quartiers, grid);
  return (
    <article className="ct-mini" style={{ ["--accent" as any]: fam.color }}>
      <div className="ct-mini-plate"><MapCanvas def={def} prep={prep} base={base} aspect={0.62} animate={false} /></div>
      <div className="ct-mini-body">
        <h3>{def.title}</h3>
        <div className="ct-mini-row">
          <span className="ct-tag"><i />{fam.label}</span>
          <small>{def.year}</small>
        </div>
        {stat && <div className="ct-mini-stats"><span>Moy. <b>{fmtS(stat.st.mean)}</b></span><span>Méd. <b>{fmtS(stat.st.median)}</b></span><span>Max <b>{fmtS(stat.st.max)}</b></span></div>}
        <div className="ct-mini-act">
          <button title="Explorer dans le Géoportail" onClick={() => onExplore(def.indicator)}><Eye size={14} /></button>
          <button title="Télécharger (PNG)" disabled={!prep}
            onClick={() => prep && exportPng(prep, def.ramp, { title: def.title, subtitle: `${def.scale} — ${def.unit}`, source: def.source, base, stroke: def.layer === "quartiers", unit: def.unit })}><Download size={14} /></button>
        </div>
      </div>
    </article>
  );
}

function CompareSlot({ def, quartiers, grid }: { def: MapDef; quartiers: QGeo[]; grid: any | null }) {
  const { prep, base } = useMapPrep(def, quartiers, grid);
  return (
    <div className="ct-cmp-slot">
      <MapCanvas def={def} prep={prep} base={base} aspect={0.8} animate={false} />
      <LegendBar def={def} prep={prep} />
      <small>{def.scale} · {def.unit}</small>
    </div>
  );
}

function ComparePanel({ defs, quartiers, grid, onClose }: { defs: MapDef[]; quartiers: QGeo[]; grid: any | null; onClose: () => void }) {
  const [a, setA] = useState("population");
  const [b, setB] = useState("acc_globale");
  const da = defs.find(d => d.id === a)!, db = defs.find(d => d.id === b)!;
  const opts = defs.map(d => <option key={d.id} value={d.id}>{d.title}</option>);
  return (
    <section className="ct-panel" id="ct-compare">
      <header><h2><Columns2 size={18} /> Comparer deux cartes</h2><button onClick={onClose} aria-label="Fermer"><X size={16} /></button></header>
      <div className="ct-cmp">
        <div><select value={a} onChange={e => setA(e.target.value)}>{opts}</select><CompareSlot key={a} def={da} quartiers={quartiers} grid={grid} /></div>
        <div><select value={b} onChange={e => setB(e.target.value)}>{opts}</select><CompareSlot key={b} def={db} quartiers={quartiers} grid={grid} /></div>
      </div>
    </section>
  );
}

function MetaPanel({ defs, onClose }: { defs: MapDef[]; onClose: () => void }) {
  const csv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [["id", "titre", "famille", "indicateur", "echelle", "unite", "source", "annee", "fichier"],
      ...defs.map(d => [d.id, d.title, FAMILIES[d.family].label, d.indicator, d.scale, d.unit, d.source, d.year, d.file])];
    const blob = new Blob(["﻿" + rows.map(r => r.map(esc).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "cartotheque_metadonnees.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <section className="ct-panel" id="ct-meta">
      <header><h2><FileText size={18} /> Métadonnées des cartes</h2>
        <div><button className="ct-btn" onClick={csv}><FileDown size={13} /> CSV</button><button onClick={onClose} aria-label="Fermer"><X size={16} /></button></div></header>
      <div className="ct-table-wrap">
        <table><thead><tr><th>Carte</th><th>Famille</th><th>Indicateur</th><th>Échelle</th><th>Source</th><th>Année</th></tr></thead>
          <tbody>{defs.map(d => (
            <tr key={d.id} className={d.locked ? "lock" : ""}><td>{d.title}</td><td>{FAMILIES[d.family].label}</td><td><code>{d.locked ? "—" : d.indicator}</code></td><td>{d.scale}</td><td>{d.source}</td><td>{d.year}</td></tr>
          ))}</tbody></table>
      </div>
    </section>
  );
}

export default function Cartotheque({ quartiers, onExplore }: { quartiers: QGeo[]; onExplore: (indicator: string) => void }) {
  const all = useMemo(buildMaps, []);
  const [filter, setFilter] = useState<FamilyId | "all">("all");
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState<"" | "compare" | "meta">("");
  const [grid, setGrid] = useState<any | null>(null);
  useEffect(() => { loadGrid().then(setGrid); }, []);

  const available = all.filter(m => !m.locked);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = all.filter(m => (filter === "all" || m.family === filter) && norm(q).split(/\s+/).filter(Boolean).every(w => norm(`${m.title} ${m.desc}`).includes(w)));
  const pick = (ids: string[]) => ids.map(id => all.find(m => m.id === id)!);
  const showcaseDefs = useMemo(() => pick(["dens_commerce", "acc_globale", "niveau_vie", "routier", "population", "acc_sante"]), [all]);
  const featured = useMemo(() => pick(["densite_pop", "dens_education", "acc_education", "instruction"]), [all]);
  const go = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  const openPanel = (p: "compare" | "meta") => { setPanel(p); go(p === "compare" ? "ct-compare" : "ct-meta"); };
  const pickFamily = (f: FamilyId | "all") => { setFilter(f); go("ct-catalogue"); };

  return (
    <section className="ct">
      <header className="ct-hero">
        <div className="ct-hero-copy">
          <div className="ct-eyebrow"><i />Thiès GéoPortail</div>
          <h1>Cartothèque</h1>
          <p>Accédez à toutes les cartes produites dans le cadre de l’analyse de la ségrégation socio-spatiale à Thiès.</p>
        </div>
      </header>

      <div className="ct-tiles">
        {(Object.keys(FAMILIES) as FamilyId[]).map(f => {
          const Ic = FAM_ICON[f]; const n = all.filter(m => m.family === f).length;
          return (
            <button key={f} className={`ct-tile ${filter === f ? "on" : ""}`} style={{ ["--accent" as any]: FAMILIES[f].color }} onClick={() => pickFamily(f)}>
              <span className="ct-tile-ic"><Ic size={20} /></span>
              <b>{FAMILIES[f].label}</b>
              <small>{n} carte{n > 1 ? "s" : ""}</small>
            </button>
          );
        })}
        <button className={`ct-tile ${filter === "all" ? "on" : ""}`} style={{ ["--accent" as any]: "#0f766e" }} onClick={() => pickFamily("all")}>
          <span className="ct-tile-ic"><Layers size={20} /></span><b>Toutes les cartes</b><small>{all.length} cartes</small>
        </button>
      </div>

      <div className="ct-live">
        <div className="ct-live-copy">
          <div className="ct-eyebrow"><i />En direct</div>
          <h2>Toutes les cartes<br /><span>du territoire.</span></h2>
          <p>Chaque carte est dessinée en direct à partir des données du projet : mêmes valeurs, mêmes échelles, mêmes classes par quartiles que dans le Géoportail.</p>
          <div className="ct-counters">
            <div><strong><Counter value={available.length} /></strong><span>cartes disponibles</span></div>
            <a href="/segregation" style={{ color: "inherit", textDecoration: "none" }} title="Voir les 19 cartes validées"><strong><Counter value={19} /></strong><span>cartes validées de l'analyse →</span></a>
            <div><strong><Counter value={2} /></strong><span>échelles : quartier & grille</span></div>
          </div>
        </div>
        <div className="ct-live-visual"><MapShowcase defs={showcaseDefs} quartiers={quartiers} grid={grid} onExplore={onExplore} /></div>
      </div>

      <div className="ct-block">
        <div className="ct-block-head"><h2>Le territoire en chiffres</h2><small className="ct-sub">Calculés sur les 65 quartiers</small></div>
        <TerritoryFacts quartiers={quartiers} />
      </div>

      <div className="ct-block">
        <div className="ct-block-head"><h2>Cartes à la une</h2><button className="ct-link" onClick={() => pickFamily("all")}>Voir toutes les cartes <ArrowRight size={14} /></button></div>
        <div className="ct-minis">{featured.map(d => <Reveal key={d.id}><MiniCard def={d} quartiers={quartiers} grid={grid} onExplore={onExplore} /></Reveal>)}</div>
      </div>

      <div className="ct-block" id="ct-catalogue">
        <div className="ct-block-head">
          <h2>Catalogue complet <small>({shown.length})</small></h2>
          <label className="ct-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une carte…" /></label>
        </div>
        <div className="ct-pills">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>Toutes <b>{all.length}</b></button>
          {(Object.keys(FAMILIES) as FamilyId[]).map(f => (
            <button key={f} className={filter === f ? "on" : ""} style={{ ["--accent" as any]: FAMILIES[f].color }} onClick={() => setFilter(f)}>
              <i />{FAMILIES[f].label} <b>{all.filter(m => m.family === f).length}</b>
            </button>
          ))}
        </div>
        {shown.length ? (
          <div className="carto-grid ct-grid">
            {shown.map((m, idx) => <MapCard key={m.id} def={m} quartiers={quartiers} grid={grid} index={idx} onExplore={onExplore} />)}
          </div>
        ) : <p className="ct-empty">Aucune carte ne correspond à « {q} ».</p>}
      </div>

      {panel === "compare" && <ComparePanel defs={available} quartiers={quartiers} grid={grid} onClose={() => setPanel("")} />}
      {panel === "meta" && <MetaPanel defs={all} onClose={() => setPanel("")} />}

      <div className="ct-actions">
        <button onClick={() => openPanel("compare")}><span style={{ ["--c" as any]: "#2563eb" }}><Columns2 size={22} /></span><div><b>Comparer des cartes</b><small>Affichez deux cartes côte à côte.</small></div></button>
        <button onClick={() => pickFamily("all")}><span style={{ ["--c" as any]: "#0f766e" }}><Download size={22} /></span><div><b>Téléchargement</b><small>PNG haute résolution et GeoJSON source, sur chaque carte.</small></div></button>
        <button onClick={() => openPanel("meta")}><span style={{ ["--c" as any]: "#ea580c" }}><FileText size={22} /></span><div><b>Métadonnées</b><small>Indicateur, échelle, source et année de chaque carte.</small></div></button>
      </div>

      <footer className="ct-note"><Sparkles size={14} /> Les classes sont des quartiles de la distribution de chaque indicateur. Les indices ACP et d’accessibilité sont affichés tels que fournis, sans recalcul.</footer>
    </section>
  );
}
