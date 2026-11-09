import { useState } from "react";
import { Wand2, Plus, X, Download, Crosshair } from "lucide-react";
import { EXAMPLES, FIELDS, evalRule, PROFILE_NAMES, STAT_LABEL, describeRule, describe, fieldOf, parseQuery, type Ctx, type Parsed, type Q, type Rule, type StatMode } from "./geoQuery";

type Props = {
  onAround?: (a: NonNullable<Parsed["around"]>) => void; onRoute?: (r: NonNullable<Parsed["route"]>) => void;
  ctx: Ctx; rules: Rule[]; setRules: (r: Rule[]) => void; mode: "and" | "or"; setMode: (m: "and" | "or") => void;
  ids: number[]; onPick: (id: number) => void; onZoomAll: () => void;
  buffer: { lat: number; lng: number; m: number } | null;
};
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 0 }));
const COMMUNES = ["Thies Est", "Thies Nord", "Thies Ouest"];
type Kind = "thr" | "stat" | "commune" | "dist" | "adj" | "lisa" | "class";

export default function GeoQueryPanel({ onAround, onRoute, ctx, rules, setRules, mode, setMode, ids, onPick, onZoomAll, buffer }: Props) {
  const [text, setText] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>("thr");
  const [field, setField] = useState("population");
  const [op, setOp] = useState<">=" | "<=" | "between">(">=");
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [statMode, setStatMode] = useState<StatMode>("top"); const [n, setN] = useState("10");
  const [commune, setCommune] = useState(COMMUNES[0]); const [ref, setRef] = useState(ctx.quartiers[0]?.quartier_id ?? 0); const [km, setKm] = useState("2");
  const [cls, setCls] = useState(1); const [lisaF, setLisaF] = useState<"LISA_offre_infra_0_1" | "LISA_instruction_0_1" | "LISA_niveau_vie_0_1_corrige">("LISA_offre_infra_0_1"); const [lisaC, setLisaC] = useState("HH");

  const f = fieldOf(field);
  const d = describe(ctx.quartiers.map(q => f.get(q)).filter((v): v is number => v !== null));
  const sortedQ = [...ctx.quartiers].sort((x, y) => x.nom.localeCompare(y.nom, "fr"));

  const ask = (s: string) => {
    setText(s); const p = parseQuery(s, ctx);
    setNotes(p.notes); setUnknown(p.unknown);
    if (p.rules.length) { setRules(p.rules); setMode(p.mode); }
    if (p.around) onAround?.(p.around);
    if (p.route) onRoute?.(p.route);
    if (!p.rules.length && !p.around && !p.route && s.trim()) setUnknown(u => [...u, "Aucun critère reconnu. Essayez un des exemples ci-dessous."]);
  };
  const add = () => {
    let r: Rule | null = null;
    if (kind === "thr") { const va = Number(a.replace(",", ".")); const vb = Number(b.replace(",", ".")); if (a.trim() === "" || !Number.isFinite(va)) return; r = op === "between" ? { kind: "thr", field, op, a: va, b: Number.isFinite(vb) ? vb : va } : { kind: "thr", field, op, a: va }; }
    else if (kind === "stat") r = { kind: "stat", field, mode: statMode, n: Math.max(1, Math.round(Number(n) || 10)) };
    else if (kind === "commune") r = { kind: "commune", values: [commune] };
    else if (kind === "dist") { const v = Number(km.replace(",", ".")); if (!(v > 0)) return; r = { kind: "dist", ref, km: v }; }
    else if (kind === "adj") r = { kind: "adj", ref };
    else if (kind === "lisa") r = { kind: "lisa", field: lisaF, cat: lisaC };
    else if (kind === "class") r = { kind: "class", cls };
    if (r) { setRules([...rules, r]); setNotes([]); setUnknown([]); }
  };
  const exportCsv = () => {
    const cols = FIELDS.map(x => x.id);
    const rows = ids.map(id => ctx.quartiers.find(q => q.quartier_id === id)!);
    const csv = ["quartier_id;nom;commune;" + cols.join(";"), ...rows.map(q => [q.quartier_id, q.nom, q.commune, ...FIELDS.map(x => x.get(q) ?? "")].join(";"))].join("\n");
    const a2 = document.createElement("a"); a2.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); a2.download = "resultat_requete_quartiers.csv"; a2.click(); URL.revokeObjectURL(a2.href);
  };
  // champ affiche dans la liste : celui de la premiere regle chiffree
  const shown = (() => { const r = rules.find(x => x.kind === "thr" || x.kind === "stat") as Extract<Rule, { field: string }> | undefined; return fieldOf(r?.field ?? "population"); })();
  const needsField = kind === "thr" || kind === "stat";

  return (
    <div className="gx-q">
      <div className="gx-q-nl">
        <label htmlFor="gx-nl">Poser une question en français</label>
        <div className="gx-q-row">
          <input id="gx-nl" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && ask(text)} placeholder="Ex. quartiers les mieux desservis en équipements" />
          <button className="gx-q-go" onClick={() => ask(text)} aria-label="Interpréter la question"><Wand2 size={15} /></button>
        </div>
        <div className="gx-q-ex">{EXAMPLES.map(e => <button key={e} onClick={() => ask(e)}>{e}</button>)}</div>
        {notes.length > 0 && <ul className="gx-q-notes">{notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        {unknown.length > 0 && <ul className="gx-q-notes warn">{unknown.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      </div>

      <details className="gx-q-build">
        <summary>Construire un critère</summary>
        <div className="gx-q-grid">
          <select value={kind} onChange={e => setKind(e.target.value as Kind)} aria-label="Type de critère">
            <option value="thr">Seuil sur une valeur</option><option value="stat">Filtre statistique</option>
            <option value="commune">Requête spatiale : commune</option><option value="adj">Requête spatiale : adjacent à</option>
            <option value="dist">Requête spatiale : à moins de … km de</option><option value="lisa">Cluster LISA (autocorrélation)</option><option value="class">Profil (5 classes)</option>
          </select>
          {needsField && <select value={field} onChange={e => setField(e.target.value)} aria-label="Indicateur">
            {(["effectif", "taille", "ratio"] as const).map(k => <optgroup key={k} label={k === "effectif" ? "Effectifs / volumes" : k === "taille" ? "Tailles" : "Indicateurs et ratios"}>{FIELDS.filter(x => x.kind === k).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}
          </select>}
          {kind === "thr" && <>
            <div className="gx-q-row">
              <select value={op} onChange={e => setOp(e.target.value as any)} aria-label="Opérateur"><option value=">=">≥</option><option value="<=">≤</option><option value="between">entre</option></select>
              <input inputMode="decimal" value={a} onChange={e => setA(e.target.value)} placeholder="valeur" aria-label="Seuil" />
              {op === "between" && <input inputMode="decimal" value={b} onChange={e => setB(e.target.value)} placeholder="et" aria-label="Seuil haut" />}
            </div>
            {d && <input type="range" min={d.min} max={d.max} step={(d.max - d.min) / 200 || 1} value={Number(a) || d.median} onChange={e => setA(String(Number(Number(e.target.value).toPrecision(4))))} aria-label="Curseur de seuil" />}
            {d && <small className="gx-q-hint">min {fmt(d.min)} · médiane {fmt(d.median)} · moyenne {fmt(d.mean)} · max {fmt(d.max)} {f.unit}</small>}
          </>}
          {kind === "stat" && <div className="gx-q-row">
            <select value={statMode} onChange={e => setStatMode(e.target.value as StatMode)} aria-label="Filtre statistique">{(Object.keys(STAT_LABEL) as StatMode[]).map(m => <option key={m} value={m}>{STAT_LABEL[m].replace("N", "N")}</option>)}</select>
            {(statMode === "top" || statMode === "bottom") && <input inputMode="numeric" value={n} onChange={e => setN(e.target.value)} aria-label="Nombre N" style={{ width: 52 }} />}
          </div>}
          {kind === "commune" && <select value={commune} onChange={e => setCommune(e.target.value)} aria-label="Commune">{COMMUNES.map(c => <option key={c}>{c}</option>)}</select>}
          {(kind === "adj" || kind === "dist") && <select value={ref} onChange={e => setRef(Number(e.target.value))} aria-label="Quartier de référence">{sortedQ.map(q => <option key={q.quartier_id} value={q.quartier_id}>{q.nom}</option>)}</select>}
          {kind === "dist" && <div className="gx-q-row"><input inputMode="decimal" value={km} onChange={e => setKm(e.target.value)} aria-label="Distance en km" style={{ width: 60 }} /><span>km (entre centroïdes)</span></div>}
          {kind === "lisa" && <div className="gx-q-row">
            <select value={lisaF} onChange={e => setLisaF(e.target.value as any)} aria-label="Variable LISA"><option value="LISA_offre_infra_0_1">Offre d'équipements</option><option value="LISA_instruction_0_1">Instruction</option><option value="LISA_niveau_vie_0_1_corrige">Richesse matérielle</option></select>
            <select value={lisaC} onChange={e => setLisaC(e.target.value)} aria-label="Cluster">{["HH", "LL", "HL", "LH"].map(c => <option key={c}>{c}</option>)}</select>
          </div>}
          {kind === "class" && <select value={cls} onChange={e => setCls(Number(e.target.value))} aria-label="Profil">{PROFILE_NAMES.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n}</option>)}</select>}
          <div className="gx-q-row">
            <button className="gx-q-add" onClick={add}><Plus size={14} /> Ajouter le critère</button>
            {buffer && <button className="gx-q-add alt" onClick={() => setRules([...rules, { kind: "buffer", ...buffer }])} title="Quartiers dont le centroïde est dans la zone tampon tracée"><Crosshair size={14} /> Zone tampon</button>}
          </div>
        </div>
      </details>

      <div className="gx-q-rules">
        <div className="gx-q-rules-head"><b>Critères actifs ({rules.length})</b>
          <span className="gx-q-mode" role="group" aria-label="Combinaison">
            <button className={mode === "and" ? "on" : ""} onClick={() => setMode("and")} title="Tous les critères à la fois">ET</button>
            <button className={mode === "or" ? "on" : ""} onClick={() => setMode("or")} title="Au moins un critère">OU</button>
          </span>
        </div>
        {rules.length > 1 && <p className="gx-q-explain">{mode === "and"
          ? <><b>ET</b> : un quartier est retenu seulement s'il respecte <u>tous</u> les critères ci-dessous (résultat plus restreint).</>
          : <><b>OU</b> : un quartier est retenu s'il respecte <u>au moins un</u> des critères ci-dessous (résultat plus large).</>}</p>}
        {rules.length === 0 ? <p className="gx-q-empty">Aucun critère. Posez une question ou construisez un critère.</p> :
          <ul>{rules.map((r, i) => <li key={i}><span>{describeRule(r, ctx)}</span><button onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Retirer ce critère"><X size={12} /></button></li>)}</ul>}
      </div>

      {rules.length > 0 && <div className="gx-q-res">
        <div className="gx-q-res-head"><b>{ids.length} quartier(s) sur {ctx.quartiers.length}</b>
          <span>
            <button onClick={onZoomAll} disabled={!ids.length}>Cadrer</button>
            <button onClick={exportCsv} disabled={!ids.length} aria-label="Exporter les résultats en CSV"><Download size={13} /></button>
            <button onClick={() => { setRules([]); setNotes([]); setUnknown([]); setText(""); }}>Effacer</button>
          </span></div>
        {ids.length === 0 ? <div className="gx-q-empty">
            <p>Aucun quartier ne répond à ces critères dans les données.</p>
            <ul className="gx-q-why">{rules.map((r, i) => <li key={i}><b>{evalRule(r, ctx).size}</b> quartier(s) : {describeRule(r, ctx)}</li>)}</ul>
            <p>{rules.some(r => evalRule(r, ctx).size === 0) ? "Un critère ne correspond à aucun quartier : c'est un résultat (par exemple, tous les quartiers possèdent au moins un équipement), pas une erreur." : mode === "and" ? "Chaque critère est satisfait par certains quartiers, mais jamais par les mêmes : passez en « OU » ou retirez un critère." : "Retirez ou assouplissez un critère."}</p>
          </div> :
          <ol>{ids.map(id => { const q = ctx.quartiers.find(x => x.quartier_id === id) as Q; return (
            <li key={id}><button onClick={() => onPick(id)}><span className="n">{q.nom}</span><span className="c">{q.commune}</span><span className="v">{fmt(shown.get(q))} <small>{shown.unit}</small></span></button></li>); })}</ol>}
      </div>}
    </div>
  );
}
