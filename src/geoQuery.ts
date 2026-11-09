// ============================================================
// Moteur de requetes du Geoportail : seuils, filtres statistiques,
// requetes spatiales et interpretation de phrases en francais.
// Aucune dependance externe ; tout est calcule cote navigateur.
// ============================================================
import type { QuartierFull } from "./Geoportail";

export type Q = QuartierFull;

// ---------- catalogue des champs interrogeables ----------
export type Field = { id: string; label: string; unit: string; kind: "effectif" | "taille" | "ratio"; get: (q: Q) => number | null };
const FAM = [["sante", "santé"], ["education", "éducation"], ["commerce", "commerce"], ["sport", "sport"], ["transport", "transport"], ["banque", "banque"], ["assurance", "assurance"], ["religion", "culte"]] as const;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const nbEquip = (q: Q) => FAM.reduce((s, [k]) => s + (((q as any)[`nb_${k}`] as number) || 0), 0);

export const FIELDS: Field[] = [
  { id: "population", label: "Population", unit: "hab.", kind: "effectif", get: q => num(q.population) },
  { id: "menages", label: "Ménages", unit: "ménages", kind: "effectif", get: q => num(q.menages) },
  { id: "surface_km2", label: "Superficie", unit: "km²", kind: "taille", get: q => num(q.surface_km2) },
  { id: "densite_pop", label: "Densité de population", unit: "hab./km²", kind: "ratio", get: q => (q.surface_km2 ? q.population / q.surface_km2 : null) },
  { id: "nb_equip", label: "Nombre d'équipements (total)", unit: "équip.", kind: "effectif", get: q => nbEquip(q) },
  ...FAM.map(([k, l]) => ({ id: `nb_${k}`, label: `Équipements — ${l}`, unit: "équip.", kind: "effectif" as const, get: (q: Q) => num((q as any)[`nb_${k}`]) })),
  { id: "offre_infra_0_1", label: "Offre d'équipements (indicateur synthétique)", unit: "/ 1", kind: "ratio", get: q => num(q.offre_infra_0_1) },
  { id: "acc_globale", label: "Accessibilité globale", unit: "/ 1", kind: "ratio", get: q => num(q.acc_globale) },
  ...FAM.map(([k, l]) => ({ id: `acc_${k}`, label: `Accessibilité — ${l}`, unit: "/ 1", kind: "ratio" as const, get: (q: Q) => num((q as any)[`acc_${k}`]) })),
  { id: "dens_equip", label: "Densité d'équipements (total)", unit: "équip./km²", kind: "ratio", get: q => (q.surface_km2 ? nbEquip(q) / q.surface_km2 : null) },
  { id: "ind_instruction_0_1", label: "Niveau d'instruction", unit: "/ 1", kind: "ratio", get: q => num(q.ind_instruction_0_1) },
  { id: "ind_niveau_vie_0_1", label: "Niveau de vie matériel", unit: "/ 1", kind: "ratio", get: q => num(q.ind_niveau_vie_0_1) },
  { id: "flux_emis", label: "Flux émis", unit: "flux", kind: "effectif", get: q => num(q.flux_emis) },
  { id: "flux_recus", label: "Flux reçus", unit: "flux", kind: "effectif", get: q => num(q.flux_recus) },
  { id: "volume_echanges", label: "Volume d'échanges", unit: "flux", kind: "effectif", get: q => num(q.volume_echanges) },
  { id: "indice_attractivite", label: "Indice d'attractivité", unit: "−1 à +1", kind: "ratio", get: q => num(q.indice_attractivite) },
];
export const fieldOf = (id: string) => FIELDS.find(f => f.id === id)!;

// ---------- regles ----------
export type StatMode = "top" | "bottom" | "q4" | "q1" | "aboveMean" | "belowMean" | "aboveMedian" | "belowMedian" | "outlier";
export type Rule =
  | { kind: "thr"; field: string; op: ">=" | "<=" | "between"; a: number; b?: number }
  | { kind: "stat"; field: string; mode: StatMode; n?: number }
  | { kind: "commune"; values: string[] }
  | { kind: "dist"; ref: number; km: number }
  | { kind: "adj"; ref: number }
  | { kind: "lisa"; field: "LISA_offre_infra_0_1" | "LISA_instruction_0_1" | "LISA_niveau_vie_0_1_corrige"; cat: string }
  | { kind: "class"; cls: number }
  | { kind: "buffer"; lat: number; lng: number; m: number };

export const STAT_LABEL: Record<StatMode, string> = {
  top: "Les N plus élevés", bottom: "Les N plus faibles", q4: "25 % les plus élevés (Q4)", q1: "25 % les plus faibles (Q1)",
  aboveMean: "Au-dessus de la moyenne", belowMean: "Sous la moyenne", aboveMedian: "Au-dessus de la médiane", belowMedian: "Sous la médiane",
  outlier: "Valeurs atypiques (IQR × 1,5)",
};

// ---------- geometrie (sans dependance) ----------
type Pt = [number, number]; // lng, lat
const polys = (g: any): Pt[][][] => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
export function centroid(g: any): Pt {
  let A = 0, cx = 0, cy = 0, best = 0, bx = 0, by = 0;
  for (const poly of polys(g)) {
    const r = poly[0]; let a = 0, x = 0, y = 0;
    for (let i = 0; i < r.length - 1; i++) { const [x0, y0] = r[i], [x1, y1] = r[i + 1]; const c = x0 * y1 - x1 * y0; a += c; x += (x0 + x1) * c; y += (y0 + y1) * c; }
    a /= 2; if (!a) continue;
    cx += x / 6; cy += y / 6; A += a;
    if (Math.abs(a) > best) { best = Math.abs(a); bx = x / (6 * a); by = y / (6 * a); }
  }
  // centroide global ; repli sur celui du plus grand polygone si l'aire est degeneree
  return A ? [cx / A, cy / A] : [bx, by];
}
export const distM = (a: Pt, b: Pt) => {
  const R = 6371008.8, rad = Math.PI / 180, dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const key = (p: Pt) => `${Math.round(p[0] * 1e4)}|${Math.round(p[1] * 1e4)}`; // ~11 m
/** Voisinage "reine" : deux quartiers sont adjacents s'ils partagent au moins deux sommets (tolerance ~11 m). */
export function buildAdjacency(qs: Q[]): Map<number, Set<number>> {
  const byVertex = new Map<string, Set<number>>();
  for (const q of qs) for (const poly of polys(q.geometry)) for (const ring of poly) for (const p of ring) {
    const k = key(p); let s = byVertex.get(k); if (!s) byVertex.set(k, (s = new Set())); s.add(q.quartier_id);
  }
  const shared = new Map<string, number>();
  for (const s of byVertex.values()) { if (s.size < 2) continue; const a = [...s]; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) { const k = a[i] < a[j] ? `${a[i]}-${a[j]}` : `${a[j]}-${a[i]}`; shared.set(k, (shared.get(k) || 0) + 1); } }
  const adj = new Map<number, Set<number>>(); qs.forEach(q => adj.set(q.quartier_id, new Set()));
  for (const [k, n] of shared) if (n >= 2) { const [a, b] = k.split("-").map(Number); adj.get(a)!.add(b); adj.get(b)!.add(a); }
  return adj;
}

// ---------- statistiques ----------
export function quantile(sorted: number[], p: number) { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
export function describe(vals: number[]) {
  const s = [...vals].sort((a, b) => a - b); const n = s.length; if (!n) return null;
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
  return { n, min: s[0], max: s[n - 1], mean: s.reduce((a, b) => a + b, 0) / n, median: quantile(s, 0.5), q1, q3, lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr };
}

// ---------- evaluation ----------
export type Ctx = { quartiers: Q[]; adj: Map<number, Set<number>>; centroids: Map<number, Pt> };
export function makeCtx(quartiers: Q[]): Ctx {
  return { quartiers, adj: buildAdjacency(quartiers), centroids: new Map(quartiers.map(q => [q.quartier_id, centroid(q.geometry)])) };
}
const nameOf = (ctx: Ctx, id: number) => ctx.quartiers.find(q => q.quartier_id === id)?.nom ?? `#${id}`;
const fmt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 0 });

export function evalRule(r: Rule, ctx: Ctx): Set<number> {
  const out = new Set<number>(); const qs = ctx.quartiers;
  switch (r.kind) {
    case "thr": {
      const f = fieldOf(r.field);
      for (const q of qs) { const v = f.get(q); if (v === null) continue; if (r.op === ">=" ? v >= r.a : r.op === "<=" ? v <= r.a : v >= Math.min(r.a, r.b ?? r.a) && v <= Math.max(r.a, r.b ?? r.a)) out.add(q.quartier_id); }
      break;
    }
    case "stat": {
      const f = fieldOf(r.field); const rows = qs.map(q => [q.quartier_id, f.get(q)] as const).filter((x): x is readonly [number, number] => x[1] !== null);
      const d = describe(rows.map(x => x[1])); if (!d) break;
      if (r.mode === "top" || r.mode === "bottom") {
        const n = Math.max(1, r.n ?? 10); [...rows].sort((a, b) => (r.mode === "top" ? b[1] - a[1] : a[1] - b[1])).slice(0, n).forEach(x => out.add(x[0]));
      } else for (const [id, v] of rows) {
        const ok = r.mode === "q4" ? v >= d.q3 : r.mode === "q1" ? v <= d.q1 : r.mode === "aboveMean" ? v > d.mean : r.mode === "belowMean" ? v < d.mean
          : r.mode === "aboveMedian" ? v > d.median : r.mode === "belowMedian" ? v < d.median : (v < d.lo || v > d.hi);
        if (ok) out.add(id);
      }
      break;
    }
    case "commune": for (const q of qs) if (r.values.includes(q.commune)) out.add(q.quartier_id); break;
    case "class": for (const q of qs) if (q.classe === r.cls) out.add(q.quartier_id); break;
    case "lisa": for (const q of qs) if ((q as any)[r.field] === r.cat) out.add(q.quartier_id); break;
    case "adj": ctx.adj.get(r.ref)?.forEach(i => out.add(i)); break;
    case "dist": { const c0 = ctx.centroids.get(r.ref); if (!c0) break; for (const q of qs) if (q.quartier_id !== r.ref && distM(c0, ctx.centroids.get(q.quartier_id)!) <= r.km * 1000) out.add(q.quartier_id); break; }
    case "buffer": for (const q of qs) if (distM([r.lng, r.lat], ctx.centroids.get(q.quartier_id)!) <= r.m) out.add(q.quartier_id); break;
  }
  return out;
}

export function describeRule(r: Rule, ctx: Ctx): string {
  switch (r.kind) {
    case "thr": { const f = fieldOf(r.field); return r.op === "between" ? `${f.label} entre ${fmt(Math.min(r.a, r.b ?? r.a))} et ${fmt(Math.max(r.a, r.b ?? r.a))} ${f.unit}` : `${f.label} ${r.op === ">=" ? "≥" : "≤"} ${fmt(r.a)} ${f.unit}`; }
    case "stat": return `${fieldOf(r.field).label} : ${r.mode === "top" || r.mode === "bottom" ? STAT_LABEL[r.mode].replace("N", String(r.n ?? 10)) : STAT_LABEL[r.mode]}`;
    case "commune": return `Commune : ${r.values.join(", ")}`;
    case "class": return `Profil ${r.cls} — ${PROFILE_NAMES[r.cls - 1] ?? ""}`;
    case "lisa": return `${r.field.replace("LISA_", "LISA ").replace(/_/g, " ")} = ${r.cat}`;
    case "adj": return `Adjacent à ${nameOf(ctx, r.ref)}`;
    case "dist": return `À moins de ${fmt(r.km)} km de ${nameOf(ctx, r.ref)} (centroïdes)`;
    case "buffer": return `Dans la zone tampon tracée (${fmt(r.m)} m)`;
  }
}

/** Applique toutes les regles (ET ou OU). Si une regle top/bottom est seule, l'ordre du classement est conserve. */
export function runRules(rules: Rule[], mode: "and" | "or", ctx: Ctx): { ids: number[]; sets: Set<number>[] } {
  const sets = rules.map(r => evalRule(r, ctx));
  if (!rules.length) return { ids: [], sets };
  const all = ctx.quartiers.map(q => q.quartier_id);
  const ids = all.filter(id => (mode === "and" ? sets.every(s => s.has(id)) : sets.some(s => s.has(id))));
  const rank = rules.find(r => r.kind === "stat" && r.mode !== "outlier") as Extract<Rule, { kind: "stat" }> | undefined;
  const sortF = rank ? fieldOf(rank.field) : (rules.find(r => r.kind === "thr") as any) ? fieldOf((rules.find(r => r.kind === "thr") as any).field) : null;
  if (sortF) { const desc = !(rank && (rank.mode === "bottom" || rank.mode === "q1" || rank.mode === "belowMean" || rank.mode === "belowMedian")); const val = (id: number) => sortF.get(ctx.quartiers.find(q => q.quartier_id === id)!) ?? -Infinity; ids.sort((a, b) => (desc ? val(b) - val(a) : val(a) - val(b))); }
  return { ids, sets };
}

// ============================================================
// Interpretation d'une phrase en francais
// ============================================================
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const FIELD_WORDS: [RegExp, string][] = [
  [/menage/, "menages"], [/densite d'?(equipement|infra)/, "dens_equip"], [/densite|dense|densement/, "densite_pop"],
  [/superficie|surface|grand|etendu|taille/, "surface_km2"], [/habitant|population|peuple|populeu/, "population"],
  [/instruction|instruit|scolaris|diplom|education.*niveau/, "ind_instruction_0_1"], [/niveau de vie|riche|aise|richesse|pauvre/, "ind_niveau_vie_0_1"],
  [/attractiv|attractif/, "indice_attractivite"], [/volume d'?echange|echange/, "volume_echanges"], [/flux emis|emetteur|depart/, "flux_emis"], [/flux recu|recepteur|arrivee/, "flux_recus"],
  [/accessib/, "acc_globale"], [/offre|desservi|equipe|dote|infrastructure|service/, "offre_infra_0_1"],
];
const FAM_WORDS: [RegExp, string][] = [
  [/sante|hopital|hopitaux|clinique|dispensaire|poste de sante|pharmaci|maternit|medical|medecin|infirmer|soins/, "sante"], [/educ|ecole|college|lycee|universit|creche|maternelle|primaire|scolaire|etablissement/, "education"], [/commerc|marche|boutique|epicerie|magasin|boulangerie|supermarche/, "commerce"], [/\bsport|stade|terrain de/, "sport"],
  [/transport|gare|bus\b|taxi|arret|station/, "transport"], [/banque|bancaire/, "banque"], [/assurance/, "assurance"], [/culte|religi|mosquee|eglise/, "religion"],
];
const COMMUNES = ["Thies Est", "Thies Nord", "Thies Ouest"];
const parseNum = (s: string) => Number(s.replace(/[\s ]/g, "").replace(",", "."));
const NUM = "(\\d[\\d\\s\\u00a0]*(?:[.,]\\d+)?)";

export const PROFILE_NAMES = ["Résidentiels aisés et instruits", "Centraux et péricentraux équipés", "Populaires denses, peu instruits", "Intermédiaires sous-équipés", "Périphérie peu urbanisée"];
export type TargetSpec = { fam?: string; type?: string; label: string };
export type GeoMode = "foot" | "bike" | "car";
export type Parsed = {
  rules: Rule[]; mode: "and" | "or"; notes: string[]; unknown: string[];
  /** Infrastructures dans un rayon autour de la position de l'utilisateur. */
  around?: { km: number; fams: string[]; spec?: TargetSpec };
  /** Itineraire depuis la position de l'utilisateur vers l'equipement le plus proche. */
  route?: { mode: GeoMode; spec: TargetSpec; guide?: boolean };
};
const TARGET_WORDS: [RegExp, TargetSpec][] = [
  [/poste de sante/, { fam: "sante", type: "poste de sante", label: "Poste de santé" }],
  [/hopital/, { fam: "sante", type: "hopital", label: "Hôpital" }],
  [/centre de sante/, { fam: "sante", type: "centre de sante", label: "Centre de santé" }],
  [/clinique/, { fam: "sante", type: "clinique", label: "Clinique" }],
  [/pharmacie/, { fam: "sante", type: "pharmacie", label: "Pharmacie" }],
  [/maternite/, { fam: "sante", type: "maternite", label: "Maternité" }],
  [/sante|dispensaire|medical|soins/, { fam: "sante", label: "Équipement de santé" }],
  [/ecole|college|lycee|universit|education|etablissement scolaire/, { fam: "education", label: "Établissement d'éducation" }],
  [/banque|bancaire|distributeur/, { fam: "banque", label: "Banque" }],
  [/assurance/, { fam: "assurance", label: "Assurance" }],
  [/gare|station|arret|transport/, { fam: "transport", label: "Transport" }],
  [/mosquee|eglise|culte|religi/, { fam: "religion", label: "Lieu de culte" }],
  [/marche|commerc|boutique/, { fam: "commerce", label: "Commerce" }],
  [/stade|sport/, { fam: "sport", label: "Équipement de sport" }],
];

export function parseQuery(text: string, ctx: Ctx): Parsed {
  const t = norm(text); const rules: Rule[] = []; const notes: string[] = []; const unknown: string[] = [];
  if (!t) return { rules, mode: "and", notes, unknown };
  const names = ctx.quartiers.map(q => ({ id: q.quartier_id, n: norm(q.nom) })).sort((a, b) => b.n.length - a.n.length);
  const refFrom = (s: string) => names.find(x => new RegExp(`(^|[^a-z0-9])${x.n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(s));
  const fam = FAM_WORDS.find(([re]) => re.test(t))?.[1];
  const wordField = (s: string) => FIELD_WORDS.find(([re]) => re.test(s))?.[1];

  // ---- actions depuis la position de l'utilisateur : rayon + itineraire ----
  const posWords = /ma position|ma localisation|autour de moi|de moi\b|d'ici|chez moi|ou je suis|mon emplacement|ma place/.test(t);
  const routeIntent = /itineraire|trajet|chemin|comment (?:aller|me rendre|rejoindre)|(?:trace|calcule|donne)[a-z-]* .*(?:vers|jusqu)|emmene|guide[- ]moi|aller (?:a|au|vers|jusqu)/.test(t);
  let around: Parsed["around"]; let route: Parsed["route"];
  const specs = TARGET_WORDS.filter(([re]) => re.test(t)).map(x => x[1]);
  const specMain = specs.find(x => x.type) ?? specs[0];
  if (routeIntent) {
    const mode: GeoMode = /velo|bicyclette|cycl/.test(t) ? "bike" : /voiture|auto\b|vehicule|en car\b|conduire|moto/.test(t) ? "car" : "foot";
    if (!/a pied|marche|pieton|velo|bicyclette|voiture|auto\b|vehicule|moto/.test(t)) notes.push("Mode de déplacement non précisé : « à pied » par défaut.");
    const spec = specMain ?? { label: "N'importe quelle infrastructure" };
    if (!specMain) notes.push("Type d'équipement non précisé : recherche de l'infrastructure la plus proche, tous types confondus.");
    if (!posWords) notes.push("Point de départ : votre position (à définir sur la carte ou par géolocalisation).");
    route = { mode, spec, guide: /guide|guidage|vocal|voix|parle|gps|navigation|3d/.test(t) };
  } else if (posWords && /rayon|moins de|autour|dans les|proche|a \d|dans un/.test(t)) {
    const km0 = t.match(new RegExp(`${NUM}\\s*(km|kilometre|m|metre)s?\\b`));
    let km = 1; if (km0) { const v = parseNum(km0[1]); km = /^k/.test(km0[2]) ? v : v / 1000; } else notes.push("Rayon non précisé : 1 km par défaut.");
    const fams = [...new Set(specs.map(x => x.fam!))];
    around = { km, fams, spec: specs.length === 1 && specs[0].type ? specs[0] : undefined };
  }

  // ---- communes ----
  const comm = COMMUNES.filter(c => t.includes(norm(c)) || (new RegExp(`thies\\s+(?:de\\s+)?${norm(c).split(" ")[1]}\\b`).test(t)));
  const refForCommune = refFrom(t); // un quartier nomme "Thies ..." ? tres rare, on laisse la commune l'emporter
  if (comm.length && !(refForCommune && refForCommune.n.startsWith("thies"))) rules.push({ kind: "commune", values: comm });

  // ---- profils ----
  const pc = t.match(/profil\s*(?:n[o°]?\s*)?([1-5])\b/); if (pc) rules.push({ kind: "class", cls: Number(pc[1]) });
  else {
    const prof = /sous[- ]?equip|intermediaire/.test(t) ? 4 : /peripheri|peu urbanis/.test(t) ? 5 : /populaire|peu instruit/.test(t) ? 3 : /central|pericentr/.test(t) ? 2 : /residentiel|aises? et instruit|instruits? et aises?/.test(t) ? 1 : 0;
    if (prof) { rules.push({ kind: "class", cls: prof }); notes.push(`Profil ${prof} de la typologie (K-means) : « ${PROFILE_NAMES[prof - 1]} ».`); }
  }

  // ---- LISA ----
  const lisaCat = t.match(/\b(hh|ll|hl|lh)\b/); if (lisaCat) {
    const f = /instruction|instruit/.test(t) ? "LISA_instruction_0_1" : /niveau de vie|riche/.test(t) ? "LISA_niveau_vie_0_1_corrige" : "LISA_offre_infra_0_1";
    rules.push({ kind: "lisa", field: f, cat: lisaCat[1].toUpperCase() }); notes.push(`Cluster LISA ${lisaCat[1].toUpperCase()} interprété sur « ${f.replace("LISA_", "").replace(/_/g, " ")} ».`);
  }
  if (/cluster|noyau|pole/.test(t) && /(equip|offre|desservi)/.test(t) && !lisaCat) { rules.push({ kind: "lisa", field: "LISA_offre_infra_0_1", cat: "HH" }); notes.push("« Pôle d'équipements » interprété comme cluster LISA HH de l'offre."); }

  // ---- spatial : adjacence / distance ----
  const adjM = t.match(/(?:voisin|adjacent|limitrophe|jouxt|contigu)\w*\s+(?:de |du |des |a |d')?\s*(.+)/);
  if (adjM) { const r = refFrom(adjM[1]); if (r) rules.push({ kind: "adj", ref: r.id }); else unknown.push("quartier de référence introuvable pour l'adjacence"); }
  const distM2 = t.match(new RegExp(`(?:a )?moins de ${NUM}\\s*(km|kilometre|m|metre)s?\\b\\s*(?:de |du |d')?\\s*(.*)`));
  if (distM2 && !posWords && !/habitant|menage/.test(distM2[3].slice(0, 12))) {
    const d = parseNum(distM2[1]); const km = /^k/.test(distM2[2]) ? d : d / 1000; const r = refFrom(distM2[3]);
    if (r) rules.push({ kind: "dist", ref: r.id, km }); else if (distM2[3]) unknown.push(`quartier de référence introuvable après « à moins de ${distM2[1]} ${distM2[2]} de »`);
  }

  // ---- absence d'equipements : « sans », « aucun », « pas de », « depourvus de », « non desservis en » ----
  let forceAnd = false;
  const famsIn = (x: string) => { const o: string[] = []; for (const [re, f] of FAM_WORDS) if (re.test(x) && !o.includes(f)) o.push(f); return o; };
  const cutSeg = (x: string) => x.split(/\bdans\b|\ba thies\b|\bde thies\b|\bsitues?\b|[.;?!]/)[0].slice(0, 90);
  const negM = t.match(/\b(?:sans|aucun(?:e|s)?|pas d[e']|pas de|depourvu(?:e|s)? d[e']|prive(?:e|s)? d[e']|manque d[e']|manquent d[e']|absence d[e']|non (?:dote|equipe|desservi)(?:e|s)?(?: en)?|ne (?:disposent|possedent|comptent|contiennent) (?:pas|aucun\w*)|n'ont (?:pas|aucun\w*)|ne sont pas (?:dotes?|equipes?|desservis?))\b(.*)/);
  const absent: string[] = [];
  if (negM) {
    const seg = cutSeg(negM[1]);
    const fs = famsIn(seg);
    const typed = TARGET_WORDS.find(([re, sp]) => sp.type && re.test(seg));
    if (fs.length) { fs.forEach(f => { rules.push({ kind: "thr", field: `nb_${f}`, op: "<=", a: 0 }); absent.push(f); }); }
    else if (/equipement|infrastructure|structure|service|amenagement|installation/.test(seg) || /^\s*$/.test(seg)) { rules.push({ kind: "thr", field: "nb_equip", op: "<=", a: 0 }); absent.push("equip"); }
    if (absent.length) { forceAnd = true; notes.push(`« Sans … » : quartiers dont le nombre d'équipements ${absent[0] === "equip" ? "(toutes familles)" : "de la famille indiquée"} est égal à 0 dans la base.`); }
    if (typed) notes.push(`Le type précis « ${typed[1].label} » n'est pas compté par quartier : la requête porte sur toute la famille « ${typed[1].fam} ».`);
  }

  // ---- seuils chiffres ----
  const used: [number, number][] = [];
  const cmp: [RegExp, ">=" | "<="][] = [
    [new RegExp(`(?:plus de|superieur(?:e|s)? a|depass\\w+|au moins|>=|>|≥)\\s*${NUM}`, "g"), ">="],
    [new RegExp(`(?:moins de|inferieur(?:e|s)? a|au plus|<=|<|≤)\\s*${NUM}`, "g"), "<="],
  ];
  const between = t.match(new RegExp(`entre ${NUM}\\s*(?:et|-)\\s*${NUM}`));
  const fieldNear = (idx: number, len: number) => {
    const before = t.slice(Math.max(0, idx - 45), idx), after = t.slice(idx + len, idx + len + 30);
    const seg = (x: string) => { const fm = FAM_WORDS.find(([re]) => re.test(x))?.[1]; return fm ? `nb_${fm}` : /equipement/.test(x) ? "nb_equip" : wordField(x); };
    const aft = seg(after.split(/ et |,|;| avec | dont /)[0]); const bef = seg(before.split(/ et |,|;| avec | dont /).slice(-1)[0]);
    return { f: aft ?? bef, from: aft ? "after" : "before" };
  };
  const famField = (base: string | undefined) => (fam && (base === "offre_infra_0_1" || !base) ? `nb_${fam}` : base);
  if (between) {
    const idx = between.index!; const { f } = fieldNear(idx, between[0].length);
    const fid = famField(f); if (fid) { rules.push({ kind: "thr", field: fid, op: "between", a: parseNum(between[1]), b: parseNum(between[2]) }); used.push([idx, idx + between[0].length]); }
    else unknown.push("indicateur non reconnu pour « entre … et … »");
  }
  for (const [re, op] of cmp) for (const m of t.matchAll(re)) {
    if (used.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
    if (/^(?:a )?(?:km|m)\b/.test(t.slice(m.index! + m[0].length).trim()) && /moins de/.test(m[0])) continue; // distance, deja traitee
    const { f } = fieldNear(m.index!, m[0].length);
    const pct = /%|pour cent|pourcent/.test(t.slice(m.index! + m[0].length, m.index! + m[0].length + 12));
    const fid = famField(f);
    if (!fid) { unknown.push(`indicateur non reconnu pour « ${m[0]} »`); continue; }
    let v = parseNum(m[1]); if (pct) v /= 100;
    rules.push({ kind: "thr", field: fid, op, a: v });
  }

  // ---- presence : « avec des ecoles », « qui ont une banque », « disposant d'un hopital » ----
  if (!absent.length) {
    const preM = t.match(/\b(?:avec|ayant|possedant|disposant|contenant|qui (?:ont|possedent|disposent|contiennent)|ou il y a|ou se trouve|comptant)\b\s*(?:au moins |d'|de |du |des |un |une |l'|la |le |les )*(.*)/);
    if (preM && !/\b(?:plus|mieux|moins|mal)\s+(?:desservi|equipe|dote|servi)/.test(t)) {
      for (const f of famsIn(cutSeg(preM[1]))) if (!rules.some(r => r.kind === "thr" && r.field === `nb_${f}`)) { rules.push({ kind: "thr", field: `nb_${f}`, op: ">=", a: 1 }); notes.push(`« Avec … » : au moins un équipement de la famille « ${f} ».`); }
    }
  }

  // ---- statistiques : classements ----
  const sup = t.match(new RegExp(`(?:les\\s+)?(?:${NUM}\\s+)?(plus|mieux|moins|mal)\\s+(\\w+)`, "g"));
  const superlative = /\b(?:les\s+)?(\d+\s+)?(plus|mieux|moins|mal)\s+(desservi|equipe|dote|peuple|habite|dense|grand|etendu|petit|instruit|riche|aise|pauvre|attractif|emetteur|recepteur|accessible|servi)/;
  const sm = t.match(superlative);
  if (sm) {
    const nTop = sm[1] ? Number(sm[1]) : /\b(\d+)\s+(?:premiers?|quartiers?)\b/.exec(t)?.[1] ? Number(/\b(\d+)\s+(?:premiers?|quartiers?)\b/.exec(t)![1]) : undefined;
    const neg = sm[2] === "moins" || sm[2] === "mal";
    const adj = sm[3]; let fid: string | undefined;
    if (/desservi|servi|equipe|dote/.test(adj)) fid = fam ? `acc_${fam}` : "offre_infra_0_1";
    else if (/accessible/.test(adj)) fid = fam ? `acc_${fam}` : "acc_globale";
    else if (/dense/.test(adj)) fid = "densite_pop"; else if (/peuple|habite/.test(adj)) fid = "population";
    else if (/grand|etendu|petit/.test(adj)) fid = "surface_km2"; else if (/instruit/.test(adj)) fid = "ind_instruction_0_1";
    else if (/riche|aise|pauvre/.test(adj)) fid = "ind_niveau_vie_0_1"; else if (/attractif/.test(adj)) fid = "indice_attractivite";
    else if (/emetteur/.test(adj)) fid = "flux_emis"; else if (/recepteur/.test(adj)) fid = "flux_recus";
    let flip = neg; if (/petit|pauvre/.test(adj)) flip = !flip;
    if (fid) {
      if (/desservi|servi|equipe|dote/.test(adj)) notes.push(fam
        ? `« ${sm[2]} ${adj} » interprété sur l'accessibilité aux équipements de type « ${fam} » (indice 0-1 de l'analyse).`
        : `« ${sm[2]} ${adj} en équipements » interprété sur l'indicateur synthétique d'offre d'équipements (ACP des 8 densités, 0-1).`);
      rules.push(nTop ? { kind: "stat", field: fid, mode: flip ? "bottom" : "top", n: nTop } : { kind: "stat", field: fid, mode: flip ? "q1" : "q4" });
      if (!nTop) notes.push(`Sans nombre précisé, « ${flip ? "les moins" : "les plus"} » = ${flip ? "25 % les plus faibles (Q1)" : "25 % les plus élevés (Q4)"}.`);
    }
  } else if (sup && !rules.length && !route && !around) unknown.push(`superlatif non reconnu : « ${sup[0]} »`);

  // ---- statistiques : moyenne / mediane / atypiques ----
  const mm = t.match(/(au[- ]dessus|superieur\w*|plus (?:eleve|haut)\w*|en dessous|sous|inferieur\w*|en[- ]dessous)\s+(?:de |d')?(?:la |l')?(moyenne|mediane)/);
  if (mm) { const above = /dessus|superieur|plus/.test(mm[1]); const f = wordField(t) ?? (fam ? `nb_${fam}` : "population"); rules.push({ kind: "stat", field: f, mode: (above ? "above" : "below") + (mm[2] === "moyenne" ? "Mean" : "Median") as StatMode }); }
  if (/atypique|aberrant|exception|valeurs? extreme|outlier/.test(t)) { const f = (fam ? `nb_${fam}` : undefined) ?? wordField(t) ?? "population"; rules.push({ kind: "stat", field: f, mode: "outlier" }); }
  const qm = t.match(/(quartile|q)\s*([14])\b|(dernier|premier) quartile/);
  if (qm) { const top = qm[2] === "4" || qm[3] === "dernier"; const f = wordField(t) ?? "offre_infra_0_1"; rules.push({ kind: "stat", field: f, mode: top ? "q4" : "q1" }); }

  // dedoublonnage
  const seen = new Set<string>(); const uniq = rules.filter(r => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; });
  const mode = !forceAnd && /\bou\b/.test(t) && !/\bet\b/.test(t) ? "or" : "and";
  return { rules: uniq, mode, notes, unknown, around, route };
}

export const EXAMPLES = [
  "Affiche-moi les quartiers les mieux desservis en termes d'équipements",
  "Les 10 quartiers les plus peuplés",
  "Quartiers de Thiès Nord avec moins de 3000 habitants",
  "Quartiers les moins desservis en santé",
  "Quartiers sans équipement de santé",
  "Quartiers sans école ni banque",
  "Quartiers de Thiès Nord sans infrastructure",
  "Quartiers avec des écoles et plus de 5000 habitants",
  "Quartiers adjacents à Escale Nord",
  "Quartiers à moins de 2 km de Escale Sud",
  "Quartiers dont l'instruction est au-dessus de la moyenne",
  "Quartiers atypiques en nombre de commerces",
  "Sélectionne les quartiers résidentiels aisés et instruits",
  "Dans un rayon de 1 km de ma position, trouve-moi les infrastructures",
  "Trace l'itinéraire à pied vers le poste de santé le plus proche",
  "Itinéraire en voiture vers l'infrastructure la plus proche",
  "Guide-moi à pied vers la pharmacie la plus proche",
];
