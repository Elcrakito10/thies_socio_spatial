import { useEffect, useMemo, useSyncExternalStore } from "react";

// ============================================================
// Ratios, normes et équipements — éducation (primaire) et santé.
// Les comptages par quartier viennent de data/build_equipements.py (public/data/equipements_normes.json) ;
// tous les ratios sont calculés ici, à partir d'hypothèses affichées et modifiables.
// ============================================================

export type EquipParams = {
  /** Part de la population qui a 6 à 11 ans (âge du primaire). HYPOTHÈSE : le recensement fourni ne contient pas l'âge. */
  partEnfants: number;
  /** Élèves par classe : standard de 48 pour les classes normales (rapport d'analyse du secteur de l'éducation de base, JICA). */
  elevesParClasse: number;
  /** Une école primaire a 6 classes (CI, CP, CE1, CE2, CM1, CM2). HYPOTHÈSE de lecture simple (une classe par niveau). */
  classesParEcole: number;
  /** Compte-t-on les écoles franco-arabes comme écoles primaires ? */
  francoArabe: boolean;
  /** Norme d'habitants par poste de santé urbain : 7 714 (carte sanitaire du Sénégal, mise à jour 2011). */
  normePS: number;
  /** Normes OMS (hab. max. par professionnel), reprises du classeur des ratios. */
  normeMedecin: number; normeInfirmier: number; normeTech: number;
  /** Poids des structures en « équivalents-poste de santé » (hiérarchie des fonctions). */
  poids: Record<string, number>;
};

export const POIDS_LABELS: { key: string; label: string; types: string[]; note: string }[] = [
  { key: "poste", label: "Poste de santé", types: ["Poste de santé"], note: "Unité de référence = 1 (3 agents d'après la carte sanitaire)." },
  { key: "maternite", label: "Maternité", types: ["Maternité"], note: "Soins de proximité, même niveau qu'un poste." },
  { key: "cms", label: "Centre médico-social", types: ["Centre médico-social"], note: "Soins de proximité, même niveau qu'un poste." },
  { key: "cs", label: "Centre de santé", types: ["Centre de santé"], note: "27 agents pour un centre de santé secondaire contre 3 pour un poste : 27 ÷ 3 = 9." },
  { key: "clinique", label: "Clinique privée", types: ["Clinique"], note: "Hypothèse : un tiers d'un centre de santé (environ 9 agents)." },
  { key: "cabinet", label: "Cabinet médical", types: ["Cabinet médical"], note: "Hypothèse : un médecin et un aide, soit environ 1,5 agent." },
  { key: "labo", label: "Laboratoire d'analyses", types: ["Laboratoire d'analyse médicale"], note: "Hypothèse : service d'appui, il ne reçoit pas de patients en consultation." },
];
export const SANS_POIDS = ["Pharmacie", "Hôpital public", "Hôpital privé", "Médecine traditionnelle", "Dépôt de médicaments moderne", "Dépôt de médicaments traditionnel", "Service d'hygiène", "Région médicale", "Centre social"];

export const DEFAULT_PARAMS: EquipParams = {
  partEnfants: 0.14, elevesParClasse: 48, classesParEcole: 6, francoArabe: true,
  normePS: 7714, normeMedecin: 10000, normeInfirmier: 5000, normeTech: 5000,
  poids: { poste: 1, maternite: 1, cms: 1, cs: 9, clinique: 3, cabinet: 0.5, labo: 0.25 },
};

export const EDU_PRIM_TYPES = ["Ecole élémentaire publique", "Ecole élémentaire privée"];
export const EDU_FRANCO = "Ecole franco-arabe";

export type EquipData = {
  quartiers: Record<string, { nom: string; poste: string | null; sante: Record<string, number>; edu: Record<string, number> }>;
  hopitaux: { nom: string; type: string; quartier_id: number | null; commune: string; lon: number; lat: number }[];
  hors_polygone: { edu: number; sante: number };
  postes: { nom: string; commune: string; lon: number; lat: number; pop_adm: number; medecins: number; infirmiers: number; tech_sup: number; quartier_ids: number[] }[];
};

// ---------- niveaux d'insuffisance (seuils du classeur des ratios, à valider avec l'encadreur) ----------
export type Statut = "ok" | "legere" | "moderee" | "severe" | "critique" | "na";
export const STATUTS: { key: Statut; label: string; color: string; lecture: string }[] = [
  { key: "ok", label: "Norme respectée", color: "#2e9e5b", lecture: "Le ratio atteint ou dépasse la norme." },
  { key: "legere", label: "Insuffisance légère", color: "#a5d04a", lecture: "Le ratio atteint 75 % à 100 % de la norme." },
  { key: "moderee", label: "Insuffisance modérée", color: "#f2c230", lecture: "Le ratio atteint 50 % à 75 % de la norme." },
  { key: "severe", label: "Insuffisance sévère", color: "#f07f2e", lecture: "Le ratio atteint 25 % à 50 % de la norme." },
  { key: "critique", label: "Insuffisance critique", color: "#d7263d", lecture: "Le ratio atteint moins de 25 % de la norme, ou rien n'existe." },
  { key: "na", label: "Sans population recensée", color: "#c9ced3", lecture: "Pas de population : ratio non calculable." },
];
export const statutDe = (couverture: number | null): Statut => couverture === null ? "na" : couverture >= 1 ? "ok" : couverture >= 0.75 ? "legere" : couverture >= 0.5 ? "moderee" : couverture >= 0.25 ? "severe" : "critique";
export const statutLabel = (s: Statut) => STATUTS.find(x => x.key === s)!.label;

// ---------- calcul par quartier ----------
export type QEquip = {
  ecoles: number; enfants: number | null; enfants_par_ecole: number | null; capacite: number; couverture_edu: number | null; ecoles_requises: number | null; ecoles_manquantes: number | null; statut_edu: Statut;
  eps: number; hab_par_eps: number | null; couverture_san: number | null; eps_requis: number | null; eps_manquants: number | null; statut_san: Statut;
  nb_postes: number; nb_pharmacies: number; nb_hopitaux: number;
  poste: string | null; inf_ratio: number | null; med_ratio: number | null; tech_ratio: number | null; statut_inf: Statut; statut_med: Statut;
};
type PosteRes = { nom: string; commune: string; pop: number; medecins: number; infirmiers: number; tech_sup: number; med_ratio: number; inf_ratio: number; tech_ratio: number; statut_inf: Statut; statut_med: Statut; statut_tech: Statut; manque_med: number; manque_inf: number; manque_tech: number };

export const poidsDe = (type: string, P: EquipParams) => { const l = POIDS_LABELS.find(x => x.types.includes(type)); return l ? (P.poids[l.key] ?? 0) : 0; };
export const nbEcoles = (edu: Record<string, number>, P: EquipParams) => EDU_PRIM_TYPES.reduce((s, t) => s + (edu[t] || 0), 0) + (P.francoArabe ? edu[EDU_FRANCO] || 0 : 0);
export const capaciteEcole = (P: EquipParams) => P.classesParEcole * P.elevesParClasse;

export function postesRes(D: EquipData, pop: Map<number, number>, P: EquipParams): PosteRes[] {
  return D.postes.map(p => {
    // Population de l'aire du poste : la valeur du classeur (68 quartiers administratifs) ; repli sur la somme des quartiers.
    const n = p.pop_adm || p.quartier_ids.reduce((s, i) => s + (pop.get(i) || 0), 0);
    const med = (p.medecins / n) * P.normeMedecin, inf = (p.infirmiers / n) * P.normeInfirmier, tech = (p.tech_sup / n) * P.normeTech;
    return { nom: p.nom, commune: p.commune, pop: n, medecins: p.medecins, infirmiers: p.infirmiers, tech_sup: p.tech_sup, med_ratio: med, inf_ratio: inf, tech_ratio: tech,
      statut_med: statutDe(med), statut_inf: statutDe(inf), statut_tech: statutDe(tech),
      manque_med: Math.max(0, Math.ceil(n / P.normeMedecin - p.medecins)), manque_inf: Math.max(0, Math.ceil(n / P.normeInfirmier - p.infirmiers)), manque_tech: Math.max(0, Math.ceil(n / P.normeTech - p.tech_sup)) };
  });
}

export function calcQuartier(id: number, popQ: number, D: EquipData, P: EquipParams, postes: Map<string, PosteRes>): QEquip {
  const e = D.quartiers[String(id)];
  const edu = e?.edu ?? {}, san = e?.sante ?? {};
  const ecoles = nbEcoles(edu, P), cap = ecoles * capaciteEcole(P);
  const enfants = popQ > 0 ? popQ * P.partEnfants : null;
  const couvE = enfants ? cap / enfants : null;
  const eps = Object.entries(san).reduce((s, [t, n]) => s + n * poidsDe(t, P), 0);
  const couvS = popQ > 0 ? (eps * P.normePS) / popQ : null;
  const ps = e?.poste ? postes.get(e.poste) ?? null : null;
  return {
    ecoles, enfants, enfants_par_ecole: enfants !== null && ecoles > 0 ? enfants / ecoles : null, capacite: cap, couverture_edu: couvE,
    ecoles_requises: enfants !== null ? Math.ceil(enfants / capaciteEcole(P)) : null, ecoles_manquantes: enfants !== null ? Math.max(0, Math.ceil(enfants / capaciteEcole(P)) - ecoles) : null, statut_edu: statutDe(couvE),
    eps, hab_par_eps: popQ > 0 && eps > 0 ? popQ / eps : null, couverture_san: couvS, eps_requis: popQ > 0 ? popQ / P.normePS : null,
    eps_manquants: popQ > 0 ? Math.max(0, popQ / P.normePS - eps) : null, statut_san: statutDe(couvS),
    nb_postes: (san["Poste de santé"] || 0) + (san["Maternité"] || 0), nb_pharmacies: san["Pharmacie"] || 0, nb_hopitaux: (san["Hôpital public"] || 0) + (san["Hôpital privé"] || 0),
    poste: e?.poste ?? null, inf_ratio: ps ? ps.inf_ratio : null, med_ratio: ps ? ps.med_ratio : null, tech_ratio: ps ? ps.tech_ratio : null,
    statut_inf: ps ? ps.statut_inf : "na", statut_med: ps ? ps.statut_med : "na",
  };
}

/** Ajoute les champs eq_* à chaque quartier (population, comptages et paramètres -> ratios). */
export function withEquip<T extends { quartier_id: number; population: number }>(qs: T[], D: EquipData | null, P: EquipParams): (T & Partial<{ eq: QEquip }>)[] {
  if (!D) return qs;
  const pop = new Map(qs.map(q => [q.quartier_id, q.population || 0]));
  const postes = new Map(postesRes(D, pop, P).map(p => [p.nom, p]));
  return qs.map(q => ({ ...q, eq: calcQuartier(q.quartier_id, q.population || 0, D, P, postes) }));
}

// ---------- agrégats (commune, ville) ----------
export type Agg = { nom: string; pop: number; enfants: number; ecoles: number; capacite: number; couvE: number | null; manquantes: number; eps: number; couvS: number | null; epsManquants: number; hopitaux: number; postesPublics: number; pharmacies: number; hab_par_hopital: number | null };
export function aggregate(rows: { commune: string; population: number; eq?: QEquip }[], nom: string, P: EquipParams, filtre?: (c: string) => boolean): Agg {
  const r = rows.filter(x => x.eq && (!filtre || filtre(x.commune)));
  const pop = r.reduce((s, x) => s + (x.population || 0), 0);
  const sum = (f: (e: QEquip) => number) => r.reduce((s, x) => s + f(x.eq!), 0);
  const enf = sum(e => e.enfants ?? 0), cap = sum(e => e.capacite), eps = sum(e => e.eps), h = sum(e => e.nb_hopitaux);
  return { nom, pop, enfants: enf, ecoles: sum(e => e.ecoles), capacite: cap, couvE: enf ? cap / enf : null, manquantes: sum(e => e.ecoles_manquantes ?? 0),
    eps, couvS: pop ? (eps * P.normePS) / pop : null, epsManquants: sum(e => e.eps_manquants ?? 0), hopitaux: h, postesPublics: sum(e => e.nb_postes), pharmacies: sum(e => e.nb_pharmacies), hab_par_hopital: h ? pop / h : null };
}

// ---------- chargement et paramètres partagés (Géoportail + Assistant) ----------
let dataP: Promise<EquipData | null> | null = null;
let data: EquipData | null = null;
const loadData = () => (dataP ??= fetch("/data/equipements_normes.json").then(r => (r.ok ? r.json() : null)).then(j => { data = j; notify(); return j; }).catch(() => null));
let params: EquipParams = (() => { try { const s = localStorage.getItem("equip-params"); return s ? { ...DEFAULT_PARAMS, ...JSON.parse(s), poids: { ...DEFAULT_PARAMS.poids, ...(JSON.parse(s).poids || {}) } } : DEFAULT_PARAMS; } catch { return DEFAULT_PARAMS; } })();
const subs = new Set<() => void>();
function notify() { subs.forEach(f => f()); }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getParams = () => params;
export const getData = () => data;
export const setParams = (p: EquipParams) => { params = p; try { localStorage.setItem("equip-params", JSON.stringify(p)); } catch { /* stockage indisponible */ } notify(); };
export const resetParams = () => setParams(DEFAULT_PARAMS);

export function useEquipParams(): [EquipParams, (p: EquipParams) => void] {
  const p = useSyncExternalStore(subscribe, getParams);
  return [p, setParams];
}
export function useEquipData(): EquipData | null {
  useEffect(() => { loadData(); }, []);
  return useSyncExternalStore(subscribe, () => data);
}
/** Quartiers enrichis des ratios (champ `eq`), recalculés quand les paramètres changent. */
export function useQuartiersEquip<T extends { quartier_id: number; population: number }>(qs: T[]) {
  const D = useEquipData(); const [P] = useEquipParams();
  return useMemo(() => withEquip(qs, D, P), [qs, D, P]);
}
export const useEquipPostes = (qs: { quartier_id: number; population: number }[]) => {
  const D = useEquipData(); const [P] = useEquipParams();
  return useMemo(() => (D ? postesRes(D, new Map(qs.map(q => [q.quartier_id, q.population || 0])), P) : []), [D, P, qs]);
};
