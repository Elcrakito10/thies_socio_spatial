import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip } from "recharts";
import {
  ChevronRight, Users, Home, Building2, Users2, Trophy, Scale, MapPinned, Download, Share2, Sparkles, Check,
  LayoutDashboard, Satellite, Store, Footprints, Car, Leaf, ShieldQuestion, GitCompare, Images, Navigation2, Fullscreen, Plus, Minus, Info,
} from "lucide-react";
import { INFRA_FAMILIES, CLASS_COLORS, CLASS_NAMES, LISA_CATS, computeStats, quartileClass, type QuartierFull } from "./Geoportail";
import { Counter } from "./ui";
import { QuartierDocuments, QuartierPhotos } from "./QuartierGallery";
import { dataFetch } from "./api";
import { computeLandCover, LC_CLASSES, type LandCover } from "./landcover";
import { askAssistant } from "./assistant/store";
import "./Profile.css";

type Props = { quartier: (QuartierFull & { annee?: number }) | null; allQuartiers: QuartierFull[]; census: any; navigate: (p: string) => void };
type Sec = "overview" | "demo" | "menages" | "infra" | "access" | "mobil" | "env" | "seg" | "compar" | "galerie";
const NAV: { key: Sec; label: string; icon: any }[] = [
  { key: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { key: "demo", label: "Démographie", icon: Users },
  { key: "menages", label: "Ménages", icon: Home },
  { key: "infra", label: "Infrastructures", icon: Building2 },
  { key: "access", label: "Accessibilité", icon: Footprints },
  { key: "mobil", label: "Mobilité", icon: Car },
  { key: "env", label: "Environnement", icon: Leaf },
  { key: "seg", label: "Indicateurs de ségrégation", icon: ShieldQuestion },
  { key: "compar", label: "Comparaison", icon: GitCompare },
  { key: "galerie", label: "Galerie & documents", icon: Images },
];
const fr = (n: number, d = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: d });
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
// point dans polygone (ray casting) : memes regles que le rattachement spatial des equipements aux quartiers
const inRing = (x: number, y: number, r: number[][]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inGeom = (x: number, y: number, g: any) => { const polys: number[][][][] = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []; return polys.some(pl => inRing(x, y, pl[0]) && !pl.slice(1).some(h => inRing(x, y, h))); };
const COMMUNE_LABEL = (c: string) => c.toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
const GRAD = ["linear-gradient(90deg,#f43f5e,#fb7185)", "linear-gradient(90deg,#3b82f6,#60a5fa)", "linear-gradient(90deg,#f59e0b,#fbbf24)", "linear-gradient(90deg,#22c55e,#4ade80)", "linear-gradient(90deg,#8b5cf6,#a78bfa)", "linear-gradient(90deg,#14b8a6,#2dd4bf)", "linear-gradient(90deg,#6366f1,#818cf8)", "linear-gradient(90deg,#ec4899,#f472b6)"];

function FitBoundary({ data }: { data: any }) {
  const map = useMap();
  useEffect(() => { const t = setTimeout(() => { map.invalidateSize({ animate: false }); const b = L.geoJSON(data).getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [36, 36], maxZoom: 16 }); }, 120); return () => clearTimeout(t); }, [map, data]);
  return null;
}
const Panel = ({ title, icon, aside, children, d = 0, cls = "" }: { title: string; icon: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; d?: number; cls?: string }) => (
  <section className={`pf-card pf-panel pf-in ${cls}`} style={{ ["--d" as any]: `${d}ms` }}>
    <header className="pf-ph"><span className="pf-ph-ico">{icon}</span><h3>{title}</h3>{aside}</header>{children}
  </section>
);
const Soon = ({ text }: { text: string }) => <div className="pf-soon"><Info size={15} /><span>{text}<em>Cette information n'est pas encore disponible dans les données.</em></span></div>;

export default function Profile({ quartier, allQuartiers, census, navigate }: Props) {
  const [sec, setSec] = useState<Sec>("overview");
  const [copied, setCopied] = useState(false);
  const [infra, setInfra] = useState<Record<string, any[]> | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const mapWrap = useRef<HTMLDivElement>(null);
  const [lc, setLc] = useState<LandCover | null>(null);
  const [lcBusy, setLcBusy] = useState<number | null>(null);
  const [lcErr, setLcErr] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 }); setSec("overview"); setInfra(null); setLcErr(null); setLcBusy(null);
    try { const c = localStorage.getItem(`lc_v1_${quartier?.quartier_id}`); setLc(c ? JSON.parse(c) : null); } catch { setLc(null); }
  }, [quartier?.quartier_id]);
  const runLc = async () => {
    if (!quartier || lcBusy !== null) return; setLcErr(null); setLcBusy(0);
    try { const r = await computeLandCover(quartier.geometry, setLcBusy); setLc(r); try { localStorage.setItem(`lc_v1_${quartier.quartier_id}`, JSON.stringify(r)); } catch { /* quota */ } }
    catch (e: any) { setLcErr(e?.message || "Échec du calcul"); }
    setLcBusy(null);
  };
  // Detail des equipements du quartier (chargement a la demande, onglet Infrastructures)
  useEffect(() => {
    if (sec !== "infra" || infra || !quartier) return;
    let alive = true; const geom = quartier.geometry;
    Promise.all(INFRA_FAMILIES.map(f => dataFetch(`/data/infrastructures/infra_${f.key}.geojson`).then(r => r.json()).then(g => [f.key, g.features.filter((x: any) => geom && inGeom(x.geometry.coordinates[0], x.geometry.coordinates[1], geom)).map((x: any) => x.properties)] as const)))
      .then(rows => { if (alive) setInfra(Object.fromEntries(rows)); }).catch(() => { if (alive) setInfra({}); });
    return () => { alive = false; };
  }, [sec, infra, quartier]);

  if (!quartier) {
    return <div className="pf"><div className="pf-wrap"><section className="pf-card pf-empty pf-in"><MapPinned size={34} /><h2>Aucun quartier sélectionné</h2><p>Ouvrez le Géoportail, cliquez sur un quartier puis « Voir la fiche complète du quartier ».</p><button className="pf-btn primary" onClick={() => navigate("/geoportail")}>Ouvrir le Géoportail</button></section></div></div>;
  }
  const q = quartier;
  const hab = q.population, men = q.menages;
  const taille = men ? hab / men : null;
  const tot = q.hommes + q.femmes;
  const pH = tot ? q.hommes / tot * 100 : 0, pF = tot ? q.femmes / tot * 100 : 0;
  const ratio = q.femmes ? q.hommes / q.femmes : null;
  const communeRows = allQuartiers.filter(x => norm(x.commune) === norm(q.commune));
  const rank = [...communeRows].sort((a, b) => b.population - a.population).findIndex(x => x.quartier_id === q.quartier_id) + 1;
  const cPop = census?.par_commune?.[q.commune]?.population ?? census?.par_commune?.[q.commune.toUpperCase()]?.population ?? 0;
  const share = cPop ? q.population / cPop * 100 : null;
  const geo = q.geometry ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: q.geometry }] } : null;
  const others = useMemo(() => ({ type: "FeatureCollection", features: allQuartiers.filter(x => x.quartier_id !== q.quartier_id && x.geometry).map(x => ({ type: "Feature", properties: {}, geometry: x.geometry })) }), [allQuartiers, q.quartier_id]);
  const totEq = INFRA_FAMILIES.reduce((s, f) => s + ((q as any)[`nb_${f.key}`] || 0), 0);
  const q4 = (get: (x: QuartierFull) => number | null | undefined, v: number | null | undefined) => {
    const st = computeStats(allQuartiers.map(get).filter((x): x is number => typeof x === "number" && Number.isFinite(x)));
    return typeof v === "number" ? quartileClass(v, st) : null;
  };
  const Q = ["Q1 · Faible", "Q2 · Moyen-faible", "Q3 · Moyen-élevé", "Q4 · Élevé"];
  const med = (rows: QuartierFull[], get: (x: QuartierFull) => number | null | undefined) => computeStats(rows.map(get).filter((x): x is number => typeof x === "number" && Number.isFinite(x)))?.median ?? null;

  const share_ = async () => {
    const txt = `${q.nom} (${COMMUNE_LABEL(q.commune)}) — ${fr(hab)} habitants, ${fr(men)} ménages — Thiès, Ségrégation socio-spatiale`;
    try { if (navigator.share) await navigator.share({ title: q.nom, text: txt }); else { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1800); } } catch { /* annule */ }
  };
  const kpis = [
    { tone: "blue", icon: <Users size={26} />, v: <Counter value={hab} duration={1200} />, l: "Habitants", s: "RGPH-5 · 2023" },
    { tone: "green", icon: <Home size={26} />, v: <Counter value={men} duration={1200} />, l: "Ménages", s: "recensés" },
    { tone: "orange", icon: <Building2 size={26} />, v: taille === null ? "—" : fr(taille, 1), l: "Taille moyenne", s: "personnes / ménage" },
    { tone: "purple", icon: <Users2 size={26} />, v: null, l: "", s: "" },
    { tone: "teal", icon: <Trophy size={26} />, v: rank ? `#${rank}` : "—", l: "Rang communal", s: `sur ${communeRows.length} quartiers` },
    { tone: "red", icon: <Scale size={26} />, v: ratio === null ? "—" : fr(ratio, 2), l: "Ratio H / F", s: "hommes pour 1 femme" },
  ];
  const sexData = [{ name: "Hommes", value: q.hommes, c: "#3b82f6" }, { name: "Femmes", value: q.femmes, c: "#d946ef" }];

  // ---------- blocs ----------
  const MapCard = (
    <section className="pf-card pf-map-card pf-in" style={{ ["--d" as any]: "320ms" }} ref={mapWrap}>
      <header className="pf-map-head"><MapPinned size={16} /> Localisation du quartier</header>
      {geo ? (
        <MapContainer ref={setMap} center={[14.79, -16.93]} zoom={14} zoomControl={false} scrollWheelZoom className="pf-map" preferCanvas>
          <TileLayer attribution="Imagerie © Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
          <FitBoundary data={geo} />
          <GeoJSON data={others as any} style={{ color: "rgba(255,255,255,.55)", weight: 1, fillOpacity: 0 }} interactive={false} />
          <GeoJSON data={geo as any} style={{ color: "#22d3ee", weight: 3.5, fillColor: "#22d3ee", fillOpacity: 0.26 }} onEachFeature={(_, l) => l.bindTooltip(q.nom, { permanent: true, direction: "center", className: "pf-map-label" })} />
        </MapContainer>
      ) : <div className="pf-nogeo"><MapPinned size={28} /><span>Géométrie non disponible pour ce quartier.</span></div>}
      <div className="pf-north"><Navigation2 size={15} />N</div>
      <div className="pf-zoom"><button onClick={() => map?.zoomIn()} aria-label="Zoomer"><Plus size={16} /></button><button onClick={() => map?.zoomOut()} aria-label="Dézoomer"><Minus size={16} /></button></div>
      <button className="pf-fs" onClick={() => { const el = mapWrap.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.().then(() => setTimeout(() => map?.invalidateSize(), 250)).catch(() => {}); }}><Fullscreen size={15} /> Voir en plein écran</button>
    </section>
  );

  const SexPanel = (
    <Panel title="Population par sexe" icon={<Users size={15} />} d={400}>
      <div className="pf-sex">
        <div className="pf-sex-chart">
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={sexData} dataKey="value" innerRadius="62%" outerRadius="95%" paddingAngle={3} stroke="none" startAngle={90} endAngle={-270} animationDuration={1300}>{sexData.map(s => <Cell key={s.name} fill={s.c} />)}</Pie><RTooltip contentStyle={{ background: "rgba(8,16,36,.95)", border: "1px solid rgba(120,150,255,.3)", borderRadius: 10, fontSize: 12 }} formatter={(v: any) => `${fr(v)} hab.`} /></PieChart></ResponsiveContainer>
          <div className="pf-sex-c"><b>{fr(tot)}</b><span>habitants</span></div>
        </div>
        <div className="pf-sex-bars">
          <div><span><i style={{ background: "#3b82f6" }} />Hommes</span><b>{fr(pH, 1)} %</b><div className="pf-track"><em style={{ width: `${pH}%`, background: "linear-gradient(90deg,#3b82f6,#60a5fa)" }} /></div><small>{fr(q.hommes)} hab.</small></div>
          <div><span><i style={{ background: "#d946ef" }} />Femmes</span><b>{fr(pF, 1)} %</b><div className="pf-track"><em style={{ width: `${pF}%`, background: "linear-gradient(90deg,#d946ef,#f0abfc)" }} /></div><small>{fr(q.femmes)} hab.</small></div>
        </div>
      </div>
      <small className="pf-note">La pyramide des âges n'est pas disponible : les données du quartier ne contiennent pas l'âge.</small>
    </Panel>
  );

  const InfraPanel = (
    <Panel title="Équipements du quartier" icon={<Building2 size={15} />} d={480} aside={<button className="pf-link" onClick={() => setSec("infra")}>Voir tout <ChevronRight size={12} /></button>}>
      <div className="pf-inf">
        {INFRA_FAMILIES.map(f => { const Ic = f.icon; const n = (q as any)[`nb_${f.key}`] || 0; return (
          <div key={f.key} className="pf-inf-t"><span style={{ background: f.color }}><Ic size={17} /></span><b>{fr(n)}</b><small>{f.label}</small></div>); })}
      </div>
      <small className="pf-note">{fr(totEq)} équipement(s) situé(s) dans les limites du quartier ({q.surface_km2 ?? "—"} km²).</small>
    </Panel>
  );

  const AccPanel = (
    <Panel title="Accessibilité aux services" icon={<Footprints size={15} />} d={540} aside={<button className="pf-link" onClick={() => setSec("access")}>Détails <ChevronRight size={12} /></button>}>
      <ul className="pf-bars">
        {INFRA_FAMILIES.map((f, i) => { const v = (q as any)[`acc_${f.key}`] as number | null; const Ic = f.icon; return (
          <li key={f.key}><span className="pf-bar-l"><Ic size={13} style={{ color: f.color }} />{f.label}</span><span className="pf-track"><em style={{ width: `${(v ?? 0) * 100}%`, background: GRAD[i], animationDelay: `${300 + i * 80}ms` }} /></span><b>{v === null ? "—" : fr(v, 2)}</b></li>); })}
      </ul>
      <small className="pf-note">Indice d'accessibilité de 0 (faible) à 1 (forte) ; les temps de trajet en minutes ne sont pas calculés.</small>
    </Panel>
  );

  const AcpPanel = (
    <Panel title="Profil socio-économique" icon={<Scale size={15} />} d={600}>
      <div className="pf-rings">
        {[{ l: "Instruction", v: q.ind_instruction_0_1, c: "#a855f7", get: (x: QuartierFull) => x.ind_instruction_0_1 }, { l: "Richesse matérielle", v: q.ind_niveau_vie_0_1, c: "#ec4899", get: (x: QuartierFull) => x.ind_niveau_vie_0_1 }].map(r => {
          const cl = q4(r.get, r.v);
          return <div key={r.l} className="pf-ring"><div className="pf-ring-c" style={{ ["--p" as any]: `${(r.v ?? 0) * 100}`, ["--c" as any]: r.c }}><b>{r.v === null ? "—" : fr(r.v, 2)}</b><small>/ 1</small></div><span>{r.l}</span><em>{cl === null ? "—" : Q[cl]}</em></div>;
        })}
      </div>
      {q.classe ? <div className="pf-profile-pill" style={{ ["--c" as any]: CLASS_COLORS[q.classe - 1] }}><i /><span>Profil {q.classe} · <b>{CLASS_NAMES[q.classe - 1]}</b></span><button className="pf-link" onClick={() => setSec("seg")}>Détails <ChevronRight size={12} /></button></div> : null}
    </Panel>
  );

  const lisaRows: { l: string; k: keyof QuartierFull }[] = [
    { l: "Niveau d'instruction", k: "LISA_instruction_0_1" }, { l: "Richesse matérielle", k: "LISA_niveau_vie_0_1_corrige" },
    { l: "Offre d'infrastructures", k: "LISA_offre_infra_0_1" }, { l: "Accessibilité globale", k: "LISA_acces_global_moyen_0_1" },
    { l: "Indice d'attractivité", k: "LISA_indice_attractivite" }, { l: "Flux émis", k: "LISA_flux_emis" }, { l: "Flux reçus", k: "LISA_flux_recus" },
  ];
  const lisaOf = (k: string | null | undefined) => LISA_CATS.find(c => c.key === k);
  const fr0 = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : fr(v, d));
  const SegPanels = (
    <>
      <div className="pf-row2">
        <Panel title="Profil du quartier (K-means)" icon={<ShieldQuestion size={15} />} d={80}>
          {q.classe ? <>
            <div className="pf-profile-big" style={{ ["--c" as any]: CLASS_COLORS[q.classe - 1] }}><span>{q.classe}</span><div><b>{CLASS_NAMES[q.classe - 1]}</b><small>1 des 5 profils types de la ville de Thiès</small></div></div>
            <ul className="pf-facts">
              <li><span>Axe 1 de l'ACP (niveau socio-éducatif)</span><b>{fr0(q.CP1)}</b></li>
              <li><span>Axe 2 de l'ACP (urbanité)</span><b>{fr0(q.CP2)}</b></li>
              <li><span>Silhouette (cohérence avec la classe)</span><b>{fr0(q.silhouette)}</b></li>
              <li><span>Indice d'instruction</span><b>{fr0(q.ind_instruction_0_1)} · {q.instruction_quartile?.split(" - ")[0] ?? "—"}</b></li>
              <li><span>Indice de richesse matérielle</span><b>{fr0(q.ind_niveau_vie_0_1)} · {q.niveau_vie_quartile?.split(" - ")[0] ?? "—"}</b></li>
              <li><span>Offre d'infrastructures</span><b>{fr0(q.offre_infra_0_1)} · {q.offre_infra_quartile?.split(" - ")[0] ?? "—"}</b></li>
            </ul>
          </> : <Soon text="Profil du quartier" />}
        </Panel>
        <Panel title="Autocorrélation spatiale (LISA)" icon={<Scale size={15} />} d={140}>
          <ul className="pf-lisa">{lisaRows.map(r => { const c = lisaOf(q[r.k] as string | null); return (
            <li key={r.k as string}><span>{r.l}</span>{c ? <em style={{ background: c.color, color: c.key === "NS" || c.key === "LH" || c.key === "HL" ? "#0b1220" : "#fff" }} title={c.label}>{c.key}</em> : <em className="na">—</em>}</li>); })}</ul>
          <small className="pf-note">HH : fortes valeurs entourées de fortes valeurs · LL : faibles entourées de faibles · LH / HL : valeur atypique · NS : non significatif (p &lt; 0,05, 999 permutations, voisinage Queen).</small>
        </Panel>
      </div>
      <div className="pf-row2">
        <Panel title="Structure scolaire & ségrégation" icon={<Users2 size={15} />} d={200}>
          {q.part_sans_niveau === null || q.part_sans_niveau === undefined ? <Soon text="Répartition par niveau d'instruction de ce quartier" /> : <>
            <ul className="pf-bars">{[["Sans niveau", q.part_sans_niveau, q.LQ_sans_niveau], ["Préscolaire", q.part_prescolaire, q.LQ_prescolaire], ["Primaire", q.part_primaire, q.LQ_primaire], ["Moyen", q.part_moyen, q.LQ_moyen], ["Secondaire", q.part_secondaire, q.LQ_secondaire], ["Supérieur", q.part_superieur, q.LQ_superieur]].map(([l, p], i) => (
              <li key={l as string}><span className="pf-bar-l">{l}</span><span className="pf-track"><em style={{ width: `${Math.min(100, ((p as number) ?? 0) * 100 * 2.2)}%`, background: GRAD[i % GRAD.length], animationDelay: `${300 + i * 80}ms` }} /></span><b>{fr((p as number) * 100, 1)} %</b></li>))}</ul>
            <div className="pf-lq">{[["Sans niveau", q.LQ_sans_niveau], ["Supérieur", q.LQ_superieur]].map(([l, v]) => <div key={l as string} className={(v as number) > 1.1 ? "up" : (v as number) < 0.9 ? "down" : ""}><small>Coefficient de localisation · {l}</small><b>{fr0(v as number)}</b><em>{(v as number) > 1.1 ? "surreprésenté" : (v as number) < 0.9 ? "sous-représenté" : "proche de la ville"}</em></div>)}</div>
            <small className="pf-note">Coefficient de localisation = part dans le quartier / part dans la ville (1 = identique). Diversité scolaire locale : {fr0(q.entropie_scolaire_locale)} (maximum 1,79).</small>
          </>}
        </Panel>
        <Panel title="Lecture des résultats" icon={<Info size={15} />} d={260}>
          <ul className="pf-facts">
            <li><span>Source</span><b>Analyse validée par l'encadreur</b></li>
            <li><span>Méthodes</span><b>ACP · K-means · LISA</b></li>
            <li><span>Unité d'analyse</span><b>65 quartiers</b></li>
          </ul>
          <small className="pf-note">Les indices globaux (Gini, Theil, dissimilarité, Moran…) concernent la ville entière : ils sont présentés dans la page Ségrégation. Les indices de ségrégation ne se calculent pas pour un seul quartier ; la fiche montre sa position (profil, clusters, coefficients de localisation).</small>
          <button className="pf-btn" style={{ marginTop: 10 }} onClick={() => navigate("/segregation")}><Scale size={15} /> Voir les indices de la ville</button>
        </Panel>
      </div>
    </>
  );


  const eqRows = INFRA_FAMILIES.map(f => ({ key: f.key, name: f.label, color: f.color, value: (q as any)[`nb_${f.key}`] || 0 }));
  const EquipDonut = (
    <Panel title="Répartition des équipements" icon={<Building2 size={15} />} d={560}>
      {totEq === 0 ? <Soon text="Aucun équipement recensé dans ce quartier" /> : (
        <div className="pf-donut">
          <div className="pf-donut-chart">
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={eqRows.filter(r => r.value > 0)} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="96%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} animationDuration={1300}>{eqRows.filter(r => r.value > 0).map(r => <Cell key={r.key} fill={r.color} />)}</Pie><RTooltip contentStyle={{ background: "rgba(8,16,36,.95)", border: "1px solid rgba(120,150,255,.3)", borderRadius: 10, fontSize: 12 }} formatter={(v: any, n: any) => [`${fr(v)} équipement(s)`, n]} /></PieChart></ResponsiveContainer>
            <div className="pf-donut-c"><b>{fr(totEq)}</b><span>équipements</span></div>
          </div>
          <ul className="pf-donut-leg">{eqRows.map(r => <li key={r.key}><i style={{ background: r.color }} /><span>{r.name}</span><b>{fr(r.value / totEq * 100, r.value / totEq < 0.1 && r.value > 0 ? 1 : 0)}%</b></li>)}</ul>
        </div>)}
    </Panel>
  );

  const lcTot = lc ? lc.px : 0;
  const LandPanel = (
    <Panel title="Occupation du sol" icon={<Satellite size={15} />} d={620}>
      {lc ? (
        <div className="pf-donut">
          <div className="pf-donut-chart">
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={LC_CLASSES.map(c => ({ name: c.label, value: lc[c.key], c: c.color }))} dataKey="value" innerRadius="64%" outerRadius="96%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} animationDuration={1300}>{LC_CLASSES.map(c => <Cell key={c.key} fill={c.color} />)}</Pie><RTooltip contentStyle={{ background: "rgba(8,16,36,.95)", border: "1px solid rgba(120,150,255,.3)", borderRadius: 10, fontSize: 12 }} formatter={(v: any, n: any) => [`${fr(v * lc.m2px / 1e6, 3)} km²`, n]} /></PieChart></ResponsiveContainer>
            <div className="pf-donut-c"><b>{fr(lcTot * lc.m2px / 1e6, 3)}</b><span>km² analysés</span></div>
          </div>
          <ul className="pf-donut-leg">{LC_CLASSES.map(c => <li key={c.key}><i style={{ background: c.color }} /><span>{c.label}</span><b>{fr(lc[c.key] / lcTot * 100, 0)}%</b></li>)}</ul>
        </div>
      ) : (
        <div className="pf-lc-empty">
          <Satellite size={26} />
          <p>Calculer la part de végétation, de sol nu / bâti et de zones sombres à partir de l'imagerie satellite de ce quartier.</p>
          <button className="pf-btn primary" onClick={runLc} disabled={lcBusy !== null || !q.geometry}>{lcBusy === null ? "Analyser l'imagerie satellite" : `Analyse en cours… ${Math.round(lcBusy * 100)} %`}</button>
          {lcBusy !== null && <div className="pf-track"><em style={{ width: `${lcBusy * 100}%`, animation: "none" }} /></div>}
          {lcErr && <span className="pf-err">{lcErr}</span>}
        </div>
      )}
      <small className="pf-note">Estimation indicative par classification des couleurs de l'imagerie Esri (résolution ≈ {lc ? fr(Math.sqrt(lc.m2px), 1) : "1–2"} m). Le bâti et le sol nu ne peuvent pas être distingués par la couleur seule ; ce n'est pas une cartographie validée.{lc && <> <button className="pf-link inline" onClick={() => { setLc(null); try { localStorage.removeItem(`lc_v1_${q.quartier_id}`); } catch { /* */ } }}>Recalculer</button></>}</small>
    </Panel>
  );

  const missing = (
    <Panel title="Données non disponibles" icon={<Info size={15} />} d={660}>
      <ul className="pf-missing">
        {["Pyramide des âges", "Répartition des ménages par taille", "Évolution de la population du quartier"].map(t => <li key={t}>{t}<em>À venir</em></li>)}
      </ul>
    </Panel>
  );

  // ---------- vues ----------
  const view: Record<Sec, React.ReactNode> = {
    overview: <>
      <div className="pf-row2">{MapCard}{SexPanel}</div>
      <div className="pf-row3">{InfraPanel}{AccPanel}{AcpPanel}</div>
      <div className="pf-row2c">{EquipDonut}{LandPanel}</div>
      <div className="pf-row2b">{missing}</div>
    </>,
    demo: <div className="pf-row2">{SexPanel}
      <Panel title="Poids dans la commune" icon={<Users2 size={15} />} d={120}>
        <div className="pf-big"><b>{share === null ? "—" : `${fr(share, 2)} %`}</b><span>de la population de {COMMUNE_LABEL(q.commune)}</span></div>
        <ul className="pf-facts"><li><span>Rang dans la commune</span><b>#{rank} / {communeRows.length}</b></li><li><span>Écart hommes / femmes</span><b>{fr(Math.abs(q.hommes - q.femmes))} hab.</b></li><li><span>Quartile de population (ville)</span><b>{(() => { const c = q4(x => x.population, q.population); return c === null ? "—" : Q[c]; })()}</b></li></ul>
      </Panel>{missing}</div>,
    menages: <div className="pf-row2"><Panel title="Structure des ménages" icon={<Home size={15} />}>
        <div className="pf-big"><b>{taille === null ? "—" : fr(taille, 1)}</b><span>personnes par ménage en moyenne</span></div>
        <ul className="pf-facts"><li><span>Ménages recensés</span><b>{fr(men)}</b></li><li><span>Moyenne de la commune</span><b>{(() => { const m = communeRows.reduce((s, x) => s + x.menages, 0); const p = communeRows.reduce((s, x) => s + x.population, 0); return m ? fr(p / m, 1) : "—"; })()}</b></li><li><span>Moyenne de la ville</span><b>{(() => { const m = allQuartiers.reduce((s, x) => s + x.menages, 0); const p = allQuartiers.reduce((s, x) => s + x.population, 0); return m ? fr(p / m, 1) : "—"; })()}</b></li></ul>
      </Panel><Panel title="Répartition par taille" icon={<Info size={15} />}><Soon text="Répartition des ménages par taille" /></Panel></div>,
    infra: <div className="pf-row2"><div className="pf-col">{InfraPanel}{EquipDonut}</div>
      <Panel title="Détail des équipements" icon={<Store size={15} />} d={120}>
        {!infra ? <div className="pf-loading">Chargement des équipements…</div> : <div className="pf-list">
          {INFRA_FAMILIES.map(f => { const rows = infra[f.key] || []; if (!rows.length) return null; const Ic = f.icon; return (
            <div key={f.key} className="pf-list-g"><h4><span style={{ background: f.color }}><Ic size={12} /></span>{f.label} <b>{rows.length}</b></h4>
              <ul>{rows.slice(0, 8).map((r, i) => <li key={i}>{r.nom || "Sans nom"}<em>{r.type || ""}</em></li>)}{rows.length > 8 && <li className="more">+ {rows.length - 8} autres</li>}</ul></div>); })}
          {!Object.values(infra).some(a => a.length) && <Soon text="Aucun équipement rattaché à ce quartier" />}
        </div>}
      </Panel></div>,
    access: <div className="pf-row2">{AccPanel}<Panel title="Densités d'équipements" icon={<Building2 size={15} />} d={120}>
        <ul className="pf-facts">{INFRA_FAMILIES.map(f => { const v = (q as any)[`dens_${f.key}`]; return <li key={f.key}><span>{f.label}</span><b>{v === null || v === undefined ? "—" : `${fr(v, 1)} /km²`}</b></li>; })}</ul>
        <div className="pf-glob">Accessibilité globale <b>{q.acc_globale === null ? "—" : fr(q.acc_globale, 2)}</b><em>{(() => { const c = q4(x => x.acc_globale, q.acc_globale); return c === null ? "" : Q[c]; })()}</em></div>
      </Panel></div>,
    mobil: <div className="pf-row2"><Panel title="Accessibilité routière" icon={<Car size={15} />}>
        <div className="pf-big"><b>{q.acc_routiere_indice === null ? "—" : fr(q.acc_routiere_indice, 2)}</b><span>indice d'accessibilité routière (0 à 1)</span></div>
        <ul className="pf-facts"><li><span>Distance moyenne à la route</span><b>{q.acc_routiere_dist_m === null ? "—" : `${fr(q.acc_routiere_dist_m, 0)} m`}</b></li><li><span>Équipements de transport</span><b>{fr(q.nb_transport)}</b></li><li><span>Accessibilité aux transports</span><b>{q.acc_transport === null ? "—" : fr(q.acc_transport, 2)}</b></li></ul>
      </Panel><Panel title="Flux et attractivité" icon={<Navigation2 size={15} />}>
        {q.flux_recus === null || q.flux_recus === undefined ? <Soon text="Flux de déplacements de ce quartier" /> : <>
          <div className="pf-big"><b>{fr0(q.indice_attractivite)}</b><span>indice d'attractivité (−1 émetteur · +1 attractif) · {q.categorie_attractivite ?? "—"}</span></div>
          <ul className="pf-facts"><li><span>Flux émis</span><b>{q.flux_emis === null || q.flux_emis === undefined ? "—" : fr(q.flux_emis)}</b></li><li><span>Flux reçus</span><b>{fr(q.flux_recus)}</b></li><li><span>Solde des échanges</span><b>{q.solde_echanges === null || q.solde_echanges === undefined ? "—" : fr(q.solde_echanges)}</b></li><li><span>Émission par habitant (LQ)</span><b>{fr0(q.LQ_emission_hab)}</b></li><li><span>Réception par habitant (LQ)</span><b>{fr0(q.LQ_reception_hab)}</b></li></ul>
        </>}
      </Panel></div>,
    env: <div className="pf-row2c">{LandPanel}<Panel title="Environnement" icon={<Leaf size={15} />}><Soon text="Espaces verts officiels, risques (inondation, érosion)" /></Panel></div>,
    seg: SegPanels,
    compar: (() => {
      const rows: { l: string; v: number | null | undefined; c: number | null; w: number | null; unit: string; d: number }[] = [
        { l: "Population", get: (x: QuartierFull) => x.population, d: 0, unit: "hab." }, { l: "Taille de ménage", get: (x: QuartierFull) => (x.menages ? x.population / x.menages : null), d: 1, unit: "pers." },
        { l: "Accessibilité globale", get: (x: QuartierFull) => x.acc_globale, d: 2, unit: "" }, { l: "Accessibilité routière", get: (x: QuartierFull) => x.acc_routiere_indice, d: 2, unit: "" },
        { l: "Instruction (0-1)", get: (x: QuartierFull) => x.ind_instruction_0_1, d: 2, unit: "" }, { l: "Richesse matérielle (0-1)", get: (x: QuartierFull) => x.ind_niveau_vie_0_1, d: 2, unit: "" },
        { l: "Offre d'infrastructures (0-1)", get: (x: QuartierFull) => x.offre_infra_0_1, d: 2, unit: "" }, { l: "Indice d'attractivité (−1 à +1)", get: (x: QuartierFull) => x.indice_attractivite, d: 2, unit: "" },
      ].map(r => ({ l: r.l, v: r.get(q), c: med(communeRows, r.get), w: med(allQuartiers, r.get), unit: r.unit, d: r.d }));
      return <div className="pf-row2b"><Panel title={`${q.nom} comparé à sa commune et à la ville`} icon={<GitCompare size={15} />}>
        <table className="pf-cmp"><thead><tr><th>Indicateur</th><th>Ce quartier</th><th>Médiane {COMMUNE_LABEL(q.commune)}</th><th>Médiane ville</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.l}><td>{r.l}</td><td><b>{r.v === null || r.v === undefined ? "—" : fr(r.v, r.d)}</b></td><td>{r.c === null ? "—" : fr(r.c, r.d)}</td><td>{r.w === null ? "—" : fr(r.w, r.d)}</td></tr>)}</tbody></table>
        <small className="pf-note">Médianes calculées sur les {communeRows.length} quartiers de la commune et les {allQuartiers.length} quartiers de la ville.</small></Panel></div>;
    })(),
    galerie: <div className="pf-row2"><Panel title="Documents sur le quartier" icon={<Images size={15} />}><QuartierDocuments nom={q.nom} /></Panel><Panel title="Photographies" icon={<Images size={15} />}><QuartierPhotos id={q.quartier_id} nom={q.nom} /></Panel></div>,
  };

  return (
    <div className="pf">
      <div className="pf-wrap">
        <aside className="pf-side">
          <nav className="pf-card pf-nav pf-in" aria-label="Sections de la fiche">
            {NAV.map(n => { const Ic = n.icon; return <button key={n.key} className={sec === n.key ? "on" : ""} onClick={() => setSec(n.key)}><Ic size={17} />{n.label}</button>; })}
          </nav>
          <div className="pf-card pf-city pf-in" style={{ ["--d" as any]: "200ms" }}><div className="pf-city-img" /><div><b>Ville de Thiès</b><small>Territoire, données et analyses pour un développement inclusif</small></div></div>
        </aside>

        <main className="pf-main">
          <nav className="pf-crumbs" aria-label="Fil d'Ariane"><button onClick={() => navigate("/")}>Accueil</button><ChevronRight size={12} /><button onClick={() => navigate("/geoportail")}>Carte</button><ChevronRight size={12} /><span className="c">{COMMUNE_LABEL(q.commune)}</span><ChevronRight size={12} /><b>{q.nom}</b></nav>
          <header className="pf-head pf-in">
            <div><h1>{q.nom} <span className="pf-chip">{COMMUNE_LABEL(q.commune)}</span></h1><p>Fiche territoriale détaillée : démographie, infrastructures, accessibilité et indicateurs socio-spatiaux.</p></div>
            <div className="pf-actions">
              <button className="pf-btn" onClick={() => navigate("/geoportail")}><MapPinned size={15} /> Voir sur la carte</button>
              <button className="pf-btn" onClick={() => window.print()}><Download size={15} /> Exporter la fiche (PDF)</button>
              <button className="pf-btn" onClick={share_}>{copied ? <><Check size={15} /> Copié</> : <><Share2 size={15} /> Partager</>}</button>
              <button className="pf-btn ai" onClick={() => askAssistant({ type: "ask", text: `Profil de ${q.nom}` })}><Sparkles size={15} /> Assistant</button>
            </div>
          </header>

          <div className="pf-kpis">
            {kpis.map((k, i) => (
              <div key={i} className="pf-card pf-kpi pf-in" style={{ ["--d" as any]: `${80 + i * 70}ms` }}>
                <span className={`pf-kpi-ico ${k.tone}`}>{k.icon}</span>
                {k.v === null ? (
                  <div className="pf-kpi-sex"><div><b>{fr(pH, 1)} %</b><small>Hommes</small></div>
                    <div className="pf-mini-donut" style={{ background: `conic-gradient(#3b82f6 0 ${pH}%, #d946ef ${pH}% 100%)` }} />
                    <div><b>{fr(pF, 1)} %</b><small>Femmes</small></div></div>
                ) : <div><b>{k.v}</b><span>{k.l}</span><small>{k.s}</small></div>}
              </div>
            ))}
          </div>

          {view[sec]}
        </main>
      </div>
    </div>
  );
}
