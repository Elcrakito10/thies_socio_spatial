import { exportThematicPng } from "./geoExport";
import { classBreaks, CLASS_METHODS, type ClassMethod } from "./geoClass";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents, ScaleControl, Polyline, Polygon, Circle, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";
import {
  Layers3, X, Search, ChevronDown, ChevronRight, Gauge, Download,
  PanelRightClose, PanelRightOpen, Building2, GraduationCap, ShoppingBag, Dumbbell, Landmark, Bus,
  CircleDollarSign, ShieldCheck, Grid3x3, Eye, EyeOff, Filter, Ruler, PenTool, CircleDot, Printer, Sparkles, Users, Wand2, Route as RouteIcon, GraduationCap as GradCap, ShieldQuestion,
} from "lucide-react";
import "./Geoportail.css";
import { KpiRow, WeatherCard, Overview, InfraDonut, TopPopulation, PopEvolution } from "./GeoParts";
import GeoQueryPanel from "./GeoQueryPanel";
import { CircleLayer, CircleLegend } from "./GeoCircles";
const GeoGuide = lazy(() => import("./GeoGuide"));
import GeoNearbyPanel, { type AroundView, type RouteView } from "./GeoNearbyPanel";
import { makeCtx, runRules, distM, type Rule, type TargetSpec } from "./geoQuery";
import { MODES, buildGraph, buildRoute, rankTargets, selectTargets, shortestTree, snap, type Found, type Graph, type Mode, type Tree } from "./geoRouting";
import { MiniMap, StatusBar, ZoomStack, fmtArea, fmtLen, haversine, ringArea } from "./GeoMapBits";

// ============================================================
// TYPES
// ============================================================
import { askAssistant, assistantStore } from "./assistant/store";
import { dataFetch } from "./api";
import { STATUTS, type QEquip, type Statut } from "./equip";
import GeoEquip, { FicheEquip } from "./GeoEquip";
export type QuartierFull = {
  quartier_id: number; nom: string; commune: string; surface_km2: number | null;
  population: number; menages: number; hommes: number; femmes: number;
  nb_sante: number; dens_sante: number | null;
  nb_education: number; dens_education: number | null;
  nb_commerce: number; dens_commerce: number | null;
  nb_sport: number; dens_sport: number | null;
  nb_transport: number; dens_transport: number | null;
  nb_banque: number; dens_banque: number | null;
  nb_assurance: number; dens_assurance: number | null;
  nb_religion: number; dens_religion: number | null;
  acc_sante: number | null; acc_education: number | null; acc_commerce: number | null;
  acc_sport: number | null; acc_transport: number | null; acc_banque: number | null;
  acc_assurance: number | null; acc_religion: number | null; acc_globale: number | null;
  acc_routiere_dist_m: number | null; acc_routiere_indice: number | null;
  ind_instruction: number | null; ind_instruction_0_1: number | null;
  ind_niveau_vie: number | null; ind_niveau_vie_0_1: number | null;
  geometry: any;
} & Partial<SegResults> & { eq?: QEquip };

/** Resultats valides de l'analyse (fichier resultats_quartiers.json, joint par quartier_id). */
export type SegResults = {
  instruction_0_1: number | null; instruction_quartile: string | null; niveau_vie_0_1_corrige: number | null; niveau_vie_quartile: string | null;
  part_sans_niveau: number | null; part_prescolaire: number | null; part_primaire: number | null; part_moyen: number | null; part_secondaire: number | null; part_superieur: number | null;
  LQ_sans_niveau: number | null; LQ_prescolaire: number | null; LQ_primaire: number | null; LQ_moyen: number | null; LQ_secondaire: number | null; LQ_superieur: number | null;
  entropie_scolaire_locale: number | null;
  offre_infra_0_1: number | null; offre_infra_quartile: string | null;
  acces_global_moyen_0_1: number | null; acces_route_moyen_0_1: number | null; distance_route_moy_m: number | null; part_cellules_LL_acces: number | null;
  flux_emis: number | null; flux_recus: number | null; volume_echanges: number | null; solde_echanges: number | null; indice_attractivite: number | null;
  LQ_emission_hab: number | null; LQ_reception_hab: number | null; categorie_attractivite: string | null;
  LISA_instruction_0_1: string | null; LISA_niveau_vie_0_1_corrige: string | null; LISA_offre_infra_0_1: string | null; LISA_acces_global_moyen_0_1: string | null;
  LISA_indice_attractivite: string | null; LISA_flux_emis: string | null; LISA_flux_recus: string | null;
  classe: number | null; nom_classe: string | null; CP1: number | null; CP2: number | null; silhouette: number | null;
};

export const CLASS_COLORS = ["#2878d6", "#eb6735", "#1ab07a", "#eda200", "#e87aa4"];
export const CLASS_NAMES = ["Résidentiels aisés et instruits", "Centraux et péricentraux équipés", "Populaires denses, peu instruits", "Intermédiaires sous-équipés", "Périphérie peu urbanisée"];
export const LISA_CATS = [
  { key: "HH", label: "HH — Forte valeur entourée de fortes valeurs", color: "#d7301f" },
  { key: "LL", label: "LL — Faible valeur entourée de faibles valeurs", color: "#2b6cb0" },
  { key: "LH", label: "LH — Faible valeur entourée de fortes valeurs", color: "#8ec5f0" },
  { key: "HL", label: "HL — Forte valeur entourée de faibles valeurs", color: "#f4a3c0" },
  { key: "NS", label: "NS — Non significatif", color: "#c9ced3" },
];

export type InfraFamily = "sante" | "education" | "commerce" | "sport" | "religion" | "transport" | "banque" | "assurance";

export const INFRA_FAMILIES: { key: InfraFamily; label: string; color: string; icon: any; file: string }[] = [
  { key: "sante", label: "Santé", color: "#e53935", icon: Building2, file: "sante" },
  { key: "education", label: "Éducation", color: "#1e88e5", icon: GraduationCap, file: "education" },
  { key: "commerce", label: "Commerce", color: "#fb8c00", icon: ShoppingBag, file: "commerce" },
  { key: "sport", label: "Sport", color: "#43a047", icon: Dumbbell, file: "sport" },
  { key: "religion", label: "Religion", color: "#8e24aa", icon: Landmark, file: "religion" },
  { key: "transport", label: "Transport", color: "#00897b", icon: Bus, file: "transport" },
  { key: "banque", label: "Banque", color: "#3949ab", icon: CircleDollarSign, file: "banque" },
  { key: "assurance", label: "Assurance", color: "#d81b60", icon: ShieldCheck, file: "assurance" },
];

export type IndicatorDef = {
  id: string; label: string; category: "densite" | "accessibilite" | "instruction" | "niveauvie" | "population" | "segregation" | "effectif" | "equipement";
  get: (q: QuartierFull) => number | null; unit: string; ramp: string[];
  /** Couche qualitative (classes, clusters LISA) : couleur par categorie plutot que par quartile. */
  cats?: { key: string; label: string; color: string }[]; getKey?: (q: QuartierFull) => string | null;
  /** Effectif, volume ou taille : represente en cercles proportionnels (surface ∝ valeur) plutot qu'en aplat de couleur. */
  circles?: boolean; color?: string;
};

export const RAMP_DENSITE = ["#fff3e0", "#ffcc80", "#ff9800", "#e65100"];
export const RAMP_ACCESS = ["#e0f7fa", "#80cbc4", "#00897b", "#00332b"];
export const RAMP_INSTRUCTION = ["#f3e5f5", "#ce93d8", "#8e24aa", "#4a0072"];
export const RAMP_NIVEAUVIE = ["#fce4ec", "#f48fb1", "#ad1457", "#560027"];
export const RAMP_ROUTIER = ["#e3f2fd", "#90caf9", "#1e88e5", "#0d2b52"];
export const RAMP_POPULATION = ["#e0f2fe", "#7dd3fc", "#0ea5e9", "#0c4a6e"];

export const DENSITY_INDICATORS: IndicatorDef[] = INFRA_FAMILIES.map(f => ({
  id: `dens_${f.key}`, label: f.label, category: "densite",
  get: (q) => (q as any)[`dens_${f.key}`], unit: "/ km²", ramp: RAMP_DENSITE,
}));

export const ACCESS_INDICATORS: IndicatorDef[] = [
  ...INFRA_FAMILIES.map(f => ({
    id: `acc_${f.key}`, label: f.label, category: "accessibilite" as const,
    get: (q: QuartierFull) => (q as any)[`acc_${f.key}`], unit: "/ 1", ramp: RAMP_ACCESS,
  })),
  { id: "acc_globale", label: "Globale (tous types)", category: "accessibilite", get: (q) => q.acc_globale, unit: "/ 1", ramp: RAMP_ACCESS },
];

export const SOCIO_INDICATORS: IndicatorDef[] = [
  { id: "ind_instruction_0_1", label: "Niveau d'instruction", category: "instruction", get: (q) => q.ind_instruction_0_1, unit: "/ 1", ramp: RAMP_INSTRUCTION },
  { id: "ind_niveau_vie_0_1", label: "Richesse matérielle", category: "niveauvie", get: (q) => q.ind_niveau_vie_0_1, unit: "/ 1", ramp: RAMP_NIVEAUVIE },
];

export const POP_INDICATORS: IndicatorDef[] = [
  { id: "population", label: "Population (RGPH-5)", category: "population", get: (q) => q.population, unit: "hab.", ramp: RAMP_POPULATION, circles: true, color: "#0ea5e9" },
  { id: "densite_pop", label: "Densité de population", category: "population", get: (q) => (q.surface_km2 ? q.population / q.surface_km2 : null), unit: "hab./km²", ramp: RAMP_POPULATION },
];

const RAMP_OFFRE = ["#fff7e6", "#fdd49e", "#fc8d59", "#b30000"];
const RAMP_FLUX = ["#edf8fb", "#b3cde3", "#8c96c6", "#6e016b"];
const RAMP_ATTRACT = ["#d73027", "#fdae61", "#abd9e9", "#2c7bb6"];
const RAMP_LQ = ["#f7fcf5", "#c7e9c0", "#74c476", "#00441b"];
const lisa = (id: string, label: string, key: keyof SegResults): IndicatorDef => ({
  id, label, category: "segregation", get: () => null, unit: "cluster LISA", ramp: [],
  cats: LISA_CATS, getKey: q => (q[key] as string | null | undefined) ?? null,
});
/** Resultats valides de l'analyse de segregation (indices, LISA, profils K-means). */
export const SEG_INDICATORS: IndicatorDef[] = [
  { id: "classe", label: "Profil du quartier (5 classes)", category: "segregation", get: q => q.classe ?? null, unit: "classe", ramp: [],
    cats: CLASS_NAMES.map((l, i) => ({ key: String(i + 1), label: `${i + 1}. ${l}`, color: CLASS_COLORS[i] })), getKey: q => (q.classe ? String(q.classe) : null) },
  { id: "offre_infra_0_1", label: "Offre d'infrastructures (indicateur synthétique)", category: "segregation", get: q => q.offre_infra_0_1 ?? null, unit: "/ 1", ramp: RAMP_OFFRE },
  { id: "LQ_superieur", label: "Coefficient de localisation — supérieur", category: "segregation", get: q => q.LQ_superieur ?? null, unit: "ratio", ramp: RAMP_LQ },
  { id: "LQ_sans_niveau", label: "Coefficient de localisation — sans niveau", category: "segregation", get: q => q.LQ_sans_niveau ?? null, unit: "ratio", ramp: RAMP_LQ },
  { id: "entropie_scolaire_locale", label: "Diversité scolaire locale (entropie)", category: "segregation", get: q => q.entropie_scolaire_locale ?? null, unit: "nats", ramp: ["#eff3ff", "#bdd7e7", "#6baed6", "#08519c"] },
  { id: "indice_attractivite", label: "Indice d'attractivité (mobilité)", category: "segregation", get: q => q.indice_attractivite ?? null, unit: "−1 à +1", ramp: RAMP_ATTRACT },
  { id: "flux_emis", label: "Flux émis", category: "segregation", get: q => q.flux_emis ?? null, unit: "flux", ramp: RAMP_FLUX, circles: true, color: "#8c5cc6" },
  { id: "flux_recus", label: "Flux reçus", category: "segregation", get: q => q.flux_recus ?? null, unit: "flux", ramp: RAMP_FLUX, circles: true, color: "#6e016b" },
  lisa("LISA_instruction_0_1", "LISA — Instruction", "LISA_instruction_0_1"),
  lisa("LISA_niveau_vie_0_1_corrige", "LISA — Richesse matérielle", "LISA_niveau_vie_0_1_corrige"),
  lisa("LISA_offre_infra_0_1", "LISA — Offre d'infrastructures", "LISA_offre_infra_0_1"),
  lisa("LISA_acces_global_moyen_0_1", "LISA — Accessibilité globale", "LISA_acces_global_moyen_0_1"),
  lisa("LISA_indice_attractivite", "LISA — Indice d'attractivité", "LISA_indice_attractivite"),
  lisa("LISA_flux_emis", "LISA — Flux émis", "LISA_flux_emis"),
  lisa("LISA_flux_recus", "LISA — Flux reçus", "LISA_flux_recus"),
];


// ---------- ratios, normes et équipements (éducation primaire, santé) : voir equip.ts ----------
const eqv = (f: (e: QEquip) => number | null) => (q: QuartierFull) => (q.eq ? f(q.eq) : null);
const RAMP_BESOIN = ["#fff5eb", "#fdbe85", "#e6550d", "#7f2704"];
const RAMP_COUV = ["#fde0dd", "#fa9fb5", "#c51b8a", "#49006a"];
const STATUT_CATS = STATUTS.map(s => ({ key: s.key, label: s.label, color: s.color }));
const statutInd = (id: string, label: string, f: (e: QEquip) => Statut): IndicatorDef => ({
  id, label, category: "equipement", get: () => null, unit: "statut", ramp: [], cats: STATUT_CATS, getKey: q => (q.eq ? f(q.eq) : null),
});
export const EQUIP_INDICATORS: IndicatorDef[] = [
  statutInd("edu_statut", "Primaire — situation par rapport à la norme", e => e.statut_edu),
  { id: "edu_enf_ecole", label: "Primaire — enfants de 6-11 ans par école", category: "equipement", get: eqv(e => e.enfants_par_ecole), unit: "enfants / école", ramp: RAMP_BESOIN },
  { id: "edu_couverture", label: "Primaire — places disponibles ÷ enfants (%)", category: "equipement", get: eqv(e => (e.couverture_edu === null ? null : e.couverture_edu * 100)), unit: "%", ramp: RAMP_COUV },
  { id: "edu_manquantes", label: "Primaire — écoles manquantes (cercles)", category: "equipement", get: eqv(e => e.ecoles_manquantes), unit: "écoles", ramp: RAMP_BESOIN, circles: true, color: "#e6550d" },
  statutInd("san_statut", "Santé — situation par rapport à la norme (équivalents-poste)", e => e.statut_san),
  { id: "san_hab_eps", label: "Santé — habitants par équivalent-poste de santé", category: "equipement", get: eqv(e => e.hab_par_eps), unit: "hab. / équiv.-poste", ramp: RAMP_BESOIN },
  { id: "san_couverture", label: "Santé — couverture de la norme (%)", category: "equipement", get: eqv(e => (e.couverture_san === null ? null : e.couverture_san * 100)), unit: "%", ramp: RAMP_COUV },
  { id: "san_manquants", label: "Santé — équivalents-poste manquants (cercles)", category: "equipement", get: eqv(e => e.eps_manquants), unit: "équiv.-poste", ramp: RAMP_BESOIN, circles: true, color: "#c51b8a" },
  statutInd("pers_inf_statut", "Personnel — infirmiers : norme OMS (aire du poste)", e => e.statut_inf),
  { id: "pers_inf", label: "Personnel — infirmiers pour 5 000 hab. (aire du poste)", category: "equipement", get: eqv(e => e.inf_ratio), unit: "pour 5 000 hab.", ramp: RAMP_COUV },
  { id: "pers_med", label: "Personnel — médecins pour 10 000 hab. (aire du poste)", category: "equipement", get: eqv(e => e.med_ratio), unit: "pour 10 000 hab.", ramp: RAMP_COUV },
];

/** Effectifs, volumes et tailles : toujours en cercles proportionnels. */
const nbTotal = (q: QuartierFull) => INFRA_FAMILIES.reduce((a, f) => a + (((q as any)[`nb_${f.key}`] as number) || 0), 0);
export const CIRCLE_INDICATORS: IndicatorDef[] = [
  { id: "menages", label: "Ménages", category: "effectif", get: q => q.menages, unit: "ménages", ramp: RAMP_POPULATION, circles: true, color: "#6366f1" },
  { id: "surface", label: "Superficie du quartier", category: "effectif", get: q => q.surface_km2, unit: "km²", ramp: RAMP_POPULATION, circles: true, color: "#10b981" },
  { id: "nb_equip", label: "Nombre d'équipements (total)", category: "effectif", get: nbTotal, unit: "équip.", ramp: RAMP_DENSITE, circles: true, color: "#f59e0b" },
  ...INFRA_FAMILIES.map(f => ({ id: `nb_${f.key}`, label: `Nombre d'équipements — ${f.label}`, category: "effectif" as const, get: (q: QuartierFull) => (q as any)[`nb_${f.key}`] as number, unit: "équip.", ramp: RAMP_DENSITE, circles: true, color: f.color })),
  { id: "volume_echanges", label: "Volume d'échanges (flux émis + reçus)", category: "effectif", get: q => q.volume_echanges ?? null, unit: "flux", ramp: RAMP_FLUX, circles: true, color: "#a21caf" },
];
export const ALL_INDICATORS = [...POP_INDICATORS, ...DENSITY_INDICATORS, ...ACCESS_INDICATORS, ...SOCIO_INDICATORS, ...SEG_INDICATORS, ...EQUIP_INDICATORS, ...CIRCLE_INDICATORS];

// ============================================================
// STATISTIQUES & CLASSIFICATION PAR QUARTILES
// ============================================================
export function computeStats(values: number[], method: ClassMethod = "quartiles") {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const quantile = (p: number) => {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const q1 = quantile(0.25), q2 = quantile(0.5), q3 = quantile(0.75);
  const [b1, b2, b3] = classBreaks(sorted, method, [q1, q2, q3]);
  return {
    min: sorted[0], max: sorted[n - 1], mean, median: quantile(0.5),
    q1, q2, q3, b1, b2, b3, method, count: n,
  };
}

export function quartileClass(value: number | null, stats: ReturnType<typeof computeStats>): 0 | 1 | 2 | 3 | null {
  if (value === null || !stats) return null;
  if (value <= stats.b1) return 0;
  if (value <= stats.b2) return 1;
  if (value <= stats.b3) return 2;
  return 3;
}

// ============================================================
// COMPOSANT : COUCHE D'INFRASTRUCTURES EN CLUSTERS (SUPERCLUSTER)
// ============================================================
function InfraClusterLayer({ points, color, onSelect }: { points: any[]; color: string; onSelect: (p: any) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const index = new Supercluster({ radius: 55, maxZoom: 17 }).load(points as any);
    const group = L.layerGroup().addTo(map);
    const render = () => {
      group.clearLayers();
      const b = map.getBounds();
      const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const zoom = Math.round(map.getZoom());
      let clusters: any[];
      try { clusters = index.getClusters(bbox, zoom); } catch { clusters = []; }
      clusters.forEach((c: any) => {
        const [lng, lat] = c.geometry.coordinates;
        if (c.properties.cluster) {
          const count = c.properties.point_count;
          const size = count < 10 ? 30 : count < 50 ? 38 : 46;
          const icon = L.divIcon({
            html: `<div class="infra-cluster" style="background:${color};width:${size}px;height:${size}px;line-height:${size}px">${count}</div>`,
            className: "infra-cluster-icon", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          });
          const marker = L.marker([lat, lng], { icon });
          marker.on("click", () => map.setView([lat, lng], Math.min(zoom + 2, 18), { animate: true }));
          group.addLayer(marker);
        } else {
          const icon = L.divIcon({
            html: `<span class="infra-dot" style="background:${color}"></span>`,
            className: "infra-dot-icon", iconSize: [14, 14], iconAnchor: [7, 7],
          });
          const marker = L.marker([lat, lng], { icon });
          marker.on("click", () => onSelect(c.properties));
          group.addLayer(marker);
        }
      });
    };
    render();
    map.on("moveend zoomend", render);
    return () => { map.off("moveend zoomend", render); map.removeLayer(group); };
  }, [map, points, color, onSelect]);
  return null;
}

// ============================================================
// LEGENDE DYNAMIQUE
// ============================================================
function CatLegend({ indicator, quartiers }: { indicator: IndicatorDef; quartiers: QuartierFull[] }) {
  const n = (k: string) => quartiers.filter(q => indicator.getKey?.(q) === k).length;
  return (
    <div className="geo-legend">
      <div className="geo-legend-title">{indicator.label}</div>
      {indicator.cats!.map(c => (
        <div className="geo-legend-row" key={c.key}>
          <i style={{ background: c.color }} />
          <span>{c.label}</span>
          <small>{n(c.key)}</small>
        </div>
      ))}
    </div>
  );
}

function Legend({ indicator, stats }: { indicator: IndicatorDef; stats: ReturnType<typeof computeStats> }) {
  if (!stats) return null;
  const labels = ["Classe 1 — Faible", "Classe 2 — Moyen-faible", "Classe 3 — Moyen-élevé", "Classe 4 — Élevé"];
  const thresholds = [stats.min, stats.b1, stats.b2, stats.b3, stats.max];
  const lf = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("fr-FR") : v.toFixed(2));
  return (
    <div className="geo-legend">
      <div className="geo-legend-title">{indicator.label}</div>
      <div className="geo-legend-method">{CLASS_METHODS.find(m => m.key === stats.method)?.label}</div>
      {indicator.ramp.map((color, i) => (
        <div className="geo-legend-row" key={i}>
          <i style={{ background: color }} />
          <span>{labels[i]}</span>
          <small>{lf(thresholds[i])} – {lf(thresholds[i + 1])}</small>
        </div>
      ))}
    </div>
  );
}

export function StatsPanel({ indicator, stats }: { indicator: IndicatorDef; stats: ReturnType<typeof computeStats> }) {
  if (!stats) return null;
  return (
    <div className="geo-stats-panel">
      <div className="geo-stats-title"><Gauge size={14} /> Statistiques — {indicator.label}</div>
      <div className="geo-stats-grid">
        <div><small>Min</small><b>{stats.min.toFixed(2)}</b></div>
        <div><small>Max</small><b>{stats.max.toFixed(2)}</b></div>
        <div><small>Moyenne</small><b>{stats.mean.toFixed(2)}</b></div>
        <div><small>Médiane</small><b>{stats.median.toFixed(2)}</b></div>
        <div><small>N quartiers</small><b>{stats.count}</b></div>
        <div><small>Unité</small><b>{indicator.unit}</b></div>
      </div>
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
const BASEMAPS = [
  { key: "sat", label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", thumb: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/13/3755/3710", attr: "Imagerie © Esri", sub: "abc" },
  { key: "plan", label: "Rue", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", thumb: "https://a.tile.openstreetmap.org/13/3710/3755.png", attr: "© OpenStreetMap", sub: "abc" },
  { key: "topo", label: "Topographique", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", thumb: "https://a.tile.opentopomap.org/13/3710/3755.png", attr: "© OpenTopoMap, © OpenStreetMap", sub: "abc" },
  { key: "dark", label: "Sombre", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", thumb: "https://a.basemaps.cartocdn.com/dark_all/13/3710/3755.png", attr: "© CARTO, © OpenStreetMap", sub: "abcd" },
] as const;
type Tool = "none" | "measure" | "draw" | "buffer" | "pos";
const fmtV = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("fr-FR") : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

function ToolClicks({ toolRef, onPoint }: { toolRef: React.MutableRefObject<Tool>; onPoint: (p: L.LatLng, t: Tool) => void }) {
  useMapEvents({ click(e) { const t = toolRef.current; if (t === "measure" || t === "draw" || t === "buffer" || t === "pos") onPoint(e.latlng, t); } });
  return null;
}

type Props = { quartiers: QuartierFull[]; communeGeo: any; onOpenProfile?: (q: any) => void; onExportCSV?: () => void; initialIndicator?: string; census?: any; navigate?: (p: string) => void; search?: string };
export default function Geoportail({ quartiers, communeGeo, onOpenProfile, onExportCSV, initialIndicator, census, navigate, search = "" }: Props) {
  const [showQuartiers, setShowQuartiers] = useState(true);
  const [showCommunes, setShowCommunes] = useState(true);
  const [showReseau, setShowReseau] = useState(false);
  const [showGrille, setShowGrille] = useState(false);
  const [activeInfra, setActiveInfra] = useState<Set<InfraFamily>>(new Set());
  const [infraData, setInfraData] = useState<Record<string, any[]>>({});
  const [reseauData, setReseauData] = useState<any>(null);
  const [grilleData, setGrilleData] = useState<any>(null);
  const [gridCount, setGridCount] = useState<number | null>(null);
  const [indicatorId, setIndicatorId] = useState<string>(initialIndicator || "none");
  const [panelOpen, setPanelOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [selectedQuartier, setSelectedQuartier] = useState<QuartierFull | null>(null);
  const [selectedInfra, setSelectedInfra] = useState<any | null>(null);
  const [selectedCell, setSelectedCell] = useState<any | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"them" | "req" | "mes">("them");
  const [layerFilter, setLayerFilter] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [openTheme, setOpenTheme] = useState<string | null>(null);
  const [baseKey, setBaseKey] = useState<(typeof BASEMAPS)[number]["key"]>("sat");
  const [opacity, setOpacity] = useState(80);
  const [classMethod, setClassMethod] = useState<ClassMethod>("quartiles");
  const [infraPanel, setInfraPanel] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [tool, setTool] = useState<Tool>("none");
  const [pts, setPts] = useState<L.LatLng[]>([]);
  const [radius, setRadius] = useState(500);
  // ---- requetes (seuils, filtres statistiques, requetes spatiales) ----
  const qCtx = useMemo(() => makeCtx(quartiers), [quartiers]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleMode, setRuleMode] = useState<"and" | "or">("and");
  const qRes = useMemo(() => runRules(rules, ruleMode, qCtx), [rules, ruleMode, qCtx]);
  const matchSet = useMemo(() => (rules.length ? new Set(qRes.ids) : null), [rules, qRes]);
  const matchSig = matchSet ? qRes.ids.join("-") : "";
  const toolRef = useRef<Tool>("none"); toolRef.current = tool;
  const qRef = useRef<L.GeoJSON | null>(null);
  const gRef = useRef<L.GeoJSON | null>(null);

  const base = BASEMAPS.find(b => b.key === baseKey)!;
  const indicator = ALL_INDICATORS.find(i => i.id === indicatorId) || null;
  const isRoutier = indicatorId === "routier";
  // L'accessibilite (8 types + globale) est calculee a l'echelle de la grille de 200 m ; seules les densites
  // d'equipements, la population et les indices ACP restent a l'echelle quartier. "routier" n'existe qu'a l'echelle grille.
  const isGridIndicator = isRoutier || indicator?.category === "accessibilite";
  useEffect(() => { assistantStore.setMap({ source: "geoportail", indicatorId, layer: isGridIndicator ? "grille" : "quartiers", quartierId: selectedQuartier?.quartier_id ?? null, families: [...activeInfra] }); }, [indicatorId, selectedQuartier, isGridIndicator, activeInfra]);
  useEffect(() => () => assistantStore.setMap(null), []);
  const gridPropertyKey = isRoutier ? "acc_routiere_indice" : indicatorId;

  useEffect(() => { dataFetch("/data/datasets_catalog.json").then(r => r.json()).then((c: any[]) => { const g = c.find(x => x.id === "grille"); if (g) setGridCount(g.count); }).catch(() => {}); }, []);

  // Charger une famille d'infrastructures a la demande (lazy)
  const loadInfra = (key: InfraFamily) => {
    if (infraData[key]) return;
    dataFetch(`/data/infrastructures/infra_${key}.geojson`).then(r => r.json()).then(geo => setInfraData(prev => ({ ...prev, [key]: geo.features })));
  };
  const toggleInfra = (key: InfraFamily) => {
    setActiveInfra(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    loadInfra(key);
  };
  useEffect(() => { if (showReseau && !reseauData) dataFetch("/data/reseau_routier.geojson").then(r => r.json()).then(setReseauData); }, [showReseau, reseauData]);
  useEffect(() => { if ((showGrille || isGridIndicator) && !grilleData) dataFetch("/data/grille_200m.geojson").then(r => r.json()).then(setGrilleData); }, [showGrille, isGridIndicator, grilleData]);

  const stats = useMemo(() => {
    if (!indicator || isGridIndicator) return null;
    if (indicator.cats) return null;
    return computeStats(quartiers.map(indicator.get).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v)), classMethod);
  }, [indicator, quartiers, isGridIndicator, classMethod]);
  const gridStats = useMemo(() => {
    if (!isGridIndicator || !grilleData) return null;
    return computeStats(grilleData.features.map((f: any) => f.properties[gridPropertyKey]).filter((v: any) => v !== null && v !== undefined), classMethod);
  }, [isGridIndicator, grilleData, gridPropertyKey, classMethod]);

  const colorFor = (value: number | null, ind: IndicatorDef, st: ReturnType<typeof computeStats>, q?: QuartierFull) => {
    if (ind.cats) { const k = q && ind.getKey ? ind.getKey(q) : null; return ind.cats.find(c => c.key === k)?.color ?? "#9aa7b1"; }
    const c = quartileClass(value, st); return c === null ? "#9aa7b1" : ind.ramp[c];
  };
  const op = opacity / 100;
  const queryMatch = (q: QuartierFull) => !matchSet || matchSet.has(q.quartier_id);
  const circleMode = !!indicator?.circles && !isGridIndicator;
  const quartierStyle = (feature: any) => {
    const q = feature.properties as QuartierFull;
    const ok = queryMatch(q);
    if (!indicator) return matchSet
      ? { color: ok ? "#fde047" : "#22d3ee", weight: ok ? 2.2 : 1, fillColor: ok ? "#fde047" : "#22d3ee", fillOpacity: ok ? 0.45 : 0.04 }
      : { color: "#22d3ee", weight: 1.3, fillColor: "#22d3ee", fillOpacity: 0.07 * (op / 0.8) };
    if (circleMode) return { color: ok && matchSet ? "#fde047" : "rgba(255,255,255,.6)", weight: ok && matchSet ? 2.2 : 1, fillColor: "#94a3b8", fillOpacity: (ok ? 0.22 : 0.05) * (op / 0.8) };
    return { color: ok && matchSet ? "#fde047" : "rgba(255,255,255,.75)", weight: ok && matchSet ? 2.4 : 1, fillColor: colorFor(indicator.get(q), indicator, stats, q), fillOpacity: (ok ? 0.85 : 0.12) * op };
  };
  const gridIndicatorDef: IndicatorDef = isRoutier
    ? { id: "routier", label: "Accessibilité routière", category: "accessibilite", get: () => null, unit: "indice 0-1", ramp: RAMP_ROUTIER }
    : (indicator as IndicatorDef);
  const grilleStyle = (feature: any) => {
    const cls = quartileClass(feature.properties[gridPropertyKey], gridStats);
    return { color: "rgba(255,255,255,.35)", weight: 0.4, fillColor: cls === null ? "#9aa7b1" : gridIndicatorDef.ramp[cls], fillOpacity: 0.85 * op };
  };

  useEffect(() => { qRef.current?.setStyle(quartierStyle as any); gRef.current?.setStyle(grilleStyle as any); }, [opacity]); // eslint-disable-line

  // Recherche globale (barre du haut) : filtre + zoom sur le premier quartier trouve
  const filteredQuartiers = useMemo(() => {
    const s = search.trim().toLowerCase(); if (!s) return quartiers;
    return quartiers.filter(q => q.nom.toLowerCase().includes(s) || q.commune.toLowerCase().includes(s));
  }, [quartiers, search]);
  useEffect(() => {
    if (!map || !search.trim() || !filteredQuartiers.length || filteredQuartiers.length === quartiers.length) return;
    const t = setTimeout(() => { const b = L.geoJSON(filteredQuartiers.map(q => ({ type: "Feature", properties: {}, geometry: q.geometry })) as any).getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 15 }); }, 350);
    return () => clearTimeout(t);
  }, [search, map, filteredQuartiers, quartiers.length]);

  // ---------- outils cartographiques ----------
  const chooseTool = (t: Tool) => { setPts([]); setTool(prev => (prev === t ? "none" : t)); };
  const onPoint = (p: L.LatLng, t: Tool) => { if (t === "pos") { acceptPos(p); setTool("none"); return; } setPts(prev => (t === "buffer" ? [p] : [...prev, p])); };
  const toolResult = useMemo(() => {
    if (tool === "measure" && pts.length > 1) { let m = 0; for (let i = 1; i < pts.length; i++) m += haversine(pts[i - 1], pts[i]); return `Distance : ${fmtLen(m)} (${pts.length} points)`; }
    if (tool === "draw" && pts.length > 2) { let per = 0; for (let i = 0; i < pts.length; i++) per += haversine(pts[i], pts[(i + 1) % pts.length]); return `Surface : ${fmtArea(ringArea(pts))} · périmètre ${fmtLen(per)}`; }
    if (tool === "buffer" && pts[0]) {
      const act = Array.from(activeInfra).filter(k => infraData[k]);
      if (!act.length) return `Zone de ${fmtLen(radius)} : activez des familles d'équipements pour les compter.`;
      const parts = act.map(k => { const f = INFRA_FAMILIES.find(x => x.key === k)!; const n = infraData[k].filter((p: any) => haversine(pts[0], L.latLng(p.geometry.coordinates[1], p.geometry.coordinates[0])) <= radius).length; return `${f.label} ${n}`; });
      return `Dans ${fmtLen(radius)} : ${parts.join(" · ")}`;
    }
    if (tool === "pos") return "Cliquez sur la carte pour placer votre position.";
    if (tool === "measure") return "Cliquez sur la carte pour mesurer une distance.";
    if (tool === "draw") return "Cliquez pour dessiner un polygone (3 points minimum).";
    if (tool === "buffer") return "Cliquez sur la carte pour tracer une zone tampon.";
    return "";
  }, [tool, pts, radius, activeInfra, infraData]);
  const circleMax = useMemo(() => (indicator?.circles ? Math.max(0, ...quartiers.map(q => indicator.get(q) ?? 0)) : 0), [indicator, quartiers]);
  const bufferRule = tool === "buffer" && pts[0] ? { lat: pts[0].lat, lng: pts[0].lng, m: radius } : null;
  const pickQuartier = (id: number) => {
    const q = quartiers.find(x => x.quartier_id === id); if (!q) return;
    setSelectedQuartier(q);
    const b = L.geoJSON({ type: "Feature", properties: {}, geometry: q.geometry } as any).getBounds(); if (b.isValid()) map?.fitBounds(b, { padding: [60, 60], maxZoom: 16 });
  };
  const zoomResults = () => {
    if (!qRes.ids.length) return;
    const b = L.geoJSON(qRes.ids.map(id => ({ type: "Feature", properties: {}, geometry: quartiers.find(q => q.quartier_id === id)!.geometry })) as any).getBounds();
    if (b.isValid()) map?.fitBounds(b, { padding: [50, 50], maxZoom: 15 });
  };


  // ---------- position de l'utilisateur, rayon d'infrastructures, itineraires ----------
  const [myPos, setMyPos] = useState<L.LatLng | null>(null);
  const [posMsg, setPosMsg] = useState(""); const [posBusy, setPosBusy] = useState(false);
  const [aroundReq, setAroundReq] = useState<{ km: number; fams: string[]; spec?: TargetSpec } | null>(null);
  const [aroundRes, setAroundRes] = useState<{ fam: string; props: any; pos: [number, number]; d: number }[] | null>(null);
  const [routeReq, setRouteReq] = useState<{ mode: Mode; spec: TargetSpec } | null>(null);
  type PerMode = { tree: Tree; ranked: Found[]; d0: number } | null;
  const [routeData, setRouteData] = useState<{ spec: TargetSpec; mode: Mode; pick: number; per: Record<Mode, PerMode>; warn?: string } | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const infraCache = useRef<Record<string, any[]>>({});
  const graphP = useRef<Promise<Graph> | null>(null);
  const pendingRef = useRef<((ll: L.LatLng) => void) | null>(null);
  const allFams = INFRA_FAMILIES.map(f => f.key as string);
  const famColor = (k: string) => INFRA_FAMILIES.find(f => f.key === k)?.color ?? "#94a3b8";

  const ensureInfra = async (keys: string[]) => {
    await Promise.all(keys.filter(k => !infraCache.current[k]).map(async k => { const geo = await (await dataFetch(`/data/infrastructures/infra_${k}.geojson`)).json(); infraCache.current[k] = geo.features; }));
    return infraCache.current;
  };
  const ensureGraph = () => (graphP.current ??= dataFetch("/data/reseau_routier.geojson").then(r => r.json()).then(buildGraph).then(g => { setGraph(g); return g; }));

  const acceptPos = (ll: L.LatLng, note = "") => {
    setMyPos(ll);
    const cs = [...qCtx.centroids.values()]; const lat0 = cs.reduce((a, c) => a + c[1], 0) / cs.length, lng0 = cs.reduce((a, c) => a + c[0], 0) / cs.length;
    const off = distM([lng0, lat0], [ll.lng, ll.lat]);
    if (off > 12000) setPosMsg(`Cette position est à ${Math.round(off / 1000)} km de Thiès : hors de la zone d'étude. Utilisez « Pointer sur la carte » pour la placer dans la ville. ${note}`);
    else { setPosMsg(note); map?.flyTo(ll, Math.max(map.getZoom(), 14), { duration: 0.8 }); }
    const f = pendingRef.current; if (f) { pendingRef.current = null; f(ll); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setPosMsg("Géolocalisation indisponible sur cet appareil : cliquez sur la carte pour placer votre position."); setTool("pos"); return; }
    setPosBusy(true); setPosMsg("Recherche d'une position précise (jusqu'à 15 s)…");
    let best: GeolocationPosition | null = null; let done = false;
    const finish = (id: number, timer: number) => {
      if (done) return; done = true; navigator.geolocation.clearWatch(id); clearTimeout(timer); setPosBusy(false);
      if (!best) { setPosMsg("Position refusée ou indisponible : autorisez la localisation dans le navigateur, ou cliquez sur la carte pour la placer."); setTool("pos"); return; }
      const acc = Math.round(best.coords.accuracy);
      if (acc > 5000) { setPosMsg(`Position trop imprécise (±${acc >= 1000 ? Math.round(acc / 1000) + " km" : acc + " m"}) : le navigateur a localisé votre connexion Internet, pas votre appareil. Activez le GPS / la localisation précise (Wi-Fi), ou cliquez sur la carte pour placer votre position.`); setTool("pos"); return; }
      acceptPos(L.latLng(best.coords.latitude, best.coords.longitude), acc > 1000 ? `Précision moyenne (±${acc} m).` : `Précision ≈ ${acc} m.`);
    };
    // watchPosition : les premieres positions sont souvent grossieres (IP / Wi-Fi), le GPS affine ensuite.
    const id = navigator.geolocation.watchPosition(
      pos => { if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos; if (pos.coords.accuracy <= 200) finish(id, timer); },
      () => finish(id, timer), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    const timer = window.setTimeout(() => finish(id, timer), 15000);
  };
  /** Execute fn avec la position ; si elle est inconnue, la demande puis execute des qu'elle est connue. */
  const withPos = (fn: (ll: L.LatLng) => void) => { if (myPos) fn(myPos); else { pendingRef.current = fn; setPosMsg("Position nécessaire : géolocalisation en cours…"); locate(); } };
  const clearPos = () => { setMyPos(null); setAroundRes(null); setAroundReq(null); setRouteData(null); setRouteReq(null); setPosMsg(""); };

  const doAround = async (ll: L.LatLng, km: number, fams: string[], spec?: TargetSpec) => {
    const keys = fams.length ? fams : allFams; const cache = await ensureInfra(keys);
    const norm = (x: string) => (x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const res: NonNullable<typeof aroundRes> = [];
    for (const k of keys) for (const f of cache[k] ?? []) {
      if (spec?.type && !norm(f.properties?.type).includes(spec.type)) continue;
      const d = distM([ll.lng, ll.lat], f.geometry.coordinates); if (d <= km * 1000) res.push({ fam: k, props: f.properties, pos: f.geometry.coordinates, d });
    }
    res.sort((a, b) => a.d - b.d); setAroundRes(res); setAroundReq({ km, fams, spec });
    map?.fitBounds(ll.toBounds(km * 2000), { padding: [30, 30] });
  };
  const [guide, setGuide] = useState<{ sim: boolean } | null>(null);
  const doRoute = async (ll: L.LatLng, mode: Mode, spec: TargetSpec, startGuide = false) => {
    setPosBusy(true); setPosMsg("Calcul de l'itinéraire sur le réseau routier…");
    try {
      const [g, cache] = await Promise.all([ensureGraph(), ensureInfra(spec.fam ? [spec.fam] : allFams)]);
      const targets = selectTargets(cache, spec); const per = {} as Record<Mode, PerMode>; let warn: string | undefined;
      for (const m of ["foot", "bike", "car"] as Mode[]) {
        const sn = snap(g, m, [ll.lng, ll.lat]); if (!sn) { per[m] = null; continue; }
        const tree = shortestTree(g, m, sn.id); per[m] = { tree, ranked: rankTargets(g, tree, targets, sn.d).slice(0, 5), d0: sn.d };
        if (m === "foot" && sn.d > 1500) warn = `Votre position est à ${(sn.d / 1000).toFixed(1)} km du réseau routier : le début du trajet est une ligne droite.`;
      }
      if (!targets.length) warn = "Aucun équipement de ce type dans la base.";
      setRouteData({ spec, mode, pick: 0, per, warn }); setRouteReq({ mode, spec }); setPosMsg("");
      if (startGuide && per[mode]?.ranked.length) setGuide({ sim: false });
      const f = per[mode]?.ranked[0];
      if (f && map) map.fitBounds(L.latLngBounds([ll, L.latLng(f.target.pos[1], f.target.pos[0])]), { padding: [60, 60], maxZoom: 16 });
    } catch { setPosMsg("Impossible de charger le réseau routier."); }
    setPosBusy(false);
  };
  const routeOut = useMemo(() => {
    if (!routeData || !myPos || !graph) return null;
    const cur = routeData.per[routeData.mode]; if (!cur?.ranked.length) return null;
    return buildRoute(graph, cur.tree, cur.ranked[Math.min(routeData.pick, cur.ranked.length - 1)], [myPos.lng, myPos.lat], cur.d0);
  }, [routeData, myPos, graph]);
  const routeView: RouteView = routeData ? {
    mode: routeData.mode, spec: routeData.spec, pick: routeData.pick, steps: routeOut?.steps ?? [], warn: routeData.warn,
    per: Object.fromEntries((["foot", "bike", "car"] as Mode[]).map(m => { const f = routeData.per[m]?.ranked[0]; return [m, f ? { distM: f.distM, timeS: f.timeS, name: f.target.props.nom, type: f.target.props.type } : null]; })),
    alts: (routeData.per[routeData.mode]?.ranked ?? []).map(f => ({ name: f.target.props.nom, type: f.target.props.type, distM: f.distM, timeS: f.timeS })),
  } : null;
  const aroundView: AroundView = aroundReq && aroundRes ? {
    km: aroundReq.km, fams: aroundReq.fams, total: aroundRes.length, spec: aroundReq.spec,
    byFam: INFRA_FAMILIES.map(f => ({ key: f.key, label: f.label, color: f.color, count: aroundRes.filter(r => r.fam === f.key).length })),
    nearest: aroundRes.slice(0, 6).map(r => ({ name: r.props.nom, type: r.props.type, fam: r.fam, d: r.d })),
  } : null;

  // ---------- liste des thematiques ----------
  type Theme = { id: string; label: string; icon: any; color: string; count: number; items?: { id: string; label: string }[]; fam?: InfraFamily; fams?: { key: InfraFamily; label: string; icon: any; color: string }[]; soon?: boolean };
  const famTotal = (k: string) => quartiers.reduce((s, q) => s + (((q as any)[`nb_${k}`] as number) || 0), 0);
  const themes: Theme[] = [
    { id: "pop", label: "Population", icon: Users, color: "#8b5cf6", count: POP_INDICATORS.length, items: POP_INDICATORS },
    { id: "dens", label: "Densité d'équipements", icon: Gauge, color: "#f59e0b", count: DENSITY_INDICATORS.length, items: DENSITY_INDICATORS },
    { id: "acc", label: "Accessibilité", icon: RouteIcon, color: "#14b8a6", count: ACCESS_INDICATORS.length + 1, items: [...ACCESS_INDICATORS, { id: "routier", label: "Routière (grille 200 m)" }] },
    { id: "acp", label: "Instruction & richesse matérielle", icon: GradCap, color: "#ec4899", count: SOCIO_INDICATORS.length, items: SOCIO_INDICATORS },
    { id: "infra", label: "Infrastructures", icon: Building2, color: "#ef4444", count: INFRA_FAMILIES.reduce((a, f) => a + famTotal(f.key), 0), fams: INFRA_FAMILIES.map(f => ({ key: f.key, label: f.label, icon: f.icon, color: f.color })) },
    { id: "cercles", label: "Effectifs, volumes & tailles (cercles)", icon: CircleDot, color: "#06b6d4", count: CIRCLE_INDICATORS.length, items: CIRCLE_INDICATORS },
    { id: "equip", label: "Ratios & normes (éducation, santé)", icon: GradCap, color: "#0ea5a4", count: EQUIP_INDICATORS.length, items: EQUIP_INDICATORS },
    { id: "seg", label: "Ségrégation & profils", icon: ShieldQuestion, color: "#f43f5e", count: SEG_INDICATORS.length, items: SEG_INDICATORS },
  ];
  const themeOf = (indId: string) => themes.find(t => t.items?.some(i => i.id === indId))?.id ?? null;
  const themeChecked = (t: Theme) => (t.fams ? t.fams.some(f => activeInfra.has(f.key)) : t.fam ? activeInfra.has(t.fam) : t.items ? themeOf(indicatorId) === t.id : false);
  const allOn = (t: Theme) => !!t.fams && t.fams.every(f => activeInfra.has(f.key));
  const toggleTheme = (t: Theme) => {
    if (t.soon) return;
    if (t.fams) { const all = allOn(t); t.fams.forEach(f => { if (all === activeInfra.has(f.key)) toggleInfra(f.key); }); if (!all) setOpenTheme(t.id); return; }
    if (t.fam) { toggleInfra(t.fam); return; }
    if (themeChecked(t)) setIndicatorId("none"); else { setIndicatorId(t.items![0].id); setOpenTheme(t.id); }
  };
  const visibleThemes = themes.filter(t => (t.label.toLowerCase().includes(layerFilter.trim().toLowerCase()) || !!t.fams?.some(f => f.label.toLowerCase().includes(layerFilter.trim().toLowerCase()))) && (!onlyActive || themeChecked(t)));
  const activeLayers = [
    ...(showQuartiers ? [{ id: "q", label: "Quartiers", off: () => setShowQuartiers(false) }] : []),
    ...(showCommunes ? [{ id: "c", label: "Communes", off: () => setShowCommunes(false) }] : []),
    ...(showReseau ? [{ id: "r", label: "Réseau routier", off: () => setShowReseau(false) }] : []),
    ...(showGrille && !isGridIndicator ? [{ id: "g", label: "Grille 200 m", off: () => setShowGrille(false) }] : []),
    ...(indicator || isRoutier ? [{ id: "i", label: `Indicateur : ${isRoutier ? "Accessibilité routière" : indicator!.label}`, off: () => setIndicatorId("none") }] : []),
    ...Array.from(activeInfra).map(k => ({ id: `f${k}`, label: `Équipements : ${INFRA_FAMILIES.find(f => f.key === k)!.label}`, off: () => toggleInfra(k) })),
  ];

  const downloadGeoJSON = () => {
    const fc = { type: "FeatureCollection", features: quartiers.map(({ geometry, ...p }) => ({ type: "Feature", properties: p, geometry })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(fc)], { type: "application/geo+json" }));
    const a = document.createElement("a"); a.href = url; a.download = "quartiers_thies.geojson"; a.click(); URL.revokeObjectURL(url);
  };

  const exportPngMap = () => {
    const ind = indicator && !isGridIndicator ? indicator : null;
    const lf = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("fr-FR") : v.toFixed(2).replace(".", ","));
    const colors = ind ? quartiers.map(q => colorFor(ind.get(q), ind, stats, q)) : quartiers.map(() => "#cfe3ee");
    const legend = !ind ? [{ color: "#cfe3ee", label: "Quartiers de Thiès" }]
      : ind.cats ? ind.cats.map(c => ({ color: c.color, label: c.label }))
      : stats ? ind.ramp.map((col, i) => ({ color: col, label: `${lf([stats.min, stats.b1, stats.b2, stats.b3][i])} – ${lf([stats.b1, stats.b2, stats.b3, stats.max][i])}` })) : [];
    exportThematicPng({
      title: ind ? ind.label : "Quartiers de Thiès", subtitle: ind ? `${ind.unit || ""}${stats && !ind.cats ? " — " + (CLASS_METHODS.find(m => m.key === classMethod)?.label ?? "") : ""}`.replace(/^ — /, "") : "65 quartiers, trois communes",
      features: quartiers, colorOf: i => colors[i], legend, legendTitle: ind ? "Classes" : "Légende",
      source: "ANSD (RGPH-5, 2023), couches du projet", filename: `carte_${(ind?.id ?? "quartiers")}.png`,
    });
  };

  const legendInd = isGridIndicator ? gridIndicatorDef : indicator;
  const legendStats = isGridIndicator ? gridStats : stats;
  const toolCls = tool !== "none" ? "tool-on" : "";

  return (
    <div className="gx">
      <div className={`gx-grid ${panelOpen ? "" : "no-side"} ${rightOpen ? "" : "no-right"}`}>
        {/* ============ PANNEAU GAUCHE ============ */}
        <aside className="gx-card gx-side gx-in" style={{ ["--d" as any]: "0ms" }}>
          <header className="gx-side-head">
            <span className="gx-side-ico"><Layers3 size={20} /></span><h2>Couches &amp; Indicateurs</h2>
            <button onClick={() => setPanelOpen(false)} aria-label="Réduire le panneau"><X size={16} /></button>
          </header>
          <div className="gx-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "them"} className={tab === "them" ? "on" : ""} onClick={() => setTab("them")}>Thèmes</button>
            <button role="tab" aria-selected={tab === "req"} className={tab === "req" ? "on" : ""} onClick={() => setTab("req")}><Wand2 size={11} /> Requêtes{rules.length > 0 && <b>{qRes.ids.length}</b>}</button>
            <button role="tab" aria-selected={tab === "mes"} className={tab === "mes" ? "on" : ""} onClick={() => setTab("mes")}>Couches <b>{activeLayers.length}</b></button>
          </div>

          {tab === "req" ? (
            <>
            <GeoNearbyPanel fams={INFRA_FAMILIES.map(f => ({ key: f.key, label: f.label, color: f.color }))} pos={myPos} msg={posMsg} busy={posBusy} placing={tool === "pos"}
              onLocate={locate} onPlace={() => chooseTool("pos")} onClearPos={clearPos}
              around={aroundView} aroundReq={aroundReq} onAround={(km, fams) => withPos(ll => doAround(ll, km, fams))} onClearAround={() => { setAroundRes(null); setAroundReq(null); }}
              route={routeView} routeReq={routeReq} onRoute={(m, sp) => withPos(ll => doRoute(ll, m, sp))}
              onSwitchMode={m => setRouteData(d => (d ? { ...d, mode: m, pick: 0 } : d))} onPick={i => setRouteData(d => (d ? { ...d, pick: i } : d))} onClearRoute={() => { setRouteData(null); setRouteReq(null); setGuide(null); }} onGuide={sim => setGuide({ sim })} />
            <GeoQueryPanel onAround={a => withPos(ll => doAround(ll, a.km, a.fams, a.spec))} onRoute={r => withPos(ll => doRoute(ll, r.mode, r.spec, r.guide))} ctx={qCtx} rules={rules} setRules={setRules} mode={ruleMode} setMode={setRuleMode} ids={qRes.ids} onPick={pickQuartier} onZoomAll={zoomResults} buffer={bufferRule} />
            </>
          ) : tab === "them" ? <>
            <div className="gx-find">
              <Search size={15} /><input value={layerFilter} onChange={e => setLayerFilter(e.target.value)} placeholder="Rechercher une couche..." aria-label="Rechercher une couche" />
              <button className={onlyActive ? "on" : ""} onClick={() => setOnlyActive(v => !v)} title="N'afficher que les couches actives" aria-label="Filtrer les couches actives"><Filter size={15} /></button>
            </div>
            <ul className="gx-themes">
              {visibleThemes.map(t => {
                const Icon = t.icon; const checked = themeChecked(t); const open = openTheme === t.id && !!(t.items || t.fams);
                return (
                  <li key={t.id} className={`${checked ? "checked" : ""} ${t.soon ? "soon" : ""}`}>
                    <div className="gx-theme-row">
                      <input type="checkbox" checked={t.fams ? allOn(t) : checked} ref={el => { if (el && t.fams) el.indeterminate = checked && !allOn(t); }} disabled={t.soon} onChange={() => toggleTheme(t)} aria-label={t.label} />
                      <span className="gx-theme-ico" style={{ background: t.color }}><Icon size={15} /></span>
                      <span className="gx-theme-name" onClick={() => (t.items || t.fams ? setOpenTheme(open ? null : t.id) : toggleTheme(t))}>{t.label}</span>
                      {t.soon ? <em className="gx-soon">À venir</em> : <span className="gx-count">{t.count.toLocaleString("fr-FR")}</span>}
                      {t.items || t.fams ? <button className="gx-chev" onClick={() => setOpenTheme(open ? null : t.id)} aria-label="Déplier">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="gx-chev-sp" />}
                    </div>
                    {open && t.fams && <div className="gx-sub gx-sub-fam">
                      {t.fams.filter(f => !layerFilter.trim() || t.label.toLowerCase().includes(layerFilter.trim().toLowerCase()) || f.label.toLowerCase().includes(layerFilter.trim().toLowerCase())).map(f => { const FI = f.icon; const on = activeInfra.has(f.key); return (
                        <label key={f.key} className={on ? "on" : ""}><input type="checkbox" checked={on} onChange={() => toggleInfra(f.key)} /><span className="gx-fam-ico" style={{ background: f.color }}><FI size={12} /></span><span className="gx-fam-name">{f.label}</span><span className="gx-count">{famTotal(f.key).toLocaleString("fr-FR")}</span></label>
                      ); })}
                    </div>}
                    {open && t.items && <div className="gx-sub">
                      {t.items!.map(it => (
                        <button key={it.id} className={indicatorId === it.id ? "on" : ""} onClick={() => setIndicatorId(indicatorId === it.id ? "none" : it.id)}><i />{it.label}</button>
                      ))}
                    </div>}
                  </li>
                );
              })}
              {!visibleThemes.length && <li className="gx-empty">Aucune couche ne correspond.</li>}
            </ul>
          </> : (
            <ul className="gx-mine">
              {activeLayers.map(l => <li key={l.id}><span>{l.label}</span><button onClick={l.off} title="Masquer cette couche" aria-label={`Masquer ${l.label}`}><EyeOff size={15} /></button></li>)}
              {!activeLayers.length && <li className="gx-empty">Aucune couche active.</li>}
            </ul>
          )}

          {tab !== "req" && <>
          <h4 className="gx-h4">Couches de base</h4>
          <div className="gx-bases">
            {BASEMAPS.map(b => (
              <button key={b.key} className={baseKey === b.key ? "on" : ""} onClick={() => setBaseKey(b.key)}>
                <span className="gx-thumb" style={{ backgroundImage: `url(${b.thumb})` }} /><em>{b.label}</em>
              </button>
            ))}
          </div>
          <div className="gx-vec">
            <label><input type="checkbox" checked={showQuartiers} onChange={e => setShowQuartiers(e.target.checked)} /> Quartiers</label>
            <label><input type="checkbox" checked={showCommunes} onChange={e => setShowCommunes(e.target.checked)} /> Communes</label>
            <label><input type="checkbox" checked={showReseau} onChange={e => setShowReseau(e.target.checked)} /> Réseau routier</label>
            <label><input type="checkbox" checked={showGrille || isGridIndicator} disabled={isGridIndicator} onChange={e => setShowGrille(e.target.checked)} /> Grille 200 m</label>
          </div>
          <div className="gx-opa"><span>Opacité des couches</span><input type="range" min={20} max={100} value={opacity} onChange={e => setOpacity(Number(e.target.value))} aria-label="Opacité des couches" /><b>{opacity}%</b></div>
          <div className="gx-opa gx-classm"><span>Discrétisation</span>
            <select value={classMethod} onChange={e => setClassMethod(e.target.value as ClassMethod)} aria-label="Méthode de classification" title={CLASS_METHODS.find(m => m.key === classMethod)?.hint}>
              {CLASS_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select></div>

          <h4 className="gx-h4 gx-h4-tools">Outils cartographiques</h4>
          <div className="gx-tools">
            <button className={tool === "measure" ? "on" : ""} onClick={() => chooseTool("measure")}><Ruler size={17} />Mesure</button>
            <button className={tool === "draw" ? "on" : ""} onClick={() => chooseTool("draw")}><PenTool size={17} />Dessin</button>
            <button className={tool === "buffer" ? "on" : ""} onClick={() => chooseTool("buffer")}><CircleDot size={17} />Buffer</button>
            <button onClick={() => { setTool("none"); setPts([]); setTab("req"); }}><Search size={17} />Requête</button>
            <button onClick={() => window.print()}><Printer size={17} />Impression</button>
          </div>

          <div className="gx-export">
            <button className="gx-export-btn" onClick={() => setExportOpen(v => !v)}><Download size={16} /> Exporter la carte <ChevronDown size={15} /></button>
            {exportOpen && <div className="gx-export-menu">
              {onExportCSV && <button onClick={() => { onExportCSV(); setExportOpen(false); }}>Quartiers (CSV)</button>}
              <button onClick={() => { downloadGeoJSON(); setExportOpen(false); }}>Quartiers (GeoJSON)</button>
              <button onClick={() => { exportPngMap(); setExportOpen(false); }}>Carte thématique (PNG)</button>
              <button onClick={() => { setExportOpen(false); window.print(); }}>Imprimer / PDF</button>
            </div>}
          </div>
          </>}
        </aside>

        {/* ============ CENTRE : KPI + CARTE ============ */}
        <div className="gx-center">
          <KpiRow quartiers={quartiers} census={census} gridCount={gridCount} />
          <div className={`gx-map-wrap gx-in ${toolCls}`} ref={wrapRef} style={{ ["--d" as any]: "200ms" }}>
            <MapContainer ref={setMap} center={[14.805, -16.93]} zoom={13} zoomControl={false} scrollWheelZoom preferCanvas className="gx-map">
              <TileLayer key={base.key} attribution={base.attr} url={base.url} subdomains={base.sub} maxZoom={20} maxNativeZoom={base.key === "sat" ? 17 : 19} />
              <ToolClicks toolRef={toolRef} onPoint={onPoint} />
              <ScaleControl position="bottomleft" imperial={false} />

              {showCommunes && communeGeo && <GeoJSON data={communeGeo} style={{ color: "#f8fafc", weight: 2, fillOpacity: 0, dashArray: "6 4" }} interactive={false} />}

              {showQuartiers && !isGridIndicator && (
                <GeoJSON
                  key={`${indicatorId}-${search}-${matchSig}`}
                  ref={qRef}
                  data={{ type: "FeatureCollection", features: filteredQuartiers.map(q => ({ type: "Feature", properties: q, geometry: q.geometry })) } as any}
                  style={quartierStyle as any}
                  onEachFeature={(feature, layer) => {
                    layer.on("click", () => { if (toolRef.current === "none") setSelectedQuartier(feature.properties); });
                    layer.on("mouseover", (e) => (e.target as L.Path).setStyle({ weight: 2.6, color: "#ffffff" }));
                    layer.on("mouseout", (e) => (e.target as L.Path).setStyle({ weight: indicator ? 1 : 1.3, color: indicator ? "rgba(255,255,255,.75)" : "#22d3ee" }));
                    const v = indicator ? indicator.get(feature.properties) : null;
                    const catLabel = indicator?.cats ? indicator.cats.find(c => c.key === indicator.getKey?.(feature.properties))?.label : undefined;
                    layer.bindTooltip(`<strong>${feature.properties.nom}</strong><br/>${feature.properties.commune}` + (indicator?.cats ? `<br/>${indicator.label} : ${catLabel ?? "—"}` : indicator && v !== null && v !== undefined ? `<br/>${indicator.label} : ${fmtV(v)}` : ""), { sticky: true });
                  }}
                />
              )}
              {circleMode && indicator && showQuartiers && (
                <CircleLayer enabled quartiers={filteredQuartiers} centroids={qCtx.centroids} get={indicator.get} max={circleMax} color={indicator.color ?? "#0ea5e9"}
                  label={indicator.label} unit={indicator.unit} match={matchSet} onPick={q => { if (toolRef.current === "none") setSelectedQuartier(q); }} />
              )}
              {isGridIndicator && grilleData && (
                <GeoJSON key={`grille-${indicatorId}`} ref={gRef} data={grilleData} style={grilleStyle as any}
                  onEachFeature={(feature, layer) => {
                    layer.on("click", () => { if (toolRef.current === "none") setSelectedCell(feature.properties); });
                    const v = feature.properties[gridPropertyKey];
                    layer.once("mouseover", () => layer.bindTooltip(`Cellule ${feature.properties.cell_id}<br/>${gridIndicatorDef.label} : ${v !== null && v !== undefined ? v.toFixed(3) : "—"}` + (isRoutier ? `<br/>Distance route : ${feature.properties.acc_routiere_dist_m?.toFixed(0)} m` : ""), { sticky: true }).openTooltip());
                  }} />
              )}
              {showGrille && !isGridIndicator && grilleData && (
                <GeoJSON data={grilleData} style={{ color: "#cbd5e1", weight: 0.4, fillOpacity: 0, dashArray: "2 2" }} onEachFeature={(feature, layer) => layer.on("click", () => { if (toolRef.current === "none") setSelectedCell(feature.properties); })} />
              )}
              {showReseau && reseauData && <GeoJSON data={reseauData} style={{ color: "#fde68a", weight: 1, opacity: 0.8 }} interactive={false} />}
              {Array.from(activeInfra).map(key => {
                const fam = INFRA_FAMILIES.find(f => f.key === key)!; const p = infraData[key];
                return p ? <InfraClusterLayer key={key} points={p} color={fam.color} onSelect={setSelectedInfra} /> : null;
              })}

              {/* resultats des outils */}
              {myPos && aroundReq && aroundRes && <Circle center={myPos} radius={aroundReq.km * 1000} pathOptions={{ color: "#22d3ee", weight: 2, fillColor: "#22d3ee", fillOpacity: 0.1, dashArray: "6 4" }} interactive={false} />}
              {aroundRes?.map((r, i) => (
                <CircleMarker key={i} center={[r.pos[1], r.pos[0]]} radius={5} pathOptions={{ color: "#fff", weight: 1, fillColor: famColor(r.fam), fillOpacity: 0.95 }}>
                  <Tooltip><strong>{r.props.nom || "(sans nom)"}</strong><br />{r.props.type} · {INFRA_FAMILIES.find(f => f.key === r.fam)?.label}<br />à {r.d >= 1000 ? `${(r.d / 1000).toFixed(2)} km` : `${Math.round(r.d)} m`}</Tooltip>
                </CircleMarker>))}
              {routeOut && <>
                <Polyline positions={routeOut.line} pathOptions={{ color: "#0f172a", weight: 9, opacity: 0.4 }} interactive={false} />
                <Polyline positions={routeOut.line} pathOptions={{ color: MODES[routeOut.mode].color, weight: 5, dashArray: routeOut.mode === "foot" ? "1 9" : undefined, lineCap: "round" }} interactive={false} />
                <CircleMarker center={[routeOut.target.pos[1], routeOut.target.pos[0]]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: famColor(routeOut.target.fam), fillOpacity: 1 }}>
                  <Tooltip permanent direction="top"><strong>{routeOut.target.props.nom || "(sans nom)"}</strong></Tooltip>
                </CircleMarker></>}
              {myPos && <CircleMarker center={myPos} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#ef4444", fillOpacity: 1 }}><Tooltip direction="top">Ma position</Tooltip></CircleMarker>}
              {tool === "measure" && pts.length > 0 && <>{pts.length > 1 && <Polyline positions={pts} pathOptions={{ color: "#fbbf24", weight: 3, dashArray: "6 5" }} />}{pts.map((p, i) => <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "#fff", fillColor: "#fbbf24", fillOpacity: 1, weight: 1.5 }} />)}</>}
              {tool === "draw" && pts.length > 0 && <>{pts.length > 2 ? <Polygon positions={pts} pathOptions={{ color: "#a78bfa", weight: 2.5, fillColor: "#a78bfa", fillOpacity: 0.25 }} /> : <Polyline positions={pts} pathOptions={{ color: "#a78bfa", weight: 2.5 }} />}{pts.map((p, i) => <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "#fff", fillColor: "#a78bfa", fillOpacity: 1, weight: 1.5 }} />)}</>}
              {tool === "buffer" && pts[0] && <><Circle center={pts[0]} radius={radius} pathOptions={{ color: "#22d3ee", weight: 2, fillColor: "#22d3ee", fillOpacity: 0.15 }} /><CircleMarker center={pts[0]} radius={4} pathOptions={{ color: "#fff", fillColor: "#22d3ee", fillOpacity: 1, weight: 1.5 }} /></>}
            </MapContainer>

            {/* ---- superpositions ---- */}
            <ZoomStack map={map} wrap={wrapRef} />
            <button className="gx-reopen-r" onClick={() => setRightOpen(v => !v)} aria-label={rightOpen ? "Masquer le panneau de droite" : "Afficher le panneau de droite"} title={rightOpen ? "Masquer le panneau de droite" : "Afficher le panneau de droite"}>{rightOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>
            {!panelOpen && <button className="gx-reopen" onClick={() => setPanelOpen(true)} aria-label="Ouvrir les couches"><Layers3 size={18} /></button>}

            <div className={`gx-infra-panel ${infraPanel ? "" : "closed"}`}>
              <button className="gx-infra-head" onClick={() => setInfraPanel(v => !v)}>Types d'infrastructures <ChevronDown size={15} /></button>
              {infraPanel && <ul>
                {INFRA_FAMILIES.map(f => { const Icon = f.icon; const on = activeInfra.has(f.key); return (
                  <li key={f.key} className={on ? "on" : ""}>
                    <span className="gx-fam-ico" style={{ background: f.color }}><Icon size={13} /></span><span>{f.label}</span>
                    <button onClick={() => toggleInfra(f.key)} aria-label={`${on ? "Masquer" : "Afficher"} ${f.label}`}>{on ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                  </li>); })}
              </ul>}
            </div>

            <div className="gx-legend">
              {circleMode && indicator ? <>
                <CircleLegend label={indicator.label} unit={indicator.unit} max={circleMax} color={indicator.color ?? "#0ea5e9"} count={quartiers.length} />
                <button className="gx-analyze" onClick={() => askAssistant({ type: "analyze", ctx: { source: "geoportail", indicatorId, layer: "quartiers", quartierId: selectedQuartier?.quartier_id ?? null, families: [...activeInfra] } })}><Sparkles size={13} /> Analyser cette carte</button>
              </> : indicator?.cats && !isGridIndicator ? <>
                <CatLegend indicator={indicator} quartiers={quartiers} />
                <div className="gx-legend-meta">{quartiers.length} quartiers{themeOf(indicatorId) === "equip" ? " · ratios calculés (hypothèses modifiables)" : " · résultats validés (K-means / LISA)"}</div>
                <button className="gx-analyze" onClick={() => askAssistant({ type: "analyze", ctx: { source: "geoportail", indicatorId, layer: "quartiers", quartierId: selectedQuartier?.quartier_id ?? null, families: [...activeInfra] } })}><Sparkles size={13} /> Analyser cette carte</button>
              </> : legendInd && legendStats ? <>
                <Legend indicator={legendInd} stats={legendStats} />
                <div className="gx-legend-meta">{isGridIndicator ? <><Grid3x3 size={11} /> Grille 200 m · {legendStats.count.toLocaleString("fr-FR")} cellules</> : <>{legendStats.count} quartiers · médiane {fmtV(legendStats.median)} {legendInd.unit}</>}</div>
                <button className="gx-analyze" onClick={() => askAssistant({ type: "analyze", ctx: { source: "geoportail", indicatorId, layer: isGridIndicator ? "grille" : "quartiers", quartierId: selectedQuartier?.quartier_id ?? null, families: [...activeInfra] } })}><Sparkles size={13} /> Analyser cette carte</button>
              </> : <div className="gx-legend-empty"><Layers3 size={14} /> {isGridIndicator ? "Chargement de la grille…" : "Aucun indicateur affiché. Choisissez une thématique dans le panneau de gauche."}</div>}
            </div>

            {tool !== "none" && <div className="gx-tool-chip">
              <b>{tool === "measure" ? "Mesure" : tool === "draw" ? "Dessin" : tool === "pos" ? "Position" : "Buffer"}</b>
              <>
                <span className="gx-res">{toolResult}</span>
                {tool === "buffer" && <select value={radius} onChange={e => setRadius(Number(e.target.value))} aria-label="Rayon">{[250, 500, 1000, 2000].map(r => <option key={r} value={r}>{fmtLen(r)}</option>)}</select>}
                {pts.length > 0 && tool !== "buffer" && <button onClick={() => setPts(p => p.slice(0, -1))}>Annuler</button>}
                {pts.length > 0 && <button onClick={() => setPts([])}>Effacer</button>}
                {tool === "buffer" && pts[0] && <button onClick={() => { setTab("req"); setPanelOpen(true); }}>Interroger la zone</button>}
              </>
              <button onClick={() => { setTool("none"); setPts([]); }} aria-label="Fermer l'outil"><X size={14} /></button>
            </div>}

            {guide && routeOut && routeData && (
              <Suspense fallback={<div className="gx-guide-load">Chargement de la vue 3D…</div>}>
                <GeoGuide key={`${routeData.mode}-${routeData.pick}-${routeOut.line[0][0]}-${routeOut.line[0][1]}-${guide.sim}`} route={routeOut} mode={routeData.mode} base={{ url: base.url, sub: base.sub, attr: base.attr }}
                  quartiers={{ type: "FeatureCollection", features: quartiers.map(q => ({ type: "Feature", properties: { population: q.population }, geometry: q.geometry })) }}
                  startSim={guide.sim} onExit={() => setGuide(null)}
                  onReroute={ll => { const p = L.latLng(ll[0], ll[1]); setMyPos(p); doRoute(p, routeData.mode, routeData.spec); }} />
              </Suspense>)}
            <StatusBar map={map} />
            <MiniMap map={map} communeGeo={communeGeo} baseUrl={base.key === "sat" ? base.url : base.url} subdomains={base.sub} />

            {/* ---- fiches ---- */}
            {selectedQuartier && (
              <div className="geo-detail-panel">
                <button className="popup-close" onClick={() => setSelectedQuartier(null)}><X size={14} /></button>
                <small>QUARTIER</small>
                <h3>{selectedQuartier.nom}</h3>
                <p>{selectedQuartier.commune} • {selectedQuartier.surface_km2?.toFixed(2)} km²</p>
                <div className="geo-detail-grid">
                  <div><small>Population</small><b>{selectedQuartier.population ? selectedQuartier.population.toLocaleString("fr-FR") : "non renseignée"}</b></div>
                  <div><small>Ménages</small><b>{selectedQuartier.menages ? selectedQuartier.menages.toLocaleString("fr-FR") : "—"}</b></div>
                  <div><small>Instruction</small><b>{selectedQuartier.ind_instruction_0_1?.toFixed(2) ?? "—"}</b></div>
                  <div><small>Richesse matérielle</small><b>{selectedQuartier.ind_niveau_vie_0_1?.toFixed(2) ?? "—"}</b></div>
                  <div><small>Accès. globale</small><b>{selectedQuartier.acc_globale?.toFixed(2) ?? "—"}</b></div>
                  <div><small>Accès. routière</small><b>{selectedQuartier.acc_routiere_indice?.toFixed(2) ?? "—"}</b></div>
                </div>
                <div className="geo-detail-subtitle">Densités d'équipements (/ km²)</div>
                <div className="geo-detail-bars">
                  {INFRA_FAMILIES.map(f => { const v = (selectedQuartier as any)[`dens_${f.key}`]; return (
                    <div className="geo-bar-row" key={f.key}><span>{f.label}</span>
                      <div className="geo-bar-track"><div className="geo-bar-fill" style={{ width: `${Math.min(100, (v || 0))}%`, background: f.color }} /></div>
                      <b>{v !== null ? v.toFixed(1) : "—"}</b></div>); })}
                </div>
                <FicheEquip q={selectedQuartier as any} />
                <button className="gx-analyze wide" onClick={() => askAssistant({ type: "ask", text: `Profil de ${selectedQuartier.nom}` })}><Sparkles size={13} /> Demander à l'assistant</button>
                {onOpenProfile && <button className="geo-detail-fullprofile" onClick={() => onOpenProfile(selectedQuartier)}>Voir la fiche complète du quartier</button>}
              </div>
            )}
            {selectedInfra && (
              <div className="geo-detail-panel">
                <button className="popup-close" onClick={() => setSelectedInfra(null)}><X size={14} /></button>
                <small>ÉQUIPEMENT — {selectedInfra.famille?.toUpperCase()}</small>
                <h3>{selectedInfra.nom}</h3>
                <div className="geo-detail-grid">
                  <div><small>Type</small><b>{selectedInfra.type || "—"}</b></div>
                  <div><small>Quartier</small><b>{selectedInfra.quartier || "—"}</b></div>
                  <div><small>Commune</small><b>{selectedInfra.commune || "—"}</b></div>
                  <div><small>Milieu</small><b>{selectedInfra.milieu || "—"}</b></div>
                </div>
              </div>
            )}
            {selectedCell && (
              <div className="geo-detail-panel">
                <button className="popup-close" onClick={() => setSelectedCell(null)}><X size={14} /></button>
                <small><Grid3x3 size={11} /> CELLULE DE GRILLE</small>
                <h3>#{selectedCell.cell_id}</h3>
                <p>Ligne {selectedCell.row_index} • Colonne {selectedCell.col_index}</p>
                <div className="geo-detail-grid">
                  <div><small>Accès. routière</small><b>{selectedCell.acc_routiere_indice?.toFixed(3) ?? "—"}</b></div>
                  <div><small>Distance route</small><b>{selectedCell.acc_routiere_dist_m?.toFixed(0) ?? "—"} m</b></div>
                  <div><small>Accès. globale</small><b>{selectedCell.acc_globale?.toFixed(3) ?? "—"}</b></div>
                  <div><small>Nœud le + proche</small><b style={{ fontSize: 11 }}>{selectedCell.hub_name ?? "—"}</b></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============ COLONNE DROITE ============ */}
        {rightOpen && <div className="gx-right"><div className="gx-right-in">
          {themeOf(indicatorId) === "equip" && <GeoEquip quartiers={quartiers as any} />}
          <WeatherCard />
          <Overview quartiers={quartiers} census={census} navigate={navigate ?? (() => {})} />
          <InfraDonut quartiers={quartiers} navigate={navigate ?? (() => {})} />
          <TopPopulation quartiers={quartiers} navigate={navigate ?? (() => {})} />
          <PopEvolution navigate={navigate ?? (() => {})} />
        </div></div>}
      </div>
    </div>
  );
}
