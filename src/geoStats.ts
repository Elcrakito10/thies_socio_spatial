// ============================================================
// Moteur de calcul de la segregation, execute dans le navigateur.
// Aucune dependance : Gini, Theil, dissimilarite, Moran global et local (LISA)
// avec tests de permutation, Spearman, ACP + K-means. Generateur aleatoire a graine : resultats reproductibles.
// ============================================================
export type Pt = [number, number];

export function rng(seed = 12345) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const mean = (a: number[]) => sum(a) / a.length;

/** Gini ; avec poids (population) : formule des differences moyennes ponderees. */
export function gini(x: number[], w?: number[]): number {
  const n = x.length; if (n < 2) return 0;
  if (!w) {
    const s = [...x].sort((a, b) => a - b); const tot = sum(s); if (!tot) return 0;
    let c = 0; s.forEach((v, i) => (c += (i + 1) * v));
    return (2 * c) / (n * tot) - (n + 1) / n;
  }
  const idx = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  const W = sum(w), M = sum(x.map((v, i) => v * w[i])); if (!W || !M) return 0;
  let P = 0, L = 0, area = 0; // aire sous la courbe de Lorenz ponderee (trapezes)
  for (const i of idx) { const dP = w[i] / W, dL = (x[i] * w[i]) / M; area += dP * (2 * L + dL); P += dP; L += dL; }
  return 1 - area;
}
/** Courbe de Lorenz (points cumules, valeurs triees). */
export function lorenz(x: number[]): { p: number; l: number }[] {
  const s = [...x].sort((a, b) => a - b); const tot = sum(s) || 1; let c = 0;
  return [{ p: 0, l: 0 }, ...s.map((v, i) => ({ p: (i + 1) / s.length, l: (c += v) / tot }))];
}
/** Indice de Theil T (entropie) ; les valeurs nulles contribuent 0. */
export function theil(x: number[]): number {
  const mu = mean(x); if (!mu) return 0;
  return mean(x.map(v => (v > 0 ? (v / mu) * Math.log(v / mu) : 0)));
}
/** Dissimilarite de Duncan entre deux groupes (effectifs par unite) : 0 = repartition identique, 1 = separation totale. */
export function dissimilarity(a: number[], b: number[]): number {
  const A = sum(a), B = sum(b); if (!A || !B) return 0;
  return 0.5 * sum(a.map((v, i) => Math.abs(v / A - b[i] / B)));
}
/** Indice d'entropie de Theil (H) pour plusieurs groupes : 0 = chaque unite reflete la composition globale, 1 = ségrégation maximale. */
export function entropyIndex(groups: number[][]): number {
  const n = groups[0].length, tot = groups.map(sum), T = sum(tot); if (!T) return 0;
  const E = (p: number[]) => -sum(p.filter(v => v > 0).map(v => v * Math.log(v)));
  const E0 = E(tot.map(v => v / T)); if (!E0) return 0;
  let h = 0;
  for (let i = 0; i < n; i++) { const ti = sum(groups.map(g => g[i])); if (!ti) continue; h += (ti / T) * (E0 - E(groups.map(g => g[i] / ti))) / E0; }
  return h;
}

// ---------- voisinage et autocorrelation ----------
export type Weights = number[][]; // listes de voisins
const polys = (g: any): number[][][][] => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
/** Contiguite « reine » (Queen) : voisins = polygones partageant au moins un sommet (tolerance ~1 m). */
export function queenNeighbours(geoms: any[], prec = 1e6): Weights {
  const key = (p: number[]) => `${Math.round(p[0] * prec)}|${Math.round(p[1] * prec)}`;
  const by = new Map<string, Set<number>>();
  geoms.forEach((g, i) => { if (!g) return; for (const poly of polys(g)) for (const ring of poly) for (const p of ring) { const k = key(p); let s = by.get(k); if (!s) by.set(k, (s = new Set())); s.add(i); } });
  const nb: Set<number>[] = geoms.map(() => new Set());
  for (const s of by.values()) if (s.size > 1) { const a = [...s]; for (const i of a) for (const j of a) if (i !== j) nb[i].add(j); }
  return nb.map(s => [...s]);
}
export function neighbourStats(nb: Weights) {
  const deg = nb.map(l => l.length);
  return { n: nb.length, links: sum(deg) / 2, islands: deg.filter(d => d === 0).length, mean: mean(deg), max: Math.max(...deg) };
}
const lagOf = (z: number[], nb: Weights, i: number) => (nb[i].length ? sum(nb[i].map(j => z[j])) / nb[i].length : 0);

/** I de Moran global (poids standardises par ligne) + pseudo-p par permutations (convention GeoDa : (M+1)/(R+1)). */
export function moran(x: number[], nb: Weights, perms = 999, seed = 7) {
  const n = x.length, m = mean(x), z = x.map(v => v - m), z2 = sum(z.map(v => v * v));
  const S0 = nb.filter(l => l.length).length;
  const I = (zz: number[]) => (S0 ? (n / S0) * sum(zz.map((v, i) => v * lagOf(zz, nb, i))) / z2 : 0);
  const obs = I(z); const r = rng(seed); const sim: number[] = [];
  const zz = [...z];
  for (let p = 0; p < perms; p++) { for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [zz[i], zz[j]] = [zz[j], zz[i]]; } sim.push(I(zz)); }
  const ge = obs >= -1 / (n - 1) ? sim.filter(v => v >= obs).length : sim.filter(v => v <= obs).length;
  const E = -1 / (n - 1), sd = Math.sqrt(sim.reduce((s, v) => s + (v - mean(sim)) ** 2, 0) / perms);
  return { I: obs, E, p: (ge + 1) / (perms + 1), z: sd ? (obs - mean(sim)) / sd : 0, perms, scatter: z.map((v, i) => ({ z: v / Math.sqrt(z2 / n), lag: lagOf(z, nb, i) / Math.sqrt(z2 / n) })) };
}
export type LisaCat = "HH" | "LL" | "HL" | "LH" | "NS";
/** LISA (I de Moran local) avec permutations conditionnelles ; clusters significatifs a `alpha`. */
export function lisa(x: number[], nb: Weights, perms = 999, alpha = 0.05, seed = 11) {
  const n = x.length, m = mean(x), sd = Math.sqrt(sum(x.map(v => (v - m) ** 2)) / n), z = x.map(v => (v - m) / (sd || 1));
  const r = rng(seed);
  return z.map((zi, i) => {
    const k = nb[i].length; const lag = lagOf(z, nb, i); const Ii = zi * lag;
    let ge = 0;
    if (k) {
      const others: number[] = []; for (let j = 0; j < n; j++) if (j !== i) others.push(z[j]);
      for (let p = 0; p < perms; p++) {
        let s = 0; for (let t = 0; t < k; t++) { const j = t + Math.floor(r() * (others.length - t)); [others[t], others[j]] = [others[j], others[t]]; s += others[t]; }
        const sim = zi * (s / k); if (Ii >= 0 ? sim >= Ii : sim <= Ii) ge++;
      }
    }
    const p = k ? (ge + 1) / (perms + 1) : 1;
    const cat: LisaCat = p > alpha || !k ? "NS" : zi >= 0 ? (lag >= 0 ? "HH" : "HL") : lag >= 0 ? "LH" : "LL";
    return { z: zi, lag, Ii, p, cat };
  });
}

// ---------- correlation de rang ----------
const ranks = (x: number[]) => { const idx = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(x.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1; } return r as number[]; };
export function pearson(a: number[], b: number[]) { const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; a.forEach((v, i) => { sab += (v - ma) * (b[i] - mb); saa += (v - ma) ** 2; sbb += (b[i] - mb) ** 2; }); return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0; }
const lgamma = (x: number): number => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const v of c) s += v / ++y; return -t + Math.log((2.5066282746310005 * s) / x); };
const betacf = (a: number, b: number, x: number) => { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let h = d; for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; h *= d * c; aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; };
const betai = (a: number, b: number, x: number) => { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b; };
/** rho de Spearman et p bilatere (loi de Student, n-2 ddl). */
export function spearman(a: number[], b: number[]) {
  const n = a.length, rho = pearson(ranks(a), ranks(b)); const t = rho * Math.sqrt((n - 2) / Math.max(1e-12, 1 - rho * rho));
  const p = betai((n - 2) / 2, 0.5, (n - 2) / ((n - 2) + t * t));
  return { rho, p, n };
}
/** Correction de Benjamini-Hochberg (FDR). */
export function fdr(p: number[]): number[] {
  const m = p.length, idx = p.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]); const out = new Array(m); let prev = 1;
  for (let k = m - 1; k >= 0; k--) { prev = Math.min(prev, (idx[k][0] * m) / (k + 1)); out[idx[k][1]] = prev; }
  return out;
}

// ---------- ACP + K-means ----------
function jacobi(A: number[][]) {
  const n = A.length; const a = A.map(r => [...r]); const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2; if (off < 1e-18) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-14) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]); const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)); const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
      for (let k = 0; k < n; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
      for (let k = 0; k < n; k++) { const kp = v[k][p], kq = v[k][q]; v[k][p] = c * kp - s * kq; v[k][q] = s * kp + c * kq; }
    }
  }
  const ev = a.map((r, i) => r[i]); const order = ev.map((_, i) => i).sort((x, y) => ev[y] - ev[x]);
  return { values: order.map(i => ev[i]), vectors: order.map(i => v.map(r => r[i])) };
}
/** ACP normee : coordonnees des individus sur les composantes, valeurs propres, % de variance. */
export function pca(X: number[][]) {
  const n = X.length, p = X[0].length; const mu = Array.from({ length: p }, (_, j) => mean(X.map(r => r[j])));
  const sd = Array.from({ length: p }, (_, j) => Math.sqrt(sum(X.map(r => (r[j] - mu[j]) ** 2)) / n) || 1);
  const Z = X.map(r => r.map((v, j) => (v - mu[j]) / sd[j]));
  const C = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => sum(Z.map(r => r[a] * r[b])) / n));
  const { values, vectors } = jacobi(C); const tot = sum(values);
  const scores = Z.map(r => vectors.map(vec => sum(vec.map((c, j) => c * r[j]))));
  return { values, pct: values.map(v => (v / tot) * 100), vectors, scores, Z };
}
function kmeansOnce(P: number[][], k: number, r: () => number) {
  const n = P.length, d2 = (a: number[], b: number[]) => sum(a.map((v, i) => (v - b[i]) ** 2));
  const cents: number[][] = [P[Math.floor(r() * n)]];
  while (cents.length < k) { const dist = P.map(p => Math.min(...cents.map(c => d2(p, c)))); const T = sum(dist); let u = r() * T, i = 0; for (; i < n - 1 && u > dist[i]; i++) u -= dist[i]; cents.push(P[i]); }
  let lab = new Array(n).fill(0);
  for (let it = 0; it < 100; it++) {
    const nl = P.map(p => { let b = 0, bd = Infinity; cents.forEach((c, j) => { const d = d2(p, c); if (d < bd) { bd = d; b = j; } }); return b; });
    const changed = nl.some((v, i) => v !== lab[i]); lab = nl;
    for (let j = 0; j < k; j++) { const m = P.filter((_, i) => lab[i] === j); if (m.length) cents[j] = m[0].map((_, c) => mean(m.map(q => q[c]))); }
    if (!changed) break;
  }
  return { lab, inertia: sum(P.map((p, i) => d2(p, cents[lab[i]]))) };
}
export function silhouette(P: number[][], lab: number[]) {
  const d = (a: number[], b: number[]) => Math.sqrt(sum(a.map((v, i) => (v - b[i]) ** 2))); const ks = [...new Set(lab)];
  return mean(P.map((p, i) => { const own = P.filter((_, j) => lab[j] === lab[i] && j !== i); if (!own.length) return 0; const a = mean(own.map(q => d(p, q))); const b = Math.min(...ks.filter(k => k !== lab[i]).map(k => mean(P.filter((_, j) => lab[j] === k).map(q => d(p, q))))); return (b - a) / Math.max(a, b); })) ;
}
/** K-means (20 departs k-means++) sur les composantes retenues ; classes triees par taille decroissante. */
export function kmeans(P: number[][], k: number, seed = 3) {
  const r = rng(seed); let best: ReturnType<typeof kmeansOnce> | null = null;
  for (let s = 0; s < 20; s++) { const o = kmeansOnce(P, k, r); if (!best || o.inertia < best.inertia) best = o; }
  const sizes = Array.from({ length: k }, (_, j) => best!.lab.filter(v => v === j).length); const order = sizes.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a]);
  const map = new Map(order.map((o, i) => [o, i])); const lab = best!.lab.map(v => map.get(v)!);
  return { lab, inertia: best!.inertia, silhouette: k > 1 ? silhouette(P, lab) : 0 };
}
/** Indice de Rand ajuste entre deux partitions (1 = identiques, ~0 = sans lien). */
export function adjustedRand(a: number[], b: number[]) {
  const n = a.length, ka = [...new Set(a)], kb = [...new Set(b)]; const c2 = (x: number) => (x * (x - 1)) / 2;
  const tab = ka.map(i => kb.map(j => a.filter((v, t) => v === i && b[t] === j).length));
  const sa = sum(tab.map(r => c2(sum(r)))), sb = sum(kb.map((_, j) => c2(sum(tab.map(r => r[j]))))), si = sum(tab.map(r => sum(r.map(c2))));
  const exp = (sa * sb) / c2(n), mx = (sa + sb) / 2; return mx === exp ? 1 : (si - exp) / (mx - exp);
}
