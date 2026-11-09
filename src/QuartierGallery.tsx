import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, ImagePlus, Search, Trash2, GraduationCap, Newspaper } from "lucide-react";
import { DOCS, QUARTIER_DOCS, keyOf } from "./quartierDocs";

/** Documents web verifies et rattaches au quartier. */
export function QuartierDocuments({ nom }: { nom: string }) {
  const links = QUARTIER_DOCS[keyOf(nom)] ?? [];
  const ville = `${nom.replace(/\s+/g, " ").replace(/\s*\(.*\)/, "")} Thiès`;
  const scholar = `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${ville.replace(" Thiès", "")}" Thiès quartier`)}`;
  return (
    <div className="pf-docs">
      {links.length === 0 ? (
        <p className="pf-docs-empty">Aucun document web précis n'a été retenu pour ce quartier : les recherches effectuées n'ont pas trouvé de source qui le traite ou le cite avec assez de précision. Rien n'est affiché plutôt qu'une source approximative.</p>
      ) : (
        <ul>
          {links.map((l, i) => {
            const d = DOCS[l.doc]; const Ic = d.type === "Presse" ? Newspaper : d.type === "Mémoire universitaire" ? GraduationCap : FileText;
            return (
              <li key={i}>
                <a href={d.url} target="_blank" rel="noopener noreferrer">
                  <span className="pf-doc-ic"><Ic size={16} /></span>
                  <span className="pf-doc-body">
                    <b>{d.title}</b>
                    <small>{d.type} · {d.outlet} · {d.date}</small>
                    <em>{l.level === "centre" ? "Traite de ce quartier" : "Cite ce quartier"} — {l.note}</em>
                  </span>
                  <ExternalLink size={14} />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <div className="pf-docs-more">
        <span>Chercher d'autres documents :</span>
        <a href={scholar} target="_blank" rel="noopener noreferrer">Google Scholar</a>
        <a href={`https://www.google.com/search?q=${encodeURIComponent(`"${ville}" quartier`)}`} target="_blank" rel="noopener noreferrer">Web</a>
        <a href={`https://www.memoireonline.com/recherche.php?q=${encodeURIComponent(ville)}`} target="_blank" rel="noopener noreferrer">Memoire Online</a>
      </div>
      <small className="pf-note">Seuls les liens sont conservés : les documents restent la propriété de leurs auteurs et éditeurs. Les notes résument ce que chaque source dit du quartier, après lecture.</small>
    </div>
  );
}

// ---------- photographies : liens de recherche + photos ajoutees par l'equipe (stockees dans ce navigateur) ----------
const DB = "thies-galerie", STORE = "photos";
const open = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true }).createIndex("q", "quartier"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
type Photo = { id?: number; quartier: number; blob: Blob; caption: string; author: string; date: string };
async function list(q: number): Promise<Photo[]> { const db = await open(); return new Promise((res, rej) => { const rq = db.transaction(STORE).objectStore(STORE).index("q").getAll(q); rq.onsuccess = () => res(rq.result as Photo[]); rq.onerror = () => rej(rq.error); }); }
async function put(p: Photo) { const db = await open(); return new Promise<void>((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).add(p); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function del(id: number) { const db = await open(); return new Promise<void>((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
/** Reduit l'image (1400 px max, JPEG) avant stockage. */
async function shrink(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f); const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("compression"))), "image/jpeg", 0.85));
}

export function QuartierPhotos({ id, nom }: { id: number; nom: string }) {
  const [items, setItems] = useState<(Photo & { url: string })[]>([]);
  const [err, setErr] = useState(""); const [view, setView] = useState<number | null>(null);
  const [caption, setCaption] = useState(""); const [author, setAuthor] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => list(id).then(ps => setItems(ps.map(p => ({ ...p, url: URL.createObjectURL(p.blob) })))).catch(() => setErr("Le stockage local du navigateur est indisponible (navigation privée ?)."));
  useEffect(() => { refresh(); return () => items.forEach(i => URL.revokeObjectURL(i.url)); }, [id]); // eslint-disable-line
  const add = async (files: FileList | null) => {
    if (!files?.length) return; setErr("");
    try { for (const f of Array.from(files)) { if (!f.type.startsWith("image/")) continue; await put({ quartier: id, blob: await shrink(f), caption: caption.trim(), author: author.trim(), date: new Date().toLocaleDateString("fr-FR") }); } setCaption(""); await refresh(); }
    catch { setErr("Impossible d'enregistrer cette image."); }
    if (input.current) input.current.value = "";
  };
  const short = nom.replace(/\s+/g, " ").replace(/\s*\(.*\)/, "");
  const q = encodeURIComponent(`${short} Thiès`);
  return (
    <div className="pf-photos">
      <p className="pf-photos-lead">Aucune photographie du web n'est affichée ici : les images de presse sont protégées et ne peuvent être reprises sans accord. Voici où chercher des photos libres de droits, et comment ajouter celles prises par l'équipe sur le terrain.</p>
      <div className="pf-docs-more">
        <a href={`https://commons.wikimedia.org/w/index.php?search=${q}&ns6=1&ns14=1`} target="_blank" rel="noopener noreferrer"><Search size={13} /> Wikimedia Commons (libres de droits)</a>
        <a href={`https://www.google.com/search?tbm=isch&q=${q}`} target="_blank" rel="noopener noreferrer">Google Images</a>
        <a href={`https://www.openstreetmap.org/search?query=${q}`} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
      </div>
      <div className="pf-add">
        <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Légende (lieu, sujet)" aria-label="Légende de la photo" />
        <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Auteur / source" aria-label="Auteur de la photo" />
        <button onClick={() => input.current?.click()}><ImagePlus size={15} /> Ajouter des photos</button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => add(e.target.files)} />
      </div>
      {err && <small className="pf-err">{err}</small>}
      {items.length === 0 ? <small className="pf-note">Aucune photo ajoutée pour {short}. Les photos ajoutées restent dans ce navigateur (elles ne sont pas envoyées sur un serveur) ; réduisez-les au besoin, elles sont compressées à 1 400 px.</small> : (
        <div className="pf-grid">
          {items.map(p => (
            <figure key={p.id}>
              <button onClick={() => setView(p.id!)} aria-label={`Agrandir ${p.caption || "la photo"}`}><img src={p.url} alt={p.caption || `Photo du quartier ${short}`} loading="lazy" /></button>
              <figcaption><span>{p.caption || "Sans légende"}<small>{[p.author, p.date].filter(Boolean).join(" · ")}</small></span>
                <button onClick={() => { if (confirm("Supprimer cette photo ?")) del(p.id!).then(refresh); }} aria-label="Supprimer"><Trash2 size={13} /></button></figcaption>
            </figure>))}
        </div>)}
      {view !== null && (() => { const p = items.find(x => x.id === view); return p ? <div className="pf-lightbox" onClick={() => setView(null)} role="dialog" aria-label="Photo agrandie"><img src={p.url} alt={p.caption} /><span>{p.caption}</span></div> : null; })()}
    </div>
  );
}
