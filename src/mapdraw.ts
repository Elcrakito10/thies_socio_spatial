import { computeStats, quartileClass } from "./Geoportail";
import { dataFetch } from "./api";

// ============================================================
// Moteur de rendu de cartes choroplethes sur <canvas>.
// Il dessine les VRAIES geometries et valeurs des donnees (aucune image
// statique) : apercus de la Cartotheque, vitrine de l'accueil, export PNG.
// ============================================================
export type Stats = ReturnType<typeof computeStats>;
export type Prepared = {
  polys: { rings: number[][][]; v: number | null; cx: number }[];
  minLon: number; maxLon: number; minLat: number; maxLat: number;
  stats: Stats;
};
export type DrawOpts = { stroke?: boolean; plate?: string };

export const PLATE = "#e9eef1";
export const BASE = "#cdd8df";
export const NO_DATA = "#b9c4cc";

let gridPromise: Promise<any> | null = null;
export function loadGrid() {
  gridPromise ??= dataFetch("/data/grille_200m.geojson").then(r => r.json());
  return gridPromise;
}

export function prepare(features: { properties: any; geometry: any }[], value: (p: any) => number | null): Prepared {
  const polys: Prepared["polys"] = [];
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const vals: number[] = [];
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    const raw = value(f.properties);
    const v = raw === null || raw === undefined || !Number.isFinite(raw) ? null : raw;
    if (v !== null) vals.push(v);
    const sets: number[][][][] = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const rings of sets) {
      let cx = 0, n = 0;
      for (const [lon, lat] of rings[0]) {
        if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        cx += lon; n++;
      }
      polys.push({ rings, v, cx: cx / Math.max(1, n) });
    }
  }
  polys.sort((a, b) => a.cx - b.cx); // balayage ouest -> est pour l'animation
  return { polys, minLon, maxLon, minLat, maxLat, stats: computeStats(vals) };
}

function projector(p: Pick<Prepared, "minLon" | "maxLon" | "minLat" | "maxLat">, w: number, h: number, pad: number) {
  const k = Math.cos(((p.minLat + p.maxLat) / 2) * Math.PI / 180);
  const W = (p.maxLon - p.minLon) * k, H = p.maxLat - p.minLat;
  const s = Math.min((w - 2 * pad) / W, (h - 2 * pad) / H);
  const ox = (w - W * s) / 2, oy = (h - H * s) / 2;
  return (lon: number, lat: number): [number, number] => [ox + (lon - p.minLon) * k * s, oy + (p.maxLat - lat) * s];
}

function setup(canvas: HTMLCanvasElement, w: number, h: number, dpr: number) {
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function colorOf(v: number | null, stats: Stats, ramp: string[]) {
  const c = quartileClass(v, stats);
  return c === null ? NO_DATA : ramp[c];
}

function paint(ctx: CanvasRenderingContext2D, prep: Prepared, ramp: string[], proj: ReturnType<typeof projector>, from: number, to: number, stroke: boolean) {
  for (let i = from; i < to; i++) {
    const poly = prep.polys[i];
    ctx.beginPath();
    for (const ring of poly.rings) {
      ring.forEach(([lon, lat], j) => { const [x, y] = proj(lon, lat); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
    const col = colorOf(poly.v, prep.stats, ramp);
    ctx.fillStyle = col; ctx.fill("evenodd");
    if (stroke) { ctx.strokeStyle = "rgba(28,48,63,.55)"; ctx.lineWidth = 0.7; ctx.stroke(); }
    else { ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke(); }
  }
}

function paintBase(ctx: CanvasRenderingContext2D, base: Prepared | null, proj: ReturnType<typeof projector>, color: string) {
  if (!base) return;
  ctx.fillStyle = color;
  for (const poly of base.polys) {
    ctx.beginPath();
    for (const ring of poly.rings) {
      ring.forEach(([lon, lat], j) => { const [x, y] = proj(lon, lat); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
    ctx.fill("evenodd");
  }
}

/** Dessin immediat (pas d'animation). `base` = silhouette sous-jacente (ex. quartiers sous la grille). */
export function drawStatic(canvas: HTMLCanvasElement, prep: Prepared, ramp: string[], w: number, h: number, opts: DrawOpts & { base?: Prepared | null; dpr?: number; pad?: number } = {}) {
  const dpr = opts.dpr ?? Math.min(2, window.devicePixelRatio || 1);
  const ctx = setup(canvas, w, h, dpr);
  ctx.fillStyle = opts.plate ?? PLATE; ctx.fillRect(0, 0, w, h);
  const proj = projector(opts.base ?? prep, w, h, opts.pad ?? 14);
  paintBase(ctx, opts.base ?? null, proj, BASE);
  paint(ctx, prep, ramp, proj, 0, prep.polys.length, opts.stroke ?? true);
}

/** Dessin progressif : la carte "se construit" d'ouest en est. Retourne une fonction d'annulation. */
export function drawAnimated(canvas: HTMLCanvasElement, prep: Prepared, ramp: string[], w: number, h: number, opts: DrawOpts & { base?: Prepared | null; duration?: number; pad?: number } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const ctx = setup(canvas, w, h, dpr);
  ctx.fillStyle = opts.plate ?? PLATE; ctx.fillRect(0, 0, w, h);
  const proj = projector(opts.base ?? prep, w, h, opts.pad ?? 14);
  paintBase(ctx, opts.base ?? null, proj, BASE);
  const N = prep.polys.length, duration = opts.duration ?? 1300, t0 = performance.now();
  let drawn = 0, raf = 0, cancelled = false;
  const tick = (t: number) => {
    if (cancelled) return;
    const p = Math.min(1, (t - t0) / duration);
    const target = Math.floor((1 - Math.pow(1 - p, 2)) * N);
    if (target > drawn) { paint(ctx, prep, ramp, proj, drawn, target, opts.stroke ?? true); drawn = target; }
    if (p < 1) raf = requestAnimationFrame(tick);
    else if (drawn < N) paint(ctx, prep, ramp, proj, drawn, N, opts.stroke ?? true);
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelled = true; cancelAnimationFrame(raf); };
}

/** Export PNG haute resolution avec titre, legende (seuils des quartiles) et source. */
export function exportPng(prep: Prepared, ramp: string[], meta: { title: string; subtitle: string; source: string; base?: Prepared | null; stroke?: boolean; unit?: string }) {
  const W = 1800, H = 1500, mapH = 1050;
  const c = document.createElement("canvas");
  const ctx = setup(c, W, H, 1);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#081725"; ctx.font = "700 54px 'Segoe UI', Arial, sans-serif"; ctx.fillText(meta.title, 70, 100);
  ctx.fillStyle = "#526579"; ctx.font = "400 30px 'Segoe UI', Arial, sans-serif"; ctx.fillText(meta.subtitle, 70, 150);
  const sub = document.createElement("canvas");
  drawStatic(sub, prep, ramp, W - 140, mapH, { base: meta.base, stroke: meta.stroke, dpr: 1, pad: 24 });
  ctx.drawImage(sub, 70, 190);
  const st = prep.stats;
  if (st) {
    const th = [st.min, st.q1, st.q2, st.q3, st.max];
    const labels = ["Q1 — faible", "Q2", "Q3", "Q4 — élevé"];
    ctx.font = "600 28px 'Segoe UI', Arial, sans-serif"; ctx.fillStyle = "#081725";
    ctx.fillText(`Légende — classes par quartiles${meta.unit ? " (" + meta.unit + ")" : ""}`, 70, 1300);
    ramp.forEach((col, i) => {
      const x = 70 + i * 420;
      ctx.fillStyle = col; ctx.fillRect(x, 1325, 60, 40);
      ctx.strokeStyle = "#8aa0b0"; ctx.lineWidth = 1; ctx.strokeRect(x, 1325, 60, 40);
      ctx.fillStyle = "#081725"; ctx.font = "600 26px 'Segoe UI', Arial, sans-serif"; ctx.fillText(labels[i], x + 76, 1352);
      ctx.fillStyle = "#526579"; ctx.font = "400 24px 'Segoe UI', Arial, sans-serif";
      ctx.fillText(`${th[i].toLocaleString("fr-FR", { maximumFractionDigits: 2 })} – ${th[i + 1].toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`, x + 76, 1388);
    });
  }
  ctx.fillStyle = "#71899b"; ctx.font = "400 24px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`Source : ${meta.source}`, 70, 1450);
  ctx.fillText("Thiès — Ségrégation socio-spatiale • Projection : WGS 84", 70, 1480);
  c.toBlob(b => {
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url; a.download = `${meta.title.toLowerCase().replace(/[^a-z0-9]+/gi, "_")}.png`; a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
