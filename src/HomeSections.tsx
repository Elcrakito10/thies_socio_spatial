import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ZoomIn, Users, MapPinned, Building2, Grid3x3, Route as RouteIcon, Ruler, Map as MapIcon, Database, BarChart3, Activity } from "lucide-react";
import { Reveal, Counter } from "./ui";
import { INFRA_FAMILIES, type QuartierFull } from "./Geoportail";
import { MapCanvas, buildMaps, useMapPrep, LegendBar, FAMILIES } from "./Cartotheque";
import { useMapStat, fmt as fmtS } from "./CartoStats";
import "./Pages.css";
import "./HomeBlocks.css";
import { dataFetch } from "./api";

type QGeo = QuartierFull & { geometry: any };
type CatalogItem = { id: string; name: string; count: number };

function Heading({ eyebrow, title, accent }: { eyebrow: string; title: string; accent?: string }) {
  return <div className="hx-heading"><div className="pg-eyebrow"><i />{eyebrow}</div><h2>{title}{accent && <><br /><span>{accent}</span></>}</h2></div>;
}

function MiniMap({ id, quartiers, onOpen }: { id: string; quartiers: QGeo[]; onOpen: () => void }) {
  const def = useMemo(() => buildMaps().find(m => m.id === id)!, [id]);
  const { prep, base } = useMapPrep(def, quartiers, null);
  const stat = useMapStat(def, quartiers, null);
  const fam = FAMILIES[def.family];
  return (
    <button className="hz-mini" style={{ ["--accent" as any]: fam.color }} onClick={onOpen}>
      <div className="hz-mini-plate"><MapCanvas def={def} prep={prep} base={base} aspect={0.8} animate={false} /></div>
      <div className="hz-mini-body">
        <small><i />{fam.label}</small>
        <h3>{def.title}</h3>
        {stat && <div className="hz-mini-stats"><span>Moy. <b>{fmtS(stat.st.mean)}</b></span><span>Méd. <b>{fmtS(stat.st.median)}</b></span><span>Max <b>{fmtS(stat.st.max)}</b></span></div>}
      </div>
    </button>
  );
}

type MapDefT = ReturnType<typeof buildMaps>[number];
function Atlas({ defs, quartiers, onExplore }: { defs: MapDefT[]; quartiers: QGeo[]; onExplore: (id: string) => void }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => { if (!auto) return; const t = setInterval(() => setI(x => (x + 1) % defs.length), 6000); return () => clearInterval(t); }, [auto, defs.length]);
  const def = defs[i];
  const { prep, base } = useMapPrep(def, quartiers, null);
  const stat = useMapStat(def, quartiers, null);
  const fam = FAMILIES[def.family];
  return (
    <div className="hz-atlas" style={{ ["--accent" as any]: fam.color }}>
      <nav className="hz-atlas-list" aria-label="Indicateurs">
        {defs.map((d, k) => (
          <button key={d.id} className={k === i ? "on" : ""} style={{ ["--dot" as any]: FAMILIES[d.family].color }} onClick={() => { setI(k); setAuto(false); }}>
            <i /><span><b>{d.title}</b><small>{FAMILIES[d.family].label}</small></span>
          </button>
        ))}
      </nav>
      <div className="hz-atlas-map"><MapCanvas def={def} prep={prep} base={base} aspect={0.86} /></div>
      <div className="hz-atlas-info">
        <small className="hz-kicker"><i />{fam.label}</small>
        <h3 key={def.id}>{def.title}</h3>
        <p>{def.desc}</p>
        <LegendBar def={def} prep={prep} />
        {stat && <dl className="hz-atlas-stats"><div><dt>Moyenne</dt><dd>{fmtS(stat.st.mean)}</dd></div><div><dt>Médiane</dt><dd>{fmtS(stat.st.median)}</dd></div><div><dt>Maximum</dt><dd>{fmtS(stat.st.max)}</dd></div></dl>}
        <button className="hz-btn" onClick={() => onExplore(def.indicator)}>Explorer cette carte <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

export default function HomeSections({ quartiers, navigate, onExplore }: { quartiers: QGeo[]; navigate: (p: string) => void; onExplore: (id: string) => void }) {
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  useEffect(() => { dataFetch("/data/datasets_catalog.json").then(r => r.json()).then(setCatalog).catch(() => setCatalog([])); }, []);
  const [rgph, setRgph] = useState<number | null>(null);
  useEffect(() => { dataFetch("/data/census_summary.json").then(r => r.json()).then(j => setRgph(j.population)).catch(() => {}); }, []);
  const count = (id: string) => catalog?.find(c => c.id === id)?.count ?? 0;

  const defs = useMemo(() => {
    const all = buildMaps();
    return ["population", "dens_commerce", "niveau_vie", "instruction", "densite_pop"].map(id => all.find(m => m.id === id)!);
  }, []);

  // ---- Enseignements calcules en direct (aucune valeur saisie a la main) ----
  const facts = useMemo(() => {
    const sortedPop = [...quartiers].sort((a, b) => b.population - a.population);
    const byCommune: Record<string, number> = {};
    quartiers.forEach(q => { byCommune[q.commune] = (byCommune[q.commune] || 0) + q.population; });
    const total = quartiers.reduce((s, q) => s + q.population, 0) || 1;
    const topCommune = Object.entries(byCommune).sort((a, b) => b[1] - a[1])[0];
    const topComm = [...quartiers].filter(q => q.dens_commerce !== null).sort((a, b) => (b.dens_commerce ?? 0) - (a.dens_commerce ?? 0))[0];
    return {
      topQuartier: sortedPop[0], topCommune, share: topCommune ? (topCommune[1] / total) * 100 : 0,
      topComm, noSante: quartiers.filter(q => q.nb_sante === 0).length, noBanque: quartiers.filter(q => q.nb_banque === 0).length,
      communes: Object.entries(byCommune).map(([c, v]) => ({ c, pct: (v / total) * 100 })).sort((a, b) => b.pct - a.pct),
    };
  }, [quartiers]);

  const [zoom, setZoom] = useState(false);
  useEffect(() => { if (!zoom) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [zoom]);
  const communeStats = useMemo(() => {
    const m: Record<string, { n: number; pop: number; surf: number }> = {};
    quartiers.forEach(q => { const c = (m[q.commune] ||= { n: 0, pop: 0, surf: 0 }); c.n++; c.pop += q.population || 0; c.surf += q.surface_km2 ?? 0; });
    const tot = Object.values(m).reduce((s, c) => s + c.pop, 0) || 1;
    return Object.entries(m).map(([name, c]) => ({ name, ...c, pct: (c.pop / tot) * 100 })).sort((a, b) => b.pop - a.pop);
  }, [quartiers]);
  const communeColors = ["#0369a1", "#0f766e", "#c2410c"];

  const totalPop = quartiers.reduce((s, q) => s + q.population, 0);
  const totalSurf = quartiers.reduce((s, q) => s + (q.surface_km2 ?? 0), 0);
  const totalInfra = INFRA_FAMILIES.reduce((s, f) => s + count(`infra_${f.key}`), 0);

  const numbers = [
    { icon: <Users />, value: totalPop, label: "habitants rattachés aux quartiers", note: rgph ? `sur ${rgph.toLocaleString("fr-FR")} recensés • RGPH-5, 2023` : "RGPH-5 • 2023", color: "#22d3ee" },
    { icon: <MapPinned />, value: quartiers.length, label: "quartiers cartographiés", note: "3 communes d'arrondissement", color: "#38bdf8" },
    { icon: <Building2 />, value: totalInfra, label: "équipements localisés", note: "8 familles d'infrastructures", color: "#fb923c" },
    { icon: <Grid3x3 />, value: count("grille"), label: "cellules de grille", note: "résolution 200 m • accessibilité", color: "#2dd4bf" },
    { icon: <RouteIcon />, value: count("reseau"), label: "tronçons routiers", note: "réseau OpenStreetMap", color: "#a3e635" },
    { icon: <Ruler />, value: totalSurf, label: "km² de territoire", note: "somme des surfaces de quartiers", color: "#c084fc", decimals: 1 },
  ];

  return (
    <>
      {/* ===== 0. CARTE DE SITUATION ===== */}
      <section className="hx hx-situation">
        <Reveal><Heading eyebrow="CARTE DE SITUATION" title="Thiès, ville de trois communes," accent="le terrain de l'étude." /></Reveal>
        <div className="hx-sit-grid">
          <Reveal>
            <figure className="hx-sit-map" onClick={() => setZoom(true)}>
              <img src="/images/zone-etude-thies.webp" alt="Carte de situation de la zone d'étude : Thiès Nord, Thiès Ouest et Thiès Est" loading="lazy" />
              <span className="hx-sit-zoom"><ZoomIn size={12} style={{ verticalAlign: -2 }} /> Agrandir</span>
              <figcaption><span>Source : ANAT • fond OpenStreetMap</span><span>Auteurs : A. A. Dione &amp; M. O. S. Sy • WGS 84, zone 28N</span></figcaption>
            </figure>
          </Reveal>
          <div className="hx-sit-side">
            <Reveal delay={80}><p className="hx-sit-lead">La zone d'étude couvre la ville de Thiès, chef-lieu de région, découpée en trois communes d'arrondissement : Thiès Nord, Thiès Ouest et Thiès Est. Les chiffres ci-dessous sont calculés à partir des données de quartiers.</p></Reveal>
            {communeStats.map((c, i) => (
              <Reveal key={c.name} delay={160 + i * 90}>
                <div className="hx-sit-commune" style={{ ["--c" as any]: communeColors[i % 3] }}>
                  <h3>{c.name}</h3><em>{c.pct.toFixed(1)} %</em>
                  <span>{c.n} quartiers • {c.pop.toLocaleString("fr-FR")} habitants • {c.surf.toFixed(1)} km²</span>
                  <i><b style={{ width: `${c.pct}%` }} /></i>
                </div>
              </Reveal>
            ))}
            <Reveal delay={450}><div className="hx-sit-actions">
              <button className="primary-button" onClick={() => navigate("/geoportail")}>Explorer le Géoportail <ArrowRight size={16} /></button>
            </div></Reveal>
            <p className="hx-sit-meta">Part de la population = habitants recensés de la commune / total des quartiers (RGPH-5, 2023).</p>
          </div>
        </div>
        {zoom && <div className="hx-lightbox" onClick={() => setZoom(false)}><img src="/images/zone-etude-thies.webp" alt="Carte de situation agrandie" /></div>}
      </section>

      {/* ===== 1. EN CHIFFRES ===== */}
      <section className="hx hx-numbers">
        <Reveal><Heading eyebrow="LE TERRITOIRE EN CHIFFRES" title="Des données réelles," accent="à plusieurs échelles." /></Reveal>
        <div className="hx-numbers-grid">
          {numbers.map((n, i) => (
            <Reveal key={n.label} delay={i * 80}>
              <div className="hx-number" style={{ ["--c" as any]: n.color }}>
                <span className="hx-number-icon">{n.icon}</span>
                <strong>{catalog ? <Counter value={n.value} decimals={n.decimals ?? 0} /> : "—"}</strong>
                <b>{n.label}</b><small>{n.note}</small>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== 2. ATLAS ===== */}
      <section className="hz hz-atlas-sec">
        <div className="hz-wrap">
          <header className="hz-head"><div><small className="hz-kicker"><i />LA VILLE SE DESSINE</small><h2>Un indicateur, une autre lecture de Thiès</h2></div><p>Cinq cartes thématiques calculées sur les 65 quartiers. Choisissez un indicateur pour le lire sur la carte.</p></header>
          <Atlas defs={defs} quartiers={quartiers} onExplore={onExplore} />
        </div>
      </section>

      {/* ===== 3. HUIT FAMILLES ===== */}
      <section className="hx hx-families">
        <Reveal><Heading eyebrow="INFRASTRUCTURES" title="Huit familles d'équipements," accent="un même territoire." /></Reveal>
        <div className="hx-families-grid">
          {INFRA_FAMILIES.map((f, i) => {
            const Icon = f.icon; const n = count(`infra_${f.key}`);
            return (
              <Reveal key={f.key} delay={(i % 4) * 90}>
                <button className="hx-family" style={{ ["--c" as any]: f.color }} onClick={() => onExplore(`dens_${f.key}`)}>
                  <span className="hx-family-icon"><Icon size={20} /></span>
                  <strong>{catalog ? <Counter value={n} /> : "—"}</strong>
                  <b>{f.label}</b>
                  <div className="hx-family-bar"><i style={{ width: `${totalInfra ? Math.max(3, (n / totalInfra) * 100) : 0}%` }} /></div>
                  <small>{totalInfra ? ((n / totalInfra) * 100).toFixed(1) : "—"} % des équipements <ArrowRight size={11} /></small>
                </button>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ===== 4. ENSEIGNEMENTS ===== */}
      <section className="hx hx-insights">
        <Reveal><Heading eyebrow="CE QUE RÉVÈLENT DÉJÀ LES DONNÉES" title="Des contrastes" accent="lisibles dès le premier regard." /></Reveal>
        <div className="hx-insights-grid">
          <Reveal><div className="hx-insight wide">
            <small>RÉPARTITION DE LA POPULATION PAR COMMUNE</small>
            <div className="hx-stack">{facts.communes.map((c, i) => <div key={c.c} style={{ width: `${c.pct}%`, ["--c" as any]: ["#22d3ee", "#38bdf8", "#818cf8"][i % 3] }}><b>{c.pct.toFixed(1)} %</b><span>{c.c}</span></div>)}</div>
            <p>{facts.topCommune?.[0]} regroupe la plus grande part de la population recensée.</p>
          </div></Reveal>
          <Reveal delay={90}><div className="hx-insight">
            <small>QUARTIER LE PLUS PEUPLÉ</small>
            <strong><Counter value={facts.topQuartier?.population ?? 0} /></strong>
            <b>{facts.topQuartier?.nom}</b><span>{facts.topQuartier?.commune}</span>
          </div></Reveal>
          <Reveal delay={180}><div className="hx-insight orange">
            <small>DENSITÉ COMMERCIALE MAXIMALE</small>
            <strong><Counter value={facts.topComm?.dens_commerce ?? 0} decimals={0} /><em> /km²</em></strong>
            <b>{facts.topComm?.nom}</b><span>{facts.topComm?.commune}</span>
          </div></Reveal>
          <Reveal delay={90}><div className="hx-insight red">
            <small>QUARTIERS SANS ÉQUIPEMENT DE SANTÉ RECENSÉ</small>
            <strong><Counter value={facts.noSante} /><em> / {quartiers.length}</em></strong>
            <span>d'après la couche d'équipements de santé fournie</span>
          </div></Reveal>
          <Reveal delay={180}><div className="hx-insight violet">
            <small>QUARTIERS SANS AGENCE BANCAIRE RECENSÉE</small>
            <strong><Counter value={facts.noBanque} /><em> / {quartiers.length}</em></strong>
            <span>d'après la couche banques fournie</span>
          </div></Reveal>
        </div>
      </section>

      {/* ===== 5. CARTOTHEQUE ===== */}
      <section className="hz hz-carto-sec">
        <div className="hz-wrap">
          <header className="hz-head"><div><small className="hz-kicker"><i />CARTOTHÈQUE</small><h2>Toutes les cartes, à portée de clic</h2></div><button className="hz-btn" onClick={() => navigate("/cartotheque")}>Ouvrir la Cartothèque <ArrowRight size={14} /></button></header>
          <div className="hz-mini-grid">
            {["dens_commerce", "population", "niveau_vie"].map(id => <MiniMap key={id} id={id} quartiers={quartiers} onOpen={() => navigate("/cartotheque")} />)}
          </div>
        </div>
      </section>

      {/* ===== 6. DEMARCHE + EXPLORATION ===== */}
      <section className="hz hz-method-sec">
        <div className="hz-wrap">
          <header className="hz-head"><div><small className="hz-kicker"><i />DU TERRITOIRE À L'INDICATEUR</small><h2>Une démarche en quatre temps</h2></div></header>
          <ol className="hz-steps">
            {[[<MapIcon key="a" />, "Localiser", "Structurer les quartiers et les équipements dans l'espace."], [<Database key="b" />, "Documenter", "Mobiliser les données démographiques et les enquêtes."], [<BarChart3 key="c" />, "Comparer", "Construire des indicateurs homogènes entre territoires."], [<Activity key="d" />, "Analyser", "Identifier les contrastes et les regroupements spatiaux."]].map((st, k) => (
              <li key={k}><span className="hz-step-n">{String(k + 1).padStart(2, "0")}</span><span className="hz-step-ic">{st[0]}</span><h3>{st[1] as string}</h3><p>{st[2] as string}</p></li>
            ))}
          </ol>
          <div className="hz-cta"><div><b>Explorer le territoire</b><span>Quartiers, équipements, accessibilité et indices de ségrégation, sur une même carte interactive.</span></div><button className="hz-btn primary" onClick={() => navigate("/geoportail")}>Ouvrir le Géoportail <MapIcon size={14} /></button></div>
        </div>
      </section>
    </>
  );
}
