import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell, CartesianGrid, PieChart, Pie } from "recharts";
import { Calculator, Scale, Layers, Map as MapIcon, GitCompareArrows, FolderDown, Download, X, ChevronRight, TriangleAlert, Info, Sparkles } from "lucide-react";
import { CLASS_COLORS, CLASS_NAMES, type QuartierFull } from "./Geoportail";
import { askAssistant } from "./assistant/store";
import "./Segregation.css";
import "./Lab.css";
import Laboratoire from "./Laboratoire";

type Ind = { dimension: string; indicateur: string; unite: string; gini: number | null; gini_pond: number | null; theil: number | null; D: number | null; IS: number | string | null; H: number | null; moran: number | null; p: number | null; lisa: string | null; classeur: string };
type Res = {
  indices: Ind[]; notes_indices: string[];
  correlations: { a: string; b: string; n: number; rho: number; p: number; pfdr: number; sig: boolean }[];
  corrections: { element: string; ancien: string; final: string; cause: string }[];
  classification: {
    noms: string[]; profils: { indicateur: string; valeurs: (number | null)[] }[]; descriptions: string[];
    acp: { cp: string; vp: number; pct: number; cum: number }[];
    charges: { indicateur: string; c1: number; c2: number; contrib1: number; contrib2: number; cos2: number }[];
    choix_k: { k: number; inertie: number; silhouette: number; ch: number; rand: number; eff: string }[];
    synthese: string[][]; methodologie: string[][];
  };
};

const DIM_COLORS: Record<string, string> = { "Socio-économique": "#a855f7", "Infrastructures": "#f59e0b", "Accessibilité": "#14b8a6", "Mobilité": "#f43f5e" };
const nf = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const R = "/resultats/";
const MAPS: { f: string; t: string; g: "Indicateurs" | "Autocorrélation (LISA)" | "Classification" }[] = [
  { f: "01_instruction", t: "Niveau d'instruction", g: "Indicateurs" }, { f: "02_richesse_materielle", t: "Richesse matérielle", g: "Indicateurs" },
  { f: "03_offre_infrastructures", t: "Offre d'infrastructures", g: "Indicateurs" }, { f: "04_accessibilite_globale", t: "Accessibilité globale", g: "Indicateurs" },
  { f: "05_distance_route", t: "Distance à la route", g: "Indicateurs" }, { f: "06_flux_emis", t: "Flux émis", g: "Indicateurs" },
  { f: "07_flux_recus", t: "Flux reçus", g: "Indicateurs" }, { f: "08_indice_attractivite", t: "Indice d'attractivité", g: "Indicateurs" },
  { f: "09_solde_echanges", t: "Solde des échanges", g: "Indicateurs" },
  { f: "10_LISA_instruction", t: "LISA — Instruction", g: "Autocorrélation (LISA)" }, { f: "11_LISA_richesse_materielle", t: "LISA — Richesse matérielle", g: "Autocorrélation (LISA)" },
  { f: "12_LISA_offre_infrastructures", t: "LISA — Offre d'infrastructures", g: "Autocorrélation (LISA)" }, { f: "13_LISA_accessibilite_globale", t: "LISA — Accessibilité globale", g: "Autocorrélation (LISA)" },
  { f: "14_LISA_indice_attractivite", t: "LISA — Indice d'attractivité", g: "Autocorrélation (LISA)" }, { f: "15_LISA_flux_emis", t: "LISA — Flux émis", g: "Autocorrélation (LISA)" },
  { f: "16_LISA_grille_accessibilite_routiere", t: "LISA — Grille, accessibilité routière", g: "Autocorrélation (LISA)" }, { f: "17_LISA_grille_accessibilite_globale", t: "LISA — Grille, accessibilité globale", g: "Autocorrélation (LISA)" },
  { f: "18_classification_5_profils", t: "Les 5 profils de quartiers", g: "Classification" }, { f: "19_plan_factoriel_ACP", t: "Plan factoriel de l'ACP", g: "Classification" },
];
const TABS = [
  { k: "synth", l: "Synthèse des indices", i: Scale }, { k: "class", l: "Profils de quartiers", i: Layers }, { k: "cartes", l: "Cartes validées", i: MapIcon },
  { k: "corr", l: "Corrélations", i: GitCompareArrows }, { k: "calc", l: "Recalculer ici", i: Calculator }, { k: "fich", l: "Rapports & fichiers", i: FolderDown },
] as const;
type Tab = typeof TABS[number]["k"];

export default function SegregationResults({ quartiers, navigate }: { quartiers: QuartierFull[]; navigate: (p: string) => void }) {
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<Tab>("synth");
  const [dim, setDim] = useState("Toutes");
  const [grp, setGrp] = useState("Toutes");
  const [zoom, setZoom] = useState<number | null>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => { fetch("/data/resultats_indices.json").then(r => r.json()).then(setRes).catch(() => setErr(true)); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const dims = useMemo(() => ["Toutes", ...Array.from(new Set((res?.indices ?? []).map(i => i.dimension)))], [res]);
  const rows = useMemo(() => (res?.indices ?? []).filter(i => dim === "Toutes" || i.dimension === dim), [res, dim]);
  const instr = res?.indices.find(i => i.indicateur.startsWith("Niveau d’instruction"));
  const vie = res?.indices.find(i => i.indicateur.startsWith("Niveau de richesse"));

  // effectifs par classe, calcules sur les donnees de l'application
  const byClass = useMemo(() => CLASS_NAMES.map((_, i) => {
    const l = quartiers.filter(q => q.classe === i + 1);
    return { n: l.length, pop: l.reduce((s, q) => s + (q.population || 0), 0), names: l.map(q => q.nom) };
  }), [quartiers]);
  const totPop = byClass.reduce((s, c) => s + c.pop, 0) || 1;

  if (err) return <section className="sg"><div className="sg-wrap"><div className="sg-card sg-pad">Les résultats n'ont pas pu être chargés.</div></div></section>;
  if (!res) return <section className="sg"><div className="sg-wrap"><div className="sg-card sg-pad">Chargement des résultats…</div></div></section>;

  const cl = res.classification;
  const kpis = [
    { l: "Gini — instruction", v: nf(instr?.gini), s: `pondéré par la population : ${nf(instr?.gini_pond)}`, c: "#a855f7" },
    { l: "Dissimilarité D — instruction", v: nf(instr?.D), s: "groupe faible vs groupe élevé", c: "#38bdf8" },
    { l: "Moran I — instruction", v: nf(instr?.moran), s: `p = ${nf(instr?.p)} · clusters : ${instr?.lisa?.replace(" (GeoDa)", "")}`, c: "#22c55e" },
    { l: "Gini — richesse matérielle", v: nf(vie?.gini), s: `Moran I = ${nf(vie?.moran)} (p = ${nf(vie?.p)})`, c: "#ec4899" },
  ];
  const chartData = rows.filter(r => r.gini !== null).map(r => ({ name: r.indicateur.replace(/ \(.*\)/, "").replace("Densité ", "Densité "), gini: r.gini as number, dim: r.dimension }));
  const maps = MAPS.filter(m => grp === "Toutes" || m.g === grp);
  const prof = cl.descriptions.filter(d => /^Classe \d/.test(d));
  const profText = (i: number) => { const t = (prof[i] ?? "").replace(/^Classe \d — [^:]*\([^)]*\) ?: ?/, "").replace(/^Classe \d — [^:]*: ?/, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
  const profEx = (i: number) => { const m = (prof[i] ?? "").match(/\(([^)]*)\)/); return m ? m[1] : ""; };
  const ville = (r: { valeurs: (number | null)[] }) => r.valeurs[5];
  const tone = (v: number | null, w: number | null, rowName: string) => {
    if (v === null || w === null) return "";
    const neutral = /Population|Nombre|Part de la/.test(rowName); if (neutral) return "";
    return v > w * 1.1 ? "hi" : v < w * 0.9 ? "lo" : "";
  };
  const fmtProf = (n: string, v: number | null) => (v === null ? "—" : /Nombre|Population$/.test(n) ? Math.round(v).toLocaleString("fr-FR") : /Part de la population/.test(n) ? `${(v * 100).toFixed(1).replace(".", ",")} %` : v.toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 3 }));

  return (
    <section className="sg">
      <div className="sg-wrap">
        <header className="sg-head sg-in">
          <div className="sg-eyebrow"><i />INÉGALITÉS ET SÉGRÉGATION · RÉSULTATS VALIDÉS</div>
          <h1>La ségrégation socio-spatiale<br /><span>à Thiès, en chiffres.</span></h1>
          <p>Indices d'inégalité et de ségrégation, autocorrélation spatiale, profils de quartiers : les résultats finaux des traitements (chapitre 3 du mémoire), sur les 65 quartiers de la ville. Cette page affiche ces résultats sous forme de tableaux, de graphiques et de cartes ; les calculs ont été réalisés dans le SIG, et l'onglet « Recalculer ici » permet de les vérifier.</p>
          <div className="sg-head-btns">
            <button className="sg-btn primary" onClick={() => navigate("/geoportail")}><MapIcon size={15} /> Voir les couches sur le Géoportail</button>
            <button className="sg-btn" onClick={() => askAssistant({ type: "ask", text: "Quels sont les principaux résultats de la ségrégation à Thiès ?" })}><Sparkles size={15} /> Demander à l'assistant</button>
          </div>
        </header>

        <div className="sg-kpis">
          {kpis.map((k, i) => <div key={k.l} className="sg-card sg-kpi sg-in" style={{ ["--d" as any]: `${80 + i * 70}ms`, ["--c" as any]: k.c }}><small>{k.l}</small><b>{k.v}</b><span>{k.s}</span></div>)}
        </div>

        <nav className="sg-tabs sg-in" style={{ ["--d" as any]: "200ms" }}>
          {TABS.map(t => { const Ic = t.i; return <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)}><Ic size={16} />{t.l}</button>; })}
        </nav>

        {tab === "synth" && <div className="sg-stack">
          <div className="sg-card sg-pad sg-in">
            <div className="sg-bar"><h3>Tous les indices par indicateur</h3>
              <div className="sg-chips">{dims.map(d => <button key={d} className={dim === d ? "on" : ""} onClick={() => setDim(d)} style={d !== "Toutes" ? { ["--c" as any]: DIM_COLORS[d] } : undefined}>{d}</button>)}</div></div>
            <div className="sg-scroll"><table className="sg-table">
              <thead><tr><th>Indicateur</th><th>Unité d'analyse</th><th>Gini</th><th>Gini pondéré</th><th>Theil</th><th>D</th><th>IS</th><th>H</th><th>Moran I</th><th>p</th><th>Clusters LISA</th></tr></thead>
              <tbody>{rows.map(r => <tr key={r.dimension + r.indicateur}>
                <td><i className="sg-dot" style={{ background: DIM_COLORS[r.dimension] }} />{r.indicateur}</td><td>{r.unite}</td>
                <td className="n">{nf(r.gini)}</td><td className="n">{nf(r.gini_pond)}</td><td className="n">{nf(r.theil)}</td><td className="n">{nf(r.D)}</td>
                <td className="n">{typeof r.IS === "string" ? r.IS : nf(r.IS as number | null)}</td><td className="n">{nf(r.H)}</td>
                <td className={`n ${r.p !== null && r.p < 0.05 ? "sig" : ""}`}>{nf(r.moran)}</td><td className="n">{nf(r.p)}</td>
                <td>{r.lisa && !/^(Cartes GeoDa|Voir)/.test(r.lisa) ? r.lisa : "—"}</td></tr>)}</tbody>
            </table></div>
            <small className="sg-note"><b>Gris vide</b> = indice non calculé pour cet indicateur. <b className="sg-sigtxt">Vert</b> = Moran significatif à 5 %. {res.notes_indices.map(n => n).join(" ")}</small>
          </div>

          <div className="sg-grid2">
            <div className="sg-card sg-pad sg-in">
              <h3>Coefficient de Gini</h3>
              <div style={{ height: Math.max(260, chartData.length * 26) }}>
                <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="rgba(148,163,184,.18)" />
                  <XAxis type="number" domain={[0, 1]} tick={{ fill: "var(--sg-mut)", fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={190} tick={{ fill: "var(--sg-mut)", fontSize: 11 }} interval={0} />
                  <RTooltip cursor={{ fill: "rgba(148,163,184,.12)" }} contentStyle={{ background: "rgba(8,16,36,.95)", border: "1px solid rgba(130,160,255,.3)", borderRadius: 10, color: "#eaf1fb", fontSize: 12 }} formatter={(v: any) => [nf(Number(v)), "Gini"]} />
                  <Bar dataKey="gini" radius={[0, 6, 6, 0]} animationDuration={1100}>{chartData.map((d, i) => <Cell key={i} fill={DIM_COLORS[d.dim]} />)}</Bar>
                </BarChart></ResponsiveContainer>
              </div>
              <small className="sg-note">0 = répartition parfaitement égale · 1 = concentration maximale. Pour l'accessibilité sur la grille, le Gini porte sur les distances.</small>
            </div>
            <div className="sg-card sg-pad sg-in">
              <h3>Comment lire ces indices</h3>
              <ul className="sg-read">
                <li><b>Gini / Theil</b> : mesurent l'inégalité de répartition d'un indicateur entre quartiers (0 = égalité).</li>
                <li><b>D (dissimilarité)</b> : part du groupe qu'il faudrait déplacer pour obtenir une répartition identique entre quartiers.</li>
                <li><b>IS, H</b> : indice de ségrégation et indice d'entropie (mélange des niveaux d'instruction).</li>
                <li><b>Moran I</b> : positif = les quartiers voisins se ressemblent (regroupement spatial) ; proche de 0 = pas de structure spatiale.</li>
                <li><b>LISA</b> : repère les quartiers qui forment des regroupements (HH, LL) ou des cas atypiques (LH, HL).</li>
              </ul>
              <div className="sg-callout"><Info size={15} /><span>La mobilité n'a pas de structure spatiale significative (Moran proche de 0) : les déplacements ne suivent pas la géographie sociale. L'offre d'équipements et l'accessibilité, elles, sont fortement regroupées dans l'espace.</span></div>
            </div>
          </div>
        </div>}

        {tab === "class" && <div className="sg-stack">
          <div className="sg-card sg-pad sg-in">
            <h3>Cinq profils de quartiers</h3>
            <p className="sg-lead">{cl.synthese.find(s => s[0] === "Classification")?.[1] ?? ""}</p>
            <div className="sg-profiles">
              {CLASS_NAMES.map((n, i) => <button key={n} className={`sg-prof ${sel === i ? "on" : ""}`} style={{ ["--c" as any]: CLASS_COLORS[i] }} onClick={() => setSel(i)}>
                <span className="sg-prof-n">{i + 1}</span><b>{n}</b>
                <small>{byClass[i].n} quartiers · {(byClass[i].pop / totPop * 100).toFixed(0)} % des habitants</small>
                <i className="sg-prof-bar"><em style={{ width: `${byClass[i].pop / totPop * 100}%` }} /></i>
              </button>)}
            </div>
            <div className="sg-prof-detail" style={{ ["--c" as any]: CLASS_COLORS[sel] }}>
              <div><h4>{sel + 1}. {CLASS_NAMES[sel]}</h4><p>{profText(sel) || "—"}</p>
                {profEx(sel) && <small className="sg-note">Exemples : {profEx(sel).replace(/…$/, "")}…</small>}</div>
              <div className="sg-prof-list"><b>Quartiers de la classe ({byClass[sel].n})</b>
                <div>{byClass[sel].names.sort().map(n => <span key={n}>{n}</span>)}</div></div>
            </div>
          </div>

          <div className="sg-grid2">
            <div className="sg-card sg-pad sg-in">
              <h3>Profil de chaque classe (valeurs médianes)</h3>
              <div className="sg-scroll"><table className="sg-table sg-prof-table">
                <thead><tr><th>Indicateur</th>{CLASS_NAMES.map((n, i) => <th key={n} style={{ ["--c" as any]: CLASS_COLORS[i] }}><i className="sg-dot" style={{ background: CLASS_COLORS[i] }} />{i + 1}</th>)}<th>Ville</th></tr></thead>
                <tbody>{cl.profils.map(r => <tr key={r.indicateur}><td>{r.indicateur}</td>{r.valeurs.slice(0, 5).map((v, i) => <td key={i} className={`n ${tone(v, ville(r), r.indicateur)}`}>{fmtProf(r.indicateur, v)}</td>)}<td className="n"><b>{fmtProf(r.indicateur, ville(r))}</b></td></tr>)}</tbody>
              </table></div>
              <small className="sg-note">Valeurs médianes par classe. Vert : au-dessus de la médiane de la ville (+10 %) · rouge : en dessous (−10 %). Les classes sont construites sur l'instruction, la richesse matérielle, la diversité scolaire, les quotients de localisation, l'offre, la distance à la route, la part de cellules mal desservies et la densité ; l'attractivité et le volume des échanges sont donnés à titre indicatif.</small>
            </div>
            <div className="sg-card sg-pad sg-in">
              <h3>Poids de chaque profil dans la population</h3>
              <div style={{ height: 250 }}><ResponsiveContainer width="100%" height="100%"><PieChart>
                <Pie data={byClass.map((c, i) => ({ name: CLASS_NAMES[i], value: c.pop }))} dataKey="value" innerRadius="58%" outerRadius="92%" paddingAngle={2} stroke="none" animationDuration={1200}>{byClass.map((_, i) => <Cell key={i} fill={CLASS_COLORS[i]} />)}</Pie>
                <RTooltip contentStyle={{ background: "rgba(8,16,36,.95)", border: "1px solid rgba(130,160,255,.3)", borderRadius: 10, color: "#eaf1fb", fontSize: 12 }} formatter={(v: any, n: any) => [`${Number(v).toLocaleString("fr-FR")} hab.`, n]} />
              </PieChart></ResponsiveContainer></div>
              <ul className="sg-leg">{CLASS_NAMES.map((n, i) => <li key={n}><i style={{ background: CLASS_COLORS[i] }} />{i + 1}. {n}<b>{(byClass[i].pop / totPop * 100).toFixed(1).replace(".", ",")} %</b></li>)}</ul>
              <small className="sg-note">Population calculée sur les 65 quartiers (RGPH 2023).</small>
              <div className="sg-callout"><Info size={15} /><span>Les classes 1 et 3 forment les deux pôles de la ségrégation : les quartiers aisés n'abritent que 9 % des habitants, alors que la moitié vit dans des quartiers populaires denses et peu instruits.</span></div>
            </div>
          </div>

          <div className="sg-grid2">
            <div className="sg-card sg-pad sg-in">
              <h3>Méthode : ACP et choix du nombre de classes</h3>
              <ul className="sg-steps">{cl.synthese.filter(s => s[0] !== "Classification").map(s => <li key={s[0]}><b>{s[0]}</b><span>{s[1]}</span></li>)}</ul>
            </div>
            <div className="sg-card sg-pad sg-in">
              <h3>Axes de l'ACP</h3>
              <div style={{ height: 180 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={cl.acp} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,.18)" /><XAxis dataKey="cp" tick={{ fill: "var(--sg-mut)", fontSize: 11 }} /><YAxis tick={{ fill: "var(--sg-mut)", fontSize: 11 }} />
                <RTooltip contentStyle={{ background: "rgba(8,16,36,.95)", border: "1px solid rgba(130,160,255,.3)", borderRadius: 10, color: "#eaf1fb", fontSize: 12 }} formatter={(v: any, _n: any, p: any) => [`${nf(Number(v), 2)} (${(p.payload.pct * 100).toFixed(1).replace(".", ",")} %)`, "Valeur propre"]} />
                <Bar dataKey="vp" radius={[6, 6, 0, 0]} animationDuration={1000}>{cl.acp.map((a, i) => <Cell key={i} fill={a.vp > 1 ? "#38bdf8" : "#64748b"} />)}</Bar></BarChart></ResponsiveContainer></div>
              <small className="sg-note">Seules CP1 ({(cl.acp[0].pct * 100).toFixed(1).replace(".", ",")} %) et CP2 ({(cl.acp[1].pct * 100).toFixed(1).replace(".", ",")} %) ont une valeur propre &gt; 1 (critère de Kaiser) : {(cl.acp[1].cum * 100).toFixed(1).replace(".", ",")} % de la variance à elles deux.</small>
              <div className="sg-scroll"><table className="sg-table sg-mini"><thead><tr><th>Indicateur retenu</th><th>CP1</th><th>CP2</th></tr></thead>
                <tbody>{cl.charges.map(c => <tr key={c.indicateur}><td>{c.indicateur}</td><td className="n">{nf(c.c1, 2)}</td><td className="n">{nf(c.c2, 2)}</td></tr>)}</tbody></table></div>
            </div>
          </div>
          <div className="sg-card sg-pad sg-in">
            <h3>Choix de k</h3>
            <div className="sg-scroll"><table className="sg-table"><thead><tr><th>k</th><th>Inertie intra-classe</th><th>Silhouette</th><th>Calinski-Harabasz</th><th>Accord avec Ward (Rand ajusté)</th><th>Effectifs</th></tr></thead>
              <tbody>{cl.choix_k.map(k => <tr key={k.k} className={k.k === 5 ? "pick" : ""}><td className="n"><b>{k.k}</b></td><td className="n">{nf(k.inertie, 1)}</td><td className="n">{nf(k.silhouette, 2)}</td><td className="n">{nf(k.ch, 1)}</td><td className="n">{nf(k.rand, 2)}</td><td>{k.eff}</td></tr>)}</tbody></table></div>
            <small className="sg-note">k = 5 retenu : meilleures silhouette et indice de Calinski-Harabasz, accord de {nf(cl.choix_k.find(k => k.k === 5)?.rand, 2)} (indice de Rand ajusté) avec la classification hiérarchique de Ward.</small>
          </div>
        </div>}

        {tab === "cartes" && <div className="sg-stack">
          <div className="sg-bar sg-in"><h3 style={{ margin: 0 }}>{MAPS.length} cartes produites par l'analyse</h3>
            <div className="sg-chips">{["Toutes", "Indicateurs", "Autocorrélation (LISA)", "Classification"].map(g => <button key={g} className={grp === g ? "on" : ""} onClick={() => setGrp(g)}>{g}</button>)}</div></div>
          <div className="sg-gallery">
            {maps.map((m, i) => <figure key={m.f} className="sg-card sg-map sg-in" style={{ ["--d" as any]: `${Math.min(i, 8) * 50}ms` }} onClick={() => setZoom(MAPS.indexOf(m))}>
              <div className="sg-map-img"><img src={`${R}cartes/${m.f}.webp`} alt={m.t} loading="lazy" /></div>
              <figcaption><b>{m.t}</b><small>{m.g}</small></figcaption></figure>)}
          </div>
        </div>}

        {tab === "corr" && <div className="sg-card sg-pad sg-in">
          <h3>Corrélations de Spearman entre dimensions (par quartier)</h3>
          <p className="sg-lead">Les corrélations significatives après correction FDR (Benjamini-Hochberg) sont en vert.</p>
          <ul className="sg-corr">{[...res.correlations].sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho)).map((c, i) => <li key={i} className={c.sig ? "sig" : ""}>
            <span className="sg-corr-n">{c.a} <ChevronRight size={12} /> {c.b}<small>{c.n} quartiers · p corrigé = {c.pfdr < 0.001 ? "< 0,001" : nf(c.pfdr)}</small></span>
            <span className="sg-corr-bar"><i className="mid" /><em style={{ [c.rho >= 0 ? "left" : "right"]: "50%", width: `${Math.abs(c.rho) * 50}%` }} className={c.rho >= 0 ? "pos" : "neg"} /></span>
            <b>{c.rho >= 0 ? "+" : "−"}{nf(Math.abs(c.rho), 2)}</b><u>{c.sig ? "significative" : "non significative"}</u></li>)}</ul>
          <small className="sg-note">Résultat clé : l'offre d'équipements est fortement liée à l'accessibilité (+0,83), mais ni l'instruction ni la richesse matérielle ne sont liées à l'offre d'équipements.</small>
        </div>}

        {tab === "calc" && <Laboratoire quartiers={quartiers as any[]} res={res as any} />}

        {tab === "fich" && <div className="sg-stack">
          <div className="sg-grid2">
            <div className="sg-card sg-pad sg-in">
              <h3>Données de l'analyse</h3>
              <ul className="sg-files">
                <li><FolderDown size={18} /><div><b>Base finale des 65 quartiers</b><small>Tous les indicateurs, quartiles, clusters LISA, classe · jointure par quartier_id</small></div><a href={`${R}BASE_FINALE_65_QUARTIERS_THIES.xlsx`} download><Download size={14} /> XLSX</a><a href={`${R}BASE_FINALE_65_QUARTIERS_THIES.csv`} download><Download size={14} /> CSV</a></li>
                <li><FolderDown size={18} /><div><b>Correspondance 68 polygones → 65 quartiers</b><small>HLM Thialy, Diakhao Souf et Nguinth Extension rattachés à leur quartier officiel</small></div><a href={`${R}CORRESPONDANCE_68_65.csv`} download><Download size={14} /> CSV</a></li>
              </ul>
              <small className="sg-note">Le classeur XLSX contient aussi les feuilles « Indices », « Profils », « Corrélations » et « Choix de k ». Les cartes de l'onglet « Cartes validées » sont téléchargeables par clic droit.</small>
            </div>
            <div className="sg-card sg-pad sg-in">
              <h3>Effet du regroupement en 65 quartiers</h3>
              <p className="sg-lead">Premiers résultats (68 polygones) comparés aux résultats finaux (65 quartiers), affichés dans l'application.</p>
              <div className="sg-scroll"><table className="sg-table sg-mini"><thead><tr><th>Élément</th><th>68 polygones</th><th>65 quartiers</th></tr></thead>
                <tbody>{res.corrections.map(c => <tr key={c.element} title={c.cause}><td>{c.element}</td><td className="n old">{c.ancien}</td><td className="n fin">{c.final}</td></tr>)}</tbody></table></div>
            </div>
          </div>
          <div className="sg-card sg-pad sg-in">
            <h3><TriangleAlert size={16} /> Points encore ouverts</h3>
            <ul className="sg-open">
              <li>Règle de découpage du réseau routier en tronçons : à préciser dans la méthodologie du mémoire.</li>
              <li>Superficie de Cité Senghor II (0,026 km²) à vérifier dans la couche des quartiers : sa densité est vraisemblablement erronée.</li>
              <li>Valeurs manquantes remplacées par la médiane dans la classification : Keur Mbaye Diakhaté (aucun district de recensement : instruction, quotients de localisation, entropie).</li>
              <li>Accessibilité calculée à vol d'oiseau, non par le réseau routier.</li>
            </ul>
          </div>
        </div>}
      </div>

      {zoom !== null && <div className="sg-lb" onClick={() => setZoom(null)}>
        <button className="sg-lb-x" aria-label="Fermer"><X size={20} /></button>
        <div className="sg-lb-in" onClick={e => e.stopPropagation()}>
          <img src={`${R}cartes/${MAPS[zoom].f}.webp`} alt={MAPS[zoom].t} />
          <div className="sg-lb-cap"><div><b>{MAPS[zoom].t}</b><small>{MAPS[zoom].g} · Source : RGPH 2023, inventaire des infrastructures, couche QRT</small></div>
            <div><button className="sg-btn" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>Précédente</button><button className="sg-btn" disabled={zoom === MAPS.length - 1} onClick={() => setZoom(zoom + 1)}>Suivante</button></div></div>
        </div>
      </div>}
    </section>
  );
}
