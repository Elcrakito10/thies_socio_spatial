import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import {
  ArrowRight, BarChart3, Bell, Building2, Database,
  Map, Menu, Moon,
  Search, Sun, Users, X, Activity, Upload, Settings2,
  House, Library, History, Info
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import { ThemeCtx } from "./ui";
import "./App.css";
import Geoportail, { type QuartierFull } from "./Geoportail";
import { useQuartiersEquip } from "./equip";
import Cartotheque from "./Cartotheque";
import Profile from "./Profile";
import SegregationResults from "./Segregation";
import HomeHero from "./HomeHero";
import HomeSections from "./HomeSections";
import About from "./About";
import Histoire from "./Histoire";
import Donnees from "./Donnees";
import "./Theme.css";
import "./Navbar.css";
import "./Wide.css";
import Assistant from "./Assistant";
import { assistantStore } from "./assistant/store";
import { dataFetch, dataSource, onDataSource, type DataSource } from "./api";

// Le type Quartier regroupe desormais l'ensemble des indicateurs du nouveau
// referentiel (densites, accessibilites, ACP instruction/niveau de vie),
// tel que produit par le pipeline de donnees (voir Geoportail.tsx).
// "annee" est ajoute a la volee au chargement : toutes les donnees du
// referentiel actuel portent sur le millesime 2023.
type Quartier = QuartierFull & { annee: number };

type CensusSummary = {
  annee: number; localites_recensees: number; population: number; menages: number;
  hommes: number; femmes: number;
  par_commune: Record<string, {population:number; menages:number; hommes:number; femmes:number}>;
};

type GeoFeatureCollection = { type: "FeatureCollection"; features: any[] };

const navItems = [
  ["Accueil", "/"], ["Cartothèque", "/cartotheque"], ["Géoportail", "/geoportail"],
  ["Tableau de bord", "/dashboard"], ["Ségrégation", "/segregation"], ["Histoire", "/histoire"],
  ["Données", "/donnees"], ["À propos", "/apropos"]
] as const;

// Auteurs du projet : photos dans public/images/equipe/ (échanger les deux entrées pour inverser l'ordre).
const TEAM = [
  { name: "Abdoul Aziz Dione", role: "Auteur", photo: "/images/equipe/membre1.webp" },
  { name: "Mouhamed Oumar Sissokho Sy", role: "Auteur", photo: "/images/equipe/membre2.webp" },
];
const NAV_ICONS: Record<string, any> = {
  "/": House, "/cartotheque": Library, "/geoportail": Map, "/dashboard": BarChart3,
  "/segregation": Activity, "/histoire": History, "/donnees": Database, "/apropos": Info,
};



function getRoute() {
  let p = window.location.pathname.replace(/\/+$/, "");
  if (p === "/analyses") { p = "/segregation"; window.history.replaceState({}, "", p); }   // ancienne adresse de la page
  return p || "/";
}

function downloadQuartiersCSV(list: Quartier[]) {
  const header = "quartier_id;nom;commune;surface_km2;population;menages;hommes;femmes;"
    + "dens_sante;dens_education;dens_commerce;dens_sport;dens_transport;dens_banque;dens_assurance;"
    + "acc_sante;acc_education;acc_commerce;acc_sport;acc_transport;acc_banque;acc_assurance;acc_religion;acc_globale;"
    + "acc_routiere_indice;ind_instruction_0_1;ind_niveau_vie_0_1;offre_infra_0_1;indice_attractivite;flux_emis;flux_recus;classe;nom_classe;"
    + "LISA_instruction;LISA_niveau_vie;LISA_offre_infra;LISA_acces_global\n";
  const rows = list.map(q => [
    q.quartier_id, q.nom, q.commune ?? "", q.surface_km2, q.population, q.menages, q.hommes, q.femmes,
    q.dens_sante, q.dens_education, q.dens_commerce, q.dens_sport, q.dens_transport, q.dens_banque, q.dens_assurance,
    q.acc_sante, q.acc_education, q.acc_commerce, q.acc_sport, q.acc_transport, q.acc_banque, q.acc_assurance, q.acc_religion, q.acc_globale,
    q.acc_routiere_indice, q.ind_instruction_0_1, q.ind_niveau_vie_0_1,
    q.offre_infra_0_1, q.indice_attractivite, q.flux_emis, q.flux_recus, q.classe, q.nom_classe,
    q.LISA_instruction_0_1, q.LISA_niveau_vie_0_1_corrige, q.LISA_offre_infra_0_1, q.LISA_acces_global_moyen_0_1,
  ].map(v => (v === null || v === undefined ? "" : v)).join(";")).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "quartiers_thies.csv"; a.click();
  URL.revokeObjectURL(url);
}


function App() {
  const [route, setRoute] = useState(getRoute());
  const [quartiersRaw, setQuartiers] = useState<Quartier[]>([]);
  const quartiers = useQuartiersEquip(quartiersRaw) as Quartier[];
  const [loading, setLoading] = useState(true);
  const [census, setCensus] = useState<CensusSummary | null>(null);
  const [communeGeo, setCommuneGeo] = useState<GeoFeatureCollection | null>(null);
  const [dark, setDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileQuartier, setProfileQuartier] = useState<Quartier | null>(null);

  useEffect(() => { assistantStore.setRoute(route); }, [route]);

  useEffect(() => {
    const onPop = () => { setRoute(getRoute()); window.scrollTo(0, 0); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    // Le nouveau referentiel (quartiers_thies.geojson) porte deja, pour chaque
    // quartier, l'integralite des attributs verifies par le pipeline de donnees
    // (densites, accessibilites, indices ACP, population ANSD) : plus besoin de
    // fusionner avec une API externe. "annee" est fixe a 2023, millesime unique
    // de l'ensemble de ce referentiel.
    Promise.all([
      dataFetch("/data/quartiers_thies.geojson").then(r => r.json()),
      dataFetch("/data/communes_thies.geojson").then(r => r.json()),
      dataFetch("/data/census_summary.json").then(r => r.json()),
    ])
      .then(([localQuartiers, communes, censusData]) => {
        const rows: Quartier[] = localQuartiers.features.map((f: any) => ({
          ...(f.properties as QuartierFull), geometry: f.geometry, annee: 2023,
        }));
        setQuartiers(rows); setCommuneGeo(communes); setCensus(censusData);
      })
      .finally(() => setLoading(false));
  }, []);

  const navigate = (path: string) => {
    if (path !== window.location.pathname) window.history.pushState({}, "", path);
    setRoute(path); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Indicateur a afficher a l'ouverture du Geoportail (bouton "Explorer" de la Cartotheque / de l'accueil)
  const [geoIndicator, setGeoIndicator] = useState<string>("none");
  const exploreIndicator = (id: string) => { setGeoIndicator(id); navigate("/geoportail"); };

  const openProfile = (q: Quartier) => { setProfileQuartier(q); navigate("/territoire"); };

  return (
    <ThemeCtx.Provider value={dark}>
    <div className={`app ${dark ? "dark" : "light"}`}>
      <header className="navbar">
        <button className="brand" onClick={() => navigate("/")} aria-label="Accueil">
          <span className="brand-logo" aria-hidden>
            <svg viewBox="0 0 48 48" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="24" cy="24" r="19"/><ellipse cx="24" cy="24" rx="8" ry="19"/><path d="M5 24h38M8.5 14h31M8.5 34h31"/>
              <path d="M24 12c-4 0-6.5 3-6.5 6.5 0 4.6 6.5 11 6.5 11s6.5-6.4 6.5-11C30.5 15 28 12 24 12Z" fill="#0b2a4a" stroke="#22d3ee"/><circle cx="24" cy="18.5" r="2.2" fill="#22d3ee" stroke="none"/>
            </svg>
          </span>
          <span className="brand-copy"><strong>THIÈS</strong><small>GéoPortail</small></span>
          <span className="brand-sep" aria-hidden/>
          <span className="brand-tag">SÉGRÉGATION<br/>SOCIO-SPATIALE</span>
        </button>

        <nav className={`nav-links ${menuOpen ? "open" : ""}`}>
          {navItems.map(([label, path]) => { const Ic = NAV_ICONS[path]; return (
            <button key={path} className={route === path ? "active" : ""} onClick={() => navigate(path)}><Ic size={22}/><span>{label}</span></button>
          ); })}
        </nav>

        <div className="nav-right">
          <div className="nav-search">
            <Search size={17}/>
            <input value={search} onChange={e => setSearch(e.target.value)} aria-label="Rechercher un quartier"
              onKeyDown={e => e.key === "Enter" && navigate("/geoportail")} placeholder="Rechercher un quartier, une infrastructure..."/>
            <kbd>⌘K</kbd>
          </div>
          <button className={`icon-button theme-btn ${dark ? "is-dark" : "is-light"}`} onClick={() => setDark(v => !v)} title="Mode clair / sombre" aria-label="Changer de thème">{dark ? <Sun/> : <Moon/>}</button>
          <div className="notif-wrap desktop-only">
            <button className="icon-button bell-btn" onClick={() => setNotifOpen(v => !v)} title="Notifications" aria-label="Notifications"><Bell/></button>
            {notifOpen && <div className="notif-drop">
              <strong>Notifications</strong>
              <p>Aucune nouvelle alerte pour le moment. Les mises à jour de données apparaîtront ici.</p>
            </div>}
          </div>
          <div className="team-avatars desktop-only" aria-label="Auteurs du projet">
            {TEAM.map(m => <button key={m.name} className="team-avatar" title={`${m.name} — ${m.role}`} aria-label={`${m.name}, ${m.role}`} onClick={() => navigate("/apropos")}><img src={m.photo} alt={m.name} width={46} height={46} /></button>)}
          </div>
          <button className="mobile-button" onClick={() => setMenuOpen(v => !v)} aria-label="Menu">{menuOpen ? <X/> : <Menu/>}</button>
        </div>
      </header>

      {loading && <div className="global-loading-bar"/>}
      <main onClick={() => notifOpen && setNotifOpen(false)}>
        {route === "/" && <HomePage navigate={navigate} population={census?.population ?? 0} quartiers={quartiers.length} data={quartiers} onExplore={exploreIndicator} communeGeo={communeGeo}/>}
        {route === "/cartotheque" && <Cartotheque quartiers={quartiers} onExplore={exploreIndicator}/>}
        {route === "/geoportail" && <Geoportail key={geoIndicator} initialIndicator={geoIndicator} quartiers={quartiers} communeGeo={communeGeo} onOpenProfile={openProfile} onExportCSV={() => downloadQuartiersCSV(quartiers)} census={census} navigate={navigate} search={search}/>}
        {route === "/dashboard" && <Dashboard quartiers={quartiers} census={census}/>}
        {route === "/segregation" && <SegregationResults quartiers={quartiers as any} navigate={navigate}/>}
        {route === "/histoire" && <Histoire quartiers={quartiers as any} navigate={navigate}/>}
        {route === "/territoire" && <Profile quartier={profileQuartier} allQuartiers={quartiers} census={census} navigate={navigate}/>}
        {route === "/donnees" && <Donnees quartiers={quartiers as any} census={census as any} navigate={navigate}/>}
        {route === "/apropos" && <About quartiers={quartiers as any} navigate={navigate}/>}
        {route === "/administration" && <AdminPage/>}
      </main>

      <Footer navigate={navigate}/>
    <Assistant quartiers={quartiers as any} census={census}/>
    </div>
    </ThemeCtx.Provider>
  );
}

function HomePage({navigate, population, quartiers, data, onExplore, communeGeo}:{navigate:(p:string)=>void; population:number; quartiers:number; data:Quartier[]; onExplore:(id:string)=>void; communeGeo:any}) {
  return <div className="home">
    <HomeHero navigate={navigate} population={population} quartiers={quartiers} communeGeo={communeGeo} onScrollDown={() => document.getElementById("home-intro")?.scrollIntoView({behavior:"smooth"})}/>

    <section id="home-intro" className="home-intro split-section">
      <div><Eyebrow text="LE PROJET"/><h2>Une lecture spatiale<br/><span>des inégalités.</span></h2><p>Cette plateforme accompagne l'analyse de la ségrégation socio-spatiale dans la ville de Thiès. Elle met en relation territoire, population, habitat, économie et accès aux équipements.</p><button className="outline-button" onClick={() => navigate("/apropos")}>Comprendre l'étude <ArrowRight size={15}/></button></div>
      <div className="intro-visual"><div className="visual-photo"/><div className="floating-note"><span>4 DIMENSIONS</span><b>Population • Habitat<br/>Économie • Accessibilité</b></div></div>
    </section>

    <HomeSections quartiers={data} navigate={navigate} onExplore={onExplore}/>

  </div>;
}


function AdminPage(){return <section className="tool-page">
    <div className="tool-heading"><div><Eyebrow text="ADMINISTRATION"/><h1>Piloter les<br/><span>données.</span></h1><p>Espace de gestion préparé pour l'import, le suivi des sources et la maintenance de la base spatiale.</p></div></div>
    <div className="tool-content admin-grid">
      <div className="upload-card"><Upload/><h3>Importer une donnée</h3><p>GeoJSON, CSV, XLSX ou couche spatiale.</p><button className="primary-button"><Upload size={15}/> Sélectionner un fichier</button></div>
      <div className="admin-list"><div className="side-title"><Settings2/> Sources récentes</div><AdminRow name="Quartiers Thiès" type="SHP" status="Actif"/><AdminRow name="Recensement 2023 (ANSD)" type="XLSX" status="Actif"/></div>
    </div>
  </section>}


function SourceBadge(){
  const [s,setS]=useState<DataSource|null>(dataSource());
  useEffect(()=>onDataSource(setS),[]);
  if(!s) return null;
  return <span className={`src-badge ${s}`} title={s==="api"?"Les données sont lues depuis la base PostGIS via l'API.":"L'API n'est pas joignable : les données sont lues depuis les fichiers du projet."}>● Données : {s==="api"?"base PostGIS (API)":"fichiers locaux"}</span>;
}
function Footer({navigate}:{navigate:(p:string)=>void}){return <footer className="footer">
    <div className="footer-top">
      <div className="footer-brand"><strong>THIÈS</strong><span>SÉGRÉGATION SOCIO-SPATIALE</span></div>
      <p className="footer-tagline">Observer aujourd'hui pour mieux aménager demain.</p>
      <div className="footer-links"><button onClick={()=>navigate("/histoire")}>Histoire</button><button onClick={()=>navigate("/dashboard")}>Tableau de bord</button><button onClick={()=>navigate("/donnees")}>Données</button><button onClick={()=>navigate("/apropos")}>À propos</button><button onClick={()=>navigate("/administration")}>Administration</button></div>
    </div>
    <div className="footer-badges">
      <SourceBadge/>
      <span><Map size={13}/> Géomatique</span>
      <span><Activity size={13}/> Analyse spatiale</span>
      <span><Building2 size={13}/> Développement durable</span>
      <span><Users size={13}/> Inclusion sociale</span>
    </div>
    <small>L3 Géomatique • 2026</small>
  </footer>}
function Eyebrow({text}:{text:string}){return <div className="eyebrow"><i/>{text}</div>}
function AdminRow({name,type,status}:{name:string;type:string;status:string}){return <div className="admin-row"><div><strong>{name}</strong><small>{type}</small></div><b>{status}</b></div>}

export default App;
