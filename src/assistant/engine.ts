import { INFRA_FAMILIES, computeStats, quartileClass, type QuartierFull } from "../Geoportail";
import type { MapCtx } from "./store";
import { STATUTS, aggregate, capaciteEcole, getData, getParams, statutLabel, type QEquip } from "../equip";

// ============================================================
// Moteur d'analyse de l'Assistant Spatial de Thiès.
// 100 % local et deterministe : chaque nombre cite est lu ou calcule
// a partir des donnees chargees dans l'application. Aucune valeur n'est
// inventee ; quand l'information manque, le moteur le dit.
// ============================================================
export type Q = QuartierFull & { geometry?: any };
export type Section = { kind: "obs" | "calc" | "interp" | "hyp" | "dispo"; lines: string[] };
export type Answer = {
  unrecognized?: boolean; title?: string; sections: Section[];
  table?: { head: string[]; rows: string[][] };
  followups?: string[];
};
export type Memory = { quartierId?: number; indId?: string };
export type Data = { quartiers: Q[]; census?: any | null; grid?: any | null };

export const LABEL: Record<Section["kind"], string> = {
  obs: "Données observées", calc: "Calculs", interp: "En clair", hyp: "Pour aller plus loin (non prouvé)", dispo: "Disponibilité",
};

// ---------- utilitaires ----------
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9 /%.-]/g, " ").replace(/\s+/g, " ").trim();
export const nf = (v: number, d = 2) => (Math.abs(v) >= 1000 ? v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : v.toLocaleString("fr-FR", { maximumFractionDigits: d }));
const communeName = (c: string) => c.replace(/^Thies/i, "Thiès").replace("THIES", "Thiès");

// ---------- catalogue d'indicateurs ----------
export type Ind = { id: string; label: string; unit: string; get: (q: Q) => number | null; kind: "pop" | "dens" | "acc" | "inst" | "vie" | "count" | "seg" | "equip"; fam?: string; d: number };
const FAM_KW: Record<string, string[]> = {
  sante: ["sante", "hopit", "hosto", "clinique", "dispensaire", "medical", "pharmacie", "maternite", "soin", "medecin", "poste de sante"],
  education: ["education", "ecole", "lycee", "college", "scolaire", "universite", "creche", "etudi", "enseignement", "classe"],
  commerce: ["commerce", "marche", "boutique", "commercial", "magasin", "supermarche", "boulangerie", "vendeur", "achat"],
  sport: ["sport", "stade", "terrain", "foot", "gymnase", "basket"],
  religion: ["religion", "mosquee", "eglise", "culte", "religieux", "paroisse", "temple", "priere", "cathedrale"],
  transport: ["transport", "gare", "bus", "station", "taxi", "arret", "garage", "mobilite"],
  banque: ["banque", "bancaire", "banques", "microfinance", "distributeur", "guichet"],
  assurance: ["assurance"],
};
export const INDS: Ind[] = [
  { id: "population", label: "Population (RGPH-5)", unit: "hab.", get: q => (q.population > 0 ? q.population : null), kind: "pop", d: 0 },
  { id: "densite_pop", label: "Densité de population", unit: "hab./km²", get: q => (q.surface_km2 && q.population > 0 ? q.population / q.surface_km2 : null), kind: "pop", d: 0 },
  ...INFRA_FAMILIES.map(f => ({ id: `dens_${f.key}`, label: `Densité d'équipements — ${f.label}`, unit: "éq./km²", get: (q: Q) => (q as any)[`dens_${f.key}`] as number | null, kind: "dens" as const, fam: f.key, d: 1 })),
  ...INFRA_FAMILIES.map(f => ({ id: `nb_${f.key}`, label: `Nombre d'équipements — ${f.label}`, unit: "éq.", get: (q: Q) => (q as any)[`nb_${f.key}`] as number | null, kind: "count" as const, fam: f.key, d: 0 })),
  ...INFRA_FAMILIES.map(f => ({ id: `acc_${f.key}`, label: `Accessibilité — ${f.label}`, unit: "indice", get: (q: Q) => (q as any)[`acc_${f.key}`] as number | null, kind: "acc" as const, fam: f.key, d: 2 })),
  { id: "acc_globale", label: "Accessibilité globale", unit: "indice", get: q => q.acc_globale, kind: "acc", d: 2 },
  { id: "acc_routiere_indice", label: "Accessibilité routière", unit: "indice 0–1", get: q => q.acc_routiere_indice, kind: "acc", d: 2 },
  { id: "ind_instruction_0_1", label: "Niveau d'instruction (ACP)", unit: "indice 0–1", get: q => q.ind_instruction_0_1, kind: "inst", d: 2 },
  { id: "ind_niveau_vie_0_1", label: "Richesse matérielle (ACP)", unit: "indice 0–1", get: q => q.ind_niveau_vie_0_1, kind: "vie", d: 2 },
  { id: "offre_infra_0_1", label: "Offre d'infrastructures (indicateur synthétique)", unit: "indice 0–1", get: q => q.offre_infra_0_1 ?? null, kind: "seg", d: 2 },
  { id: "indice_attractivite", label: "Indice d'attractivité (mobilité)", unit: "−1 à +1", get: q => q.indice_attractivite ?? null, kind: "seg", d: 2 },
  { id: "flux_emis", label: "Flux émis", unit: "flux", get: q => q.flux_emis ?? null, kind: "seg", d: 0 },
  { id: "flux_recus", label: "Flux reçus", unit: "flux", get: q => q.flux_recus ?? null, kind: "seg", d: 0 },
  { id: "LQ_superieur", label: "Coefficient de localisation — supérieur", unit: "ratio", get: q => q.LQ_superieur ?? null, kind: "seg", d: 2 },
  { id: "LQ_sans_niveau", label: "Coefficient de localisation — sans niveau", unit: "ratio", get: q => q.LQ_sans_niveau ?? null, kind: "seg", d: 2 },
  ...(([
    ["edu_enf_ecole", "Primaire — enfants de 6-11 ans par école", "enfants / école", (e: QEquip) => e.enfants_par_ecole, 0],
    ["edu_couverture", "Primaire — places disponibles ÷ enfants (%)", "%", (e: QEquip) => (e.couverture_edu === null ? null : e.couverture_edu * 100), 0],
    ["edu_manquantes", "Primaire — écoles manquantes", "écoles", (e: QEquip) => e.ecoles_manquantes, 0],
    ["san_hab_eps", "Santé — habitants par équivalent-poste de santé", "hab. / équiv.", (e: QEquip) => e.hab_par_eps, 0],
    ["san_couverture", "Santé — couverture de la norme (%)", "%", (e: QEquip) => (e.couverture_san === null ? null : e.couverture_san * 100), 0],
    ["san_manquants", "Santé — équivalents-poste manquants", "équiv.-poste", (e: QEquip) => e.eps_manquants, 1],
    ["pers_inf", "Personnel — infirmiers pour 5 000 hab. (aire du poste)", "pour 5 000 hab.", (e: QEquip) => e.inf_ratio, 2],
    ["pers_med", "Personnel — médecins pour 10 000 hab. (aire du poste)", "pour 10 000 hab.", (e: QEquip) => e.med_ratio, 2],
  ] as [string, string, string, (e: QEquip) => number | null, number][]).map(([id, label, unit, f, d]): Ind => ({ id, label, unit, get: q => ((q as any).eq ? f((q as any).eq) : null), kind: "equip", d }))),
];
const ALIAS: Record<string, string> = { routier: "acc_routiere_indice", instruction: "ind_instruction_0_1", niveau_vie: "ind_niveau_vie_0_1" };
export const findInd = (id: string) => INDS.find(i => i.id === (ALIAS[id] ?? id));
const famOf = (t: string): string | null => { for (const [k, ws] of Object.entries(FAM_KW)) if (ws.some(w => t.includes(w))) return k; return null; };

export function detectInd(t: string): Ind | null {
  const fam = famOf(t);
  if (/offre d infrastructure|offre infra|offre d equipement|indicateur synthetique/.test(t)) return findInd("offre_infra_0_1")!;
  if (/attractivite|attractif/.test(t)) return findInd("indice_attractivite")!;
  if (/flux (emis|sortant)|emetteur/.test(t)) return findInd("flux_emis")!;
  if (/flux (recu|entrant)|recepteur/.test(t)) return findInd("flux_recus")!;
  if (/(coefficient de localisation|\blq\b).*(superieur|diplome)|diplomes? du superieur/.test(t)) return findInd("LQ_superieur")!;
  if (/(coefficient de localisation|\blq\b).*sans niveau|sans niveau|non scolaris/.test(t)) return findInd("LQ_sans_niveau")!;
  if (/niveau de vie|vie materiel|richesse|aise|pauvre|standing/.test(t)) return findInd("ind_niveau_vie_0_1")!;
  if (/instruction|alphabet|niveau d etude|scolarisation/.test(t)) return findInd("ind_instruction_0_1")!;
  if (/routier|route|voirie|reseau routier/.test(t) && /acces|dessert|distance|proxim|route|routier/.test(t)) return findInd("acc_routiere_indice")!;
  if (/densite de population|densite population|hab ?\/ ?km|densite demographique/.test(t)) return findInd("densite_pop")!;
  if (/accessib|dessert|acces |proximite/.test(t)) return fam ? findInd(`acc_${fam}`)! : findInd("acc_globale")!;
  if (/densite/.test(t)) return fam ? findInd(`dens_${fam}`)! : findInd("densite_pop")!;
  if (/equipement|infrastructure|combien d/.test(t) && fam) return findInd(`nb_${fam}`)!;
  if (/population|habitant|peuple|demograph/.test(t)) return findInd("population")!;
  if (fam) return findInd(`dens_${fam}`)!;
  return null;
}
function detectAllInds(t: string): Ind[] {
  // decoupe sur « et / avec / vs / entre » pour reperer deux indicateurs
  const parts = t.split(/ et | avec | vs | versus | entre | ou /).map(s => s.trim()).filter(Boolean);
  const out: Ind[] = [];
  for (const p of parts) { const i = detectInd(p); if (i && !out.find(o => o.id === i.id)) out.push(i); }
  return out;
}

// ---------- statistiques ----------
type Row = { q: Q; v: number };
const rowsOf = (qs: Q[], ind: Ind): Row[] => qs.map(q => ({ q, v: ind.get(q) as number })).filter(r => r.v !== null && r.v !== undefined && Number.isFinite(r.v));
const rankOf = (rows: Row[], id: number) => { const s = [...rows].sort((a, b) => b.v - a.v); const i = s.findIndex(r => r.q.quartier_id === id); return i < 0 ? null : { rank: i + 1, of: s.length }; };
const median = (v: number[]) => computeStats(v)?.median ?? NaN;
const QLAB = ["Q1 (valeurs les plus faibles)", "Q2", "Q3", "Q4 (valeurs les plus élevées)"];
export function pearson(a: number[], b: number[]) {
  const n = a.length; if (n < 4) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}

const simpleLink = (r: number) => { const a = Math.abs(r); if (a < 0.2) return "presque pas de lien"; const f = a >= 0.7 ? "lien fort" : a >= 0.4 ? "lien moyen" : "lien faible"; return `${f} : quand l'un ${r > 0 ? "monte, l'autre a tendance à monter aussi" : "monte, l'autre a tendance à baisser"}`; };

// ---------- geometrie : centroides, voisinage, distance au barycentre ----------
const geoCache = new WeakMap<Q[], { cx: Map<number, [number, number]>; center: [number, number] }>();
function geo(qs: Q[]) {
  let g = geoCache.get(qs); if (g) return g;
  const cx = new Map<number, [number, number]>(); let sx = 0, sy = 0, sw = 0;
  for (const q of qs) {
    const gm = q.geometry; if (!gm) continue;
    const polys: number[][][][] = gm.type === "Polygon" ? [gm.coordinates] : gm.coordinates;
    let best = polys[0]; let ba = -1;
    for (const p of polys) { const r = p[0]; let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; r.forEach(([x, y]) => { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }); const a = (mxx - mnx) * (mxy - mny); if (a > ba) { ba = a; best = p; } }
    const r = best[0]; let x = 0, y = 0; r.forEach(([a, b]) => { x += a; y += b; }); x /= r.length; y /= r.length;
    cx.set(q.quartier_id, [x, y]);
    if (q.population > 0) { sx += x * q.population; sy += y * q.population; sw += q.population; }
  }
  g = { cx, center: sw ? [sx / sw, sy / sw] : [0, 0] }; geoCache.set(qs, g); return g;
}
const km = (a: [number, number], b: [number, number]) => { const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180); return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111.32; };
const distCenter = (qs: Q[], q: Q) => { const g = geo(qs); const c = g.cx.get(q.quartier_id); return c ? km(c, g.center) : null; };
function neighbours(qs: Q[], q: Q, n = 5): Q[] {
  const g = geo(qs); const c = g.cx.get(q.quartier_id); if (!c) return [];
  return qs.filter(o => o.quartier_id !== q.quartier_id && g.cx.has(o.quartier_id)).map(o => ({ o, d: km(c, g.cx.get(o.quartier_id)!) })).sort((a, b) => a.d - b.d).slice(0, n).map(x => x.o);
}


// ---------- tolerance aux fautes : correction par similarite de mots ----------
const lev = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length; let p2: number[] = [], p1 = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i]; let mn = i;
    for (let j = 1; j <= n; j++) {
      let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1); // transposition
      cur[j] = v; mn = Math.min(mn, v);
    }
    if (mn > max) return max + 1;
    p2 = p1; p1 = cur;
  }
  return p1[n];
};
const KEYWORDS = ("quartier quartiers commune communes population habitant habitants peuple peuples demographie densite accessibilite accessible acces desservi desservis desserte equipement equipements infrastructure infrastructures sante hopital hopitaux clinique dispensaire education ecole ecoles lycee college universite commerce commerces marche marches boutique sport stade religion mosquee mosquees eglise transport gare bus banque banques assurance assurances routier route routes voirie instruction alphabetisation niveau vie pauvre pauvres riche riches richesse aise standing compare comparer comparaison difference differences correlation lien relation pourquoi cause causes raison explique expliquer definition signifie classement classer meilleur meilleurs pire pires faible faibles eleve eleves elevee elevees plus moins mieux mal bien synthese resume bilan statistique statistiques chiffres carte analyser analyse interpreter piste pistes action actions recommandation priorite prioriser ameliorer investir thies nord est ouest segregation gini lisa dissimilarite entropie revenu revenus salaire chomage emploi evolution tendance profil territoire indicateur indicateurs equipes surface zone zones peupl dense denses repartition ecart ecarts defavorise defavorises favorise favorises").split(" ");
const STOP = new Set("de la le les des du un une et ou en au aux a ce cet cette ces mon ma mes ton ta son sa ses il elle on nous vous je tu que qui quoi dans sur par pour avec sans est sont etre ete avoir ai as fait faire dit dis moi toi lui y ne pas non oui si mais donc car ni se leur leurs tout tous toute toutes tres peu trop assez entre vers chez sous quel quels quelle quelles comment combien quand donne montre affiche liste cite veux voudrais peux peut cherche trouve dire savoir voir ici la ou d l c n s t m j qu vs et".split(" "));
const vocabCache = new WeakMap<Q[], { all: string[]; names: Set<string> }>();
function vocab(qs: Q[]) {
  let v = vocabCache.get(qs); if (v) return v;
  const names = new Set<string>(); qs.forEach(q => norm(q.nom).replace(/\(.*?\)/g, " ").split(" ").filter(w => w.length > 2).forEach(w => names.add(w)));
  v = { all: Array.from(new Set([...KEYWORDS, ...names])), names }; vocabCache.set(qs, v); return v;
}
const maxDist = (len: number) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);
/** Corrige chaque mot proche (faute de frappe) vers le mot du vocabulaire le plus proche. */
const SMS: Record<string, string> = { vi: "vie", nivo: "niveau", nivau: "niveau", niv: "niveau", kartier: "quartier", kartiers: "quartiers", kel: "quels", kels: "quels", kil: "quel", pop: "population", acces: "acces", dens: "densite", hosto: "hopital", ecol: "ecole", cmpar: "compare", cmp: "compare" };
function correct(t: string, qs: Q[]): string {
  const v = vocab(qs); const set = new Set(v.all);
  return t.split(" ").map(w => {
    if (SMS[w]) return SMS[w];
    if (w.length <= 3 || set.has(w) || STOP.has(w) || /\d/.test(w)) return w;
    const sing = w.replace(/(s|x)$/, ""); if (set.has(sing)) return sing;
    const md = maxDist(w.length); let best = w, bd = md + 1;
    for (const c of v.all) { const d = lev(w, c, md); if (d < bd) { bd = d; best = c; if (d === 1) { /* continue pour chercher mieux */ } } }
    return bd <= md ? best : w;
  }).join(" ");
}
/** Synonymes et formulations courantes ramenes a la forme canonique comprise par les regles. */
function canon(t: string): string {
  return t
    .replace(/\b(c ?koi|ckoi|kesako|ca veut dire quoi|ca veut dire|c est quoi|cest quoi|qu est ce que c est|qu est ce que)\b/g, "c est quoi")
    .replace(/\b(pk|pq|pourkoi|pourqoi|porquoi)\b/g, "pourquoi")
    .replace(/\b(mal desservis?|defavorises?|delaisses?|abandonnes?|enclaves?|isoles?|peripheriques?|sous equipes?|manque d?\b)/g, "moins desservis")
    .replace(/\b(bien desservis?|favorises?|privilegies?|bien equipes?|les mieux)\b/g, "mieux desservis")
    .replace(/\b(les pauvres?|plus pauvres?|plus defavorises?)\b/g, "niveau de vie plus faible")
    .replace(/\b(les riches?|plus riches?|plus aises?)\b/g, "niveau de vie plus eleve")
    .replace(/\b(quel est le (nombre|total) d|combien d)\b/g, "combien d")
    .replace(/\b(qui est|lesquels|lesquelles|quelles? sont les|quels sont les)\b/g, "quels")
    .replace(/\b(diff|differencie|differencient|oppose|opposent|se distingue|se distinguent)\b/g, "difference")
    .replace(/\b(rapport|lien|influence|depend)\b/g, "correlation")
    .replace(/\s+/g, " ").trim();
}

// ---------- detection des quartiers / communes ----------
export function findQuartiers(t: string, qs: Q[]): Q[] {
  const out: { q: Q; pos: number }[] = [];
  const padded = ` ${t} `; let rest = t;
  const found: { q: Q; len: number; pos: number; name: string }[] = [];
  for (const q of qs) {
    const n = norm(q.nom).replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim(); if (n.length < 3) continue;
    const i = padded.indexOf(` ${n} `);
    if (i >= 0) found.push({ q, len: n.length, pos: i, name: n });
  }
  // retire les noms contenus dans un nom plus long deja trouve (« mbour » dans « mbour i »)
  const keep = found.filter(f => !found.some(g => g !== f && g.len > f.len && g.pos <= f.pos && g.pos + g.len >= f.pos + f.len));
  for (const f of keep) { out.push({ q: f.q, pos: (padded.slice(0, f.pos).match(/ /g) || []).length - 1 }); rest = (" " + rest + " ").replace(` ${f.name} `, " ~ ").trim(); }
  // approximatif : fenetres de mots de la reste de la question comparees aux noms (fautes d'orthographe)
  const toks = rest.split(" "); const have = new Set(out.map(o => o.q.quartier_id)); const best: { q: Q; d: number; pos: number }[] = [];
  for (const q of qs) {
    if (have.has(q.quartier_id)) continue;
    const n = norm(q.nom).replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim(); const nws = n.split(" "); const nw = nws.length; if (n.length < 5) continue;
    const md = n.length >= 9 ? 2 : 1; let bd = md + 1, bp = -1;
    for (let i = 0; i + nw <= toks.length; i++) {
      const win = toks.slice(i, i + nw); if (win.some(w => w === "~" || STOP.has(w) || (KEYWORDS.includes(w) && !nws.includes(w)))) continue;
      const d = lev(win.join(" "), n, md); if (d > 0 && d < bd) { bd = d; bp = i; }
    }
    if (bp >= 0) best.push({ q, d: bd, pos: bp });
  }
  best.sort((a, b) => a.d - b.d || a.pos - b.pos);
  const used = new Set<number>();
  for (const b of best) { if (used.has(b.pos)) continue; used.add(b.pos); out.push({ q: b.q, pos: b.pos }); if (out.length >= 3) break; }
  if (out.length) return out.sort((a, b) => a.pos - b.pos).map(o => o.q);
  // repli : tous les mots significatifs du nom sont dans la question
  const words = t.split(" ").filter(w => w.length > 2);
  const fb = qs.map(q => { const nw = norm(q.nom).split(" ").filter(w => w.length > 2); const hit = nw.filter(w => words.includes(w)).length; return { q, score: nw.length ? hit / nw.length : 0, hit }; })
    .filter(x => x.hit >= 1 && x.score >= 0.99).sort((a, b) => b.hit - a.hit);
  return fb.slice(0, 2).map(x => x.q);
}
export function findCommune(t: string): string | null {
  if (/thies nord|commune nord|\bnord\b/.test(t)) return "Thies Nord";
  if (/thies ouest|commune ouest|\bouest\b/.test(t)) return "Thies Ouest";
  if (/thies est|commune est\b/.test(t)) return "Thies Est";
  return null;
}
const inCommune = (qs: Q[], c: string) => qs.filter(q => norm(q.commune) === norm(c));

// ---------- briques de reponse ----------
const unitStr = (i: Ind, v: number) => `${nf(v, i.d)} ${i.unit}`;
function summaryLines(ind: Ind, qs: Q[]): { st: NonNullable<ReturnType<typeof computeStats>>; rows: Row[] } | null {
  const rows = rowsOf(qs, ind); const st = computeStats(rows.map(r => r.v)); return st ? { st, rows } : null;
}
function communeBreakdown(ind: Ind, qs: Q[]): string[] {
  return ["Thies Nord", "Thies Est", "Thies Ouest"].map(c => {
    const r = rowsOf(inCommune(qs, c), ind); if (!r.length) return `${communeName(c)} : aucune valeur.`;
    const st = computeStats(r.map(x => x.v))!; const sum = r.reduce((a, x) => a + x.v, 0);
    return ind.id === "population" ? `${communeName(c)} : ${nf(sum, 0)} hab. sur ${r.length} quartiers renseignés (moyenne ${nf(st.mean, 0)}).` : `${communeName(c)} : moyenne ${unitStr(ind, st.mean)}, médiane ${unitStr(ind, st.median)} (${r.length} quartiers).`;
  });
}
const NOTE: Record<Ind["kind"], string> = {
  pop: "Population : recensement RGPH-5 (ANSD, 2023) rattaché aux quartiers par appariement des localités.",
  dens: "Densité d'équipements : nombre d'équipements de la famille rapporté à la surface du quartier (km²).",
  count: "Nombre d'équipements de la famille recensés dans le quartier (couches thématiques de l'application).",
  acc: "Indice d'accessibilité fourni par les données (calculé à l'échelle de la grille 200 m puis moyenné par quartier). Il est affiché tel quel, sans recalcul ; la convention de l'application est « valeur élevée = mieux desservi ».",
  inst: "Score issu d'une Analyse en Composantes Principales (ACP) sur les données du recensement, mis à l'échelle 0–1. Affiché tel que fourni, non recalculé.",
  vie: "Indice de richesse matérielle : ACP sur 27 taux d'équipement des ménages, mis à l'échelle 0–1 (valeur élevée = ménages mieux équipés). Valeur validée, affichée telle quelle.",
  equip: "Ratio calculé dans l'application à partir du nombre d'équipements de chaque quartier, de sa population et de normes officielles. Les hypothèses (part des enfants de 6-11 ans, taille des classes, poids des structures de santé) se règlent dans l'onglet Hypothèses du panneau de droite.",
  seg: "Résultat de l'analyse de ségrégation validée (offre d'infrastructures, mobilité, coefficients de localisation). Affiché tel que fourni, non recalculé.",
};

export function explainInd(ind: Ind, d: Data): Answer {
  const s = summaryLines(ind, d.quartiers);
  const sections: Section[] = [{ kind: "obs", lines: [NOTE[ind.kind]] }];
  if (s) sections.push({ kind: "calc", lines: [`Sur ${s.rows.length} quartiers renseignés : min ${unitStr(ind, s.st.min)}, médiane ${unitStr(ind, s.st.median)}, moyenne ${unitStr(ind, s.st.mean)}, max ${unitStr(ind, s.st.max)}.`] });
  sections.push({ kind: "interp", lines: [
    ind.kind === "acc" ? "Plus le chiffre est grand, plus on trouve facilement des services près de chez soi. C'est comme une note de « facilité d'accès » : elle ne dit pas si les services sont bons." :
    ind.kind === "dens" ? "Plus le chiffre est grand, plus il y a d'équipements serrés sur un même petit espace. Un quartier du centre en a souvent beaucoup." :
    ind.kind === "inst" || ind.kind === "vie" ? "Plus le chiffre est proche de 1, mieux le quartier est placé par rapport aux autres. Ce n'est pas un pourcentage de personnes : c'est une note pour comparer." :
    ind.kind === "equip" ? "On compare ce que le quartier a (écoles, postes de santé, personnel) à ce que la norme demande pour ses habitants. Quand le chiffre de couverture est de 100 % ou plus, le quartier a au moins ce que la norme demande ; en dessous, il lui manque quelque chose." :
    ind.kind === "seg" ? "Un chiffre plus grand que 1 veut dire qu'un groupe est plus présent dans ce quartier que dans le reste de la ville. L'indice d'attractivité va de −1 (les gens partent de ce quartier) à +1 (les gens y viennent)." :
    ind.kind === "pop" ? "Un grand quartier a plus d'habitants simplement parce qu'il est grand. La densité (habitants par km²) permet de comparer des quartiers de tailles différentes." : "C'est un simple comptage. Pour comparer des quartiers, il faut penser à leur taille et à leur nombre d'habitants." ] });
  return { title: ind.label, sections, followups: [`Résume « ${ind.label} »`, `Quels sont les quartiers les plus élevés pour ${ind.label.toLowerCase()} ?`] };
}

export function summarizeInd(ind: Ind, d: Data): Answer {
  const s = summaryLines(ind, d.quartiers); const qs = d.quartiers;
  if (!s) return unavailable(`l'indicateur « ${ind.label} » (aucune valeur renseignée)`);
  const top = [...s.rows].sort((a, b) => b.v - a.v);
  const nbMissing = qs.length - s.rows.length;
  const dc = rowsOf(qs, ind).map(r => ({ v: r.v, dist: distCenter(qs, r.q) })).filter(x => x.dist !== null);
  const r = pearson(dc.map(x => x.v), dc.map(x => x.dist as number));
  const inter: string[] = [`La moitié des quartiers est au-dessus de ${unitStr(ind, s.st.median)} et l'autre moitié en dessous : c'est la valeur « du milieu » (la médiane).`];
  const communeMeans = ["Thies Nord", "Thies Est", "Thies Ouest"].map(c => ({ c, m: median(rowsOf(inCommune(qs, c), ind).map(x => x.v)) })).filter(x => Number.isFinite(x.m)).sort((a, b) => b.m - a.m);
  if (communeMeans.length > 1) inter.push(`En général, ${communeName(communeMeans[0].c)} a les valeurs les plus hautes (${unitStr(ind, communeMeans[0].m)}) et ${communeName(communeMeans[communeMeans.length - 1].c)} les plus basses (${unitStr(ind, communeMeans[communeMeans.length - 1].m)}).`);
  if (r !== null) inter.push(Math.abs(r) >= 0.4 ? (r < 0 ? "Plus on s'éloigne du centre de la ville, plus les valeurs ont tendance à baisser." : "Plus on s'éloigne du centre de la ville, plus les valeurs ont tendance à monter.") : "Être près ou loin du centre de la ville ne change pas beaucoup les valeurs.");
  return {
    title: `Synthèse — ${ind.label}`,
    sections: [
      { kind: "obs", lines: [`${s.rows.length} quartiers renseignés sur ${qs.length}${nbMissing ? ` (${nbMissing} sans valeur dans les données)` : ""}.`, `Minimum ${unitStr(ind, s.st.min)} (${top[top.length - 1].q.nom}), maximum ${unitStr(ind, s.st.max)} (${top[0].q.nom}).`] },
      { kind: "calc", lines: [`Moyenne ${unitStr(ind, s.st.mean)} ; médiane ${unitStr(ind, s.st.median)} ; quartiles Q1 ${nf(s.st.q1, ind.d)} · Q3 ${nf(s.st.q3, ind.d)} (le quart des quartiers les plus bas est en dessous de Q1, le quart des plus hauts au-dessus de Q3).`, ...communeBreakdown(ind, qs)] },
      { kind: "interp", lines: inter.length ? inter : ["Rien d'autre à signaler avec les données disponibles."] },
    ],
    followups: [`Quels quartiers sont les plus élevés pour ${ind.label.toLowerCase()} ?`, `Quels sont les moins élevés ?`, `Explique « ${ind.label} »`],
  };
}

export function ranking(ind: Ind, d: Data, n: number, dir: "top" | "bottom"): Answer {
  const rows = rowsOf(d.quartiers, ind); if (!rows.length) return unavailable(`l'indicateur « ${ind.label} »`);
  const sorted = [...rows].sort((a, b) => (dir === "top" ? b.v - a.v : a.v - b.v)).slice(0, n);
  return {
    title: `${dir === "top" ? "Valeurs les plus élevées" : "Valeurs les plus faibles"} — ${ind.label}`,
    sections: [
      { kind: "obs", lines: [`Classement de ${rows.length} quartiers renseignés (${d.quartiers.length - rows.length} sans valeur).`] },
      { kind: "interp", lines: ind.kind === "acc" || ind.kind === "dens" || ind.kind === "count" ? [dir === "top" ? "Ces quartiers ont le plus d'équipements ou sont les mieux desservis pour cet indicateur." : "Ces quartiers ont le moins d'équipements ou sont les moins bien desservis : ce sont les premiers à regarder de plus près."] : ["C'est un classement pour comparer les quartiers ; il faut aussi penser à la taille de chaque quartier."] },
    ],
    table: { head: ["#", "Quartier", "Commune", ind.unit], rows: sorted.map((r, i) => [String(i + 1), r.q.nom, communeName(r.q.commune), nf(r.v, ind.d)]) },
    followups: [`Pourquoi ${sorted[0].q.nom} est-il dans ce classement ?`, `Profil de ${sorted[0].q.nom}`],
  };
}

export function quartierProfile(q: Q, d: Data, focus?: Ind | null): Answer {
  const qs = d.quartiers; const lines: string[] = []; const calc: string[] = [];
  const list = focus ? [focus] : [findInd("population")!, findInd("densite_pop")!, findInd("acc_globale")!, findInd("acc_routiere_indice")!, findInd("ind_instruction_0_1")!, findInd("ind_niveau_vie_0_1")!];
  for (const ind of list) {
    const v = ind.get(q); const rows = rowsOf(qs, ind);
    if (v === null || v === undefined) { lines.push(`${ind.label} : non renseigné dans les données.`); continue; }
    const st = computeStats(rows.map(r => r.v)); const rk = rankOf(rows, q.quartier_id); const cl = quartileClass(v, st);
    lines.push(`${ind.label} : ${unitStr(ind, v)}${rk ? ` — rang ${rk.rank}/${rk.of}` : ""}${cl !== null ? `, ${QLAB[cl]}` : ""}.`);
  }
  const head = [`Commune : ${communeName(q.commune)}.`, q.surface_km2 ? `Surface : ${nf(q.surface_km2, 2)} km².` : "Surface : non renseignée.", `Équipements recensés : ${INFRA_FAMILIES.map(f => `${f.label} ${(q as any)[`nb_${f.key}`] ?? 0}`).join(" · ")}.`];
  if (q.classe) calc.push(`Profil de la classification (K-means, 5 classes) : ${q.classe}. ${q.nom_classe}. Clusters LISA — instruction : ${q.LISA_instruction_0_1 ?? "—"}, richesse matérielle : ${q.LISA_niveau_vie_0_1_corrige ?? "—"}, offre d'infrastructures : ${q.LISA_offre_infra_0_1 ?? "—"}.`);
  const dc = distCenter(qs, q); if (dc !== null) calc.push(`Distance au centre de la ville (là où vivent le plus de gens) : ${nf(dc, 1)} km ; la moitié des quartiers est à moins de ${nf(median(qs.map(x => distCenter(qs, x)).filter((x): x is number => x !== null)), 1)} km.`);
  return { title: q.nom, sections: [{ kind: "obs", lines: [...head, ...lines] }, ...(calc.length ? [{ kind: "calc" as const, lines: calc }] : [])],
    followups: [`Pourquoi l'accessibilité de ${q.nom} est-elle ${(q.acc_globale ?? 0) < (computeStats(qs.map(x => x.acc_globale).filter((v): v is number => v !== null))?.median ?? 0) ? "faible" : "élevée"} ?`, `Compare ${q.nom} avec un autre quartier`] };
}

export function compareQuartiers(a: Q, b: Q, d: Data): Answer {
  const list = [findInd("population")!, findInd("densite_pop")!, ...INFRA_FAMILIES.map(f => findInd(`dens_${f.key}`)!), findInd("acc_globale")!, findInd("acc_routiere_indice")!, findInd("ind_instruction_0_1")!, findInd("ind_niveau_vie_0_1")!];
  const rows: string[][] = []; let aHigher = 0, bHigher = 0;
  for (const ind of list) {
    const va = ind.get(a), vb = ind.get(b);
    const fa = va === null || va === undefined ? "—" : nf(va, ind.d), fb = vb === null || vb === undefined ? "—" : nf(vb, ind.d);
    rows.push([ind.label, fa, fb]);
    if (va != null && vb != null && va !== vb && ind.kind !== "pop") { if (va > vb) aHigher++; else bHigher++; }
  }
  const dc = (q: Q) => distCenter(d.quartiers, q);
  const da = dc(a), db = dc(b);
  return {
    title: `${a.nom} ↔ ${b.nom}`,
    sections: [
      { kind: "obs", lines: [`${a.nom} : ${communeName(a.commune)} ; ${b.nom} : ${communeName(b.commune)}.`] },
      { kind: "calc", lines: [`Sur les indicateurs comparables (hors population), ${a.nom} est supérieur sur ${aHigher} et ${b.nom} sur ${bHigher}.`, ...(da !== null && db !== null ? [`Distance au centre de la ville : ${a.nom} ${nf(da, 1)} km, ${b.nom} ${nf(db, 1)} km.`] : [])] },
      { kind: "interp", lines: [aHigher === bHigher ? "Les deux quartiers sont à égalité : chacun est meilleur sur à peu près autant de points." : `${aHigher > bHigher ? a.nom : b.nom} a de meilleurs chiffres sur la plupart des points (équipements, accessibilité, richesse, instruction).`, "On compare seulement des chiffres : cela ne dit pas pourquoi les quartiers sont différents."] },
    ],
    table: { head: ["Indicateur", a.nom, b.nom], rows },
    followups: [`Pourquoi ces différences ?`],
  };
}

export function compareInds(a: Ind, b: Ind, d: Data): Answer {
  const pairs = d.quartiers.map(q => [a.get(q), b.get(q)] as [number | null, number | null]).filter((p): p is [number, number] => p[0] !== null && p[1] !== null && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const r = pearson(pairs.map(p => p[0]), pairs.map(p => p[1]));
  if (r === null) return unavailable(`la corrélation entre « ${a.label} » et « ${b.label} » (pas assez de quartiers renseignés pour les deux)`);
  const sa = computeStats(pairs.map(p => p[0]))!, sb = computeStats(pairs.map(p => p[1]))!;
  let both = 0, bothLow = 0; pairs.forEach(p => { const ca = quartileClass(p[0], sa), cb = quartileClass(p[1], sb); if (ca === 3 && cb === 3) both++; if (ca === 0 && cb === 0) bothLow++; });
  return {
    title: `${a.label} ↔ ${b.label}`,
    sections: [
      { kind: "obs", lines: [`${pairs.length} quartiers renseignés pour les deux indicateurs.`] },
      { kind: "calc", lines: [`Lien entre les deux indicateurs : ${simpleLink(r)} (coefficient de corrélation r = ${nf(r, 2)}).`, `${both} quartiers sont dans le quart le plus haut pour les deux ; ${bothLow} dans le quart le plus bas pour les deux.`] },
      { kind: "interp", lines: [Math.abs(r) >= 0.4 ? `Les deux vont souvent ensemble : quand l'un est élevé dans un quartier, l'autre ${r > 0 ? "l'est aussi" : "est plutôt bas"}.` : "Les deux n'ont pas vraiment de rapport d'un quartier à l'autre.", "Aller ensemble ne veut pas dire que l'un cause l'autre."] },
      { kind: "hyp", lines: ["Un lien peut venir d'autre chose qui touche les deux (être près du centre, être un vieux quartier, être grand…) : ces données ne permettent pas de le savoir."] },
    ],
  };
}

export function explainWhy(q: Q, ind: Ind, d: Data): Answer {
  const qs = d.quartiers; const rows = rowsOf(qs, ind); const v = ind.get(q);
  if (v === null || v === undefined) return unavailable(`la valeur de « ${ind.label} » pour ${q.nom}`);
  const st = computeStats(rows.map(r => r.v))!; const rk = rankOf(rows, q.quartier_id)!; const cl = quartileClass(v, st)!;
  const com = rowsOf(inCommune(qs, q.commune), ind); const cm = median(com.map(r => r.v));
  const nb = neighbours(qs, q, 5); const nbVals = nb.map(n => ind.get(n)).filter((x): x is number => x !== null && x !== undefined); const nbMean = nbVals.length ? nbVals.reduce((s, x) => s + x, 0) / nbVals.length : null;
  const obs = [`${q.nom} (${communeName(q.commune)}) : ${ind.label} = ${unitStr(ind, v)}, rang ${rk.rank}/${rk.of}, ${QLAB[cl]}. Médiane de la ville : ${nf(st.median, ind.d)} ; médiane de la commune : ${nf(cm, ind.d)}.`];
  const calc: string[] = []; const facts: string[] = [];
  if (nbMean !== null) { calc.push(`Les ${nbVals.length} quartiers les plus proches ont en moyenne ${nf(nbMean, ind.d)} : ${q.nom} est ${v < nbMean ? "plus bas que ses voisins" : "plus haut que ses voisins"}.`); }
  if (ind.kind === "acc" || ind.kind === "dens" || ind.kind === "count") {
    const lows: string[] = []; const zeros: string[] = [];
    for (const f of INFRA_FAMILIES) {
      const nbv = (q as any)[`nb_${f.key}`] as number; const av = (q as any)[`acc_${f.key}`] as number | null;
      if (nbv === 0) zeros.push(f.label.toLowerCase());
      if (av !== null) { const m = median(qs.map(x => (x as any)[`acc_${f.key}`]).filter((x): x is number => x !== null)); if (av < m) lows.push(f.label.toLowerCase()); }
    }
    if (zeros.length) facts.push(`il n'y a aucun équipement dans le quartier pour : ${zeros.join(", ")}`);
    if (lows.length) facts.push(`c'est moins facile d'accès que dans la moitié des quartiers pour ${lows.length} type(s) de services sur 8 (${lows.join(", ")})`);
    if (q.acc_routiere_dist_m != null) { const md = median(qs.map(x => x.acc_routiere_dist_m).filter((x): x is number => x !== null)); facts.push(`la route est en moyenne à ${nf(q.acc_routiere_dist_m, 0)} m (dans la moitié des quartiers, elle est à moins de ${nf(md, 0)} m)`); }
    if (q.surface_km2 && q.population > 0) { const dd = q.population / q.surface_km2; const md = median(qs.map(x => (x.surface_km2 && x.population > 0 ? x.population / x.surface_km2 : NaN)).filter(Number.isFinite)); facts.push(`il y a ${nf(dd, 0)} habitants par km² (valeur du milieu pour la ville : ${nf(md, 0)})`); }
    const dcq = distCenter(qs, q);
    if (dcq !== null) {
      const dcAll = qs.map(x => ({ x, dc: distCenter(qs, x), v: ind.get(x) })).filter(o => o.dc !== null && o.v != null) as { x: Q; dc: number; v: number }[];
      const r = pearson(dcAll.map(o => o.v), dcAll.map(o => o.dc));
      calc.push(`Distance au centre de la ville : ${nf(dcq, 1)} km (la moitié des quartiers est à moins de ${nf(median(dcAll.map(o => o.dc)), 1)} km).`);
      if (r !== null) facts.push(Math.abs(r) >= 0.4 ? (r < 0 ? "dans la ville, plus on s'éloigne du centre, plus cette valeur baisse" : "dans la ville, plus on s'éloigne du centre, plus cette valeur monte") : "dans la ville, être près ou loin du centre change peu cette valeur");
    }
  }
  const interp: string[] = [];
  if (facts.length) interp.push(`Ce qui peut aider à comprendre : ${facts.join(" ; ")}.`);
  interp.push(cl <= 1 ? `${q.nom} est plutôt dans le bas du classement des quartiers.` : `${q.nom} est plutôt dans le haut du classement des quartiers.`);
  interp.push("Ce sont des pistes pour comprendre, pas des preuves.");
  const hyp = ind.kind === "acc" ? ["Être loin du centre, être un quartier plus récent ou avoir moins de routes pourrait jouer, mais les données ne le prouvent pas."] : ["D'autres choses que nous n'avons pas dans les données (l'âge du quartier, les terrains, les décisions de la mairie) peuvent aussi jouer."];
  return { title: `Pourquoi ${q.nom} ?`, sections: [{ kind: "obs", lines: obs }, ...(calc.length ? [{ kind: "calc" as const, lines: calc }] : []), { kind: "interp", lines: interp }, { kind: "hyp", lines: hyp }], followups: [`Profil de ${q.nom}`, `Quels quartiers ont la même situation ?`] };
}

export function actionLeads(ind: Ind, d: Data): Answer {
  const qs = d.quartiers; const rows = rowsOf(qs, ind); if (!rows.length) return unavailable(`l'indicateur « ${ind.label} »`);
  const st = computeStats(rows.map(r => r.v))!; const low = rows.filter(r => r.v <= st.q1).sort((a, b) => a.v - b.v);
  const lines: string[] = [`${low.length} quartiers sont dans le quart le plus bas pour « ${ind.label} » (valeur ≤ ${nf(st.q1, ind.d)}).`];
  const popLow = low.reduce((s, r) => s + (r.q.population || 0), 0);
  const calc = [`Ces quartiers rassemblent ${nf(popLow, 0)} habitants recensés (${nf((popLow / Math.max(1, qs.reduce((s, q) => s + (q.population || 0), 0))) * 100, 1)} % de la population rattachée).`];
  const byFam = INFRA_FAMILIES.map(f => ({ f, n: low.filter(r => ((r.q as any)[`nb_${f.key}`] ?? 0) === 0).length })).sort((a, b) => b.n - a.n).slice(0, 3);
  const prio = [...low].sort((a, b) => (b.q.population || 0) - (a.q.population || 0)).slice(0, 5);
  return {
    title: `Pistes d'action — ${ind.label}`,
    sections: [
      { kind: "obs", lines },
      { kind: "calc", lines: [...calc, `Familles d'équipements les plus souvent absentes dans ces quartiers : ${byFam.map(x => `${x.f.label.toLowerCase()} (${x.n} quartiers sans équipement)`).join(" ; ")}.`] },
      { kind: "interp", lines: ["Idées à regarder, en commençant par les quartiers où vivent le plus de gens :", `1) Aller voir sur place dans : ${prio.map(r => `${r.q.nom} (${nf(r.q.population || 0, 0)} hab.)`).join(", ")}.`, `2) Penser d'abord aux équipements qui manquent le plus (${byFam.map(x => x.f.label.toLowerCase()).join(", ")}).`, "3) Demander aux habitants comment ils se déplacent et ce dont ils ont besoin avant de décider."] },
      { kind: "hyp", lines: ["Ce sont des idées de départ tirées des chiffres, pas un plan décidé."] },
    ],
    table: { head: ["#", "Quartier", "Commune", "Valeur", "Population"], rows: prio.map((r, i) => [String(i + 1), r.q.nom, communeName(r.q.commune), nf(r.v, ind.d), nf(r.q.population || 0, 0)]) },
  };
}


// ---------- ratios, normes et equipements (education primaire, sante) ----------
const EQ_STAT: Record<string, { what: string; get: (e: QEquip) => string; norm: () => string; simple: string }> = {
  edu_statut: { what: "des écoles primaires", get: e => e.statut_edu, norm: () => { const P = getParams(); return `Une école primaire peut accueillir ${capaciteEcole(P)} élèves (${P.classesParEcole} classes de ${P.elevesParClasse}). Les enfants de 6 à 11 ans sont estimés à ${nf(P.partEnfants * 100, 1)} % des habitants.`; },
    simple: "On compte combien de places il y a dans les écoles du quartier et combien d'enfants d'école il y a. Vert : il y a assez de places. Rouge : il en manque beaucoup." },
  san_statut: { what: "des structures de santé de proximité", get: e => e.statut_san, norm: () => { const P = getParams(); return `La norme est d'un poste de santé pour ${nf(P.normePS, 0)} habitants en ville. Chaque structure (poste, centre de santé, clinique, cabinet) compte pour une part de poste, selon son importance.`; },
    simple: "On additionne les lieux de soins du quartier, les gros comptant plus que les petits. Vert : il y en a assez pour le nombre d'habitants. Rouge : il en manque beaucoup. Les hôpitaux ne sont pas comptés, car ils servent toute la ville." },
  pers_inf_statut: { what: "des infirmiers des postes de santé publics", get: e => e.statut_inf, norm: () => { const P = getParams(); return `La norme OMS est d'un infirmier pour ${nf(P.normeInfirmier, 0)} habitants. Chaque quartier prend le chiffre du poste de santé auquel il est rattaché.`; },
    simple: "On regarde s'il y a assez d'infirmiers dans le poste de santé du quartier pour le nombre d'habitants qu'il doit soigner. Vert : oui. Rouge : très peu." },
};
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(-])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()).replace(/^Hopital/, "Hôpital").replace(/Thies/g, "Thiès").replace(/\b(De|Du)\b/g, m => m.toLowerCase());
function analyzeStatut(ctx: MapCtx, d: Data): Answer | null {
  const conf = EQ_STAT[ctx.indicatorId]; const qs = d.quartiers.filter(q => (q as any).eq); if (!conf || !qs.length) return null;
  const tot = qs.reduce((s, q) => s + (q.population || 0), 0) || 1;
  const grp = STATUTS.map(s => ({ s, l: qs.filter(q => conf.get((q as any).eq) === s.key) })).filter(g => g.l.length);
  const q = ctx.quartierId != null ? qs.find(x => x.quartier_id === ctx.quartierId) : null;
  const crit = qs.filter(x => conf.get((x as any).eq) === "critique").sort((a, b) => (b.population || 0) - (a.population || 0));
  return { title: `Analyse de la carte — ${EQ_STAT[ctx.indicatorId] ? ({ edu_statut: "Primaire : situation par rapport à la norme", san_statut: "Santé : situation par rapport à la norme", pers_inf_statut: "Infirmiers : norme OMS" } as any)[ctx.indicatorId] : ""}`, sections: [
    { kind: "obs", lines: [`Contexte transmis : carte de la situation ${conf.what} dans les ${qs.length} quartiers.`, ...(q ? [`Quartier sélectionné : ${q.nom} → ${statutLabel(conf.get((q as any).eq) as any)}.`] : [])] },
    { kind: "calc", lines: [conf.norm(), grp.map(g => `${g.s.label.toLowerCase()} : ${g.l.length} quartier${g.l.length > 1 ? "s" : ""} (${nf(g.l.reduce((s, x) => s + (x.population || 0), 0) / tot * 100, 0)} % des habitants)`).join(" ; ") + "."] },
    { kind: "interp", lines: [conf.simple, crit.length ? `Les quartiers en rouge où vivent le plus de monde : ${crit.slice(0, 5).map(x => `${x.nom} (${nf(x.population || 0, 0)} hab.)`).join(", ")}.` : "Aucun quartier n'est en situation critique.", "Attention : les habitants peuvent aller se faire soigner ou étudier dans un quartier voisin. Un quartier rouge n'est donc pas forcément sans service pour ses habitants."] },
    { kind: "hyp", lines: ["Les chiffres dépendent d'hypothèses (part des enfants de 6-11 ans, poids des structures) à valider avec l'encadreur ; elles se modifient dans l'onglet Hypothèses du panneau de droite."] },
  ], followups: ["Quels quartiers manquent le plus d'écoles primaires ?", "Ratios de santé de la ville"] };
}
export function equipAnswer(t: string, d: Data, named: Q[]): Answer {
  const P = getParams(); const D = getData(); const qs = d.quartiers.filter(q => (q as any).eq);
  if (!qs.length || !D) return unavailable("les ratios (données d'équipements non chargées)");
  const city = aggregate(qs as any, "Ville", P);
  const q = named[0] as (Q & { eq?: QEquip }) | undefined;
  if (q?.eq) {
    const e = q.eq;
    return { title: `Ratios et normes — ${q.nom}`, sections: [
      { kind: "obs", lines: [`${nf(q.population || 0, 0)} habitants ; ${e.ecoles} école(s) primaire(s) ; ${nf(e.eps, 1)} équivalent(s)-poste de santé.`] },
      { kind: "calc", lines: [`Primaire : environ ${nf(e.enfants ?? 0, 0)} enfants de 6-11 ans${e.enfants_par_ecole ? `, soit ${nf(e.enfants_par_ecole, 0)} enfants par école (une école en accueille ${capaciteEcole(P)})` : ", sans école primaire dans le quartier"} → ${statutLabel(e.statut_edu).toLowerCase()}${e.ecoles_manquantes ? ` ; il manquerait ${e.ecoles_manquantes} école(s) pour que tous aient une place` : ""}.`,
        `Santé : ${e.hab_par_eps ? `${nf(e.hab_par_eps, 0)} habitants par équivalent-poste (norme ${nf(P.normePS, 0)})` : "aucune structure de proximité comptée"} → ${statutLabel(e.statut_san).toLowerCase()}.`,
        ...(e.poste ? [`Personnel du poste de rattachement (${e.poste.replace(/^PS /, "")}) : ${nf(e.inf_ratio ?? 0, 2)} infirmier pour ${nf(P.normeInfirmier, 0)} habitants → ${statutLabel(e.statut_inf).toLowerCase()}.`] : [])] },
      { kind: "interp", lines: ["Un ratio, c'est « combien de gens pour une école ou un poste de santé ». Plus il y a de gens pour un seul lieu, plus c'est difficile pour chacun.", ...(e.nb_hopitaux ? ["Il y a un hôpital dans ce quartier, mais il n'est pas compté : il soigne toute la ville et même la région."] : [])] },
      { kind: "hyp", lines: ["Les enfants et les malades peuvent aller dans un autre quartier : ce sont des repères, pas la réalité exacte."] },
    ], followups: ["Ratios de santé de la ville", "Quels quartiers manquent le plus d'écoles primaires ?"] };
  }
  if (/hopita|hopitau/.test(t) && !/ratio|norme/.test(t)) {
    return { title: "Les hôpitaux de Thiès", sections: [
      { kind: "obs", lines: [D.hopitaux.map(h => `${titleCase(h.nom)} (${h.type.replace("Hôpital ", "").toLowerCase()}, ${titleCase(h.commune)})`).join(" ; ") + "."] },
      { kind: "interp", lines: [`Il y a ${D.hopitaux.length} hôpitaux pour environ ${nf(city.pop, 0)} habitants. On ne calcule pas de ratio hôpital par quartier : un hôpital soigne des gens de toute la ville, du département et de la région, pas seulement de son quartier. Les ratios par quartier ne portent que sur les postes de santé et les structures de proximité.`] },
    ], followups: ["Ratios de santé de la ville"] };
  }
  const edu = /ecole|primaire|scolaire|enfant|classe/.test(t); const san = /sante|poste|infirmi|medecin|clinique|cabinet|equivalent|soin/.test(t);
  const rows = (k: (e: QEquip) => number | null, desc = true) => qs.map(x => ({ x, v: k((x as any).eq) })).filter(r => r.v !== null && r.v > 0).sort((a, b) => (desc ? b.v! - a.v! : a.v! - b.v!));
  const sections: Section[] = [];
  const tableRows: string[][] = [];
  if (edu || !san) {
    const top = rows(e => e.ecoles_manquantes).slice(0, 6);
    sections.push({ kind: "calc", lines: [`Primaire : ${nf(city.enfants, 0)} enfants de 6-11 ans estimés (${nf(P.partEnfants * 100, 1)} % des habitants), ${city.ecoles} écoles primaires, soit ${nf(city.ecoles ? city.enfants / city.ecoles : 0, 0)} enfants par école. Une école accueille ${capaciteEcole(P)} élèves : les places couvrent ${nf((city.couvE ?? 0) * 100, 0)} % des enfants.`, aggregate(qs as any, "", P, c => /nord/i.test(c)).couvE !== null ? ["Nord", "Est", "Ouest"].map(n => { const a = aggregate(qs as any, n, P, c => new RegExp(n, "i").test(c)); return `Thiès ${n} : ${nf(a.ecoles ? a.enfants / a.ecoles : 0, 0)} enfants par école, couverture ${nf((a.couvE ?? 0) * 100, 0)} %`; }).join(" ; ") + "." : ""] });
    top.forEach(r => tableRows.push([r.x.nom, "Écoles manquantes", nf(r.v!, 0), nf(r.x.population || 0, 0)]));
  }
  if (san || !edu) {
    const top = rows(e => e.eps_manquants).slice(0, 6);
    sections.push({ kind: "calc", lines: [`Santé : ${nf(city.eps, 1)} équivalents-poste de santé (structures de proximité pondérées) pour ${nf(city.pop, 0)} habitants, soit ${nf(city.pop / Math.max(city.eps, 0.01), 0)} habitants par équivalent-poste ; la norme est ${nf(P.normePS, 0)}. En moyenne sur la ville la norme est dépassée, mais ${qs.filter(x => (x as any).eq.statut_san === "critique").length} quartiers sont en situation critique : la moyenne cache des écarts.`] });
    top.forEach(r => tableRows.push([r.x.nom, "Équiv.-poste manquants", nf(r.v!, 1), nf(r.x.population || 0, 0)]));
  }
  return { title: "Ratios, normes et équipements", sections: [
    { kind: "obs", lines: ["Calculs faits dans l'application : nombre d'équipements de chaque quartier, population (RGPH-5) et normes officielles (carte sanitaire du Sénégal ; taille des classes ; normes OMS pour le personnel)."] },
    ...sections,
    { kind: "interp", lines: ["Un ratio répond à la question : « combien de personnes pour un seul lieu ? ». Une norme dit combien c'est acceptable.",
      ...(edu || !san ? ["Pour l'école : on compare les enfants de 6 à 11 ans au nombre de places dans les écoles primaires. Les enfants peuvent aller dans une école d'un quartier voisin : la lecture par commune est plus sûre."] : []),
      ...(san || !edu ? ["Les hôpitaux sont à part : ils servent toute la ville, donc pas de ratio par quartier.", `Pour les infirmiers : ${D.postes.reduce((s, p) => s + p.infirmiers, 0)} infirmiers et ${D.postes.reduce((s, p) => s + p.medecins, 0)} médecins dans les 28 postes publics ; la norme OMS (1 infirmier pour ${nf(P.normeInfirmier, 0)} habitants) est respectée par ${D.postes.filter(p => (p.infirmiers / p.pop_adm) * P.normeInfirmier >= 1).length} postes sur 28.`] : [])] },
    { kind: "hyp", lines: ["Les chiffres dépendent d'hypothèses à valider avec l'encadreur (part des enfants de 6-11 ans, poids des structures privées) ; elles se modifient dans le Géoportail, thème « Ratios & normes », onglet Hypothèses."] },
  ], table: tableRows.length ? { head: ["Quartier", "Manque", "Valeur", "Habitants"], rows: tableRows } : undefined, followups: ["Les hôpitaux de Thiès", "Ratios de santé de la ville"] };
}

// ---------- resultats valides de la segregation (fichier resultats_indices.json) ----------
type SegInd = { dimension: string; indicateur: string; unite: string; gini: number | null; gini_pond: number | null; theil: number | null; D: number | null; IS: number | string | null; H: number | null; moran: number | null; p: number | null; lisa: string | null };
let RES: { indices: SegInd[]; correlations: any[]; classification: { noms: string[] } } | null = null;
if (typeof window !== "undefined") fetch("/data/resultats_indices.json").then(r => (r.ok ? r.json() : null)).then(j => { RES = j; }).catch(() => {});
const f3 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
function segSummaryLines(qs: Q[]): string[] {
  const out: string[] = [];
  const by = [1, 2, 3, 4, 5].map(c => qs.filter(q => q.classe === c));
  if (by[0].length) {
    const tot = qs.reduce((s, q) => s + (q.population || 0), 0) || 1;
    out.push(`Classification en 5 profils (K-means validé) : ${by.map((l, i) => `${l[0]?.nom_classe ?? i + 1} — ${l.length} quartiers, ${nf(l.reduce((s, q) => s + (q.population || 0), 0) / tot * 100, 0)} % des habitants`).join(" ; ")}.`);
  }
  const instr = RES?.indices.find(i => i.indicateur.startsWith("Niveau d’instruction"));
  if (instr) out.push(`Instruction : Gini ${f3(instr.gini)} (pondéré ${f3(instr.gini_pond)}), dissimilarité D ${f3(instr.D)}, Moran I ${f3(instr.moran)} (p = ${f3(instr.p)}).`);
  return out.length ? out : ["Les résultats détaillés de la ségrégation sont dans la page Ségrégation."];
}
const SEG_KEYS: [RegExp, (i: SegInd) => boolean][] = [
  [/instruction|scolaire/, i => i.indicateur.startsWith("Niveau d’instruction")], [/niveau de vie|richesse/, i => i.indicateur.startsWith("Niveau de richesse")],
  [/offre|equipement|infrastructure/, i => /Offre d’équipements|Densité/.test(i.indicateur)], [/accessib/, i => i.dimension.startsWith("Accessibilité")],
  [/mobilite|flux|attractivite|deplacement/, i => i.dimension === "Mobilité"],
];
export function segregationAnswer(t: string, d: Data, named: Q[]): Answer {
  const qs = d.quartiers;
  if (named.length && /lisa|cluster|classe|profil|typolog|k means|classification/.test(t)) {
    const q = named[0];
    if (!q.classe) return unavailable(`le profil de ${q.nom}`);
    return { title: `${q.nom} — position dans l'analyse de ségrégation`, sections: [
      { kind: "obs", lines: [`Classe K-means : ${q.classe} — ${q.nom_classe}.`, `Clusters LISA — instruction : ${q.LISA_instruction_0_1 ?? "—"} ; richesse matérielle : ${q.LISA_niveau_vie_0_1_corrige ?? "—"} ; offre d'infrastructures : ${q.LISA_offre_infra_0_1 ?? "—"} ; accessibilité : ${q.LISA_acces_global_moyen_0_1 ?? "—"}.`] },
      { kind: "interp", lines: ["HH : quartier élevé entouré de voisins élevés. LL : quartier bas entouré de voisins bas. LH / HL : un quartier qui fait exception par rapport à ses voisins. NS : pas de groupe net, rien de particulier."] }],
      followups: [`Compare ${q.nom} avec un autre quartier`, "Synthèse de la ségrégation"] };
  }
  if (/classification|typolog|k means|kmeans|classe|profils?\b/.test(t)) {
    return { title: "Les 5 profils de quartiers", sections: [{ kind: "obs", lines: segSummaryLines(qs).slice(0, 1) }, { kind: "calc", lines: ["Méthode : 9 indicateurs retenus par le filtre KMO (0,74), ACP (2 axes, 70,2 % de la variance), K-means k = 5 (silhouette 0,49), accord de 0,82 (indice de Rand ajusté) avec la classification de Ward."] }, { kind: "interp", lines: ["On a rangé les 65 quartiers en 5 familles de quartiers qui se ressemblent.", "La famille 1 (aisés et instruits) et la famille 3 (populaires, très peuplés, moins instruits) sont les plus différentes l'une de l'autre. La famille 2 regroupe les quartiers du centre, bien équipés."] }],
      followups: ["Quels sont les quartiers du profil 3 ?", "Gini de l'instruction"] };
  }
  const hit = SEG_KEYS.find(([re]) => re.test(t));
  const list = (RES?.indices ?? []).filter(i => (hit ? hit[1](i) : /Niveau d’instruction|Niveau de richesse|Offre d’équipements|Accessibilité globale moyenne/.test(i.indicateur))).slice(0, 8);
  if (!list.length) return unavailable("les indices de ségrégation (fichier de résultats non chargé)");
  const rows = list.map(i => [i.indicateur, f3(i.gini), i.theil === null ? "—" : f3(i.theil), i.D === null ? "—" : f3(i.D), f3(i.moran), i.p === null ? "—" : f3(i.p)]);
  return { title: "Indices de ségrégation (résultats validés)", sections: [
    { kind: "obs", lines: ["Valeurs finales validées, calculées par l'équipe ; affichées telles quelles."] },
    { kind: "interp", lines: ["Gini et Theil : plus c'est proche de 0, plus c'est égal entre les quartiers ; plus c'est grand, plus il y a d'écarts. D : part des habitants qu'il faudrait déplacer pour que tout soit réparti pareil. Moran I positif : les quartiers voisins se ressemblent (c'est sûr si p est plus petit que 0,05)."] }],
    table: { head: ["Indicateur", "Gini", "Theil", "D", "Moran I", "p"], rows },
    followups: ["Les 5 profils de quartiers", "Synthèse du territoire"] };
}

export function globalSynthesis(d: Data): Answer {
  const qs = d.quartiers; const pop = qs.reduce((s, q) => s + (q.population || 0), 0); const surf = qs.reduce((s, q) => s + (q.surface_km2 || 0), 0);
  const equip = qs.reduce((s, q) => s + INFRA_FAMILIES.reduce((a, f) => a + (((q as any)[`nb_${f.key}`] as number) || 0), 0), 0);
  const fam = INFRA_FAMILIES.map(f => ({ f, n: qs.reduce((s, q) => s + (((q as any)[`nb_${f.key}`] as number) || 0), 0) })).sort((a, b) => b.n - a.n);
  const miss = qs.filter(q => !(q.population > 0)).length;
  return { title: "Synthèse du territoire", sections: [
    { kind: "obs", lines: [`${qs.length} quartiers répartis en 3 communes (Thiès Nord, Est, Ouest), ${nf(surf, 1)} km² cartographiés.`, `Population recensée RGPH-5 : ${d.census?.population ? nf(d.census.population, 0) : "non chargée"} habitants ; ${nf(pop, 0)} rattachés aux quartiers${miss ? ` (${miss} quartiers sans population appariée)` : ""}.`, `${nf(equip, 0)} équipements recensés dans 8 familles : ${fam.map(x => `${x.f.label.toLowerCase()} ${x.n}`).join(", ")}.`] },
    { kind: "calc", lines: [`Densité moyenne : ${nf(pop / surf, 0)} hab./km² (population rattachée / surface).`, `Famille dominante : ${fam[0].f.label.toLowerCase()} (${nf((fam[0].n / Math.max(1, equip)) * 100, 0)} % des équipements recensés).`] },
    { kind: "calc", lines: segSummaryLines(qs) },
  ], followups: ["Quels quartiers sont les moins bien desservis ?", "Explique la richesse matérielle", "Compare Thiès Nord et Thiès Est"] };
}

export function communeSummary(c: string, d: Data, ind?: Ind | null): Answer {
  const qs = inCommune(d.quartiers, c); const pop = qs.reduce((s, q) => s + (q.population || 0), 0); const surf = qs.reduce((s, q) => s + (q.surface_km2 || 0), 0);
  const all = d.quartiers; const popAll = all.reduce((s, q) => s + (q.population || 0), 0);
  const lines: string[] = [`${qs.length} quartiers ; ${nf(surf, 1)} km² ; ${nf(pop, 0)} habitants rattachés (${nf((pop / popAll) * 100, 1)} % du total).`];
  const calc = [`Densité : ${nf(pop / surf, 0)} hab./km².`];
  const inds = ind ? [ind] : [findInd("acc_globale")!, findInd("ind_niveau_vie_0_1")!, findInd("ind_instruction_0_1")!];
  const rows: string[][] = inds.map(i => { const r = rowsOf(qs, i), ra = rowsOf(all, i); return [i.label, r.length ? nf(median(r.map(x => x.v)), i.d) : "—", ra.length ? nf(median(ra.map(x => x.v)), i.d) : "—"]; });
  return { title: communeName(c), sections: [{ kind: "obs", lines }, { kind: "calc", lines: calc }], table: { head: ["Indicateur (médiane)", communeName(c), "Ville"], rows }, followups: [`Compare ${communeName(c)} avec une autre commune`] };
}

export function compareCommunes(a: string, b: string, d: Data): Answer {
  const inds = [findInd("population")!, findInd("densite_pop")!, findInd("acc_globale")!, findInd("ind_niveau_vie_0_1")!, findInd("ind_instruction_0_1")!, findInd("dens_sante")!, findInd("dens_education")!];
  const rows = inds.map(i => { const f = (c: string) => { const r = rowsOf(inCommune(d.quartiers, c), i); if (!r.length) return "—"; return i.id === "population" ? nf(r.reduce((s, x) => s + x.v, 0), 0) : nf(median(r.map(x => x.v)), i.d); }; return [i.id === "population" ? "Population (total)" : `${i.label} (médiane)`, f(a), f(b)]; });
  return { title: `${communeName(a)} ↔ ${communeName(b)}`, sections: [{ kind: "obs", lines: ["Médianes calculées sur les quartiers de chaque commune (hors valeurs manquantes)."] }, { kind: "interp", lines: ["La médiane est la valeur « du milieu » : la moitié des quartiers est au-dessus, l'autre en dessous. Elle montre la situation habituelle d'un quartier, pas celle de chaque habitant."] }], table: { head: ["Indicateur", communeName(a), communeName(b)], rows } };
}

export function unavailable(what: string, extra?: string[]): Answer {
  return { title: "Information non disponible", sections: [{ kind: "dispo", lines: [`Cette information n'est pas encore disponible dans les données${what ? ` : ${what}` : ""}.`, ...(extra ?? [])] }],
    followups: ["Que peux-tu analyser ?", "Synthèse du territoire"] };
}

export const HELP: Answer = {
  title: "Assistant Spatial de Thiès",
  sections: [
    { kind: "obs", lines: ["Je réponds uniquement à partir des données chargées dans l'application : 65 quartiers, 3 communes, 8 familles d'équipements, accessibilités (grille 200 m), niveau d'instruction et richesse matérielle (ACP), résultats de la ségrégation (indices, LISA, profils), population RGPH-5."] },
    { kind: "interp", lines: ["Je peux : expliquer un indicateur, résumer ses statistiques, classer les quartiers, comparer deux quartiers ou deux indicateurs, interpréter la carte affichée (indicateurs, profils de quartiers, zones LISA, équipements), expliquer pourquoi un quartier a telle valeur et proposer des pistes d'action.", "Je distingue toujours données observées, calculs, interprétation et hypothèses, et je ne donne jamais une valeur qui n'est pas dans les données."] },
  ],
  followups: ["Synthèse du territoire", "Quels quartiers sont les moins bien desservis ?", "Explique la richesse matérielle", "Compare Medina Fall et Cite Lamy"],
};

// ---------- analyse de la carte courante ----------
const LISA_NAMES: Record<string, string> = { LISA_instruction_0_1: "le niveau d'instruction", LISA_niveau_vie_0_1_corrige: "la richesse matérielle", LISA_offre_infra_0_1: "l'offre d'infrastructures", LISA_acces_global_moyen_0_1: "l'accessibilité", LISA_indice_attractivite: "l'attractivité (les gens qui viennent dans le quartier)", LISA_flux_emis: "les déplacements qui partent du quartier", LISA_flux_recus: "les déplacements qui arrivent dans le quartier" };
const CLASS_SIMPLE = [
  "Les habitants font de longues études et ont plus de biens à la maison.",
  "Des quartiers proches du centre, avec beaucoup d'écoles, de commerces et de services de santé.",
  "Des quartiers où vivent beaucoup de gens serrés, avec moins d'années d'école en moyenne.",
  "Des quartiers entre les deux, mais avec peu d'équipements.",
  "Des quartiers loin du centre, où il y a peu de maisons et peu de monde.",
];
function analyzeCategorical(ctx: MapCtx, d: Data): Answer | null {
  const qs = d.quartiers;
  if (ctx.indicatorId === "edu_statut" || ctx.indicatorId === "san_statut" || ctx.indicatorId === "pers_inf_statut") return analyzeStatut(ctx, d);
  if (ctx.indicatorId === "classe") {
    const tot = qs.reduce((s, q) => s + (q.population || 0), 0) || 1;
    const groups = [1, 2, 3, 4, 5].map(c => qs.filter(q => q.classe === c));
    const rows = groups.map((g, i) => [`${i + 1}. ${g[0]?.nom_classe ?? ""}`, String(g.length), `${nf(g.reduce((s, q) => s + (q.population || 0), 0) / tot * 100, 0)} %`]);
    const q = ctx.quartierId != null ? qs.find(x => x.quartier_id === ctx.quartierId) : null;
    return { title: "Analyse de la carte — Profil du quartier (5 classes)", sections: [
      { kind: "obs", lines: ["Contexte transmis : carte des profils de quartiers (K-means, 5 classes), résultats validés de l'analyse.", ...(q && q.classe ? [`Quartier sélectionné : ${q.nom} → famille ${q.classe} (${q.nom_classe}).`] : [])] },
      { kind: "calc", lines: [`${groups.map((g, i) => `famille ${i + 1} : ${g.length} quartiers`).join(" ; ")}.`] },
      { kind: "interp", lines: ["Chaque couleur est une famille de quartiers qui se ressemblent : même niveau d'études, mêmes équipements, même éloignement du centre.", ...CLASS_SIMPLE.map((t, i) => `Famille ${i + 1} : ${t}`), "La plus grande famille (la 3) regroupe la moitié des habitants de la ville. Les quartiers aisés et instruits (famille 1) sont peu nombreux : c'est cela qui montre que la ville n'est pas partout pareille."] },
    ], table: { head: ["Famille", "Quartiers", "Habitants"], rows }, followups: ["Quels sont les quartiers du profil 3 ?", "Les 5 profils de quartiers"] };
  }
  if (ctx.indicatorId.startsWith("LISA_")) {
    const key = ctx.indicatorId as keyof Q; const what = LISA_NAMES[ctx.indicatorId] ?? "cet indicateur";
    const by = (k: string) => qs.filter(q => (q[key] as any) === k);
    const hh = by("HH"), ll = by("LL"), lh = by("LH"), hl = by("HL"), ns = by("NS");
    if (hh.length + ll.length + lh.length + hl.length + ns.length === 0) return null;
    const names = (l: Q[]) => l.slice(0, 6).map(q => q.nom).join(", ") + (l.length > 6 ? "…" : "");
    const q = ctx.quartierId != null ? qs.find(x => x.quartier_id === ctx.quartierId) : null;
    const inter = [`Cette carte cherche les groupes de quartiers voisins qui se ressemblent pour ${what}.`,
      ...(hh.length ? [`En rouge (HH) : ${hh.length} quartiers où c'est élevé, entourés de voisins où c'est aussi élevé (par exemple ${names(hh)}).`] : ["Il n'y a aucun groupe de quartiers élevés côte à côte."]),
      ...(ll.length ? [`En bleu (LL) : ${ll.length} quartiers où c'est bas, entourés de voisins où c'est aussi bas (par exemple ${names(ll)}).`] : []),
      ...(lh.length + hl.length ? [`${lh.length + hl.length} quartier(s) font exception : ils sont différents de leurs voisins.`] : []),
      `En gris : ${ns.length} quartiers sans groupe net, donc rien de particulier à dire.`,
      hh.length && ll.length ? "Quand le rouge et le bleu forment chacun un bloc, cela peut vouloir dire que la ville est séparée en zones : c'est ce qu'on appelle la ségrégation." : "Les quartiers voisins ne forment pas de grands blocs bien séparés."];
    return { title: `Analyse de la carte — LISA : ${what}`, sections: [
      { kind: "obs", lines: [`Contexte transmis : carte des zones LISA pour ${what}, résultats validés de l'analyse.`, ...(q ? [`Quartier sélectionné : ${q.nom} → ${(q[key] as any) ?? "—"}.`] : [])] },
      { kind: "calc", lines: [`HH ${hh.length} · LL ${ll.length} · LH ${lh.length} · HL ${hl.length} · non significatif ${ns.length} (sur ${qs.length} quartiers).`] },
      { kind: "interp", lines: inter },
    ], followups: ["Les 5 profils de quartiers", "Synthèse de la ségrégation"] };
  }
  return null;
}
function analyzeFamilies(ctx: MapCtx, d: Data): Answer | null {
  const fams = INFRA_FAMILIES.filter(f => ctx.families?.includes(f.key));
  if (!fams.length) return null; const qs = d.quartiers;
  const tot = (k: string) => qs.reduce((s, q) => s + (((q as any)[`nb_${k}`] as number) || 0), 0);
  const rows = fams.map(f => { const sorted = [...qs].sort((a, b) => (((b as any)[`nb_${f.key}`] as number) || 0) - (((a as any)[`nb_${f.key}`] as number) || 0)); const none = qs.filter(q => !(((q as any)[`nb_${f.key}`] as number) > 0)).length; return [f.label, nf(tot(f.key), 0), sorted[0].nom, String(none)]; });
  return { title: "Analyse de la carte — équipements affichés", sections: [
    { kind: "obs", lines: [`Contexte transmis : équipements affichés sur la carte — ${fams.map(f => f.label.toLowerCase()).join(", ")}.`] },
    { kind: "calc", lines: fams.map(f => `${f.label} : ${nf(tot(f.key), 0)} équipements recensés dans les 65 quartiers.`) },
    { kind: "interp", lines: ["Chaque point est un équipement : plus il y a de points serrés, plus il y a d'équipements au même endroit.", "Les quartiers avec peu de points ou sans point doivent faire plus de chemin pour trouver ce service.", "Choisissez aussi un indicateur (par exemple la densité ou l'accessibilité) pour comparer les quartiers avec des couleurs."] },
  ], table: { head: ["Famille", "Total", "Quartier le mieux servi", "Quartiers sans équipement"], rows }, followups: ["Quels quartiers sont les moins bien desservis ?", "Synthèse du territoire"] };
}
export function analyzeMap(ctx: MapCtx, d: Data): Answer {
  const cat = analyzeCategorical(ctx, d); if (cat) return cat;
  const ind = findInd(ctx.indicatorId);
  if (!ind) {
    const fam = analyzeFamilies(ctx, d); if (fam) return fam;
    return { title: "Carte affichée", sections: [{ kind: "obs", lines: ["Aucune couche n'est affichée : on voit seulement les limites des quartiers."] }, { kind: "interp", lines: ["Choisissez une couche à gauche (population, accessibilité, richesse matérielle, profils de quartiers, zones LISA, équipements…) et je vous l'expliquerai simplement."] }], followups: ["Synthèse du territoire", "Les 5 profils de quartiers"] };
  }
  const place = ctx.source === "geoportail" ? "Géoportail" : ctx.source === "cartotheque" ? "Cartothèque" : "Tableau de bord";
  const head: string[] = [`Contexte transmis : indicateur « ${ind.label} », couche ${ctx.layer === "grille" ? "grille 200 m" : "quartiers"}, page ${place}.`];
  let sections: Section[];
  if (ctx.layer === "grille") {
    const vals: number[] = d.grid ? d.grid.features.map((f: any) => f.properties[ind.id]).filter((v: any) => typeof v === "number" && Number.isFinite(v)) : [];
    const gs = computeStats(vals);
    if (!gs) return { title: `Analyse de la carte — ${ind.label}`, sections: [{ kind: "obs", lines: head }, { kind: "dispo", lines: ["La grille 200 m n'est pas disponible : je ne peux pas calculer ses statistiques."] }] };
    const by = ["Thies Nord", "Thies Est", "Thies Ouest"].map(c => { const r = rowsOf(inCommune(d.quartiers, c), ind); return r.length ? `${communeName(c)} : médiane des moyennes par quartier ${nf(median(r.map(x => x.v)), ind.d)}` : ""; }).filter(Boolean);
    sections = [
      { kind: "obs", lines: head },
      { kind: "calc", lines: [`Grille 200 m (${vals.length.toLocaleString("fr-FR")} cellules) : min ${nf(gs.min, ind.d)}, Q1 ${nf(gs.q1, ind.d)}, médiane ${nf(gs.median, ind.d)}, Q3 ${nf(gs.q3, ind.d)}, max ${nf(gs.max, ind.d)}, moyenne ${nf(gs.mean, ind.d)}.`, `Les classes de la carte (Q1–Q4) découpent ces ${vals.length.toLocaleString("fr-FR")} cellules en quatre groupes de taille égale.`] },
      { kind: "interp", lines: ["Chaque petit carré de la carte fait 200 m de côté. Plus la valeur est grande, mieux le carré est desservi. Les carrés du premier quart (Q1) sont les zones les moins bien desservies.", ...(by.length ? [`Pour repère, par commune — ${by.join(" ; ")}.`] : [])] },
      { kind: "dispo", lines: ["Les valeurs de la grille et celles par quartier ne sont pas exprimées sur la même échelle : ne les comparez pas directement."] },
    ];
  } else { sections = [...summarizeInd(ind, d).sections]; sections.unshift({ kind: "obs", lines: head }); }
  const q = ctx.quartierId != null ? d.quartiers.find(x => x.quartier_id === ctx.quartierId) : null;
  let qLine = "";
  if (q) {
    const v = ind.get(q); const rows = rowsOf(d.quartiers, ind);
    if (v != null) { const st = computeStats(rows.map(r => r.v)); const rk = rankOf(rows, q.quartier_id); const cl = quartileClass(v, st);
      qLine = `Quartier sélectionné : ${q.nom} (${communeName(q.commune)}) — valeur moyennée par quartier ${unitStr(ind, v)}, rang ${rk?.rank}/${rk?.of}, ${cl !== null ? QLAB[cl] : "—"}.`; }
    else qLine = `Quartier sélectionné : ${q.nom} — valeur non renseignée pour cet indicateur.`;
  }
  if (q) sections.splice(1, 0, { kind: "obs", lines: [qLine] });
  return { title: `Analyse de la carte — ${ind.label}`, sections, followups: q ? [`Pourquoi ${q.nom} a cette valeur ?`, `Pistes d'action pour ${ind.label.toLowerCase()}`] : [`Pistes d'action pour ${ind.label.toLowerCase()}`, `Quels quartiers sont les plus faibles ?`] };
}

// ---------- routeur d'intentions ----------
const NOT_AVAILABLE = [
  { re: /revenu|salaire|chomage|emploi|criminalite|insecurite|prix|loyer|pollution|temperature|inondation/, what: "cette variable (elle ne figure pas dans les jeux de données chargés)", extra: ["Variables disponibles : population, densités et accessibilité des 8 familles d'équipements, accessibilité routière, niveau d'instruction et niveau de vie (ACP)."] },
  { re: /evolution|tendance|prevision|projection|avant 20|depuis 20|2010|2015|2020|2030|futur/, what: "les évolutions dans le temps, sauf pour la population historique (voir la page Histoire)", extra: ["Les couches d'équipements et d'accessibilité n'ont pas d'année précisée : aucune évolution ne peut être calculée."] },
];

export function answer(textRaw: string, d: Data, mem: Memory, ctx: MapCtx | null): { a: Answer; mem: Memory } {
  const qs = d.quartiers; const t = canon(correct(canon(norm(textRaw)), qs)); let m: Memory = { ...mem };
  if (!t) return { a: HELP, mem: m };
  if (/^(bonjour|salut|bonsoir|hello|coucou|aide|help)\b|que peux|que sais|comment (ca )?marche|tu peux faire|fonctionnalit/.test(t)) return { a: HELP, mem: m };

  const na = NOT_AVAILABLE.find(x => x.re.test(t));
  const inds = detectAllInds(t); let ind: Ind | null = inds[0] ?? null;
  const here = /cette zone|ce quartier|ici|cet endroit|ce secteur/.test(t);
  let named = findQuartiers(t, qs);
  if (!named.length && here && ctx?.quartierId != null) { const cq = qs.find(q => q.quartier_id === ctx.quartierId); if (cq) named = [cq]; }
  const pronoun = /\b(son|sa|ses|lui|il|elle|meme|ce dernier)\b/.test(t);
  if (!named.length && pronoun && m.quartierId != null) { const mq = qs.find(q => q.quartier_id === m.quartierId); if (mq) named = [mq]; }
  if (!ind && ctx && /cette carte|carte affichee|cet indicateur|la carte/.test(t)) ind = findInd(ctx.indicatorId) ?? null;
  if (!ind && m.indId && /\b(et|aussi|meme|pareil)\b/.test(t) === false && (here || pronoun)) ind = findInd(m.indId) ?? null;

  if (/\bratios?\b|norme|normes|oms|carte sanitaire|ecoles? primaires?|primaire|poste de sante|postes de sante|infirmiers?|medecins?|hopita|equivalent|capacite des ecoles|enfants de 6/.test(t) && !/segregation|lisa|gini/.test(t)) { if (named[0]) m.quartierId = named[0].quartier_id; return { a: equipAnswer(t, d, named), mem: m }; }
  if (/segregation|dissimilar|gini|theil|moran|\blisa\b|entropie|autocorrelation|cluster|typolog|k means|kmeans|classification|quelle classe|quel profil|indice de segregation|profils? de quartiers?|(5|cinq) profils?|profils? types?|\bclass(e|es|er) (de|du|d) /.test(t)) { if (named[0]) m.quartierId = named[0].quartier_id; return { a: segregationAnswer(t, d, named), mem: m }; }
  if (na) return { a: unavailable(na.what, na.extra), mem: m };

  const remember = (q?: Q | null, i?: Ind | null) => { if (q) m.quartierId = q.quartier_id; if (i) m.indId = i.id; };
  const communes = (() => { const out: string[] = []; for (const c of ["Thies Nord", "Thies Est", "Thies Ouest"]) { const re = c === "Thies Nord" ? /thies nord|\bnord\b/ : c === "Thies Ouest" ? /thies ouest|\bouest\b/ : /thies est|commune est\b/; if (re.test(t)) out.push(c); } return out; })();
  const wantCompare = /compar|versus|\bvs\b|difference|differ|oppos|contraste|ecart/.test(t);
  const n = Number((t.match(/\b(\d{1,2})\b/) || [])[1]) || 5;

  if (/analys\w* (cette |la )?carte|interpret\w* (cette |la )?carte|que montre (cette |la )carte|lis cette carte/.test(t) && ctx) { remember(null, findInd(ctx.indicatorId)); return { a: analyzeMap(ctx, d), mem: m }; }
  if (/combien|nombre d|total d/.test(t) && ind && (ind.kind === "count" || ind.kind === "dens") && ind.fam) {
    const ci = findInd(`nb_${ind.fam}`)!; const fam = INFRA_FAMILIES.find(f => f.key === ind!.fam)!;
    const sum = (list: Q[]) => list.reduce((a, q) => a + (ci.get(q) ?? 0), 0);
    remember(named[0], ci);
    if (named.length) return { a: { title: `${fam.label} — ${named[0].nom}`, sections: [{ kind: "obs", lines: [`${named[0].nom} : ${nf(ci.get(named[0]) ?? 0, 0)} équipement(s) de la famille ${fam.label.toLowerCase()} recensé(s).`] }] }, mem: m };
    const cs = communes.length ? communes : ["Thies Nord", "Thies Est", "Thies Ouest"];
    return { a: { title: `${fam.label} — nombre d'équipements`, sections: [{ kind: "obs", lines: [communes.length ? "" : `Total sur les 65 quartiers : ${nf(sum(qs), 0)} équipement(s) ${fam.label.toLowerCase()}.`, ...cs.map(c => `${communeName(c)} : ${nf(sum(inCommune(qs, c)), 0)}.`)].filter(Boolean) }, { kind: "interp", lines: ["Ce sont des comptes d'équipements recensés dans les couches de l'application, pas une mesure de leur capacité ni de leur qualité."] }], followups: [`Quels quartiers ont le plus d'équipements ${fam.label.toLowerCase()} ?`] }, mem: m };
  }
  if (/ou sont|ou se trouv|localis|repartition|reparti/.test(t) && ind && !named.length) { remember(null, ind); return { a: ranking(ind.kind === "acc" ? ind : (ind.fam ? findInd(`nb_${ind.fam}`)! : ind), d, Math.min(n, 10), "top"), mem: m }; }
  if (named.length >= 2 && (wantCompare || /\bet\b|\bavec\b/.test(t)) && !/pourquoi/.test(t)) { remember(named[1]); return { a: compareQuartiers(named[0], named[1], d), mem: m }; }
  if (communes.length >= 2 && wantCompare) return { a: compareCommunes(communes[0], communes[1], d), mem: m };
  if (inds.length >= 2 && /compar|correl|lien|relation|rapport|associ|influence|depend|va de pair/.test(t)) { remember(null, inds[0]); return { a: compareInds(inds[0], inds[1], d), mem: m }; }

  if (/pourquoi|explique\w* (la |cette )?(difference|valeur|situation)|cause|raison|comment (se fait|expliquer)/.test(t)) {
    const q = named[0]; const i = ind ?? (ctx ? findInd(ctx.indicatorId) : null) ?? (m.indId ? findInd(m.indId) : null) ?? findInd("acc_globale")!;
    if (q) { remember(q, i); return { a: explainWhy(q, i, d), mem: m }; }
    if (i) { remember(null, i); return { a: summarizeInd(i, d), mem: m }; }
  }
  if (/piste|action|recommand|prioris|ameliorer|que faire|intervenir|investir|politique/.test(t)) { const i = ind ?? (ctx ? findInd(ctx.indicatorId) : null) ?? findInd("acc_globale")!; remember(null, i); return { a: actionLeads(i, d), mem: m }; }
  if (/c est quoi|qu est ce|definition|signifi|explique|expliquer|comment (est|sont) (calcul|mesur)|que mesure|interpretation|comprendre/.test(t) && ind && !named.length) { remember(null, ind); return { a: explainInd(ind, d), mem: m }; }
  if (/(plus|moins|top|classement|meilleur|pire|mieux|mal|faible|eleve|fort|haut|bas|premier|dernier)/.test(t) && /quartier|zone|classement|top|lesquels|quel/.test(t) && (ind || !named.length)) {
    const i = ind ?? (ctx ? findInd(ctx.indicatorId) : null) ?? (/peupl/.test(t) ? findInd("population") : null) ?? findInd("acc_globale")!;
    const bottom = /moins|pire|mal |faible|bas|dernier|defavoris|sous|pauvre/.test(t) && !/moins de [a-z]+ (habitant|equip)|plus peupl/.test(t); remember(null, i);
    return { a: ranking(i, d, Math.min(n, 15), bottom ? "bottom" : "top"), mem: m };
  }
  if (named.length && !communes.length || named.length) { const q = named[0]; remember(q, ind); return { a: quartierProfile(q, d, ind), mem: m }; }
  if (communes.length === 1) { remember(null, ind); return { a: communeSummary(communes[0], d, ind), mem: m }; }
  if (/synthese|resume|bilan|vue d ensemble|statistique|chiffres cles|territoire/.test(t) && !ind) return { a: globalSynthesis(d), mem: m };
  if (ind) { remember(null, ind); return { a: summarizeInd(ind, d), mem: m }; }
  return { a: { ...unavailable("je n'ai pas reconnu de quartier, d'indicateur ou de commune dans votre question", ["Essayez par exemple : « population de Medina Fall », « quartiers les moins bien desservis », « compare Cite Lamy et Hersent »."]), unrecognized: true }, mem: m };
}
