import { useEffect, useMemo, useState } from "react";
import { ArrowRight, TrainFront, Landmark, Scale, Users, GraduationCap, Building2, MapPinned, Quote, ExternalLink, ChevronDown, Flame, Route as RouteIcon, ShieldAlert, BookOpen } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot } from "recharts";
import { Reveal, Counter } from "./ui";
import type { QuartierFull } from "./Geoportail";
import "./Histoire.css";

type QGeo = QuartierFull & { geometry: any };

/* ============================================================
   DONNEES HISTORIQUES — chaque element est rattache a une source
   (S1 Wikipedia Thies • S2 Massacre de Thies • S3 Gare de Thies
    S4 Le Soleil 2026 • S5 base du projet / RGPH-5)
   ============================================================ */
type Cat = "rail" | "urbain" | "social" | "institution" | "demo" | "admin" | "colonial";
const CATS: Record<Cat, { label: string; color: string }> = {
  rail: { label: "Chemin de fer", color: "#0369a1" },
  urbain: { label: "Fait urbain", color: "#c2410c" },
  social: { label: "Luttes sociales", color: "#be123c" },
  institution: { label: "Institutions & savoirs", color: "#6d28d9" },
  demo: { label: "Population", color: "#0f766e" },
  admin: { label: "Administration", color: "#a16207" },
  colonial: { label: "Fait colonial", color: "#57534e" },
};

type Ev = { y: string; t: string; d: string; cat: Cat; s: string; more?: string };
const EVENTS: Ev[] = [
  { y: "XVIIe s.", t: "Dianxène, village du Cayor", cat: "urbain", s: "S1", d: "Le village de Dianxène, rattaché au Cayor, est fondé grâce à une nappe phréatique accessible par puits. Il se trouve au carrefour de cinq pistes.", more: "Avant la colonisation, le plateau de Thiès forme une barrière boisée entre les royaumes du Cayor et du Baol ; il abrite les Sérères-Noon." },
  { y: "1860", t: "75 habitants", cat: "demo", s: "S1", d: "Le village de Dianxène ne compte que 75 habitants : le point de départ démographique de la ville actuelle." },
  { y: "12 mai 1862", t: "Le village est incendié", cat: "colonial", s: "S1", d: "Le village est incendié par Pinet-Laprade, dans le contexte de la conquête coloniale du Cayor." },
  { y: "1863", t: "Un poste militaire français", cat: "colonial", s: "S1", d: "Les Français érigent un poste militaire à Thiès : première étape de structuration administrative du site." },
  { y: "1881–1885", t: "Dakar–Saint-Louis, la première ligne de l'AOF", cat: "rail", s: "S1·S4", d: "La ligne Dakar–Saint-Louis est construite entre 1881 et 1885. Inaugurée en 1885, avec un arrêt à Thiès, elle est la première de ce type en Afrique-Occidentale française.", more: "Avant le chemin de fer, Thiès ne compte que « quelques centaines de personnes », réparties dans des quartiers traditionnels qui sont en fait des villages (Le Soleil, 2026)." },
  { y: "vers 1885", t: "La mission des spiritains", cat: "institution", s: "S1", d: "Les spiritains fondent une mission à Thiès, pour protéger la population des razzias mauritaniennes." },
  { y: "1890", t: "1 200 habitants et 20 000 t d'arachide", cat: "rail", s: "S1", d: "Dès 1890, la gare exporte 20 000 tonnes d'arachide. La population est alors de 1 200 habitants : Thiès devient une place de commerce de l'arachide." },
  { y: "1904", t: "Thiès devient commune", cat: "admin", s: "S1", d: "L'administration coloniale institue la commune de Thiès." },
  { y: "1907", t: "Début de la ligne Thiès–Kayes", cat: "rail", s: "S1", d: "La construction de la ligne vers Kayes (Dakar–Niger) commence : Thiès se prépare à devenir le grand carrefour de l'AOF occidentale." },
  { y: "1911", t: "La peste déplace le quartier indigène", cat: "urbain", s: "S1", d: "Après une épidémie de peste, le quartier « indigène » est déplacé hors de la zone commerciale. Il est rebaptisé Randoulène.", more: "Dans la base du projet, deux quartiers portent ce nom : Randoulène Nord et Randoulène Sud (Grand Thiès), tous deux en commune de Thiès Ouest." },
  { y: "1914", t: "Camp de formation de tirailleurs", cat: "colonial", s: "S1", d: "Un camp de formation de tirailleurs s'installe à Thiès. La ville compte alors 2 400 habitants." },
  { y: "1923", t: "Thiès–Kayes achevée, ateliers ferroviaires", cat: "rail", s: "S1", d: "La liaison Thiès–Kayes est achevée et de grands ateliers de réparation s'installent : Thiès devient une ville ouvrière." },
  { y: "1929", t: "13 000 habitants", cat: "demo", s: "S1", d: "En huit ans, la population est passée de 3 000 (1921) à 13 000 habitants : plus de quatre fois plus." },
  { y: "1934", t: "Le siège du Dakar–Niger à Thiès", cat: "rail", s: "S1", d: "Le siège du Dakar–Niger et les ateliers ferroviaires de Dakar sont transférés à Thiès. Bureaux et ateliers sont regroupés dans la « cité Ballabey ».", more: "La cité Ballabey est aussi appelée « DVF » — derrière la voie ferrée : le rail devient une ligne de démarcation de la ville (Le Soleil, 2026)." },
  { y: "juin–sept. 1938", t: "La grève des cheminots", cat: "social", s: "S2", d: "De l'attroupement du 20 juin à la grève du 28 septembre : première grève de masse des colonies françaises d'Afrique, qui se termine par un massacre (6 morts)." },
  { y: "1939", t: "22 000 habitants, dont 1 200 Européens", cat: "demo", s: "S1", d: "Environ 5 % de la population est européenne : une société urbaine très inégalement composée." },
  { y: "1940", t: "Une base aérienne", cat: "colonial", s: "S1", d: "Une base aérienne est installée à Thiès." },
  { y: "1943", t: "8 617 employés au Dakar–Niger", cat: "social", s: "S2", d: "Le DN emploie 8 617 personnes, dont 7 500 sans statut de cheminot (auxiliaires ou journaliers) : environ 87 % des effectifs." },
  { y: "1945–1948", t: "Les grandes grèves générales", cat: "social", s: "S1", d: "Thiès joue un rôle important dans les grèves générales de 1945-1946 et 1947-1948." },
  { y: "1956", t: "Senghor maire de Thiès", cat: "admin", s: "S1", d: "Léopold Sédar Senghor devient maire de Thiès." },
  { y: "1966", t: "La tapisserie de Thiès", cat: "institution", s: "S1", d: "Les Manufactures sénégalaises des arts décoratifs, spécialisées dans la tapisserie, s'implantent à l'initiative de Senghor. La ville compte 72 400 habitants." },
  { y: "1969", t: "Création du diocèse", cat: "institution", s: "S1", d: "Le diocèse de Thiès est créé par démembrement de celui de Dakar." },
  { y: "1973", t: "L'École polytechnique de Thiès", cat: "institution", s: "S1", d: "Création de l'École polytechnique de Thiès, à l'initiative de Senghor.", more: "Dans la base du projet, l'emprise « EPT (École polytechnique de Thiès) » est un quartier de la commune de Thiès Nord de 25,4 km², le plus vaste de la couche." },
  { y: "1988", t: "177 253 habitants", cat: "demo", s: "S1", d: "La population a été multipliée par 2,4 en vingt-deux ans." },
  { y: "début années 1990", t: "L'apogée de l'activité ferroviaire", cat: "rail", s: "S4", d: "Selon un ancien cadre du chemin de fer, l'activité culmine au début des années 1990 ; l'entreprise employait près de 3 500 personnes, dont 1 000 ouvriers dans les grands centres de maintenance." },
  { y: "1995", t: "Le musée régional dans le fort", cat: "institution", s: "S1", d: "Inauguration du musée régional, installé dans le fort de Thiès." },
  { y: "2002", t: "237 849 habitants (commune)", cat: "demo", s: "S1", d: "Population de la commune de Thiès au recensement de 2002." },
  { y: "2007", t: "L'Université de Thiès", cat: "institution", s: "S1", d: "Ouverture de l'Université de Thiès." },
  { y: "Nov. 2008", t: "Trois communes d'arrondissement", cat: "admin", s: "S1", d: "Le décret n° 2008-1344 crée les communes d'arrondissement de Thiès Est, Thiès Ouest et Thiès Nord : le découpage même de cette étude.", more: "Thiès est chef-lieu du département et de la région du même nom." },
  { y: "2023", t: "RGPH-5 : la base du projet", cat: "demo", s: "S5", d: "Les populations de quartiers utilisées dans ce projet proviennent du recensement RGPH-5 (ANSD, 2023)." },
  { y: "28 fév. 2024", t: "Le train revient", cat: "rail", s: "S1·S3", d: "Réouverture du transport de voyageurs entre Thiès et la gare TER de Diamniadio, après la remise en état de la gare de Thiès, portée par Grands Trains du Sénégal (GTS)." },
];

export const POP = [
  { y: 1860, v: 75, n: "Dianxène" }, { y: 1890, v: 1200, n: "Arrivée du rail" }, { y: 1914, v: 2400, n: "" }, { y: 1921, v: 3000, n: "" },
  { y: 1929, v: 13000, n: "Ateliers ferroviaires" }, { y: 1936, v: 15000, n: "« un peu plus de 15 000 »" }, { y: 1939, v: 22000, n: "dont 1 200 Européens" },
  { y: 1953, v: 40000, n: "36 650 au recensement de la commune mixte" }, { y: 1966, v: 72400, n: "" }, { y: 1988, v: 177253, n: "" },
  { y: 2002, v: 237849, n: "Commune" }, { y: 2022, v: 274009, n: "2021-2022" },
];

const SOURCES = [
  { id: "S1", label: "Wikipédia — Thiès", url: "https://fr.wikipedia.org/wiki/Thi%C3%A8s", note: "Origines, rail, population, institutions, découpage 2008" },
  { id: "S2", label: "Wikipédia — Massacre de Thiès", url: "https://fr.wikipedia.org/wiki/Massacre_de_Thi%C3%A8s", note: "Déroulement et bilan de la grève de 1938 ; bibliographie savante" },
  { id: "S3", label: "Wikipédia — Gare de Thiès", url: "https://fr.wikipedia.org/wiki/Gare_de_Thi%C3%A8s", note: "Jalons de la gare, réhabilitation 2024" },
  { id: "S4", label: "Le Soleil — « Benn Deuk, Ñaari Garr »", url: "https://lesoleil.sn/actualites/economie/benn-deuk-naari-garr-comment-le-chemin-de-fer-a-faconne-lhistoire-de-thies/", note: "Cité Ballabey, DVF, effectifs ferroviaires (témoignage d'un ancien cadre)" },
  { id: "S5", label: "ANSD — RGPH-5 (2023)", url: "https://www.ansd.sn", note: "Populations de quartiers de la base du projet" },
];
const FURTHER = [
  { label: "APS — Thiès : l'histoire de la ville bâtie autour du chemin de fer", url: "https://aps.sn/thies-lhistoire-de-la-ville-batie-autour-du-chemin-de-fer-au-menu-dun-colloque/" },
  { label: "Cairn — « Les martyrs de Thiès : la grève des cheminots du 27 septembre 1938 »", url: "https://shs.cairn.info/la-vocation-de-servir--9791037029584-page-115?lang=fr" },
  { label: "Mamadou Seyni Mbengue, « La grève tragique des cheminots de Thiès », Éthiopiques, 1975", url: "" },
  { label: "Iba Der Thiam, La Tuerie de Thiès, 2019", url: "" },
];

const CHAPTERS = [
  { id: "ch1", n: "I", t: "Avant la ville" }, { id: "ch2", n: "II", t: "Le rail" }, { id: "ch3", n: "III", t: "La ville coloniale" },
  { id: "ch4", n: "IV", t: "Ville ouvrière" }, { id: "ch5", n: "V", t: "Ville senghorienne" }, { id: "ch6", n: "VI", t: "Trois communes" },
  { id: "ch7", n: "VII", t: "Aujourd'hui" }, { id: "frise", n: "∞", t: "Frise" }, { id: "lecture", n: "?", t: "Ségrégation" },
];

/* ---------- petits composants ---------- */
function Chapter({ id, n, title, kicker, lead, className, children }: { id: string; n: string; title: string; kicker: string; lead: string; className: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`hs-chapter ${className}`}>
      <div className="hs-inner">
        <Reveal><div className="hs-chead"><span className="hs-bignum">{n}</span><div><div className="hs-kicker">{kicker}</div><h2>{title}</h2><p className="hs-lead">{lead}</p></div></div></Reveal>
        {children}
      </div>
    </section>
  );
}
function Fact({ value, suffix, label, note, color, decimals }: { value: number; suffix?: string; label: string; note?: string; color?: string; decimals?: number }) {
  return <div className="hs-fact" style={{ ["--c" as any]: color || "#c2410c" }}><strong><Counter value={value} suffix={suffix} decimals={decimals ?? 0} /></strong><b>{label}</b>{note && <small>{note}</small>}</div>;
}
function Src({ s }: { s: string }) { return <span className="hs-src" title="Voir les sources en bas de page">{s}</span>; }

/* ---------- Hero : paysage ferroviaire anime ---------- */
function HeroScene() {
  return (
    <svg className="hs-scene" viewBox="0 0 1440 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e1b4b" /><stop offset=".45" stopColor="#7c2d12" /><stop offset=".8" stopColor="#f59e0b" /><stop offset="1" stopColor="#fde68a" /></linearGradient>
        <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fef3c7" /><stop offset="1" stopColor="#fb923c" /></linearGradient>
        <pattern id="sleepers" width="26" height="14" patternUnits="userSpaceOnUse"><rect x="0" y="0" width="10" height="14" fill="#3b2a1e" /></pattern>
      </defs>
      <rect width="1440" height="560" fill="url(#sky)" />
      <g className="hs-stars" fill="#fff">{Array.from({ length: 36 }).map((_, i) => <circle key={i} cx={(i * 211) % 1440} cy={(i * 97) % 190 + 10} r={(i % 3) * 0.5 + 0.7} opacity={0.35 + (i % 5) * 0.12} />)}</g>
      <circle className="hs-sun" cx="1010" cy="360" r="92" fill="url(#sun)" />
      <path d="M0 400 C180 340 300 380 470 350 C660 316 760 390 960 360 C1140 334 1300 380 1440 346 L1440 560 L0 560Z" fill="#5b2a3c" opacity=".55" />
      <path d="M0 440 C220 395 380 430 560 410 C760 390 900 440 1100 420 C1260 404 1360 424 1440 410 L1440 560 L0 560Z" fill="#3b1d2d" />
      {/* silhouette de gare */}
      <g transform="translate(1080 360)" fill="#1f1020">
        <rect x="0" y="40" width="210" height="48" /><rect x="70" y="8" width="70" height="80" /><polygon points="62,10 105,-22 148,10" />
        <rect x="98" y="16" width="14" height="14" fill="#fde68a" /><rect x="-8" y="34" width="226" height="8" />
        {[0, 1, 2, 3, 4].map(i => <rect key={i} x={14 + i * 38} y="52" width="14" height="20" fill="#fbbf24" opacity=".75" />)}
      </g>
      {/* poteaux telegraphiques */}
      <g stroke="#1f1020" strokeWidth="3">{[80, 380, 680, 980].map(x => <g key={x}><line x1={x} y1="330" x2={x} y2="440" /><line x1={x - 18} y1="342" x2={x + 18} y2="342" /></g>)}</g>
      <path d="M62 342 Q230 372 398 342 T 698 342 T 998 342" stroke="#1f1020" strokeWidth="1.5" fill="none" />
      {/* voie */}
      <rect x="0" y="470" width="1440" height="90" fill="#2a1626" />
      <g className="hs-track"><rect x="-52" y="494" width="1560" height="14" fill="url(#sleepers)" /></g>
      <rect x="0" y="490" width="1440" height="3.5" fill="#d6c7b2" /><rect x="0" y="508" width="1440" height="3.5" fill="#d6c7b2" />
      {/* train */}
      <g className="hs-train">
        <g transform="translate(0 420)">
          <rect x="0" y="22" width="150" height="46" rx="6" fill="#0f172a" /><rect x="8" y="30" width="20" height="16" fill="#fde68a" /><rect x="34" y="-12" width="54" height="42" rx="4" fill="#1e293b" />
          <rect x="94" y="0" width="30" height="26" fill="#0f172a" /><rect x="90" y="-26" width="16" height="30" fill="#0f172a" />
          <circle cx="30" cy="70" r="13" fill="#7c2d12" /><circle cx="76" cy="70" r="13" fill="#7c2d12" /><circle cx="122" cy="70" r="13" fill="#7c2d12" />
          {[0, 1, 2, 3].map(i => <g key={i} transform={`translate(${-170 - i * 178} 0)`}><rect x="0" y="16" width="160" height="52" rx="4" fill={["#b45309", "#0f766e", "#9f1239", "#4338ca"][i]} /><rect x="0" y="16" width="160" height="8" fill="rgba(0,0,0,.25)" />{[0, 1, 2, 3, 4].map(j => <rect key={j} x={12 + j * 30} y="32" width="18" height="16" fill="#fde68a" opacity=".8" />)}<circle cx="30" cy="72" r="10" fill="#1f1020" /><circle cx="130" cy="72" r="10" fill="#1f1020" /></g>)}
          <g className="hs-smoke">{[0, 1, 2, 3].map(i => <circle key={i} cx="98" cy="-30" r={12 + i * 4} fill="#fff" opacity=".4" style={{ animationDelay: `${i * 0.6}s` }} />)}</g>
        </g>
      </g>
    </svg>
  );
}

/* ---------- Schema ferroviaire (non geographique) ---------- */
function RailHub() {
  const [on, setOn] = useState<string | null>(null);
  const lines = [
    { id: "dsl", label: "Dakar – Saint-Louis (via Louga)", year: "1881–1885", color: "#0369a1", text: "Première ligne de l'AOF, inaugurée en 1885 : Thiès y est une escale ferroviaire. Des embranchements vers Louga et Linguère renforcent plus tard le rôle de carrefour." },
    { id: "kayes", label: "Thiès – Kayes (→ Niger)", year: "1907–1923", color: "#c2410c", text: "Construite à partir de 1907, achevée en 1923 : Thiès devient le point de départ du Dakar–Niger." },
    { id: "touba", label: "Diourbel – Touba", year: "après 1923", color: "#6d28d9", text: "Embranchement vers le centre du bassin arachidier, jusqu'à Touba, qui renforce la position de Thiès." },
  ];
  const cur = lines.find(l => l.id === on);
  return (
    <div className="hs-railhub">
      <svg viewBox="0 0 780 290" role="img" aria-label="Schéma des lignes ferroviaires convergeant vers Thiès">
        <rect width="780" height="290" rx="18" fill="#f5f9fd" />
        <g strokeWidth="7" strokeLinecap="round" fill="none">
          <line x1="70" y1="145" x2="390" y2="145" stroke="#0369a1" opacity={on && on !== "dsl" ? 0.2 : 1} />
          <path d="M390 145 L390 50" stroke="#0369a1" opacity={on && on !== "dsl" ? 0.2 : 1} />
          <line x1="390" y1="145" x2="720" y2="145" stroke="#c2410c" opacity={on && on !== "kayes" ? 0.2 : 1} />
          <path d="M390 145 L390 240" stroke="#6d28d9" opacity={on && on !== "touba" ? 0.2 : 1} />
        </g>
        <circle cx="390" cy="145" r="22" fill="#fff" stroke="#0f2a3a" strokeWidth="5" /><circle cx="390" cy="145" r="8" fill="#be123c" className="hs-pulse" />
        <text x="424" y="128" fontSize="15" fontWeight="900" fill="#0f2a3a">THIÈS</text>
        <text x="70" y="168" textAnchor="middle" fontSize="12" fill="#475569">Dakar</text><text x="720" y="168" textAnchor="middle" fontSize="12" fill="#475569">Kayes → Bamako</text>
        <text x="410" y="45" fontSize="12" fill="#475569">Louga · Linguère · Saint-Louis</text><text x="410" y="256" fontSize="12" fill="#475569">Diourbel · Touba</text>
        {[["dsl", 230, 145], ["dsl", 390, 90], ["kayes", 560, 145], ["touba", 390, 205]].map(([id, x, y], i) => { const l = lines.find(z => z.id === id)!; return <circle key={i} cx={x as number} cy={y as number} r="11" fill={l.color} stroke="#fff" strokeWidth="3" style={{ cursor: "pointer" }} onMouseEnter={() => setOn(l.id)} onClick={() => setOn(l.id)} onMouseLeave={() => setOn(null)} />; })}
      </svg>
      <div className="hs-railhub-card" style={{ ["--c" as any]: cur?.color || "#0f2a3a" }}>
        {cur ? <><small>{cur.year}</small><h4>{cur.label}</h4><p>{cur.text}</p></> : <><small>SCHÉMA — NON GÉOGRAPHIQUE</small><h4>Un nœud ferroviaire</h4><p>Survolez ou touchez un point coloré pour découvrir chaque ligne. Les lignes sont représentées de façon schématique pour montrer le rôle de carrefour de Thiès.</p></>}
      </div>
    </div>
  );
}

/* ---------- Carte historique interactive ---------- */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const GROUPS: { key: string; label: string; color: string; test: (n: string) => boolean; note: string }[] = [
  { key: "rando", label: "Randoulène (1911)", color: "#c2410c", test: n => n.startsWith("randoulene"), note: "Nom donné au quartier « indigène » déplacé après la peste de 1911 (Wikipédia)." },
  { key: "ballabey", label: "Cité Ballabey & DVF", color: "#0369a1", test: n => n.includes("balabey") || n.includes("ballabey") || n.startsWith("dvf"), note: "La cité Ballabey regroupe bureaux et ateliers du Dakar–Niger ; « DVF » signifie derrière la voie ferrée (Wikipédia, Le Soleil)." },
  { key: "none", label: "Thiès-Nones", color: "#0f766e", test: n => n === "thies none", note: "Quartier du sud-ouest qui abrite les Sérères-Noon, population présente avant la colonisation (Wikipédia)." },
  { key: "ept", label: "École polytechnique (1973)", color: "#6d28d9", test: n => n.startsWith("ept"), note: "Emprise de l'École polytechnique de Thiès, créée en 1973." },
];
const COMMUNE_COLORS: Record<string, string> = { "Thies Nord": "#0369a1", "Thies Est": "#0f766e", "Thies Ouest": "#c2410c" };

function HistoryMap({ quartiers }: { quartiers: QGeo[] }) {
  const [mode, setMode] = useState<"histoire" | "commune">("histoire");
  const [hover, setHover] = useState<QGeo | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const built = useMemo(() => {
    const rings = (g: any): number[][][] => (!g ? [] : g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p: any) => p[0]) : []);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    quartiers.forEach(q => rings(q.geometry).forEach(r => r.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); })));
    if (!Number.isFinite(minX)) return { items: [] as { q: QGeo; d: string }[], W: 660, H: 400 };
    const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
    const W = 640, sx = W / ((maxX - minX) * k), H = (maxY - minY) * sx, pad = 10;
    const proj = ([x, y]: number[]) => `${((x - minX) * k * sx + pad).toFixed(1)},${(H - (y - minY) * sx + pad).toFixed(1)}`;
    const items = quartiers.map(q => ({ q, d: rings(q.geometry).map(r => "M" + r.map(proj).join("L") + "Z").join("") }));
    return { items, W: W + pad * 2, H: H + pad * 2 };
  }, [quartiers]);
  const groupOf = (q: QGeo) => GROUPS.find(g => g.test(norm(q.nom)));
  const fill = (q: QGeo) => {
    if (mode === "commune") return COMMUNE_COLORS[q.commune] || "#94a3b8";
    const g = groupOf(q); if (!g) return "#d9d2c3";
    return !focus || focus === g.key ? g.color : "#d9d2c3";
  };
  const fg = GROUPS.find(g => g.key === focus);
  return (
    <div className="hs-map">
      <div className="hs-map-stage">
        <div className="hs-map-modes">
          <button className={mode === "histoire" ? "on" : ""} onClick={() => setMode("histoire")}>Lecture historique</button>
          <button className={mode === "commune" ? "on" : ""} onClick={() => setMode("commune")}>Trois communes</button>
        </div>
        <svg viewBox={`0 0 ${built.W} ${built.H}`} role="img" aria-label="Carte des quartiers de Thiès et repères historiques">
          {built.items.map(({ q, d }) => <path key={q.quartier_id} d={d} fill={fill(q)} stroke="#fff" strokeWidth={hover?.quartier_id === q.quartier_id ? 2.2 : 0.8} fillRule="evenodd" onMouseEnter={() => setHover(q)} onMouseLeave={() => setHover(null)} onClick={() => setHover(q)} style={{ transition: "fill .3s", cursor: "pointer" }} />)}
        </svg>
        <div className="hs-map-tip">{hover ? <><b>{hover.nom}</b><span>{hover.commune} • {hover.population ? `${hover.population.toLocaleString("fr-FR")} hab.` : "population non renseignée"}</span>{groupOf(hover) && <em>{groupOf(hover)!.label}</em>}</> : <span>Survolez ou touchez un quartier</span>}</div>
      </div>
      <div className="hs-map-side">
        {mode === "histoire" ? <>
          <h4>Des traces d'histoire dans la carte actuelle</h4>
          <p className="hs-map-intro">Seuls les quartiers dont l'histoire est documentée dans nos sources sont colorés. Cliquez sur un repère pour l'isoler.</p>
          {GROUPS.map(g => {
            const list = quartiers.filter(q => g.test(norm(q.nom)));
            const pop = list.reduce((s, q) => s + (q.population || 0), 0);
            return (
              <button key={g.key} className={`hs-legend ${focus === g.key ? "on" : ""}`} style={{ ["--c" as any]: g.color }} onClick={() => setFocus(focus === g.key ? null : g.key)}>
                <i /><div><b>{g.label}</b><small>{list.length} quartier{list.length > 1 ? "s" : ""}{pop ? ` • ${pop.toLocaleString("fr-FR")} hab.` : ""}</small></div>
              </button>
            );
          })}
          <div className="hs-map-note">{fg ? <><b>{fg.label}.</b> {fg.note}</> : "Le gris regroupe les quartiers pour lesquels aucune source historique précise n'a été retenue : ce n'est pas une absence d'histoire."}</div>
        </> : <>
          <h4>Le découpage de 2008</h4>
          <p className="hs-map-intro">Le décret n° 2008-1344 (novembre 2008) crée les communes d'arrondissement de Thiès Nord, Est et Ouest.</p>
          {Object.entries(COMMUNE_COLORS).map(([c, col]) => {
            const list = quartiers.filter(q => q.commune === c); const pop = list.reduce((s, q) => s + (q.population || 0), 0);
            return <div key={c} className="hs-legend static" style={{ ["--c" as any]: col }}><i /><div><b>{c}</b><small>{list.length} quartiers • {pop.toLocaleString("fr-FR")} hab. rattachés (RGPH-5)</small></div></div>;
          })}
        </>}
      </div>
    </div>
  );
}

/* ---------- Graphique de population ---------- */
function PopChart() {
  const [log, setLog] = useState(true);
  const mult = (a: number, b: number) => (POP.find(p => p.y === b)!.v / POP.find(p => p.y === a)!.v);
  return (
    <div className="hs-pop">
      <div className="hs-pop-head">
        <div><div className="hs-kicker">DÉMOGRAPHIE</div><h3>De 75 habitants à plus de 270 000</h3></div>
        <div className="hs-toggle"><button className={log ? "on" : ""} onClick={() => setLog(true)}>Échelle log</button><button className={!log ? "on" : ""} onClick={() => setLog(false)}>Échelle linéaire</button></div>
      </div>
      <div className="hs-pop-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={POP} margin={{ top: 16, right: 24, bottom: 4, left: 4 }}>
            <defs><linearGradient id="popg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f766e" stopOpacity={0.55} /><stop offset="1" stopColor="#0f766e" stopOpacity={0.05} /></linearGradient></defs>
            <CartesianGrid stroke="rgba(15,42,58,.1)" vertical={false} />
            <XAxis dataKey="y" type="number" domain={[1860, 2022]} ticks={[1860, 1890, 1938, 1966, 1988, 2022]} tick={{ fontSize: 11, fill: "#475569" }} />
            <YAxis scale={log ? "log" : "linear"} domain={log ? [50, 400000] : [0, 300000]} allowDataOverflow tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)} k` : String(v)} tick={{ fontSize: 11, fill: "#475569" }} width={46} ticks={log ? [100, 1000, 10000, 100000] : undefined} />
            <Tooltip formatter={(v: any) => [Number(v).toLocaleString("fr-FR") + " hab.", "Population"]} labelFormatter={(l: any) => `Année ${l}`} contentStyle={{ borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 12 }} />
            <Area type="monotone" dataKey="v" stroke="#0f766e" strokeWidth={3} fill="url(#popg)" dot={{ r: 4, fill: "#0f766e", stroke: "#fff", strokeWidth: 2 }} />
            <ReferenceDot x={1938} y={22000} r={0} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="hs-pop-facts">
        <div><b>× {mult(1890, 1939).toFixed(0)}</b><span>de 1890 à 1939 : l'âge du rail</span></div>
        <div><b>× {mult(1939, 2002).toFixed(0)}</b><span>de 1939 à 2002</span></div>
        <div><b>× {mult(1966, 1988).toFixed(1).replace(".", ",")}</b><span>de 1966 à 1988</span></div>
      </div>
      <p className="hs-pop-note">Sources : Wikipédia — Thiès (recensements et estimations de périodes différentes, périmètres communaux ou d'aire urbaine variables : lecture à titre indicatif). 1953 : 40 000 selon l'historique, 36 650 au recensement de la commune mixte. 2021-2022 : 274 009. Le RGPH-5 de 2023 utilisé dans ce projet porte sur 65 quartiers ; il n'est volontairement pas tracé ici.</p>
    </div>
  );
}

/* ---------- Frise filtrable ---------- */
function MasterTimeline() {
  const [filter, setFilter] = useState<Cat | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const list = EVENTS.filter(e => filter === "all" || e.cat === filter);
  return (
    <div className="hs-frise">
      <div className="hs-chips">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>Tout ({EVENTS.length})</button>
        {(Object.keys(CATS) as Cat[]).map(c => <button key={c} className={filter === c ? "on" : ""} style={{ ["--c" as any]: CATS[c].color }} onClick={() => setFilter(c)}><i />{CATS[c].label} ({EVENTS.filter(e => e.cat === c).length})</button>)}
      </div>
      <div className="hs-fr-list">
        {list.map(e => {
          const k = e.y + e.t; const isOpen = open === k; const c = CATS[e.cat];
          return (
            <article key={k} className={`hs-fr-item ${isOpen ? "open" : ""}`} style={{ ["--c" as any]: c.color }}>
              <div className="hs-fr-year">{e.y}</div><div className="hs-fr-dot" />
              <div className="hs-fr-card" onClick={() => e.more && setOpen(isOpen ? null : k)} style={{ cursor: e.more ? "pointer" : "default" }}>
                <div className="hs-fr-top"><span className="hs-fr-cat">{c.label}</span><Src s={e.s} /></div>
                <h4>{e.t}</h4><p>{e.d}</p>
                {e.more && <><div className="hs-fr-more">{e.more}</div><span className="hs-fr-toggle"><ChevronDown size={14} />{isOpen ? "Réduire" : "En savoir plus"}</span></>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
export default function Histoire({ quartiers, navigate }: { quartiers: QGeo[]; navigate: (p: string) => void }) {
  const [active, setActive] = useState("ch1");
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => { const h = document.documentElement; setProgress(Math.min(100, (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100)); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-40% 0px -55% 0px" });
      CHAPTERS.forEach(c => { const el = document.getElementById(c.id); el && io!.observe(el); });
    }
    return () => { window.removeEventListener("scroll", onScroll); io?.disconnect(); };
  }, []);
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const [strike, setStrike] = useState(0);
  const steps = [
    { d: "20 juin", t: "L'attroupement", x: "Lors de la visite du directeur aux ateliers, un attroupement se forme. Une délégation de six ouvriers, menée par Cheikh Diack, fourgonnier auxiliaire, négocie un accord sur les salaires ; les autres mesures sont reportées au 9 août." },
    { d: "11 août", t: "La rupture", x: "Le syndicat des travailleurs indigènes du Dakar–Niger (STIDN) dénonce ces négociations menées sans lui. Elles échouent, et Cheikh Diack est muté à Gossas, à un poste sédentaire." },
    { d: "26 sept.", t: "Une pétition ignorée", x: "Diack part pour Gossas. Les auxiliaires demandent une audience, refusée. Une pétition de 806 signatures ne change rien." },
    { d: "27 sept.", t: "La grève est décidée", x: "La grève est décidée pour le lendemain, dans un climat de vie chère et alors que la mobilisation générale en cas de crise européenne repose en grande partie sur les chemins de fer de l'AOF." },
    { d: "28 sept.", t: "Le passage à niveau", x: "1 275 des 1 975 journaliers de Thiès et 75 % des effectifs des ateliers font grève. Au passage menant à la cité Ballabey, la troupe fait feu sur les grévistes, rejoints par les femmes de la ville. Les trains sont immobilisés ; le soir, les augmentations sont accordées et les sanctions levées." },
  ];

  return (
    <div className="hs">
      <div className="hs-progress"><i style={{ width: `${progress}%` }} /></div>

      {/* ===== HERO ===== */}
      <header className="hs-hero">
        <HeroScene />
        <div className="hs-hero-copy">
          <Reveal><div className="hs-kicker light">HISTOIRE & ÉVOLUTION URBAINE</div></Reveal>
          <Reveal delay={100}><h1>Thiès,<br /><span>une ville née du rail.</span></h1></Reveal>
          <Reveal delay={220}><p>De 75 habitants en 1860 à un carrefour de lignes, d'ateliers et de luttes ouvrières : comment un village du Cayor est devenu la troisième ville du Sénégal — et pourquoi son plan urbain porte encore les traces de cette histoire.</p></Reveal>
          <Reveal delay={340}><div className="hs-hero-cta"><button onClick={() => go("ch1")}>Remonter le temps <ArrowRight size={16} /></button><button className="ghost" onClick={() => go("frise")}>Voir la frise complète</button></div></Reveal>
        </div>
        <div className="hs-hero-stats">
          {[["1885", "arrivée du rail"], ["1938", "la grève des cheminots"], ["2008", "trois communes"], ["2024", "le train revient"]].map(([a, b]) => <div key={a}><strong>{a}</strong><span>{b}</span></div>)}
        </div>
      </header>

      {/* ===== NAV DE CHAPITRES ===== */}
      <nav className="hs-nav" aria-label="Chapitres">
        {CHAPTERS.map(c => <button key={c.id} className={active === c.id ? "on" : ""} onClick={() => go(c.id)}><b>{c.n}</b><span>{c.t}</span></button>)}
      </nav>

      {/* ===== I ===== */}
      <Chapter id="ch1" n="I" kicker="XVIIe SIÈCLE — 1863" title="Un plateau entre deux royaumes" className="hs-c1" lead="Avant d'être une ville, Thiès est un point d'eau et un carrefour de pistes : un site, pas encore un lieu de pouvoir.">
        <div className="hs-two">
          <Reveal><div className="hs-prose">
            <p>Avant la colonisation, le plateau de Thiès forme une <b>barrière boisée entre les royaumes du Cayor et du Baol</b>. Il abrite les <b>Sérères-Noon</b>, dont le nom se retrouve aujourd'hui dans le quartier de Thiès-Nones, au sud-ouest de la ville.</p>
            <p>Au XVIIe siècle, le village de <b>Dianxène</b>, relevant du Cayor, s'y fixe pour une raison très concrète : <b>une nappe phréatique accessible par puits</b>. Il se trouve au croisement de <b>cinq pistes</b> — l'eau et la circulation, deux ressources qui expliqueront plus tard l'attrait du site pour le rail.</p>
            <p>En 1860, le village ne compte que <b>75 habitants</b>. Le <b>12 mai 1862</b>, il est incendié par Pinet-Laprade ; en <b>1863</b>, les Français y érigent un <b>poste militaire</b>. La fonction de Thiès bascule : de village paysan, il devient un point d'appui colonial. Vers 1885, les spiritains y fondent une mission.</p>
            <p className="hs-src-line"><Src s="S1" /> Wikipédia — Thiès</p>
          </div></Reveal>
          <div className="hs-facts">
            <Reveal delay={60}><Fact value={75} label="habitants en 1860" note="village de Dianxène" color="#15803d" /></Reveal>
            <Reveal delay={140}><Fact value={5} label="pistes qui se croisent" note="carrefour de Dianxène" color="#a16207" /></Reveal>
            <Reveal delay={220}><Fact value={1863} label="poste militaire français" note="premier acte de la ville coloniale" color="#c2410c" /></Reveal>
          </div>
        </div>
      </Chapter>

      {/* ===== II ===== */}
      <Chapter id="ch2" n="II" kicker="1881 — 1934" title="Le rail fait la ville" className="hs-c2" lead="En un demi-siècle, quatre jalons ferroviaires transforment un poste militaire en carrefour de l'Afrique-Occidentale française.">
        <div className="hs-steps4">
          {[
            { y: "1885", t: "Dakar–Saint-Louis", x: "Construite de 1881 à 1885 : première ligne de l'AOF. Thiès devient une escale.", i: <TrainFront /> },
            { y: "1890", t: "20 000 t d'arachide", x: "La gare exporte déjà 20 000 tonnes : Thiès est une place de traite.", i: <Building2 /> },
            { y: "1923", t: "Thiès–Kayes + ateliers", x: "Commencée en 1907, la ligne est achevée ; les ateliers lancent la ville ouvrière.", i: <RouteIcon /> },
            { y: "1934", t: "Siège du Dakar–Niger", x: "Bureaux et ateliers sont regroupés dans la cité Ballabey.", i: <Landmark /> },
          ].map((s, i) => <Reveal key={s.y} delay={i * 90}><div className="hs-step4"><span>{s.i}</span><b>{s.y}</b><h4>{s.t}</h4><p>{s.x}</p></div></Reveal>)}
        </div>
        <Reveal><RailHub /></Reveal>
        <div className="hs-two rev">
          <Reveal><div className="hs-prose">
            <p>Dès <b>1890</b>, la gare exporte <b>20 000 tonnes d'arachide</b>. Les embranchements vers <b>Louga, Linguère, Diourbel et Touba</b> renforcent la position de Thiès au centre du réseau. Le rail ne dessert plus la ville : <b>il la constitue</b>.</p>
            <p>La ville a longtemps eu <b>deux gares</b> — celle de Dakar–Saint-Louis et celle de Thiès–Kayes, aujourd'hui non fonctionnelle. De là vient le slogan wolof <b>« Benn Deuk, Ñaari Gaar »</b> (une ville, deux gares), resté dans la mémoire collective des cheminots.</p>
            <p>À son apogée, au début des années 1990, l'entreprise employait près de <b>3 500 personnes</b>, dont 1 000 ouvriers dans les grands centres de maintenance — selon le témoignage d'un ancien cadre rapporté par <i>Le Soleil</i>.</p>
            <p className="hs-src-line"><Src s="S1" /><Src s="S3" /><Src s="S4" /></p>
          </div></Reveal>
          <Reveal delay={100}><blockquote className="hs-quote"><Quote size={26} /><p>« Thiès–Kayes, Benn Deuk, Ñaari Gaar »</p><small>Formule de la mémoire cheminote qui désignait la double gare — <i>Le Soleil</i>, 2026</small></blockquote></Reveal>
        </div>
      </Chapter>

      {/* ===== III ===== */}
      <Chapter id="ch3" n="III" kicker="1904 — 1939" title="La ville coloniale et ses lignes de partage" className="hs-c3" lead="Commune dès 1904, Thiès se structure autour de la voie ferrée, qui sépare autant qu'elle relie.">
        <div className="hs-two">
          <Reveal><div className="hs-prose">
            <p>En <b>1904</b>, l'administration coloniale institue la <b>commune de Thiès</b>. La ville s'organise autour du rail : la voie devient, selon <i>Le Soleil</i>, une <b>« ligne de démarcation »</b>. De l'autre côté, la cité Ballabey est appelée <b>DVF — « derrière la voie ferrée »</b>.</p>
            <p>En <b>1911</b>, une épidémie de peste conduit à <b>déplacer le quartier « indigène » hors de la zone commerciale</b>. Le nouveau quartier prend le nom de <b>Randoulène</b>. C'est l'un des premiers gestes documentés de séparation spatiale organisée de la ville.</p>
            <p>L'activité économique attire <b>des Maliens et des Dahoméens</b> ; de nouveaux quartiers se créent. La population passe de <b>3 000 habitants en 1921 à 13 000 en 1929</b>, puis <b>22 000 en 1939</b> — dont <b>1 200 Européens</b>, soit environ 5 % de la population.</p>
            <p className="hs-src-line"><Src s="S1" /><Src s="S4" /></p>
          </div></Reveal>
          <div className="hs-facts">
            <Reveal delay={60}><Fact value={1911} label="la peste déplace un quartier" note="naissance de Randoulène" color="#c2410c" /></Reveal>
            <Reveal delay={140}><Fact value={(1200 / 22000) * 100} decimals={1} suffix=" %" label="d'Européens en 1939" note="1 200 sur 22 000 habitants" color="#be123c" /></Reveal>
            <Reveal delay={220}><Fact value={13000 / 3000} decimals={1} suffix="×" label="population 1921 → 1929" note="3 000 → 13 000 habitants" color="#a16207" /></Reveal>
          </div>
        </div>
        <Reveal><div className="hs-maphead"><MapPinned size={18} /><div><h3>Ces repères, sur la carte d'aujourd'hui</h3><p>Les noms de quartiers conservent la mémoire de ces événements. Basculez entre lecture historique et découpage communal.</p></div></div></Reveal>
        <Reveal delay={100}><HistoryMap quartiers={quartiers} /></Reveal>
      </Chapter>

      {/* ===== IV ===== */}
      <Chapter id="ch4" n="IV" kicker="1938 — 1948" title="Thiès, ville ouvrière et ville de luttes" className="hs-c4" lead="Le 28 septembre 1938, la grève des cheminots se termine en massacre. Elle est présentée comme la première grève de masse des colonies françaises d'Afrique.">
        <div className="hs-strike">
          <div className="hs-strike-rail">
            {steps.map((s, i) => <button key={s.d} className={`${i === strike ? "on" : ""} ${i <= strike ? "done" : ""}`} onClick={() => setStrike(i)}><i /><b>{s.d}</b><span>{s.t}</span></button>)}
          </div>
          <div className="hs-strike-card" key={strike}><small>ÉTAPE {strike + 1} / {steps.length} — 1938</small><h3>{steps[strike].t}</h3><p>{steps[strike].x}</p>
            <div className="hs-strike-nav"><button disabled={strike === 0} onClick={() => setStrike(strike - 1)}>← Précédent</button><button disabled={strike === steps.length - 1} onClick={() => setStrike(strike + 1)}>Suivant →</button></div></div>
        </div>
        <div className="hs-facts row">
          <Reveal><Fact value={806} label="signatures de la pétition" note="ignorée par la direction" color="#fda4af" /></Reveal>
          <Reveal delay={80}><Fact value={1275} label="journaliers grévistes" note="sur 1 975 à Thiès" color="#fdba74" /></Reveal>
          <Reveal delay={160}><Fact value={75} suffix=" %" label="des ateliers en grève" note="effectifs des ateliers" color="#fcd34d" /></Reveal>
          <Reveal delay={240}><Fact value={6} label="grévistes tués par balles" note="90 à 119 blessés selon les bilans" color="#fecaca" /></Reveal>
        </div>
        <div className="hs-two">
          <Reveal><div className="hs-prose dark">
            <h4><ShieldAlert size={16} /> Le contexte : une main-d'œuvre sans statut</h4>
            <p>Le syndicalisme ferroviaire est alors organisé sur une base raciale. Parmi les Africains, les <b>titulaires</b> (représentés par le STIDN de François Gning, soutenu par Lamine Guèye) se distinguent des <b>auxiliaires et journaliers</b>, aux salaires plus bas et sans garantie d'emploi. En 1943, le DN emploie <b>8 617 personnes, dont 7 500 sans statut</b> : environ <b>{((7500 / 8617) * 100).toFixed(0)} %</b>.</p>
            <p>Les auxiliaires demandent une hausse de salaire, des indemnités de déplacement, des primes pour les mécaniciens et un train de banlieue Dakar–Rufisque. Le Soleil rapporte des conditions où « même aller aux toilettes nécessitait une autorisation ».</p>
          </div></Reveal>
          <Reveal delay={100}><div className="hs-prose dark">
            <h4><Scale size={16} /> Les suites et la mémoire</h4>
            <p>Le ministre des Colonies Georges Mandel demande des poursuites, mais <b>aucun responsable ne passe devant un tribunal</b>. Le gouverneur Marcel de Coppet et le directeur du DN Albert Giran sont rappelés. Les grèves reprennent en <b>1945-1946</b> et <b>1947-1948</b>, où Thiès joue de nouveau un rôle important.</p>
            <p>L'événement est documenté par Mamadou Seyni Mbengue (<i>Éthiopiques</i>, 1975) et par <b>Iba Der Thiam</b> — dont l'université de Thiès porte aujourd'hui le nom — auteur d'un mémoire (1972) puis de <i>La Tuerie de Thiès</i> (2019).</p>
            <p className="hs-src-line"><Src s="S2" /><Src s="S4" /></p>
          </div></Reveal>
        </div>
        <p className="hs-note-dark"><BookOpen size={14} /> <b>Précision sur les sources.</b> La grève est souvent datée du « 27 septembre 1938 » : le 27 est la date de la décision, l'affrontement au passage à niveau a lieu le 28. Le bilan varie : 6 morts dans toutes les sources ; 90 à 92 blessés dans la presse de l'époque, jusqu'à 119 dans le décompte détaillé.</p>
      </Chapter>

      {/* ===== V ===== */}
      <Chapter id="ch5" n="V" kicker="1956 — 2007" title="La ville senghorienne : administration, tapisserie, savoirs" className="hs-c5" lead="Après la ville du rail, Thiès devient une ville d'institutions — politiques, religieuses, artistiques et universitaires.">
        <div className="hs-inst">
          {[
            { y: "1956", t: "Senghor, maire de Thiès", i: <Landmark />, c: "#a16207" },
            { y: "1966", t: "Manufactures sénégalaises des arts décoratifs — la tapisserie de Thiès", i: <BookOpen />, c: "#be123c" },
            { y: "1969", t: "Création du diocèse de Thiès, détaché de celui de Dakar", i: <Building2 />, c: "#6d28d9" },
            { y: "1973", t: "École polytechnique de Thiès, à l'initiative de Senghor", i: <GraduationCap />, c: "#0369a1" },
            { y: "1995", t: "Musée régional, installé dans le fort de Thiès", i: <Landmark />, c: "#0f766e" },
            { y: "2007", t: "Ouverture de l'Université de Thiès", i: <GraduationCap />, c: "#c2410c" },
          ].map((e, i) => <Reveal key={e.y} delay={i * 70}><div className="hs-inst-card" style={{ ["--c" as any]: e.c }}><span>{e.i}</span><b>{e.y}</b><p>{e.t}</p></div></Reveal>)}
        </div>
        <Reveal><div className="hs-prose wide">
          <p>La population croît à un rythme soutenu : <b>72 400 habitants en 1966</b>, <b>177 253 en 1988</b>, <b>237 849 en 2002</b> (commune). Thiès est aussi un pôle militaire (camp de tirailleurs depuis 1914, base aérienne depuis 1940, puis détachement motorisé après 1945), et une partie de ses habitants travaille aux <b>mines de phosphates de Taïba et de Pallo</b> ou dans des entreprises locales comme l'usine de piles SIGELEC.</p>
          <p className="hs-src-line"><Src s="S1" /></p>
        </div></Reveal>
        <Reveal><PopChart /></Reveal>
      </Chapter>

      {/* ===== VI ===== */}
      <Chapter id="ch6" n="VI" kicker="NOVEMBRE 2008" title="Trois communes d'arrondissement" className="hs-c6" lead="Le découpage qui structure toute cette étude : Thiès Nord, Thiès Est et Thiès Ouest.">
        <div className="hs-two">
          <Reveal><div className="hs-prose">
            <p>Par le <b>décret n° 2008-1344</b>, en novembre 2008, sont créées les communes d'arrondissement de <b>Thiès Est, Thiès Ouest et Thiès Nord</b>. La ville de Thiès est le chef-lieu du département et de la région du même nom.</p>
            <p>Ce découpage récent recoupe des strates historiques très différentes : Thiès Ouest contient Randoulène, héritier du déplacement de 1911 ; Thiès Est contient la cité Ballabey et les quartiers « derrière la voie ferrée » ; Thiès Nord abrite l'emprise de l'École polytechnique. C'est précisément ce que l'étude cherche à mesurer : <b>ces différences d'origine se traduisent-elles aujourd'hui en inégalités ?</b></p>
            <p className="hs-src-line"><Src s="S1" /><Src s="S5" /></p>
          </div></Reveal>
          <div className="hs-communes">
            {Object.entries(COMMUNE_COLORS).map(([c, col], i) => {
              const l = quartiers.filter(q => q.commune === c); const pop = l.reduce((s, q) => s + (q.population || 0), 0); const surf = l.reduce((s, q) => s + (q.surface_km2 || 0), 0);
              return <Reveal key={c} delay={i * 90}><div className="hs-commune" style={{ ["--c" as any]: col }}><h4>{c}</h4><div><b><Counter value={pop} /></b><span>habitants rattachés (RGPH-5)</span></div><div><b>{l.length}</b><span>quartiers</span></div><div><b><Counter value={surf} decimals={1} /></b><span>km²</span></div></div></Reveal>;
            })}
          </div>
        </div>
      </Chapter>

      {/* ===== VII ===== */}
      <Chapter id="ch7" n="VII" kicker="2023 — 2024" title="Aujourd'hui : mémoire et renaissance du rail" className="hs-c7" lead="La gare retrouve des voyageurs, tandis que la ville s'étend bien au-delà de la voie.">
        <div className="hs-two">
          <Reveal><div className="hs-prose">
            <p>Le <b>28 février 2024</b>, le transport de voyageurs rouvre entre <b>Thiès et la gare TER de Diamniadio</b>, après la remise en état de la gare de Thiès, dans le cadre de la relance portée par <b>Grands Trains du Sénégal (GTS)</b>. Pour une ville construite par le rail, ce retour est autant symbolique que fonctionnel.</p>
            <p>La population de la ville atteint <b>274 009 habitants en 2021-2022</b> (Wikipédia) ; la base utilisée dans ce projet — le <b>RGPH-5 de 2023</b> — décrit 65 quartiers et sert de socle aux cartes, indicateurs et analyses du site.</p>
            <p className="hs-src-line"><Src s="S1" /><Src s="S3" /></p>
          </div></Reveal>
          <Reveal delay={100}><div className="hs-heritage"><h4><Landmark size={16} /> Patrimoine recensé</h4>
            <ul>{["La gare ferroviaire et ses entrepôts", "Place Ibrahima Sarr, à Ballabey", "L'ancien bâtiment de la direction de la SNCS", "Le bâtiment des « 3 Horloges »", "Le Fort de Thiès (musée régional depuis 1995)", "La Gouvernance"].map(x => <li key={x}>{x}</li>)}</ul>
            <small>Liste des sites et monuments historiques de Thiès retenus dans la précédente version du site.</small></div></Reveal>
        </div>
        <Reveal><div className="hs-people"><h3><Users size={18} /> Quelques figures citées dans les sources</h3>
          <div>{[
            ["Cheikh Diack", "fourgonnier auxiliaire, meneur de la grève de 1938"], ["François Gning", "dirigeant du STIDN, syndicat des travailleurs titulaires"],
            ["Lamine Guèye", "soutien du STIDN"], ["Marcel de Coppet", "gouverneur en 1938, rappelé après les événements"],
            ["Léopold Sédar Senghor", "maire de Thiès en 1956, à l'initiative de la tapisserie et de l'École polytechnique"], ["Iba Der Thiam", "historien de la grève de 1938"],
          ].map(([n, r]) => <div key={n} className="hs-person"><b>{n}</b><span>{r}</span></div>)}</div></div></Reveal>
      </Chapter>

      {/* ===== FRISE ===== */}
      <section id="frise" className="hs-chapter hs-frise-sec">
        <div className="hs-inner">
          <Reveal><div className="hs-chead"><span className="hs-bignum">∞</span><div><div className="hs-kicker">TOUS LES REPÈRES</div><h2>La frise complète</h2><p className="hs-lead">{EVENTS.length} repères datés, filtrables par thème. Chaque carte indique sa source (S1 à S5, détaillées en bas de page).</p></div></div></Reveal>
          <MasterTimeline />
        </div>
      </section>

      {/* ===== LECTURE SEGREGATION ===== */}
      <section id="lecture" className="hs-chapter hs-lecture">
        <div className="hs-inner">
          <Reveal><div className="hs-chead"><span className="hs-bignum">?</span><div><div className="hs-kicker">DE L'HISTOIRE À LA PROBLÉMATIQUE</div><h2>Ce que cette histoire suggère sur la ségrégation</h2><p className="hs-lead">Quatre mécanismes historiques à confronter aux données — des hypothèses de lecture, pas des conclusions.</p></div></div></Reveal>
          <div className="hs-mech">
            {[
              { i: <TrainFront />, t: "Le rail comme frontière", x: "La voie ferrée est décrite comme une « ligne de démarcation » : « derrière la voie ferrée » (DVF) devient un nom de quartier. Les écarts d'équipement se lisent-ils de part et d'autre du rail ?", c: "#0369a1", go: ["/geoportail", "Voir l'accessibilité"] },
              { i: <Flame />, t: "L'hygiénisme de 1911", x: "Déplacer un quartier « indigène » après la peste est une séparation spatiale justifiée par la santé. Les quartiers issus de ce déplacement ont-ils un niveau de vie et d'équipement différent ?", c: "#c2410c", go: ["/cartotheque", "Voir le niveau de vie"] },
              { i: <Users />, t: "Une ville de main-d'œuvre", x: "Une grande part des travailleurs sont sans statut (près de 87 % au DN en 1943) et viennent d'ailleurs. L'habitat populaire dense actuel prolonge-t-il cette géographie du travail ?", c: "#be123c", go: ["/dashboard", "Voir le tableau de bord"] },
              { i: <Building2 />, t: "La localisation des institutions", x: "Camps, base aérienne, école polytechnique, université, musée : où l'État a-t-il installé ses équipements, et qui en est proche aujourd'hui ?", c: "#6d28d9", go: ["/geoportail", "Explorer le Géoportail"] },
            ].map((m, i) => <Reveal key={m.t} delay={i * 90}><div className="hs-mech-card" style={{ ["--c" as any]: m.c }}><span>{m.i}</span><h4>{m.t}</h4><p>{m.x}</p><button onClick={() => navigate(m.go[0])}>{m.go[1]} <ArrowRight size={13} /></button></div></Reveal>)}
          </div>
          <Reveal><div className="hs-warn"><ShieldAlert size={18} /><p>Ces liens sont des <b>pistes de lecture</b>. Ils ne seront retenus que s'ils sont confirmés par les indicateurs de ségrégation (Gini, dissimilarité, Moran / LISA, profils de quartiers), désormais disponibles dans la page Analyse. Aucun lien de cause à effet n'est avancé ici.</p></div></Reveal>
        </div>
      </section>

      {/* ===== SOURCES ===== */}
      <footer className="hs-sources">
        <div className="hs-inner">
          <h3>Sources et références</h3>
          <div className="hs-src-grid">
            {SOURCES.map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer"><b>{s.id}</b><div><strong>{s.label} <ExternalLink size={12} /></strong><small>{s.note}</small></div></a>)}
          </div>
          <h4>Pour approfondir</h4>
          <ul>{FURTHER.map(f => <li key={f.label}>{f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.label}</a> : f.label}</li>)}</ul>
          <p>Cette page synthétise des sources secondaires accessibles en ligne ; les travaux d'historiens cités (Mbengue, Iba Der Thiam, etc.) restent les références à consulter pour une citation académique. Les dates et chiffres sont rapportés tels que publiés ; les divergences entre sources sont signalées dans le texte. Le fond de carte et les noms de quartiers proviennent de la base du projet (RGPH-5, ANSD, 2023).</p>
        </div>
      </footer>
    </div>
  );
}
