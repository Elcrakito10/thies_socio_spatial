import { useMemo, useState } from "react";
import { Download, RotateCcw, GraduationCap, HeartPulse, SlidersHorizontal } from "lucide-react";
import "./GeoEquip.css";
import {
  STATUTS, POIDS_LABELS, SANS_POIDS, aggregate, capaciteEcole, statutLabel, resetParams, setParams,
  useEquipData, useEquipParams, useEquipPostes, type EquipParams, type QEquip, type Statut,
} from "./equip";

type Row = { quartier_id: number; nom: string; commune: string; population: number; eq?: QEquip };
const fr = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }));
const pct = (v: number | null) => (v === null ? "—" : `${fr(v * 100, 0)} %`);
const tc = (s: string) => s.toLowerCase().replace(/(^|[\s(-])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()).replace(/^Hopital/, "Hôpital").replace(/Thies/g, "Thiès").replace(/\b(De|Du)\b/g, m => m.toLowerCase());
const COMMUNES = [["Thiès Est", /est/i], ["Thiès Nord", /nord/i], ["Thiès Ouest", /ouest/i]] as const;

export const Chip = ({ s }: { s: Statut }) => <span className="eqp-chip" style={{ background: STATUTS.find(x => x.key === s)!.color, color: s === "legere" || s === "moderee" ? "#222" : "#fff" }}>{statutLabel(s)}</span>;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export default function GeoEquip({ quartiers }: { quartiers: Row[] }) {
  const [tab, setTab] = useState<"edu" | "san" | "hyp">("edu");
  const [P] = useEquipParams(); const D = useEquipData();
  const postes = useEquipPostes(quartiers);
  const rows = quartiers.filter(q => q.eq);
  const ville = useMemo(() => aggregate(rows, "Ville de Thiès", P), [rows, P]);
  const comm = useMemo(() => COMMUNES.map(([n, re]) => aggregate(rows, n, P, c => re.test(c))), [rows, P]);
  if (!D) return <section className="gx-card eqp"><h3>Ratios, normes et équipements</h3><p className="mut">Chargement des données…</p></section>;

  const cap = capaciteEcole(P);
  const prioEdu = [...rows].filter(q => (q.eq!.ecoles_manquantes ?? 0) > 0).sort((a, b) => (b.eq!.ecoles_manquantes ?? 0) - (a.eq!.ecoles_manquantes ?? 0)).slice(0, 8);
  const prioSan = [...rows].filter(q => (q.eq!.eps_manquants ?? 0) > 0.5).sort((a, b) => (b.eq!.eps_manquants ?? 0) - (a.eq!.eps_manquants ?? 0)).slice(0, 8);
  const nbStat = (f: (e: QEquip) => Statut) => STATUTS.map(s => ({ s, n: rows.filter(q => f(q.eq!) === s.key).length }));
  const hop = D.hopitaux;
  const okMed = postes.filter(p => p.statut_med === "ok").length, okInf = postes.filter(p => p.statut_inf === "ok").length;
  const totMed = postes.reduce((s, p) => s + p.medecins, 0), totInf = postes.reduce((s, p) => s + p.infirmiers, 0), totTech = postes.reduce((s, p) => s + p.tech_sup, 0);
  const popPostes = postes.reduce((s, p) => s + p.pop, 0);
  const csv = () => {
    const h = ["quartier_id", "quartier", "commune", "population", "enfants_6_11_estimes", "ecoles_primaires", "enfants_par_ecole", "places_theoriques", "couverture_primaire", "ecoles_manquantes", "statut_primaire",
      "equivalents_poste_sante", "hab_par_equivalent_poste", "couverture_sante", "equivalents_poste_manquants", "statut_sante", "poste_de_rattachement", "infirmiers_pour_5000_hab", "medecins_pour_10000_hab", "statut_infirmiers_oms"];
    const l = rows.map(q => { const e = q.eq!; return [q.quartier_id, q.nom, q.commune, q.population, fr(e.enfants, 0), e.ecoles, fr(e.enfants_par_ecole, 0), e.capacite, fr(e.couverture_edu, 2), e.ecoles_manquantes ?? "", statutLabel(e.statut_edu), fr(e.eps, 2), fr(e.hab_par_eps, 0), fr(e.couverture_san, 2), fr(e.eps_manquants, 2), statutLabel(e.statut_san), e.poste ?? "", fr(e.inf_ratio, 2), fr(e.med_ratio, 2), statutLabel(e.statut_inf)].map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"); });
    download("ratios_normes_quartiers_thies.csv", [h.join(";"), ...l].join("\n"));
  };

  return (
    <section className="gx-card eqp gx-in">
      <h3><GraduationCap size={15} /> Ratios, normes et équipements</h3>
      <div className="eqp-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "edu"} className={tab === "edu" ? "on" : ""} onClick={() => setTab("edu")}>Éducation</button>
        <button role="tab" aria-selected={tab === "san"} className={tab === "san" ? "on" : ""} onClick={() => setTab("san")}>Santé</button>
        <button role="tab" aria-selected={tab === "hyp"} className={tab === "hyp" ? "on" : ""} onClick={() => setTab("hyp")}>Hypothèses</button>
      </div>

      {tab === "edu" && <>
        <div className="eqp-box">
          <p><b>Norme utilisée.</b> Une école primaire accueille <b>{P.classesParEcole} classes × {P.elevesParClasse} élèves = {cap} élèves</b>. Les enfants de 6 à 11 ans sont estimés à <b>{fr(P.partEnfants * 100, 1)} %</b> de la population (hypothèse : le recensement fourni ne donne pas l'âge).</p>
        </div>
        <div className="eqp-kpis">
          <div className="eqp-kpi"><b>{fr(ville.enfants)}</b><small>enfants de 6-11 ans (estimés)</small></div>
          <div className="eqp-kpi"><b>{fr(ville.ecoles)}</b><small>écoles primaires{P.francoArabe ? " (franco-arabes comprises)" : ""}</small></div>
          <div className="eqp-kpi"><b>{fr(ville.ecoles ? ville.enfants / ville.ecoles : null)}</b><small>enfants par école (ville)</small></div>
          <div className="eqp-kpi"><b>{pct(ville.couvE)}</b><small>places disponibles ÷ enfants</small></div>
        </div>
        <h4>Par commune</h4>
        <table><thead><tr><th>Commune</th><th>Enfants</th><th>Écoles</th><th>Enf./école</th><th>Couv.</th></tr></thead><tbody>
          {comm.map(c => <tr key={c.nom}><td>{c.nom}</td><td>{fr(c.enfants)}</td><td>{c.ecoles}</td><td>{fr(c.ecoles ? c.enfants / c.ecoles : null)}</td><td>{pct(c.couvE)}</td></tr>)}
          <tr className="tot"><td>Ville</td><td>{fr(ville.enfants)}</td><td>{ville.ecoles}</td><td>{fr(ville.ecoles ? ville.enfants / ville.ecoles : null)}</td><td>{pct(ville.couvE)}</td></tr>
        </tbody></table>
        <h4>Quartiers par situation</h4>
        <div className="eqp-row">{nbStat(e => e.statut_edu).filter(x => x.n).map(x => <span key={x.s.key}><Chip s={x.s.key} /> {x.n}</span>)}</div>
        <h4>Écoles les plus manquantes</h4>
        <table><thead><tr><th>Quartier</th><th>Enfants</th><th>Écoles</th><th>Manque</th></tr></thead><tbody>
          {prioEdu.map(q => <tr key={q.quartier_id}><td>{q.nom}</td><td>{fr(q.eq!.enfants)}</td><td>{q.eq!.ecoles}</td><td>{q.eq!.ecoles_manquantes}</td></tr>)}
        </tbody></table>
        <p className="eqp-note">Les enfants ne vont pas forcément à l'école de leur quartier : la lecture par commune ou pour toute la ville est plus sûre. {D.hors_polygone.edu} équipements d'éducation sont hors des polygones de quartiers et ne sont pas comptés.</p>
      </>}

      {tab === "san" && <>
        <div className="eqp-box">
          <p><b>Normes de la carte sanitaire du Sénégal (mise à jour 2011).</b> Poste de santé urbain : <b>{fr(P.normePS)} habitants</b> (ancienne valeur 10 000) ; poste rural : 3 871 (ancienne valeur 5 000) ; centre de santé : 116 519 habitants. Thiès est urbaine : on retient {fr(P.normePS)}.</p>
          <p><b>Hôpitaux :</b> aucune norme en habitants dans ce document, et leur zone d'influence dépasse le quartier. Ils ne sont donc <b>pas</b> comptés dans les ratios par quartier (voir plus bas).</p>
        </div>
        <h4>Indicateur de synthèse : équivalents-poste de santé</h4>
        <p className="mut">On additionne les structures publiques et privées de proximité après les avoir pondérées selon leur fonction (hiérarchie des fonctions). Un poste de santé vaut 1 ; un centre de santé {fr(P.poids.cs, 1)} ; une clinique {fr(P.poids.clinique, 1)} ; un cabinet médical {fr(P.poids.cabinet, 2)}. Poids modifiables dans l'onglet Hypothèses.</p>
        <div className="eqp-kpis">
          <div className="eqp-kpi"><b>{fr(ville.eps, 1)}</b><small>équivalents-poste (ville)</small></div>
          <div className="eqp-kpi"><b>{fr(ville.pop / Math.max(ville.eps, 0.01))}</b><small>habitants par équivalent-poste</small></div>
          <div className="eqp-kpi"><b>{pct(ville.couvS)}</b><small>de la norme atteinte (ville)</small></div>
          <div className="eqp-kpi"><b>{fr(ville.epsManquants, 1)}</b><small>équivalents-poste manquants (somme des quartiers)</small></div>
        </div>
        <h4>Par commune</h4>
        <table><thead><tr><th>Commune</th><th>Habitants</th><th>Équiv.</th><th>Hab./éq.</th><th>Couv.</th></tr></thead><tbody>
          {comm.map(c => <tr key={c.nom}><td>{c.nom}</td><td>{fr(c.pop)}</td><td>{fr(c.eps, 1)}</td><td>{fr(c.eps ? c.pop / c.eps : null)}</td><td>{pct(c.couvS)}</td></tr>)}
        </tbody></table>
        <h4>Quartiers par situation</h4>
        <div className="eqp-row">{nbStat(e => e.statut_san).filter(x => x.n).map(x => <span key={x.s.key}><Chip s={x.s.key} /> {x.n}</span>)}</div>
        <h4>Les plus éloignés de la norme</h4>
        <table><thead><tr><th>Quartier</th><th>Habitants</th><th>Équiv.</th><th>Manque</th></tr></thead><tbody>
          {prioSan.map(q => <tr key={q.quartier_id}><td>{q.nom}</td><td>{fr(q.population)}</td><td>{fr(q.eq!.eps, 1)}</td><td>{fr(q.eq!.eps_manquants, 1)}</td></tr>)}
        </tbody></table>
        <h4>Hôpitaux : échelle de la ville</h4>
        <table><thead><tr><th>Hôpital</th><th>Type</th><th>Commune</th></tr></thead><tbody>
          {hop.map(h => <tr key={h.nom}><td>{tc(h.nom)}</td><td>{h.type.replace("Hôpital ", "")}</td><td>{tc(h.commune)}</td></tr>)}
        </tbody></table>
        <p className="mut">{hop.length} hôpitaux pour {fr(ville.pop)} habitants : environ {fr(ville.pop / Math.max(hop.length, 1))} habitants par hôpital. Leur zone d'influence couvre la ville, le département et la région.</p>
        <h4>Personnel des 28 postes publics (normes OMS)</h4>
        <p className="mut">Source : enquête du projet « maillage sanitaire de Thiès », population de l'aire administrative de chaque poste. Chaque quartier prend le ratio de son poste de rattachement.</p>
        <div className="eqp-kpis">
          <div className="eqp-kpi"><b>{totMed}</b><small>médecins · norme 1 pour {fr(P.normeMedecin)} · {okMed}/28 postes conformes</small></div>
          <div className="eqp-kpi"><b>{totInf}</b><small>infirmiers · norme 1 pour {fr(P.normeInfirmier)} · {okInf}/28 postes conformes</small></div>
          <div className="eqp-kpi"><b>{fr((totInf / popPostes) * P.normeInfirmier, 2)}</b><small>infirmiers pour {fr(P.normeInfirmier)} hab. (ensemble)</small></div>
          <div className="eqp-kpi"><b>{totTech}</b><small>techniciens supérieurs (norme supposée, voir Hypothèses)</small></div>
        </div>
        <table><thead><tr><th>Poste</th><th>Infirm.</th><th>Ratio</th><th>Manque</th></tr></thead><tbody>
          {[...postes].sort((a, b) => a.inf_ratio - b.inf_ratio).slice(0, 8).map(p => <tr key={p.nom}><td>{p.nom.replace(/^PS /, "")}</td><td>{p.infirmiers}</td><td>{fr(p.inf_ratio, 2)}</td><td>{p.manque_inf}</td></tr>)}
        </tbody></table>
        <p className="eqp-note">Huit postes les plus faibles en infirmiers. Le ratio est « infirmiers pour {fr(P.normeInfirmier)} habitants » : 1 ou plus = norme respectée. Les données publiques officielles (carte sanitaire, ministère) devraient remplacer cette enquête quand elles sont disponibles.</p>
      </>}

      {tab === "hyp" && <Hypotheses P={P} />}

      <div className="eqp-row">
        <button className="eqp-btn" onClick={csv}><Download size={13} /> Télécharger les ratios (CSV)</button>
      </div>
    </section>
  );
}

function Num({ v, on, step = 1, min = 0 }: { v: number; on: (n: number) => void; step?: number; min?: number }) {
  return <input type="number" value={Number.isFinite(v) ? v : 0} step={step} min={min} onChange={e => { const n = parseFloat(e.target.value); if (Number.isFinite(n) && n >= min) on(n); }} />;
}
function Hypotheses({ P }: { P: EquipParams }) {
  const set = (p: Partial<EquipParams>) => setParams({ ...P, ...p });
  return <>
    <p className="mut"><SlidersHorizontal size={12} /> Tout se recalcule dès qu'une valeur change. Ces choix sont à valider avec l'encadreur.</p>
    <h4>Éducation (primaire)</h4>
    <div className="eqp-sc">
      <label>Enfants de 6-11 ans (% de la population)</label><Num v={+(P.partEnfants * 100).toFixed(1)} step={0.5} on={n => set({ partEnfants: n / 100 })} />
      <small>Hypothèse. Au niveau national, les 0-14 ans représentent 39,1 % de la population (RGPH-5) ; 6 années d'âge sur 15, en ville, donnent environ 14 %. À remplacer par la valeur communale si elle est disponible.</small>
      <label>Élèves par classe</label><Num v={P.elevesParClasse} on={n => set({ elevesParClasse: n })} />
      <small>Standard de 48 élèves pour une classe normale à l'élémentaire (rapport d'analyse du secteur de l'éducation de base, JICA).</small>
      <label>Classes par école primaire</label><Num v={P.classesParEcole} on={n => set({ classesParEcole: n })} />
      <small>Six niveaux : CI, CP, CE1, CE2, CM1, CM2, une classe par niveau.</small>
      <label>Compter les écoles franco-arabes</label><input type="checkbox" checked={P.francoArabe} onChange={e => set({ francoArabe: e.target.checked })} />
      <small>Écoles élémentaires publiques et privées toujours comptées. Les écoles coraniques et arabes, jardins d'enfants et collèges ne le sont pas.</small>
    </div>
    <h4>Santé</h4>
    <div className="eqp-sc">
      <label>Habitants par poste de santé (urbain)</label><Num v={P.normePS} step={100} on={n => set({ normePS: n })} />
      <small>Carte sanitaire du Sénégal, mise à jour 2011 : 7 714 (urbain), 3 871 (rural).</small>
      <label>Médecin : habitants maximum</label><Num v={P.normeMedecin} step={500} on={n => set({ normeMedecin: n })} />
      <label>Infirmier : habitants maximum</label><Num v={P.normeInfirmier} step={500} on={n => set({ normeInfirmier: n })} />
      <label>Technicien supérieur : habitants maximum</label><Num v={P.normeTech} step={500} on={n => set({ normeTech: n })} />
      <small>Normes OMS reprises du classeur. Pour les techniciens supérieurs, il n'y a pas de norme OMS propre : valeur alignée sur les infirmiers (hypothèse).</small>
    </div>
    <h4>Poids des structures (équivalents-poste)</h4>
    <div className="eqp-sc">
      {POIDS_LABELS.map(l => <><label key={l.key}>{l.label}</label><Num v={P.poids[l.key]} step={0.25} on={n => set({ poids: { ...P.poids, [l.key]: n } })} /><small>{l.note}</small></>)}
    </div>
    <p className="mut">Ne comptent pas à l'échelle du quartier : {SANS_POIDS.join(", ").toLowerCase()}.</p>
    <div className="eqp-row"><button className="eqp-btn" onClick={resetParams}><RotateCcw size={13} /> Rétablir les valeurs par défaut</button></div>
    <HeartPulse size={0} />
  </>;
}

export function FicheEquip({ q }: { q: Row }) {
  const e = q.eq; const [P] = useEquipParams();
  if (!e) return null;
  return (
    <div className="eqp eqp-fiche">
      <h4>Ratios et normes</h4>
      <p><b>Primaire :</b> {fr(e.enfants)} enfants de 6-11 ans estimés, {e.ecoles} école{e.ecoles > 1 ? "s" : ""}{e.enfants_par_ecole ? ` (${fr(e.enfants_par_ecole)} enfants par école, norme ${capaciteEcole(P)})` : ""} <Chip s={e.statut_edu} /></p>
      <p><b>Santé :</b> {fr(e.eps, 1)} équivalent-poste{e.eps >= 2 ? "s" : ""} pour {fr(q.population)} habitants{e.hab_par_eps ? ` (${fr(e.hab_par_eps)} hab. par équivalent, norme ${fr(P.normePS)})` : ""} <Chip s={e.statut_san} /></p>
      {e.poste && <p><b>Personnel du poste ({e.poste.replace(/^PS /, "")}) :</b> {fr(e.inf_ratio, 2)} infirmier pour {fr(P.normeInfirmier)} hab. <Chip s={e.statut_inf} /></p>}
      {e.nb_hopitaux > 0 && <p className="mut">{e.nb_hopitaux} hôpital dans ce quartier : non compté (zone d'influence = toute la ville).</p>}
    </div>
  );
}

