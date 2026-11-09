import { useEffect, useMemo, useState } from "react";
import { Compass, Target, FlaskConical, Database, Gauge, Layers, AlertTriangle, Telescope, CheckCircle2, Clock, Map as MapIcon, BarChart3, Users, MapPin, Landmark, Building2, Grid3x3, Lightbulb, Gem, Quote, Crosshair, ArrowRight } from "lucide-react";
import { Reveal, Counter } from "./ui";
import { FAMILIES } from "./Cartotheque";
import "./Pages.css";
import "./HomeBlocks.css";
import "./About.css";
import { dataFetch } from "./api";

type CatalogItem = { id: string; name: string; description: string; source: string; scale: string; count: number; year: string; formats: string[]; kind: string };

const OBJECTIFS = [
  "Établir un profil socio-économique comparé des ménages des trois communes à partir des données disponibles.",
  "Caractériser les conditions d'habitat et les formes de différenciation résidentielle à l'échelle des communes et des quartiers.",
  "Inventorier, localiser et analyser la répartition des principaux équipements et services urbains retenus.",
  "Mesurer les différences d'accessibilité aux équipements et services à l'aide d'indicateurs spatiaux adaptés.",
  "Mettre en relation les différenciations observées avec l'histoire urbaine et les transformations institutionnelles de Thiès.",
];
const ETAPES = [
  ["Inventorier", "Recensement de toutes les couches fournies : quartiers, communes, 8 familles d'équipements, grille, réseau routier, indicateurs."],
  ["Harmoniser", "Reprojection UTM 28N → WGS 84 ; jointures vérifiées par identifiant de quartier, après contrôle des correspondances nom/commune."],
  ["Calculer", "Densités d'équipements (nombre ÷ surface), accessibilités sur grille de 200 m, indices ACP d'instruction et de richesse matérielle."],
  ["Classer", "Découpage de chaque indicateur en quatre groupes par quartiles, base commune de lecture des disparités."],
  ["Représenter", "Géoportail WebGIS, cartothèque, tableau de bord analytique : mêmes données, mêmes classes, partout."],
  ["Mesurer la ségrégation", "Gini, Theil, dissimilarité, indice de ségrégation, entropie, coefficients de localisation, Moran et LISA, puis classification des quartiers (KMO, ACP, K-means) : résultats validés, intégrés à l'application."],
];
const LIMITES = [
  "L'année de référence n'est pas précisée pour les couches d'équipements et d'accessibilité ; seule la population (RGPH-5) est millésimée 2023.",
  "Les indices d'accessibilité et les scores ACP sont affichés tels que fournis : l'application n'en rejoue pas le calcul.",
  "La couche source ne fournissait pas la densité Religion : elle est calculée ici (nombre ÷ surface), selon la même définition que les sept autres.",
  "L'exhaustivité des inventaires d'équipements n'est pas vérifiée : une absence signifie « non recensé dans la couche », pas nécessairement « inexistant ».",
  "Les classes par quartiles sont relatives à la distribution observée ; elles ne constituent pas des seuils normatifs.",
  "Les résultats de ségrégation sont ceux de l'analyse validée : la règle de découpage du réseau routier, la méthode de collecte de la mobilité et la superficie de Cité Senghor II restent à documenter ou vérifier.",
  "Les données d'enquête de terrain auprès des ménages ne sont pas intégrées à cette version.",
];
const PERSPECTIVES = [
  "Confronter les profils de quartiers et les clusters LISA aux entretiens institutionnels et à l'analyse historique.",
  "Confronter les indicateurs aux résultats des entretiens institutionnels et à l'analyse historique.",
  "Documenter l'année et la méthode de chaque couche d'accessibilité.",
  "Ajouter un assistant d'interprétation des cartes fondé exclusivement sur les données présentes.",
  "Ouvrir des points d'accès (API) pour la réutilisation des données.",
];

function OutlineMap({ quartiers }: { quartiers: any[] }) {
  const { paths, w, h } = useMemo(() => {
    const rings: number[][][] = [];
    quartiers.forEach(q => {
      const g = q?.geometry; if (!g) return;
      if (g.type === "Polygon") rings.push(g.coordinates[0]);
      else if (g.type === "MultiPolygon") g.coordinates.forEach((p: number[][][]) => rings.push(p[0]));
    });
    if (!rings.length) return { paths: [] as string[], w: 1, h: 1 };
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    rings.forEach(r => r.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
    const W = (x1 - x0) * k, H = y1 - y0, S = 600 / Math.max(W, H);
    return { w: W * S, h: H * S, paths: rings.map(r => "M" + r.map(([x, y]) => `${((x - x0) * k * S).toFixed(1)},${((y1 - y) * S).toFixed(1)}`).join("L") + "Z") };
  }, [quartiers]);
  if (!paths.length) return null;
  return (
    <svg className="ap-outline" viewBox={`-8 -8 ${w + 16} ${h + 16}`} role="img" aria-label="Contour des 65 quartiers de Thiès">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const VALEURS: [any, string, string, string][] = [
  [FlaskConical, "Rigueur scientifique", "Des données fiables et vérifiées", "#0891b2"],
  [MapPin, "Impact territorial", "Des analyses au service des citoyens", "#0d9488"],
  [Users, "Collaboration", "Avec les acteurs locaux et institutionnels", "#7c3aed"],
  [Lightbulb, "Innovation", "Des outils modernes pour un territoire durable", "#d97706"],
];

export default function About({ quartiers = [], navigate }: { quartiers?: any[]; navigate?: (p: string) => void }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  useEffect(() => { dataFetch("/data/datasets_catalog.json").then(r => r.json()).then(setCatalog).catch(() => {}); }, []);
  const stat = (id: string) => catalog.find(c => c.id === id)?.count ?? 0;

  return (
    <section className="ap-page">
      {/* ===== HERO ===== */}
      <header className="ap-hero">
        <div className="ap-hero-copy">
          <small className="hz-kicker"><i />À PROPOS</small>
          <h1>Comprendre aujourd'hui<br />pour <span>mieux aménager</span> demain.</h1>
          <p>Le <b>Géoportail de la commune de Thiès</b> est une plateforme géomatique qui permet d'explorer, d'analyser et de visualiser les dynamiques de ségrégation socio-spatiale dans la ville de Thiès. Il constitue un outil d'aide à la décision pour les acteurs publics, les chercheurs et les citoyens.</p>
          <ul className="ap-feats">
            <li><span><MapIcon /></span>Données géospatiales<br />et statistiques</li>
            <li><span><BarChart3 /></span>Analyse des inégalités<br />socio-spatiales</li>
            <li><span><Users /></span>Une ville plus inclusive<br />et durable</li>
          </ul>
        </div>
        <div className="ap-hero-visual">
          <div className="ap-hero-photo" />
          <OutlineMap quartiers={quartiers} />
          <span className="ap-hero-tag">Une ville, plusieurs réalités</span>
          <div className="ap-loc"><span><MapPin /></span><div><b>Thiès</b><small>Région de Thiès, Sénégal</small></div></div>
        </div>
      </header>

      <div className="ap-grid">
        {/* ===== MISSION ===== */}
        <article className="ap-card ap-mission">
          <div className="ap-mission-copy">
            <span className="ap-ic"><Crosshair /></span>
            <h2>Notre mission</h2>
            <p>Fournir des données géospatiales fiables et des outils d'analyse performants pour mieux comprendre les dynamiques territoriales et contribuer à une planification urbaine plus équitable et durable.</p>
            <i className="ap-bar" />
          </div>
          <div className="ap-mission-photo" />
          <b className="ap-num">01</b>
        </article>

        {/* ===== CHIFFRES ===== */}
        <article className="ap-card ap-figures">
          <h2><span className="ap-ic sm"><BarChart3 /></span>Quelques chiffres clés</h2>
          <div className="ap-fig-grid">
            {[[Layers, quartiers.length || stat("quartiers") || 65, "quartiers analysés"], [Landmark, 3, "communes"], [Building2, 8, "familles d'équipements"], [Grid3x3, stat("grille") || 2170, "cellules d'accessibilité"]].map(([Ic, v, l], i) => {
              const I = Ic as any; return <div key={i}><span className="ap-ic"><I /></span><div><strong><Counter value={v as number} /></strong><small>{l as string}</small></div></div>;
            })}
          </div>
        </article>
      </div>

      {/* ===== VISION / VALEURS / CITATION ===== */}
      <div className="ap-grid ap-grid-3">
        <article className="ap-card ap-vision">
          <small className="hz-kicker"><i />NOTRE VISION</small>
          <h2>Une ville plus équitable<br />et mieux connectée.</h2>
          <i className="ap-bar" />
          <p>Nous aspirons à une ville de Thiès où chaque quartier bénéficie des mêmes opportunités d'accès aux services, aux infrastructures et aux équipements.</p>
        </article>
        <article className="ap-card ap-values">
          <h2><span className="ap-ic sm"><Gem /></span>Nos valeurs</h2>
          <div className="ap-val-grid">
            {VALEURS.map(([Ic, t, d, c]) => { const I = Ic; return <div key={t} style={{ ["--c" as any]: c }}><span className="ap-ic"><I /></span><div><b>{t}</b><small>{d}</small></div></div>; })}
          </div>
        </article>
        <article className="ap-card ap-quote">
          <div className="ap-quote-copy">
            <Quote className="ap-q" />
            <blockquote>La géomatique n'est pas seulement une technologie, c'est un levier pour une ville plus juste et plus résiliente.</blockquote>
            <i className="ap-bar" />
            <small>Géoportail de Thiès</small>
          </div>
          <div className="ap-quote-photo" />
        </article>
      </div>

      <div className="ap-more-head"><small className="hz-kicker"><i />EN DÉTAIL</small><h2>Problématique, méthode, données et limites</h2><p>Ce qui suit documente l'étude : on y trouve aussi bien ce que mesurent les données que ce qu'elles ne permettent pas encore d'affirmer.</p><button className="hz-btn" onClick={() => navigate?.("/geoportail")}>Ouvrir le Géoportail <ArrowRight size={14} /></button></div>

      <div className="about-body">
        <Reveal><section className="ab-section">
          <div className="ab-label"><Compass size={18} /><span>01</span><b>Problématique</b></div>
          <div className="ab-content">
            <blockquote>Dans quelle mesure les communes de Thiès Nord, Thiès Est et Thiès Ouest présentent-elles des différenciations socio-spatiales mesurables, notamment en matière de caractéristiques des ménages, d'habitat et d'accès aux équipements et services urbains, et quels processus historiques et institutionnels peuvent contribuer à expliquer ces différenciations ?</blockquote>
            <p>Née du rail, structurée par les lotissements successifs, Thiès juxtapose des quartiers d'origines très différentes. La plateforme n'affirme pas qu'une commune est « favorisée » : elle donne à voir, indicateur par indicateur, ce que mesurent les données.</p>
          </div>
        </section></Reveal>

        <Reveal><section className="ab-section">
          <div className="ab-label"><Target size={18} /><span>02</span><b>Objectifs</b></div>
          <div className="ab-content">
            <p className="ab-lead"><b>Objectif général —</b> analyser les différenciations socio-spatiales à Thiès par une comparaison des trois communes, en caractérisant leurs manifestations actuelles et en en examinant les déterminants historiques et institutionnels.</p>
            <ol className="ab-objectifs">{OBJECTIFS.map((o, i) => <li key={i}><span>{i + 1}</span><p>{o}</p></li>)}</ol>
          </div>
        </section></Reveal>

        <Reveal><section className="ab-section">
          <div className="ab-label"><FlaskConical size={18} /><span>03</span><b>Méthodologie</b></div>
          <div className="ab-content ab-steps">
            {ETAPES.map(([t, d], i) => (
              <div className={`ab-step ${i === ETAPES.length - 1 ? "pending" : ""}`} key={t}>
                <span className="ab-step-n">{i === ETAPES.length - 1 ? <Clock size={14} /> : <CheckCircle2 size={14} />}</span>
                <div><b>{t}</b><p>{d}</p></div>
              </div>
            ))}
          </div>
        </section></Reveal>

        <Reveal><section className="ab-section">
          <div className="ab-label"><Database size={18} /><span>04</span><b>Données</b></div>
          <div className="ab-content">
            <div className="ab-table">
              <div className="ab-row head"><span>Jeu de données</span><span>Échelle</span><span>Entités</span><span>Source</span></div>
              {catalog.map(c => <div className="ab-row" key={c.id}><span><b>{c.name}</b></span><span>{c.scale}</span><span>{c.count.toLocaleString("fr-FR")}</span><span>{c.source}</span></div>)}
              {!catalog.length && <div className="ab-row"><span>Chargement du catalogue…</span></div>}
            </div>
          </div>
        </section></Reveal>

        <Reveal><section className="ab-section">
          <div className="ab-label"><Gauge size={18} /><span>05</span><b>Indicateurs</b></div>
          <div className="ab-content ab-families">
            {(Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]).map(k => (
              <div key={k} style={{ ["--c" as any]: FAMILIES[k].color }}><i /><b>{FAMILIES[k].label}</b>
                <p>{{
                  socio: "Population et densité de population par quartier (RGPH-5, ANSD, 2023).",
                  densite: "Nombre d'équipements par km² pour huit familles : santé, éducation, commerce, sport, religion, transport, banque, assurance.",
                  access: "Neuf indices (huit familles + globale) et l'accessibilité routière, calculés sur la grille de 200 m.",
                  eco: "Indices ACP d'instruction et de richesse matérielle (indice corrigé, validé).",
                  segreg: "Offre d'infrastructures, coefficients de localisation, mobilité (flux, attractivité), clusters LISA et profils de quartiers (résultats validés).",
                }[k]}</p></div>
            ))}
          </div>
        </section></Reveal>

        <Reveal><section className="ab-section">
          <div className="ab-label"><Layers size={18} /><span>06</span><b>Analyses spatiales</b></div>
          <div className="ab-content"><p>Cartes choroplèthes classées par quartiers, représentation des accessibilités sur grille (sans les réduire à des centroïdes), regroupement des points d'équipements, comparaisons inter-communes, distributions statistiques. Les analyses d'autocorrélation et de ségrégation viendront compléter ce socle.</p></div>
        </section></Reveal>

        <Reveal><section className="ab-section warn">
          <div className="ab-label"><AlertTriangle size={18} /><span>07</span><b>Limites</b></div>
          <div className="ab-content"><ul className="ab-list">{LIMITES.map(l => <li key={l}>{l}</li>)}</ul></div>
        </section></Reveal>

        <Reveal><section className="ab-section">
          <div className="ab-label"><Telescope size={18} /><span>08</span><b>Perspectives</b></div>
          <div className="ab-content"><ul className="ab-list good">{PERSPECTIVES.map(l => <li key={l}>{l}</li>)}</ul></div>
        </section></Reveal>

        <Reveal><footer className="ab-credit"><b>Réalisation</b><span>Mouhamed Oumar Sissokho Sy • Abdoul Aziz Dione</span><small>Projet de fin de cycle — Licence Géomatique, UFR SI</small></footer></Reveal>
      </div>
    </section>
  );
}
