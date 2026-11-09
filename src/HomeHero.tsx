import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Database, Layers, Map as MapIcon, MapPin, Mouse, Play, TrendingUp, Users, Building2 } from "lucide-react";
import { WeatherCard } from "./GeoParts";
import { Counter } from "./ui";
import "./HomeHero.css";

const SLIDES = ["/thies-hero.png", "/images/geoportail-hero.jpg", "/images/dashboard-thies-bg.png"];

/** Silhouette reelle des communes (projection equirectangulaire simple) pour la carte "Decouvrir Thies". */
function Silhouette({ geo }: { geo: any }) {
  const d = useMemo(() => {
    if (!geo?.features?.length) return null;
    const rings: number[][][] = [];
    geo.features.forEach((f: any) => { const g = f.geometry; (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []).forEach((p: number[][][]) => rings.push(p[0])); });
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90; rings.forEach(r => r.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), W = (x1 - x0) * k, H = y1 - y0, s = 100 / Math.max(W, H);
    const path = rings.map(r => r.map(([x, y], i) => `${i ? "L" : "M"}${((x - x0) * k * s).toFixed(1)} ${((y1 - y) * s).toFixed(1)}`).join("") + "Z").join("");
    return { path, w: W * s, h: H * s };
  }, [geo]);
  if (!d) return <div className="hh-sil-empty"><MapIcon size={34} /></div>;
  return (
    <svg className="hh-sil" viewBox={`-4 -4 ${d.w + 8} ${d.h + 8}`} aria-hidden>
      <defs><linearGradient id="hh-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38bdf8" stopOpacity=".5" /><stop offset="1" stopColor="#6366f1" stopOpacity=".25" /></linearGradient></defs>
      <path d={d.path} fill="url(#hh-g)" stroke="#67e8f9" strokeWidth="0.9" strokeLinejoin="round" />
      <circle cx={d.w / 2} cy={d.h / 2} r="1.6" fill="#22d3ee" /><circle className="hh-ping" cx={d.w / 2} cy={d.h / 2} r="1.6" fill="none" stroke="#22d3ee" strokeWidth=".5" />
    </svg>
  );
}

type Props = { navigate: (p: string) => void; population: number; quartiers: number; communeGeo: any; onScrollDown: () => void };
export default function HomeHero({ navigate, population, quartiers, communeGeo, onScrollDown }: Props) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI(v => (v + 1) % SLIDES.length), 9000);
    return () => clearInterval(t);
  }, [paused]);
  const go = (n: number) => { setI((n + SLIDES.length) % SLIDES.length); setPaused(true); };

  const stats = [
    { tone: "blue", icon: <Users size={26} />, v: population, l: "Habitants recensés", to: "/dashboard" },
    { tone: "teal", icon: <Building2 size={26} />, v: quartiers, l: "Quartiers intégrés", to: "/geoportail" },
    { tone: "green", icon: <MapIcon size={26} />, v: 3, l: "Communes urbaines", to: "/geoportail" },
    { tone: "amber", icon: <Database size={26} />, v: "2023", l: "Référence recensement", to: "/donnees" },
  ];
  const cards = [
    { tone: "blue", icon: <MapIcon size={26} />, t: "Carte interactive", d: "Explorer les quartiers et les infrastructures", to: "/geoportail" },
    { tone: "green", icon: <BarChart3 size={26} />, t: "Indicateurs", d: "Consulter les statistiques et indicateurs territoriaux", to: "/dashboard" },
    { tone: "purple", icon: <Layers size={26} />, t: "Cartothèque", d: "Accéder aux cartes thématiques", to: "/cartotheque" },
    { tone: "red", icon: <Database size={26} />, t: "Données", d: "Télécharger les données (GeoJSON, CSV...)", to: "/donnees" },
    { tone: "orange", icon: <TrendingUp size={26} />, t: "Ségrégation", d: "Indices, profils de quartiers et cartes validées", to: "/segregation" },
    { tone: "indigo", icon: <BookOpen size={26} />, t: "Histoire", d: "Découvrir l'évolution urbaine de Thiès", to: "/histoire" },
  ];

  return (
    <section className="hh">
      <div className="hh-bgs" aria-hidden>{SLIDES.map((s, k) => <div key={s} className={k === i ? "on" : ""} style={{ backgroundImage: `url(${s})` }} />)}</div>
      <div className="hh-shade" aria-hidden />
      <svg className="hh-lines" viewBox="0 0 600 700" preserveAspectRatio="none" aria-hidden>
        <path d="M-10 120C120 60 200 170 330 110S520 40 620 90" /><path d="M-10 200C110 150 210 250 350 190S520 130 620 175" /><path d="M-10 540C140 480 230 600 380 540S540 470 620 520" /><path d="M-10 610C130 560 240 660 380 600S540 540 620 590" />
      </svg>

      <div className="hh-main">
        <div className="hh-left">
          <div className="hh-kicker hh-in" style={{ ["--d" as any]: "100ms" }}><span>UNE VILLE</span><i>•</i><b>DES TERRITOIRES</b><i>•</i><span>DES INÉGALITÉS</span></div>
          <h1 className="hh-title hh-in" style={{ ["--d" as any]: "200ms" }}><span>SÉGRÉGATION</span><span>SOCIO-SPATIALE</span><em>DANS LA VILLE DE THIÈS</em></h1>
          <p className="hh-desc hh-in" style={{ ["--d" as any]: "320ms" }}>Explorer, analyser et comprendre les dynamiques territoriales et sociales de la ville de Thiès à travers la géomatique et la donnée spatiale.</p>
          <div className="hh-cta hh-in" style={{ ["--d" as any]: "440ms" }}>
            <button className="hh-btn primary" onClick={() => navigate("/geoportail")}><Users size={20} /> Explorer le Géoportail <ChevronRight size={20} /></button>
            <button className="hh-btn ghost" onClick={() => navigate("/apropos")}><Play size={18} /> Voir la présentation</button>
          </div>
        </div>

        <div className="hh-right">
          <div className="hh-wx hh-in" style={{ ["--d" as any]: "250ms" }}><WeatherCard /></div>
          <div className="hh-stats">
            {stats.map((s, k) => (
              <button key={s.l} className={`hh-glass hh-stat hh-in ${s.tone}`} style={{ ["--d" as any]: `${350 + k * 80}ms` }} onClick={() => navigate(s.to)}>
                <span className="hh-ico">{s.icon}</span>
                <span className="hh-stat-t"><b>{typeof s.v === "number" ? <Counter value={s.v} duration={1500} /> : s.v}</b><small>{s.l}</small></span>
                <ChevronRight className="hh-chev" size={18} />
              </button>
            ))}
          </div>
          <button className="hh-glass hh-disc hh-in" style={{ ["--d" as any]: "700ms" }} onClick={() => navigate("/geoportail")}>
            <Silhouette geo={communeGeo} />
            <span className="hh-disc-t"><b>Découvrir Thiès</b><small>Visualiser les limites, les quartiers et les principales infrastructures.</small></span>
            <span className="hh-round"><ChevronRight size={18} /></span>
          </button>
        </div>
      </div>

      <div className="hh-cards">
        {cards.map((c, k) => (
          <button key={c.t} className={`hh-glass hh-card hh-in ${c.tone}`} style={{ ["--d" as any]: `${600 + k * 80}ms` }} onClick={() => navigate(c.to)}>
            <span className="hh-ico">{c.icon}</span>
            <span className="hh-card-t"><b>{c.t}</b><small>{c.d}</small></span>
            <span className="hh-round"><ChevronRight size={16} /></span>
          </button>
        ))}
      </div>

      <div className="hh-bar">
        <div className="hh-bar-l"><span className="hh-pin"><MapPin size={26} /></span><div><b>Thiès, une ville en mouvement</b><small>Une lecture territoriale par la donnée spatiale</small></div></div>
        <button className="hh-scroll" onClick={onScrollDown} aria-label="Défiler pour découvrir"><Mouse size={30} strokeWidth={1.4} /><span>SCROLLER POUR DÉCOUVRIR</span><ChevronDown size={18} /></button>
        <div className="hh-slides">
          <button className="hh-arrow" onClick={() => go(i - 1)} aria-label="Image précédente"><ChevronLeft size={18} /></button>
          {SLIDES.map((s, k) => <button key={s} className={`hh-thumb ${k === i ? "on" : ""}`} style={{ backgroundImage: `url(${s})` }} onClick={() => go(k)} aria-label={`Image ${k + 1}`} />)}
          <button className="hh-arrow" onClick={() => go(i + 1)} aria-label="Image suivante"><ChevronRight size={18} /></button>
        </div>
      </div>
    </section>
  );
}
