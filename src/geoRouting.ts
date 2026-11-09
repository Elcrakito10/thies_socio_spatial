// ============================================================
// Itineraires sur le reseau routier (OpenStreetMap, 4 658 tronçons) :
// graphe, plus court chemin (Dijkstra) a pied, a velo et en voiture,
// et recherche de l'equipement le plus proche. Calcul 100 % local.
// ============================================================
import { distM } from "./geoQuery";

type Pt = [number, number]; // lng, lat
export type Mode = "foot" | "bike" | "car";
export const MODES: Record<Mode, { label: string; color: string; short: string }> = {
  foot: { label: "À pied", short: "pied", color: "#22c55e" },
  bike: { label: "À vélo", short: "vélo", color: "#f59e0b" },
  car: { label: "En voiture", short: "voiture", color: "#3b82f6" },
};
export const FOOT_MS = 5 / 3.6; // 5 km/h, vitesse des raccords hors reseau

type Edge = { to: number; len: number; name: string; hw: string; unpaved: boolean };
export type Graph = { nodes: Pt[]; adj: Edge[][]; cell: Map<string, number[]>; comp: Record<Mode, Int32Array>; main: Record<Mode, number> };
const CELL = 0.002;
const cellKey = (lng: number, lat: number) => `${Math.floor(lng / CELL)}|${Math.floor(lat / CELL)}`;
const UNPAVED = new Set(["unpaved", "sand", "dirt", "dirt/sand", "ground"]);

const allowed = (m: Mode, hw: string) =>
  hw === "raceway" ? false : m === "foot" ? true : m === "bike" ? !["footway", "pedestrian", "steps"].includes(hw) : !["footway", "pedestrian", "path", "steps"].includes(hw);
/** Vitesse estimee (m/s). Hypotheses explicites : pas de donnees de trafic ni de sens uniques. */
function speed(m: Mode, e: Edge): number {
  if (m === "foot") return FOOT_MS;
  const rough = e.unpaved || e.hw === "track";
  if (m === "bike") return (rough ? 11 : 15) / 3.6;
  const base = /^(trunk|primary)/.test(e.hw) ? 50 : e.hw === "secondary" ? 40 : /^tertiary/.test(e.hw) ? 35 : 25;
  return (rough ? base * 0.6 : base) / 3.6;
}

export function buildGraph(fc: any): Graph {
  const ids = new Map<string, number>(); const nodes: Pt[] = []; const adj: Edge[][] = [];
  const nid = (p: number[]) => { const k = `${Math.round(p[0] * 1e5)}|${Math.round(p[1] * 1e5)}`; let i = ids.get(k); if (i === undefined) { i = nodes.length; ids.set(k, i); nodes.push([p[0], p[1]]); adj.push([]); } return i; };
  for (const f of fc.features) {
    if (f.geometry?.type !== "LineString") continue;
    const c = f.geometry.coordinates; const hw = f.properties?.type_voie ?? "residential"; const name = f.properties?.nom ?? ""; const unpaved = UNPAVED.has(f.properties?.revetement);
    for (let i = 0; i + 1 < c.length; i++) {
      const a = nid(c[i]), b = nid(c[i + 1]); if (a === b) continue;
      const len = distM(nodes[a], nodes[b]);
      adj[a].push({ to: b, len, name, hw, unpaved }); adj[b].push({ to: a, len, name, hw, unpaved });
    }
  }
  const cell = new Map<string, number[]>();
  nodes.forEach((p, i) => { const k = cellKey(p[0], p[1]); const l = cell.get(k); if (l) l.push(i); else cell.set(k, [i]); });
  const comp = {} as Record<Mode, Int32Array>; const main = {} as Record<Mode, number>;
  (["foot", "bike", "car"] as Mode[]).forEach(m => {
    const par = new Int32Array(nodes.length).map((_, i) => i); const has = new Uint8Array(nodes.length);
    const find = (x: number) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    adj.forEach((es, a) => es.forEach(e => { if (allowed(m, e.hw)) { has[a] = 1; has[e.to] = 1; par[find(a)] = find(e.to); } }));
    const size = new Map<number, number>(); const out = new Int32Array(nodes.length).fill(-1);
    for (let i = 0; i < nodes.length; i++) if (has[i]) { const r = find(i); out[i] = r; size.set(r, (size.get(r) ?? 0) + 1); }
    comp[m] = out; main[m] = [...size.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  });
  return { nodes, adj, cell, comp, main };
}

/** Noeud du reseau (composante principale du mode) le plus proche d'un point. */
export function snap(g: Graph, m: Mode, p: Pt): { id: number; d: number } | null {
  const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL); let best = null as { id: number; d: number } | null;
  for (let r = 0; r <= 40; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const l = g.cell.get(`${cx + dx}|${cy + dy}`); if (!l) continue;
      for (const i of l) if (g.comp[m][i] === g.main[m]) { const d = distM(p, g.nodes[i]); if (!best || d < best.d) best = { id: i, d }; }
    }
    if (best && best.d <= r * CELL * 85000) break; // ~ metres par cellule a cette latitude
  }
  return best;
}

class Heap {
  private a: [number, number][] = [];
  get size() { return this.a.length; }
  push(k: number, v: number) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop(): [number, number] { const a = this.a; const top = a[0]; const last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < a.length && a[l][0] < a[s][0]) s = l; if (r < a.length && a[r][0] < a[s][0]) s = r; if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } } return top; }
}

export type Tree = { mode: Mode; src: number; time: Float64Array; dist: Float64Array; prev: Int32Array; prevEdge: Int32Array };
export function shortestTree(g: Graph, m: Mode, src: number): Tree {
  const n = g.nodes.length; const time = new Float64Array(n).fill(Infinity), dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1), prevEdge = new Int32Array(n).fill(-1); time[src] = 0; dist[src] = 0;
  const h = new Heap(); h.push(0, src);
  while (h.size) {
    const [t, u] = h.pop(); if (t > time[u]) continue;
    g.adj[u].forEach((e, k) => { if (!allowed(m, e.hw)) return; const nt = t + e.len / speed(m, e); if (nt < time[e.to]) { time[e.to] = nt; dist[e.to] = dist[u] + e.len; prev[e.to] = u; prevEdge[e.to] = k; h.push(nt, e.to); } });
  }
  return { mode: m, src, time, dist, prev, prevEdge };
}

export type Target = { fam: string; props: any; pos: Pt };
export type Route = {
  mode: Mode; target: Target; distM: number; timeS: number; line: [number, number][]; // lat,lng
  steps: { name: string; dist: number }[]; segNames: string[]; connectors: { start: number; end: number }; straightM: number;
};
export type Found = { target: Target; node: number; d1: number; timeS: number; distM: number };

/** Classe les cibles par duree de trajet croissante (raccord hors reseau inclus). */
export function rankTargets(g: Graph, tree: Tree, targets: Target[], d0: number): Found[] {
  const out: Found[] = []; const m = tree.mode;
  for (const t of targets) {
    const s = snap(g, m, t.pos); if (!s) continue; const tt = tree.time[s.id]; if (!Number.isFinite(tt)) continue;
    out.push({ target: t, node: s.id, d1: s.d, timeS: tt + (d0 + s.d) / FOOT_MS, distM: tree.dist[s.id] + d0 + s.d });
  }
  return out.sort((a, b) => a.timeS - b.timeS);
}

export function buildRoute(g: Graph, tree: Tree, f: Found, origin: Pt, d0: number): Route {
  const nodes: number[] = []; const edges: Edge[] = [];
  for (let v = f.node; v !== tree.src && v !== -1; v = tree.prev[v]) { nodes.push(v); edges.push(g.adj[tree.prev[v]][tree.prevEdge[v]]); }
  nodes.push(tree.src); nodes.reverse(); edges.reverse();
  const line: [number, number][] = [[origin[1], origin[0]], ...nodes.map(i => [g.nodes[i][1], g.nodes[i][0]] as [number, number]), [f.target.pos[1], f.target.pos[0]]];
  const steps: { name: string; dist: number }[] = [];
  for (const e of edges) { const nm = e.name || "voie sans nom"; const last = steps[steps.length - 1]; if (last && last.name === nm) last.dist += e.len; else steps.push({ name: nm, dist: e.len }); }
  return { mode: tree.mode, target: f.target, distM: f.distM, timeS: f.timeS, line, steps, segNames: ["", ...edges.map(e => e.name), ""], connectors: { start: d0, end: f.d1 }, straightM: distM(origin, f.target.pos) };
}

export const fmtTime = (s: number) => (s < 60 ? "< 1 min" : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`);

/** Cibles disponibles pour une requete d'itineraire. */
export type TargetSpec = { fam?: string; type?: string; label: string };
export const TARGET_SPECS: TargetSpec[] = [
  { label: "Équipement de santé le plus proche (toute catégorie)", fam: "sante" },
  { label: "Poste de santé", fam: "sante", type: "poste de sante" },
  { label: "Hôpital", fam: "sante", type: "hopital" },
  { label: "Centre de santé", fam: "sante", type: "centre de sante" },
  { label: "Clinique", fam: "sante", type: "clinique" },
  { label: "Pharmacie", fam: "sante", type: "pharmacie" },
  { label: "Maternité", fam: "sante", type: "maternite" },
  { label: "Établissement d'éducation", fam: "education" },
  { label: "Commerce", fam: "commerce" },
  { label: "Équipement de sport", fam: "sport" },
  { label: "Transport (gare, station…)", fam: "transport" },
  { label: "Banque", fam: "banque" },
  { label: "Assurance", fam: "assurance" },
  { label: "Lieu de culte", fam: "religion" },
  { label: "N'importe quelle infrastructure" },
];

const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function selectTargets(all: Record<string, any[]>, spec: TargetSpec): Target[] {
  const out: Target[] = [];
  for (const [fam, feats] of Object.entries(all)) {
    if (spec.fam && fam !== spec.fam) continue;
    for (const f of feats) { if (spec.type && !norm(f.properties?.type).includes(spec.type)) continue; out.push({ fam, props: f.properties, pos: f.geometry.coordinates as Pt }); }
  }
  return out;
}
