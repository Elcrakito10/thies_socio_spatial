import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowRight, Building2, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun,
  Grid3x3, Layers3, Map as MapIcon, Moon, ShieldQuestion, Sun, Users, Users2, WifiOff, Wind,
} from "lucide-react";
import { INFRA_FAMILIES, type QuartierFull } from "./Geoportail";
import { POP as POP_HISTORY } from "./Histoire";
import { Counter } from "./ui";

const fr = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
const equipTotal = (q: QuartierFull) => INFRA_FAMILIES.reduce((s, f) => s + (((q as any)[`nb_${f.key}`] as number) || 0), 0);

// ============================================================
// METEO EN DIRECT (Open-Meteo, sans cle). Hors ligne : message honnete.
// ============================================================
type Wx = { t: number; code: number; day: boolean; wind: number };
const WMO: Record<number, string> = {
  0: "Ciel dégagé", 1: "Plutôt dégagé", 2: "Partiellement nuageux", 3: "Couvert", 45: "Brouillard", 48: "Brouillard givrant",
  51: "Bruine légère", 53: "Bruine", 55: "Bruine dense", 61: "Pluie légère", 63: "Pluie", 65: "Pluie forte", 80: "Averses légères", 81: "Averses", 82: "Averses violentes",
  95: "Orage", 96: "Orage avec grêle", 99: "Orage violent",
};
function wxIcon(code: number, day: boolean) {
  if (code === 0 || code === 1) return day ? <Sun className="gx-sun" size={34} /> : <Moon size={34} />;
  if (code === 2) return day ? <CloudSun size={34} /> : <CloudMoon size={34} />;
  if (code === 3) return <Cloud size={34} />;
  if (code === 45 || code === 48) return <CloudFog size={34} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle size={34} />;
  if (code >= 71 && code <= 77) return <CloudSnow size={34} />;
  if (code >= 95) return <CloudLightning size={34} />;
  return <CloudRain size={34} />;
}

export function WeatherCard() {
  const [wx, setWx] = useState<Wx | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 7000);
        const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=14.79&longitude=-16.93&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=Africa%2FDakar", { signal: ctl.signal });
        clearTimeout(to); if (!r.ok) throw new Error(String(r.status));
        const j = await r.json(); const c = j.current;
        if (alive && typeof c?.temperature_2m === "number") { setWx({ t: c.temperature_2m, code: c.weather_code, day: c.is_day === 1, wind: c.wind_speed_10m }); setOffline(false); }
      } catch { if (alive) setOffline(true); }
    };
    load(); const id = setInterval(load, 10 * 60 * 1000); const tick = setInterval(() => setNow(new Date()), 30000);
    return () => { alive = false; clearInterval(id); clearInterval(tick); };
  }, []);
  const date = now.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Dakar" });
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" });
  return (
    <section className="gx-card gx-weather gx-in" style={{ ["--d" as any]: "0ms" }}>
      <div className="gx-wx-icon">{wx ? wxIcon(wx.code, wx.day) : offline ? <WifiOff size={30} /> : <Sun className="gx-sun" size={34} />}</div>
      <div className="gx-wx-main">
        <small>Thiès</small>
        <b>{wx ? <>{Math.round(wx.t)}°C</> : "—"}</b>
      </div>
      <div className="gx-wx-text">
        <span>{wx ? WMO[wx.code] ?? "Conditions variables" : offline ? "Météo indisponible (hors ligne)" : "Chargement de la météo…"}</span>
        <em>{date} - {time}</em>
        {wx && <i><Wind size={11} /> {Math.round(wx.wind)} km/h</i>}
      </div>
      <div className="gx-wx-photo" aria-hidden />
    </section>
  );
}

// ============================================================
// CARTES KPI (donnees reelles)
// ============================================================
export function KpiRow({ quartiers, census, gridCount }: { quartiers: QuartierFull[]; census: any; gridCount: number | null }) {
  const equip = useMemo(() => quartiers.reduce((s, q) => s + equipTotal(q), 0), [quartiers]);
  const items = [
    { icon: <Users size={22} />, tone: "teal", value: census?.population ?? 0, label: "Habitants recensés", sub: `RGPH-5 · ${census?.annee ?? 2023}` },
    { icon: <MapIcon size={22} />, tone: "green", value: quartiers.length, label: "Quartiers analysés", sub: "3 communes" },
    { icon: <Building2 size={22} />, tone: "orange", value: equip, label: "Équipements recensés", sub: "8 familles" },
    { icon: <Layers3 size={22} />, tone: "purple", value: 5, label: "Thématiques", sub: "indicateurs cartographiés" },
    { icon: <Grid3x3 size={22} />, tone: "blue", value: gridCount ?? 2170, label: "Cellules d'analyse", sub: "grille de 200 m" },
  ];
  return (
    <div className="gx-kpis">
      {items.map((k, i) => (
        <div key={k.label} className="gx-card gx-kpi gx-in" style={{ ["--d" as any]: `${80 + i * 70}ms` }}>
          <span className={`gx-kpi-ico ${k.tone}`}>{k.icon}</span>
          <div><b><Counter value={k.value} duration={1400} /></b><span>{k.label}</span><small>{k.sub}</small></div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// PANNEAUX DE DROITE
// ============================================================
const Head = ({ icon, title, to, label, onGo }: { icon: React.ReactNode; title: string; to?: string; label?: string; onGo?: (p: string) => void }) => (
  <header className="gx-ph"><span className="gx-ph-ico">{icon}</span><h3>{title}</h3>{to && <button onClick={() => onGo?.(to)}>{label} <ArrowRight size={12} /></button>}</header>
);

export function Overview({ quartiers, census, navigate }: { quartiers: QuartierFull[]; census: any; navigate: (p: string) => void }) {
  const equip = useMemo(() => quartiers.reduce((s, q) => s + equipTotal(q), 0), [quartiers]);
  const [gini, setGini] = useState<number | null>(null);
  useEffect(() => { fetch("/data/resultats_indices.json").then(r => r.json()).then(j => setGini(j.indices.find((i: any) => String(i.indicateur).startsWith("Niveau d’instruction"))?.gini ?? null)).catch(() => {}); }, []);
  return (
    <section className="gx-card gx-panel gx-in" style={{ ["--d" as any]: "120ms" }}>
      <Head icon={<Layers3 size={15} />} title="Vue d'ensemble" to="/dashboard" label="Détails" onGo={navigate} />
      <div className="gx-ov">
        <div className="gx-ov-t t1"><Users2 size={16} /><b>{fr(census?.population ?? 0)}</b><span>Population</span></div>
        <div className="gx-ov-t t2"><MapIcon size={16} /><b>{quartiers.length}</b><span>Quartiers</span></div>
        <div className="gx-ov-t t3"><Building2 size={16} /><b>{fr(equip)}</b><span>Équipements</span></div>
        <button className="gx-ov-t t4" title="Voir les indices de ségrégation validés" onClick={() => navigate("/segregation")} style={{ font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}><ShieldQuestion size={16} /><b>{gini === null ? "—" : gini.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><span>Gini · instruction</span></button>
      </div>
    </section>
  );
}

export function InfraDonut({ quartiers, navigate }: { quartiers: QuartierFull[]; navigate: (p: string) => void }) {
  const data = useMemo(() => {
    const rows = INFRA_FAMILIES.map(f => ({ key: f.key, name: f.label, color: f.color, value: quartiers.reduce((s, q) => s + (((q as any)[`nb_${f.key}`] as number) || 0), 0) }));
    const total = rows.reduce((s, r) => s + r.value, 0) || 1;
    return { rows: rows.sort((a, b) => b.value - a.value), total };
  }, [quartiers]);
  return (
    <section className="gx-card gx-panel gx-in" style={{ ["--d" as any]: "180ms" }}>
      <Head icon={<Building2 size={15} />} title="Répartition des infrastructures" to="/cartotheque" label="Voir tout" onGo={navigate} />
      <div className="gx-donut">
        <div className="gx-donut-chart">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.rows} dataKey="value" innerRadius="64%" outerRadius="96%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} animationDuration={1300}>
                {data.rows.map(r => <Cell key={r.key} fill={r.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="gx-donut-center"><b>{fr(data.total)}</b><span>Total</span></div>
        </div>
        <ul className="gx-donut-legend">
          {data.rows.map(r => <li key={r.key}><i style={{ background: r.color }} /><span>{r.name}</span><b>{(r.value / data.total * 100).toLocaleString("fr-FR", { maximumFractionDigits: r.value / data.total < 0.1 ? 1 : 0 })}%</b></li>)}
        </ul>
      </div>
    </section>
  );
}

const COMMUNE_TONE: Record<string, string> = { "THIES NORD": "#3b82f6", "THIES EST": "#ef4444", "THIES OUEST": "#a855f7" };
export function TopPopulation({ quartiers, navigate }: { quartiers: QuartierFull[]; navigate: (p: string) => void }) {
  const top = useMemo(() => [...quartiers].filter(q => q.population > 0).sort((a, b) => b.population - a.population).slice(0, 5), [quartiers]);
  const max = top[0]?.population || 1;
  const grads = ["linear-gradient(90deg,#22d3ee,#3b82f6)", "linear-gradient(90deg,#2dd4bf,#14b8a6)", "linear-gradient(90deg,#fbbf24,#f97316)", "linear-gradient(90deg,#fb7185,#ef4444)", "linear-gradient(90deg,#c084fc,#8b5cf6)"];
  return (
    <section className="gx-card gx-panel gx-in" style={{ ["--d" as any]: "240ms" }}>
      <Head icon={<Users size={15} />} title="Population par quartier (Top 5)" to="/dashboard" label="Voir tout" onGo={navigate} />
      <ul className="gx-top">
        {top.map((q, i) => (
          <li key={q.quartier_id} title={`${q.nom} — ${q.commune}`}>
            <span className="gx-top-name"><i style={{ background: COMMUNE_TONE[q.commune.toUpperCase()] ?? "#64748b" }} />{q.nom}</span>
            <span className="gx-top-bar"><em style={{ width: `${q.population / max * 100}%`, background: grads[i], animationDelay: `${300 + i * 120}ms` }} /></span>
            <b>{fr(q.population)}</b>
          </li>
        ))}
      </ul>
      <small className="gx-note">Population RGPH-5 (2023) rattachée au quartier ; couleur = commune.</small>
    </section>
  );
}

export function PopEvolution({ navigate }: { navigate: (p: string) => void }) {
  const data = POP_HISTORY.filter(p => p.y >= 1953).map(p => ({ y: p.y, v: p.v }));
  return (
    <section className="gx-card gx-panel gx-in" style={{ ["--d" as any]: "300ms" }}>
      <Head icon={<Users size={15} />} title="Évolution de la population" to="/histoire" label="Voir tout" onGo={navigate} />
      <div className="gx-evo">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 10, left: -6, bottom: 0 }}>
            <defs><linearGradient id="gx-evo-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} /><stop offset="100%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="rgba(148,163,184,.18)" vertical={false} />
            <XAxis dataKey="y" tick={{ fill: "var(--gx-mut)", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "var(--gx-mut)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v / 1000}k`} width={38} />
            <Tooltip contentStyle={{ background: "rgba(8,16,36,.95)", border: "1px solid rgba(120,150,255,.3)", borderRadius: 10, fontSize: 12, color: "#e6edf7" }} formatter={(v: any) => [`${fr(v)} hab.`, "Population"]} labelFormatter={l => `Année ${l}`} />
            <Area type="monotone" dataKey="v" stroke="#38bdf8" strokeWidth={2.4} fill="url(#gx-evo-g)" dot={{ r: 3, fill: "#f0abfc", stroke: "#38bdf8", strokeWidth: 1.5 }} animationDuration={1500} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <small className="gx-note">Série historique de la page Histoire (1953-2022). Le RGPH-5 de 2023 (391 253 hab.) couvre le périmètre des 3 communes actuelles.</small>
    </section>
  );
}
