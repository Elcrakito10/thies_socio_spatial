// Onglet « Calculer ici » : recalcule dans le navigateur les indices de ségrégation, l'autocorrélation
// spatiale (Moran, LISA), les corrélations et la typologie, puis les compare aux résultats validés.
import { useMemo, useState } from "react";
import { Play, CheckCircle2, AlertTriangle, Download, Cpu } from "lucide-react";
import * as S from "./geoStats";
import { LISA_CATS } from "./Geoportail";

type Ref = { indicateur: string; gini: number | null; gini_pond: number | null; theil: number | null; D: number | null; H: number | null; moran: number | null; p: number | null; lisa: string | null };
type Corr = { a: string; b: string; n: number; rho: number; p: number; pfdr: number };
type Ind = { key: string; label: string; ref?: string; cref?: string; signed?: boolean };

const INDS: Ind[] = [
  { key: "instruction_0_1", label: "Niveau d'instruction (0–1)", ref: "Niveau d’instruction", cref: "Instruction" },
  { key: "niveau_vie_0_1_corrige", label: "Richesse matérielle (indice 0–1)", ref: "Niveau de richesse", cref: "Richesse matérielle" },
  { key: "offre_infra_0_1", label: "Offre d'équipements (synthétique)", ref: "Offre d’équipements", cref: "Offre d’équipements" },
  { key: "acces_global_moyen_0_1", label: "Accessibilité globale moyenne", ref: "Accessibilité globale moyenne", cref: "Accessibilité globale" },
  { key: "densite_sante", label: "Densité de santé (nb/km²)", ref: "Densité santé" },
  { key: "densite_education", label: "Densité d'éducation (nb/km²)", ref: "Densité éducation" },
  { key: "densite_commerce", label: "Densité de commerce (nb/km²)", ref: "Densité commerce" },
  { key: "densite_sport", label: "Densité de sport (nb/km²)", ref: "Densité sport" },
  { key: "densite_transport", label: "Densité de transport (nb/km²)", ref: "Densité transport" },
  { key: "densite_banque", label: "Densité de banque (nb/km²)", ref: "Densité banque" },
  { key: "densite_assurance", label: "Densité d'assurance (nb/km²)", ref: "Densité assurance" },
  { key: "densite_religion", label: "Densité de lieux de culte (nb/km²)", ref: "Densité religion" },
  { key: "distance_route_moy_m", label: "Distance moyenne à la route (m)", ref: "Distance moyenne à la route", cref: "Distance à la route" },
  { key: "flux_emis", label: "Flux émis", ref: "Flux émis" },
  { key: "flux_recus", label: "Flux reçus", ref: "Flux reçus" },
  { key: "volume_echanges", label: "Volume des échanges", ref: "Volume des échanges" },
  { key: "solde_echanges", label: "Solde des échanges (signé)", ref: "Solde des échanges", signed: true },
  { key: "indice_attractivite", label: "Indice d'attractivité (signé)", ref: "Indice d’attractivité", cref: "Attractivité", signed: true },
  { key: "population", label: "Population" },
];
const LISA_COLORS: Record<string, string> = { ...Object.fromEntries(LISA_CATS.map(c => [c.key, c.color])), NS: "#d8dee6" };
const DOT_COLORS: Record<string, string> = { ...LISA_COLORS, NS: "#7c8da6" };
const nf = (v: number | null | undefined, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

/** Projette les polygones en chemins SVG (une seule fois). */
function useShapes(qs: any[]) {
  return useMemo(() => {
    const rings = (g: any): number[][][] => (!g ? [] : g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p: any) => p[0]) : []);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    qs.forEach(q => rings(q.geometry).forEach(r => r.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); })));
    if (!Number.isFinite(x0)) return { d: qs.map(() => ""), w: 100, h: 100 };
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), sc = 600 / Math.max((x1 - x0) * k, y1 - y0);
    return { w: (x1 - x0) * k * sc, h: (y1 - y0) * sc, d: qs.map(q => rings(q.geometry).map(r => "M" + r.map(([x, y]) => `${((x - x0) * k * sc).toFixed(1)},${((y1 - y) * sc).toFixed(1)}`).join("L") + "Z").join("")) };
  }, [qs]);
}
function MapSvg({ shapes, qs, color, tip }: { shapes: { d: string[]; w: number; h: number }; qs: any[]; color: (i: number) => string; tip: (i: number) => string }) {
  return (
    <svg className="lab-map" viewBox={`-4 -4 ${shapes.w + 8} ${shapes.h + 8}`} role="img">
      {qs.map((q, i) => <path key={q.quartier_id ?? i} d={shapes.d[i]} fill={color(i)} stroke="#475569" strokeWidth={0.6}><title>{tip(i)}</title></path>)}
    </svg>
  );
}

export default function Laboratoire({ quartiers, res }: { quartiers: any[]; res: { indices: Ref[]; correlations: Corr[]; classification?: any } | null }) {
  const qs = quartiers;
  const shapes = useShapes(qs);
  const nb = useMemo(() => S.queenNeighbours(qs.map(q => q.geometry)), [qs]);
  const nbs = useMemo(() => S.neighbourStats(nb), [nb]);

  // ---------- 1. indicateur : Gini, Theil, Moran, LISA ----------
  const [key, setKey] = useState("instruction_0_1");
  const [perms, setPerms] = useState(999);
  const [alpha, setAlpha] = useState(0.05);
  const [out, setOut] = useState<null | ReturnType<typeof compute>>(null);
  const [busy, setBusy] = useState(false);
  const ind = INDS.find(i => i.key === key)!;
  const ref = ind.ref ? res?.indices.find(r => r.indicateur.startsWith(ind.ref!)) : undefined;

  function compute() {
    const idx = qs.map((q, i) => (Number.isFinite(q[key]) ? i : -1)).filter(i => i >= 0);
    const x = idx.map(i => qs[i][key] as number), w = idx.map(i => qs[i].population || 0);
    const pos = new Map(idx.map((i, j) => [i, j])); const nb2 = idx.map(i => nb[i].filter(j => pos.has(j)).map(j => pos.get(j)!));
    const nonneg = x.every(v => v >= 0); const t0 = performance.now();
    const mo = S.moran(x, nb2, perms); const li = S.lisa(x, nb2, perms, alpha);
    const counts: Record<string, number> = { HH: 0, LL: 0, HL: 0, LH: 0, NS: 0 }; li.forEach(r => counts[r.cat]++);
    return {
      idx, n: x.length, missing: qs.length - x.length, nonneg, ms: Math.round(performance.now() - t0), perms,
      gini: nonneg ? S.gini(x) : null, ginip: nonneg && sum(w) ? S.gini(x, w) : null, theil: nonneg ? S.theil(x) : null,
      moran: mo, lisa: li, counts, lorenz: nonneg ? S.lorenz(x) : null, key, label: ind.label,
    };
  }
  const run = () => { setBusy(true); setTimeout(() => { setOut(compute()); setBusy(false); }, 30); };
  const lisaOf = out ? new Map(out.idx.map((i, j) => [i, out.lisa[j]])) : null;

  const cmp = (calc: number | null | undefined, val: number | null | undefined, tol: number) => {
    if (calc === null || calc === undefined || val === null || val === undefined) return null;
    const e = Math.abs(calc - val); return { e, ok: e <= tol };
  };
  const exportCsv = () => {
    if (!out || !lisaOf) return;
    const rows = ["quartier_id;nom;commune;valeur;z;retard_spatial;I_local;p;cluster", ...qs.map((q, i) => { const l = lisaOf.get(i); return [q.quartier_id, q.nom, q.commune, q[key] ?? "", l ? nf(l.z) : "", l ? nf(l.lag) : "", l ? nf(l.Ii) : "", l ? nf(l.p, 3) : "", l ? l.cat : ""].join(";"); })];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" })); a.download = `lisa_${key}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  // ---------- 2. dissimilarite (instruction) ----------
  const dis = useMemo(() => {
    const idx = qs.map((q, i) => ((q.population || 0) > 0 && Number.isFinite(q.part_primaire) ? i : -1)).filter(i => i >= 0);
    const lv = ["sans_niveau", "prescolaire", "primaire", "moyen", "secondaire", "superieur"].map(k => idx.map(i => qs[i].population * qs[i][`part_${k}`]));
    const low = idx.map((_, j) => lv[0][j] + lv[1][j] + lv[2][j]), high = idx.map((_, j) => lv[4][j] + lv[5][j]);
    return { n: idx.length, D: S.dissimilarity(low, high), H: S.entropyIndex(lv), lowT: Math.round(sum(low)), highT: Math.round(sum(high)) };
  }, [qs]);
  const refInstr = res?.indices.find(r => r.indicateur.startsWith("Niveau d’instruction"));

  // ---------- 3. Spearman ----------
  const [ka, setKa] = useState("offre_infra_0_1"); const [kb, setKb] = useState("acces_global_moyen_0_1");
  const sp = useMemo(() => {
    const idx = qs.map((q, i) => (Number.isFinite(q[ka]) && Number.isFinite(q[kb]) ? i : -1)).filter(i => i >= 0);
    return S.spearman(idx.map(i => qs[i][ka]), idx.map(i => qs[i][kb]));
  }, [qs, ka, kb]);
  const labA = INDS.find(i => i.key === ka)!, labB = INDS.find(i => i.key === kb)!;
  const refCorr = res?.correlations.find(c => (labA.cref && labB.cref && ((c.a === labA.cref && c.b === labB.cref) || (c.a === labB.cref && c.b === labA.cref))));

  // ---------- 4. typologie ----------
  const [k, setK] = useState(5);
  const typo = useMemo(() => {
    const idx = qs.map((q, i) => (Number.isFinite(q.CP1) && Number.isFinite(q.CP2) ? i : -1)).filter(i => i >= 0);
    const P = idx.map(i => [qs[i].CP1, qs[i].CP2]); const r = S.kmeans(P, k);
    const lab = new Map(idx.map((i, j) => [i, r.lab[j]]));
    const valid = idx.map(i => qs[i].classe as number);
    return { lab, n: idx.length, sizes: Array.from({ length: k }, (_, c) => r.lab.filter(v => v === c).length), sil: r.silhouette, ari: S.adjustedRand(r.lab, valid) };
  }, [qs, k]);
  const typoColors = ["#2878d6", "#eb6735", "#1ab07a", "#eda200", "#e87aa4", "#8b5cf6", "#0ea5e9"];

  return (
    <div className="sg-stack lab">
      <div className="sg-card sg-pad sg-in lab-intro">
        <h3><Cpu size={18} />Calculs exécutés dans votre navigateur</h3>
        <p>Choisissez un indicateur et lancez le calcul : l'application recalcule les indices à partir des données des 65 quartiers, puis les compare aux résultats validés par l'encadreur. Voisinage : contiguïté « reine » (Queen), {nbs.links} liens, {nbs.islands} île, {nbs.mean.toFixed(1).replace(".", ",")} voisins en moyenne, poids standardisés par ligne. Tests de Moran et LISA par permutations (graine fixe : résultat reproductible).</p>
      </div>

      {/* ===== 1 ===== */}
      <div className="sg-card sg-pad sg-in">
        <h3>1. Inégalité et autocorrélation d'un indicateur</h3>
        <div className="lab-form">
          <label>Indicateur<select value={key} onChange={e => { setKey(e.target.value); setOut(null); }}>{INDS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select></label>
          <label>Permutations<select value={perms} onChange={e => setPerms(Number(e.target.value))}>{[99, 499, 999, 4999].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>Seuil LISA<select value={alpha} onChange={e => setAlpha(Number(e.target.value))}>{[0.05, 0.01, 0.001].map(v => <option key={v} value={v}>{v.toString().replace(".", ",")}</option>)}</select></label>
          <button className="sg-btn primary" onClick={run} disabled={busy}><Play size={15} />{busy ? "Calcul…" : "Lancer le calcul"}</button>
        </div>
        {!out && <p className="lab-hint">Cliquez sur « Lancer le calcul » : Gini, Theil, Moran I, LISA et courbe de Lorenz apparaissent ici.</p>}
        {out && <>
          <div className="lab-kpis">
            <div><small>Gini</small><b>{nf(out.gini)}</b></div><div><small>Gini pondéré (pop.)</small><b>{nf(out.ginip)}</b></div><div><small>Theil</small><b>{nf(out.theil)}</b></div>
            <div><small>Moran I</small><b>{nf(out.moran.I)}</b></div><div><small>Pseudo-p</small><b>{nf(out.moran.p, 3)}</b></div><div><small>z (permutations)</small><b>{nf(out.moran.z, 2)}</b></div>
          </div>
          {!out.nonneg && <p className="lab-warn"><AlertTriangle size={14} /> Valeurs négatives : Gini et Theil ne sont pas définis, seuls Moran et LISA sont calculés.</p>}
          {out.missing > 0 && <p className="lab-hint">{out.missing} quartier(s) sans valeur ont été écartés du calcul (n = {out.n}) ; le voisinage est reconstruit sur les quartiers restants.</p>}
          <div className="sg-scroll"><table className="sg-table lab-cmp">
            <thead><tr><th>Mesure</th><th>Recalculé ici</th><th>Résultat validé</th><th>Écart</th></tr></thead>
            <tbody>
              {([["Gini", out.gini, ref?.gini, 0.0006], ["Gini pondéré", out.ginip, ref?.gini_pond, 0.0006], ["Theil", out.theil, ref?.theil, 0.0006], ["Moran I", out.moran.I, ref?.moran, 0.002]] as [string, number | null, number | null | undefined, number][]).map(([l, c, v, tol]) => {
                const d = cmp(c, v, tol); return <tr key={l}><td>{l}</td><td className="n">{nf(c)}</td><td className="n">{v === null || v === undefined ? "—" : nf(v)}</td>
                  <td className="n">{d ? <span className={d.ok ? "lab-ok" : "lab-ko"}>{d.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {nf(d.e)}</span> : "—"}</td></tr>;
              })}
              <tr><td>Pseudo-p de Moran</td><td className="n">{nf(out.moran.p, 3)}</td><td className="n">{ref?.p == null ? "—" : nf(ref.p, 3)}</td><td className="n">aléatoire (permutations)</td></tr>
              <tr><td>Clusters LISA</td><td>{Object.entries(out.counts).filter(([c]) => c !== "NS").map(([c, v]) => `${v} ${c}`).join(" / ")} · {out.counts.NS} NS</td><td>{ref?.lisa && !/^(Cartes|Voir)/.test(ref.lisa) ? ref.lisa : "—"}</td><td className="n">quelques quartiers d'écart possibles</td></tr>
            </tbody></table></div>
          <small className="sg-note">Calcul en {out.ms} ms ({out.perms} permutations). Le Gini, le Theil et le I de Moran sont déterministes : ils doivent coïncider avec le résultat validé. Les p-values et les clusters LISA dépendent du tirage des permutations, donc varient légèrement.</small>

          <div className="lab-viz">
            <div><h4>Courbe de Lorenz</h4>{out.lorenz ? <svg viewBox="0 0 220 220" className="lab-chart"><rect x="20" y="10" width="190" height="190" className="lab-frame" /><line x1="20" y1="200" x2="210" y2="10" className="lab-diag" />
              <polyline fill="none" className="lab-curve" points={out.lorenz.map(p => `${20 + p.p * 190},${200 - p.l * 190}`).join(" ")} />
              <text x="115" y="216" textAnchor="middle" className="lab-axis">part cumulée des quartiers</text><text x="6" y="105" className="lab-axis" transform="rotate(-90 6 105)" textAnchor="middle">part cumulée de la valeur</text></svg> : <p className="lab-hint">Non défini (valeurs négatives).</p>}</div>
            <div><h4>Diagramme de Moran</h4><svg viewBox="0 0 220 220" className="lab-chart">
              {(() => { const pts = out.moran.scatter, m = Math.max(3, ...pts.map(p => Math.max(Math.abs(p.z), Math.abs(p.lag)))), X = (v: number) => 115 + (v / m) * 95;
                return <><rect x="20" y="10" width="190" height="190" className="lab-frame" /><line x1="20" y1="105" x2="210" y2="105" className="lab-diag" /><line x1="115" y1="10" x2="115" y2="200" className="lab-diag" />
                  <line x1={X(-m)} y1={105 - (-m / m) * 95 * out.moran.I} x2={X(m)} y2={105 - (m / m) * 95 * out.moran.I} className="lab-curve" />
                  {pts.map((p, i) => <circle key={i} cx={X(p.z)} cy={105 - (p.lag / m) * 95} r={3.4} fill={DOT_COLORS[out.lisa[i].cat]} stroke="#0f172a" strokeWidth={0.7} fillOpacity={0.92}><title>{qs[out.idx[i]].nom} : {out.lisa[i].cat}</title></circle>)}
                  <text x="115" y="216" textAnchor="middle" className="lab-axis">valeur standardisée</text><text x="6" y="105" className="lab-axis" transform="rotate(-90 6 105)" textAnchor="middle">moyenne des voisins</text></>; })()}
            </svg></div>
            <div className="lab-mapbox"><h4>Clusters LISA recalculés</h4>
              <MapSvg shapes={shapes} qs={qs} color={i => (lisaOf!.get(i) ? LISA_COLORS[lisaOf!.get(i)!.cat] : "#f1f5f9")} tip={i => `${qs[i].nom} : ${lisaOf!.get(i)?.cat ?? "sans valeur"}`} />
              <div className="lab-leg">{["HH", "LL", "LH", "HL", "NS"].map(c => <span key={c}><i style={{ background: LISA_COLORS[c] }} />{c} ({out.counts[c]})</span>)}</div>
              <button className="sg-btn" onClick={exportCsv}><Download size={14} /> Exporter (CSV)</button></div>
          </div>
        </>}
      </div>

      {/* ===== 2 ===== */}
      <div className="sg-card sg-pad sg-in">
        <h3>2. Dissimilarité et entropie : l'instruction</h3>
        <p className="lab-hint">Deux groupes : niveau faible (sans niveau, préscolaire, primaire : {dis.lowT.toLocaleString("fr-FR")} personnes) et niveau élevé (secondaire, supérieur : {dis.highT.toLocaleString("fr-FR")}). Effectifs = part × population de chaque quartier ({dis.n} quartiers de population non nulle).</p>
        <div className="lab-kpis">
          <div><small>D de Duncan (recalculé)</small><b>{nf(dis.D)}</b></div><div><small>D validé</small><b>{nf(refInstr?.D)}</b></div>
          <div><small>H, 6 niveaux (recalculé)</small><b>{nf(dis.H)}</b></div><div><small>H validé</small><b>{nf(refInstr?.H)}</b></div>
        </div>
        <small className="sg-note">Lecture : {(dis.D * 100).toFixed(0)} % des personnes d'un des deux groupes devraient changer de quartier pour que les deux groupes soient répartis pareillement. L'écart avec la valeur validée (≈ {nf(Math.abs(dis.D - (refInstr?.D ?? dis.D)), 3)}) vient des effectifs reconstitués à partir de parts arrondies.</small>
      </div>

      {/* ===== 3 ===== */}
      <div className="sg-card sg-pad sg-in">
        <h3>3. Corrélation de Spearman entre deux indicateurs</h3>
        <div className="lab-form">
          <label>Indicateur A<select value={ka} onChange={e => setKa(e.target.value)}>{INDS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select></label>
          <label>Indicateur B<select value={kb} onChange={e => setKb(e.target.value)}>{INDS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select></label>
        </div>
        <div className="lab-kpis">
          <div><small>ρ de Spearman</small><b>{nf(sp.rho, 3)}</b></div><div><small>p (bilatéral)</small><b>{sp.p < 0.0001 ? "< 0,0001" : nf(sp.p, 4)}</b></div><div><small>n</small><b>{sp.n}</b></div>
          <div><small>Validé (ρ · p corrigé FDR)</small><b>{refCorr ? `${nf(refCorr.rho, 3)} · ${refCorr.pfdr < 0.0001 ? "< 0,0001" : nf(refCorr.pfdr, 4)}` : "—"}</b></div>
        </div>
        <small className="sg-note">{Math.abs(sp.rho) >= 0.7 ? "Association forte" : Math.abs(sp.rho) >= 0.4 ? "Association modérée" : "Association faible"} {sp.rho >= 0 ? "positive" : "négative"} entre les rangs des quartiers. Une corrélation n'est pas une causalité. {refCorr ? "Le p validé est corrigé pour les tests multiples (FDR)." : "Cette paire ne figure pas dans la liste validée."}</small>
      </div>

      {/* ===== 4 ===== */}
      <div className="sg-card sg-pad sg-in">
        <h3>4. Typologie : K-means recalculé</h3>
        <div className="lab-form">
          <label>Nombre de classes k<select value={k} onChange={e => setK(Number(e.target.value))}>{[2, 3, 4, 5, 6, 7].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        </div>
        <div className="lab-viz two">
          <div>
            <div className="lab-kpis">
              <div><small>Silhouette moyenne</small><b>{nf(typo.sil, 3)}</b></div><div><small>Accord avec les 5 profils validés (indice de Rand ajusté)</small><b>{nf(typo.ari, 3)}</b></div>
            </div>
            <ul className="lab-sizes">{typo.sizes.map((s, c) => <li key={c}><i style={{ background: typoColors[c] }} />Classe {c + 1} <b>{s}</b> quartiers</li>)}</ul>
            <small className="sg-note">K-means (20 départs k-means++) sur les deux premières composantes de l'ACP validée (CP1, CP2). À k = 5, on retrouve exactement les 5 profils validés (indice = 1). Faites varier k pour voir comment la silhouette évolue : c'est le critère qui justifie le choix du nombre de classes. Les classes sont numérotées dans l'ordre du calcul : leur numéro n'a pas de signification en soi.</small>
          </div>
          <div className="lab-mapbox"><MapSvg shapes={shapes} qs={qs} color={i => typoColors[typo.lab.get(i) ?? 0] ?? "#f1f5f9"} tip={i => `${qs[i].nom} : classe ${(typo.lab.get(i) ?? 0) + 1}`} /></div>
        </div>
      </div>
    </div>
  );
}
