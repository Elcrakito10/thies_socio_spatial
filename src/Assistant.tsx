import { useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bot, MapPinned, Send, Sparkles, X } from "lucide-react";
import { ThemeCtx } from "./ui";
import { answer, analyzeMap, findInd, HELP, INDS, LABEL, type Answer, type Data, type Memory, type Q } from "./assistant/engine";
import { ASSISTANT_EVENT, askAssistant, assistantStore, type AssistantRequest } from "./assistant/store";
import { loadGrid } from "./mapdraw";
import "./Assistant.css";

void askAssistant;
type Msg = { id: number; role: "user" | "bot"; text?: string; a?: Answer; ai?: boolean };
const SUGGEST = ["Synthèse du territoire", "Quels quartiers sont les moins bien desservis ?", "Explique la richesse matérielle", "Compare Thiès Nord et Thiès Est", "Que peux-tu analyser ?"];

const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p);

function Bubble({ m, onFollow }: { m: Msg; onFollow: (t: string) => void }) {
  if (m.role === "user") return <div className="as-msg as-user">{m.text}</div>;
  if (m.ai) return <div className="as-msg as-bot as-ai"><span className="as-badge">Reformulation par Claude (à partir des faits ci-dessus)</span>{m.text!.split(/\n+/).map((l, i) => <p key={i}>{bold(l)}</p>)}</div>;
  const a = m.a!;
  return (
    <div className="as-msg as-bot">
      {a.title && <h4>{a.title}</h4>}
      {a.sections.map((s, i) => (
        <div key={i} className={`as-sec as-${s.kind}`}>
          <span className="as-badge">{LABEL[s.kind]}</span>
          {s.lines.map((l, j) => <p key={j}>{bold(l)}</p>)}
        </div>
      ))}
      {a.table && <div className="as-table-wrap"><table className="as-table"><thead><tr>{a.table.head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{a.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
      {a.followups && <div className="as-chips">{a.followups.map(f => <button key={f} onClick={() => onFollow(f)}>{f}</button>)}</div>}
      <small className="as-src">Source : données de l'application (quartiers, RGPH-5, équipements, ACP).</small>
    </div>
  );
}

export default function Assistant({ quartiers, census }: { quartiers: Q[]; census: any }) {
  const dark = useContext(ThemeCtx);
  const st = useSyncExternalStore(assistantStore.subscribe, assistantStore.get);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [grid, setGrid] = useState<any>(null);
  const mem = useRef<Memory>({});
  const llm = useRef(false);
  const [llmOn, setLlmOn] = useState(false);
  useEffect(() => { fetch("/api/assistant/health").then(r => r.json()).then(j => { llm.current = !!j.ok; setLlmOn(!!j.ok); }).catch(() => {}); }, []);
  const id = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const data = useRef<Data>({ quartiers, census, grid });
  data.current = { quartiers, census, grid };
  const stRef = useRef(st); stRef.current = st;

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, open]);

  const push = (m: Omit<Msg, "id">) => setMsgs(x => [...x, { ...m, id: ++id.current }]);
  const post = async (path: string, body: any) => {
    const r = await fetch(`/api/assistant/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(String(r.status)); return r.json();
  };
  const factsOf = (a: Answer) => ({ titre: a.title, sections: a.sections.map(s => ({ type: LABEL[s.kind], lignes: s.lines })), tableau: a.table });
  const ai = async (question: string, a: Answer) => {
    if (!llm.current) return;
    try { const { text } = await post("explain", { question, facts: factsOf(a) }); if (text) push({ role: "bot", text, ai: true }); } catch { /* serveur IA indisponible : on garde la reponse du moteur */ }
  };
  const ask = async (text: string) => {
    const t = text.trim(); if (!t) return;
    push({ role: "user", text: t });
    if (!data.current.quartiers.length) { push({ role: "bot", a: { sections: [{ kind: "dispo", lines: ["Les données sont encore en cours de chargement. Réessayez dans un instant."] }] } }); return; }
    let r = answer(t, data.current, mem.current, stRef.current.map);
    if (r.a.unrecognized && llm.current) {
      try {
        const { query } = await post("rewrite", { question: t, quartiers: data.current.quartiers.map(q => q.nom), indicators: INDS.map(i => ({ id: i.id, label: i.label })) });
        if (query) { const r2 = answer(query, data.current, mem.current, stRef.current.map); if (!r2.a.unrecognized) r = r2; }
      } catch { /* on garde la reponse du moteur */ }
    }
    mem.current = r.mem; push({ role: "bot", a: r.a }); ai(t, r.a);
  };
  const analyze = async (ctx = stRef.current.map) => {
    if (!ctx) { push({ role: "bot", a: { sections: [{ kind: "dispo", lines: ["Aucune carte n'est affichée sur cette page. Ouvrez le Géoportail, la Cartothèque ou le Tableau de bord pour que je l'analyse."] }] } }); return; }
    if (ctx.layer === "grille" && !data.current.grid) { try { const g = await loadGrid(); data.current = { ...data.current, grid: g }; setGrid(g); } catch { /* grille indisponible */ } }
    const label = findInd(ctx.indicatorId)?.label ?? "carte affichée";
    push({ role: "user", text: `Analyser cette carte : ${label}` });
    mem.current = { ...mem.current, indId: findInd(ctx.indicatorId)?.id, quartierId: ctx.quartierId ?? mem.current.quartierId };
    push({ role: "bot", a: analyzeMap(ctx, data.current) });
  };

  useEffect(() => {
    const h = (e: Event) => {
      const req = (e as CustomEvent<AssistantRequest>).detail; setOpen(true);
      if (req.type === "ask") ask(req.text); else analyze(req.ctx ?? stRef.current.map);
    };
    window.addEventListener(ASSISTANT_EVENT, h); return () => window.removeEventListener(ASSISTANT_EVENT, h);
  }, []); // eslint-disable-line
  useEffect(() => { if (open && !grid) loadGrid().then(setGrid).catch(() => {}); }, [open, grid]);

  const ctxInd = st.map ? findInd(st.map.indicatorId) : null;
  return (
    <div className={`as-root ${dark ? "as-dark" : "as-light"}`}>
      {!open && <button className="as-fab" onClick={() => setOpen(true)} aria-label="Ouvrir l'assistant"><Bot size={22}/><span>Assistant</span></button>}
      {open && <section className="as-panel" role="dialog" aria-label="Assistant Spatial de Thiès">
        <header>
          <div className="as-av"><Sparkles size={16}/></div>
          <div><strong>Assistant Spatial de Thiès</strong><small>{llmOn ? "Moteur de calcul local + reformulation par Claude" : "Répond uniquement à partir des données de l'application"}</small></div>
          <button onClick={() => setOpen(false)} aria-label="Fermer"><X size={18}/></button>
        </header>
        {ctxInd && <div className="as-ctx"><MapPinned size={14}/><span>Carte : <b>{ctxInd.label}</b></span><button onClick={() => analyze()}>Analyser cette carte</button></div>}
        <div className="as-body">
          {!msgs.length && <>
            <Bubble m={{ id: 0, role: "bot", a: HELP }} onFollow={ask}/>
            <div className="as-chips as-start">{SUGGEST.map(s => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
          </>}
          {msgs.map(m => <Bubble key={m.id} m={m} onFollow={ask}/>)}
          <div ref={end}/>
        </div>
        <form onSubmit={e => { e.preventDefault(); ask(input); setInput(""); }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Posez une question sur Thiès…" aria-label="Question"/>
          <button type="submit" aria-label="Envoyer"><Send size={16}/></button>
        </form>
      </section>}
    </div>
  );
}
