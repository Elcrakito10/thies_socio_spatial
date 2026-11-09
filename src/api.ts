// Accès aux données : API PostGIS en priorité, repli automatique sur les fichiers statiques de /data.
// Les deux sources ont exactement le même format ; l'application ne voit pas la différence.
const MAP: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/data\/quartiers_thies\.geojson$/, () => "/api/quartiers"],
  [/^\/data\/communes_thies\.geojson$/, () => "/api/communes"],
  [/^\/data\/census_summary\.json$/, () => "/api/recensement"],
  [/^\/data\/census_localites\.json$/, () => "/api/recensement/localites"],
  [/^\/data\/datasets_catalog\.json$/, () => "/api/datasets"],
  [/^\/data\/grille_200m\.geojson$/, () => "/api/grille"],
  [/^\/data\/reseau_routier\.geojson$/, () => "/api/reseau-routier"],
  [/^\/data\/infrastructures\/infra_(\w+)\.geojson$/, m => `/api/infrastructures?famille=${m[1]}`],
];

export type DataSource = "api" | "fichiers";
let source: DataSource | null = null;
let downUntil = 0;
const listeners = new Set<(s: DataSource) => void>();
const setSource = (s: DataSource) => { if (source !== s) { source = s; listeners.forEach(f => f(s)); } };
export const dataSource = () => source;
export const onDataSource = (f: (s: DataSource) => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

// Resultats valides de l'analyse (indices de segregation, LISA, classes, indice de niveau de vie corrige) :
// fusionnes dans chaque quartier, quelle que soit la source (API ou fichier), par la cle quartier_id.
let resultsP: Promise<Record<string, any> | null> | null = null;
const loadResults = () => (resultsP ??= fetch("/data/resultats_quartiers.json").then(r => (r.ok ? r.json() : null)).catch(() => null));

async function withResults(r: Response): Promise<Response> {
  const [geo, res] = await Promise.all([r.json(), loadResults()]);
  if (!res || !Array.isArray(geo?.features)) return new Response(JSON.stringify(geo), { headers: { "content-type": "application/json" } });
  for (const f of geo.features) {
    const x = res[f.properties.quartier_id];
    if (!x) continue;
    Object.assign(f.properties, x);
    // Valeurs validees : remplacent les anciens indices (l'ancien niveau de vie etait inverse).
    f.properties.ind_niveau_vie_0_1 = x.niveau_vie_0_1_corrige;
    f.properties.ind_niveau_vie = null;
    if (x.instruction_0_1 !== null && x.instruction_0_1 !== undefined) f.properties.ind_instruction_0_1 = x.instruction_0_1;
  }
  return new Response(JSON.stringify(geo), { headers: { "content-type": "application/json" } });
}

const RESULTS_ENTRY = {
  id: "resultats_base", name: "Résultats de l'analyse — base finale des 65 quartiers", kind: "table", geometry: "—", scale: "Quartier", count: 65,
  file: "/data/resultats_base_65.json", formats: ["CSV", "JSON"], bytes: 124340, columns: ["quartier_id", "quartier", "commune", "population", "menages", "superficie_km2", "densite_pop_km2", "instruction_0_1", "instruction_quartile", "part_sans_niveau", "part_prescolaire", "part_primaire", "part_moyen", "part_secondaire", "part_superieur", "LQ_sans_niveau", "LQ_prescolaire", "LQ_primaire", "LQ_moyen", "LQ_secondaire", "LQ_superieur", "entropie_scolaire_locale", "niveau_vie_0_1_corrige", "niveau_vie_quartile", "densite_sante", "densite_education", "densite_commerce", "densite_sport", "densite_transport", "densite_banque", "densite_assurance", "densite_religion", "offre_infra_0_1", "offre_infra_quartile", "acces_global_moyen_0_1", "acces_route_moyen_0_1", "distance_route_moy_m", "part_cellules_LL_acces", "flux_emis", "flux_recus", "volume_echanges", "solde_echanges", "indice_attractivite", "LQ_emission_hab", "LQ_reception_hab", "categorie_attractivite", "LISA_instruction_0_1", "LISA_niveau_vie_0_1_corrige", "LISA_offre_infra_0_1", "LISA_acces_global_moyen_0_1", "LISA_indice_attractivite", "LISA_flux_emis", "LISA_flux_recus", "classe", "nom_classe", "CP1", "CP2", "silhouette"],
  description: "Une ligne par quartier : instruction, niveau de vie (indice corrigé), parts et coefficients de localisation par niveau d'instruction, densités, offre d'infrastructures, accessibilité, flux et attractivité, clusters LISA, classe K-means et scores ACP.",
  source: "Analyse de la ségrégation socio-spatiale (Dione & Sissokho Sy), résultats validés par l'encadreur ; RGPH-5 (ANSD) ; inventaire des infrastructures",
  year: "2023", status: "Intégré", indicators: ["Gini, Theil, dissimilarité, IS, entropie, LQ", "Moran / LISA", "Classe K-means (5 profils)", "Indice de niveau de vie corrigé"],
  notes: "65 quartiers (les trois polygones sans population de la couche d'origine sont rattachés à leur quartier officiel). Colonnes vides = valeur non définie. Le classeur XLSX téléchargeable depuis la page Ségrégation contient aussi les indices, les profils, les corrélations et le choix de k.",
};
const EQUIP_ENTRY = {
  id: "equipements_normes", name: "Ratios et normes — éducation primaire et santé (comptages par quartier)", kind: "table", geometry: "—", scale: "Quartier", count: 65,
  file: "/data/equipements_normes.json", formats: ["JSON"], bytes: 21090, columns: ["poste", "sante (comptage par type)", "edu (comptage par type)", "postes (28 postes publics : population, médecins, infirmiers, techniciens)", "hopitaux"],
  description: "Pour chaque quartier : nombre d'équipements d'éducation et de santé par type (rattachés par jointure spatiale), poste de santé de rattachement ; effectifs de personnel des 28 postes publics ; liste des hôpitaux. Les ratios sont calculés dans le Géoportail avec des hypothèses modifiables.",
  source: "Inventaire des infrastructures ; projet « Maillage sanitaire de Thiès » (effectifs, normes OMS) ; carte sanitaire du Sénégal (norme de 7 714 habitants par poste urbain)", year: "2023", status: "Intégré",
  indicators: ["Enfants de 6-11 ans par école primaire", "Équivalents-poste de santé (hiérarchie des fonctions)", "Infirmiers et médecins pour 5 000 / 10 000 habitants"],
  notes: "La part des enfants de 6-11 ans (14 %) est une hypothèse : le recensement fourni ne donne pas l'âge. Les hôpitaux ne sont pas comptés à l'échelle du quartier.",
};
async function withCatalog(r: Response): Promise<Response> {
  const j = await r.json();
  if (Array.isArray(j) && !j.some((x: any) => x.id === "resultats_base")) j.push(RESULTS_ENTRY);
  if (Array.isArray(j) && !j.some((x: any) => x.id === "equipements_normes")) j.push(EQUIP_ENTRY);
  return new Response(JSON.stringify(j), { headers: { "content-type": "application/json" } });
}

/** Remplace fetch("/data/...") : essaie l'API puis retombe sur le fichier statique. */
export async function dataFetch(url: string): Promise<Response> {
  const r = await dataFetchRaw(url);
  if (/^\/data\/quartiers_thies\.geojson$/.test(url)) return withResults(r);
  if (/^\/data\/datasets_catalog\.json$/.test(url)) return withCatalog(r);
  return r;
}

async function dataFetchRaw(url: string): Promise<Response> {
  const hit = MAP.map(([re, to]) => { const m = url.match(re); return m ? to(m) : null; }).find(Boolean);
  if (hit && Date.now() > downUntil) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(hit, { signal: ctl.signal }); clearTimeout(t);
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) { setSource("api"); return r; }
    } catch { /* API indisponible */ }
    downUntil = Date.now() + 30000;
  }
  if (hit) setSource("fichiers");
  return fetch(url);
}
