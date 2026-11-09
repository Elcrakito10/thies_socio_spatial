import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Flag, Mountain, Pause, Play, RotateCcw, Square, Volume2, VolumeX, Navigation } from "lucide-react";
import { MODES, fmtTime, type Mode, type Route } from "./geoRouting";
import { MODE_WORD, hasFrenchVoice, planRoute, pointAlong, project, sentence, sentenceStart, speak, type Kind } from "./geoGuidance";

type Props = {
  route: Route; mode: Mode; base: { url: string; sub: string; attr: string }; quartiers: any; startSim: boolean;
  onExit: () => void; onReroute: (ll: [number, number]) => void;
};
const SPEED: Record<Mode, number> = { foot: 1.4, bike: 4.2, car: 8 }; // m/s en simulation (x facteur)
const THRESH: Record<Mode, number[]> = { foot: [18, 40, 120], bike: [18, 50, 150], car: [20, 60, 150, 400] };
const ICON: Record<Kind, any> = { start: Navigation, straight: ArrowUp, "slight-left": ArrowUpLeft, "slight-right": ArrowUpRight, left: CornerUpLeft, right: CornerUpRight, "sharp-left": CornerUpLeft, "sharp-right": CornerUpRight, uturn: RotateCcw, arrive: Flag };
const fmtD = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km` : `${Math.max(0, Math.round(m / 5) * 5)} m`);

export default function GeoGuide({ route, mode, base, quartiers, startSim, onExit, onReroute }: Props) {
  const plan = useMemo(() => planRoute(route), [route]);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [muted, setMuted] = useState(false);
  const [sim, setSim] = useState(startSim);
  const [paused, setPaused] = useState(false);
  const [factor, setFactor] = useState(3);
  const [relief, setRelief] = useState(false);
  const [along, setAlong] = useState(0);
  const [msg, setMsg] = useState("");
  const [voiceNote, setVoiceNote] = useState(false);
  const alongRef = useRef(0); const announced = useRef<Set<string>>(new Set()); const mutedRef = useRef(false); mutedRef.current = muted;
  const offCount = useRef(0); const last = useRef("");
  const say = (t: string) => { last.current = t; setMsg(t); speak(t, { muted: mutedRef.current }); };

  // ---------- carte 3D (MapLibre : camera inclinee, orientee dans le sens de la marche) ----------
  useEffect(() => {
    if (!box.current) return;
    const tiles = base.url.includes("{s}") ? [...base.sub].map(c => base.url.replace("{s}", c)) : [base.url];
    const L0 = route.line[0];
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: box.current, center: [L0[1], L0[0]], zoom: 17.5, pitch: 62, bearing: plan.bearings[0] ?? 0, maxPitch: 80, attributionControl: { compact: true, customAttribution: base.attr },
        style: { version: 8, sources: { base: { type: "raster", tiles: tiles.map(t => t.replace("{r}", "")), tileSize: 256, maxzoom: base.url.includes("arcgisonline") ? 17 : 19 } }, layers: [{ id: "base", type: "raster", source: "base" }] },
      });
    } catch { setWebgl(false); return; }
    mapRef.current = map;
    map.on("error", () => {});
    map.on("load", () => {
      const lineFc = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.line.map(p => [p[1], p[0]]) } } as any;
      map.addSource("route", { type: "geojson", data: lineFc });
      map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0b1220", "line-width": 12, "line-opacity": 0.55 } });
      map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": MODES[mode].color, "line-width": 7 } });
      const maxPop = Math.max(1, ...quartiers.features.map((f: any) => f.properties.population || 0));
      map.addSource("quartiers", { type: "geojson", data: { ...quartiers, features: quartiers.features.map((f: any) => ({ ...f, properties: { ...f.properties, h: ((f.properties.population || 0) / maxPop) * 260 } })) } });
      map.addLayer({ id: "relief", type: "fill-extrusion", source: "quartiers", layout: { visibility: "none" }, paint: { "fill-extrusion-color": "#38bdf8", "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0.55 } });
      const end = route.line[route.line.length - 1];
      const flag = document.createElement("div"); flag.className = "gx-guide-dest"; flag.textContent = "⚑";
      new maplibregl.Marker({ element: flag, anchor: "bottom" }).setLngLat([end[1], end[0]]).addTo(map);
    });
    const el = document.createElement("div"); el.className = "gx-guide-me"; el.innerHTML = "<i></i>";
    markerRef.current = new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([L0[1], L0[0]]).addTo(map);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [route]); // eslint-disable-line

  useEffect(() => { const m = mapRef.current; if (m && m.getLayer("relief")) m.setLayoutProperty("relief", "visibility", relief ? "visible" : "none"); }, [relief]);

  // ---------- annonce de depart + voix ----------
  useEffect(() => {
    announced.current = new Set(); alongRef.current = 0; setAlong(0); offCount.current = 0;
    const st = plan.maneuvers[0]; say(sentenceStart(plan.bearings[0] ?? 0, st.street, MODE_WORD[mode]));
    const t = setTimeout(() => { if (!hasFrenchVoice()) setVoiceNote(true); }, 1500);
    return () => { clearTimeout(t); try { window.speechSynthesis.cancel(); } catch { /* ignore */ } };
  }, [plan]); // eslint-disable-line

  // ---------- source de position : simulation ou GPS ----------
  useEffect(() => {
    if (!sim || paused) return;
    const id = setInterval(() => { const next = Math.min(plan.total, alongRef.current + SPEED[mode] * factor * 0.25); alongRef.current = next; setAlong(next); }, 250);
    return () => clearInterval(id);
  }, [sim, paused, factor, plan, mode]);
  useEffect(() => {
    if (sim || paused) return;
    if (!navigator.geolocation) { setMsg("GPS indisponible : utilisez la simulation."); return; }
    const id = navigator.geolocation.watchPosition(pos => {
      const p = project(plan, route, [pos.coords.latitude, pos.coords.longitude], alongRef.current);
      if (p.off > 50) { if (++offCount.current >= 3) { offCount.current = 0; say("Vous vous êtes écarté de l'itinéraire. Recalcul en cours."); onReroute([pos.coords.latitude, pos.coords.longitude]); } return; }
      offCount.current = 0; alongRef.current = Math.max(alongRef.current, p.along); setAlong(alongRef.current);
    }, () => setMsg("Position GPS indisponible : passez en simulation."), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [sim, paused, plan]); // eslint-disable-line

  // ---------- a chaque avancee : camera, marqueur, consignes vocales ----------
  const posNow = pointAlong(plan, route, along);
  const nextIdx = Math.max(1, plan.maneuvers.findIndex((m, i) => i > 0 && m.at > along + 3));
  const nxt = plan.maneuvers[nextIdx === -1 ? plan.maneuvers.length - 1 : nextIdx];
  const ahead = Math.max(0, nxt.at - along);
  const heading = project(plan, route, posNow, along).heading;
  useEffect(() => {
    const map = mapRef.current; if (map) { map.easeTo({ center: [posNow[1], posNow[0]], bearing: heading, pitch: 62, zoom: mode === "car" ? 17 : 18, duration: 300, easing: t => t }); markerRef.current?.setLngLat([posNow[1], posNow[0]]).setRotation(heading); }
  }, [along]); // eslint-disable-line
  useEffect(() => {
    const idx = plan.maneuvers.findIndex((m, i) => i > 0 && m.at > along + 3); const k = idx === -1 ? plan.maneuvers.length - 1 : idx; const m = plan.maneuvers[k]; const d = m.at - along;
    for (const thr of THRESH[mode].slice().sort((a, b) => a - b)) {
      const key = `${k}:${thr}`; if (d > thr || announced.current.has(key)) continue;
      THRESH[mode].forEach(x => { if (x >= d - 15) announced.current.add(`${k}:${x}`); });
      say(sentence(m, d < 20 ? null : d)); break;
    }
    if (m.kind === "arrive" && d < 20 && sim) setPaused(true);
  }, [along]); // eslint-disable-line

  const Ico = ICON[nxt.kind];
  const arrived = plan.total - along < 20;
  const remaining = Math.max(0, plan.total - along);
  const etaS = route.timeS * (remaining / (plan.total || 1));
  return (
    <div className="gx-guide">
      <div ref={box} className="gx-guide-map" />
      {!webgl && <div className="gx-guide-fallback">La vue 3D nécessite WebGL, indisponible sur ce navigateur. Le guidage vocal reste actif.</div>}
      <div className="gx-guide-top" role="status" aria-live="polite">
        <span className="ic"><Ico size={34} /></span>
        <div><b>{arrived ? "Vous êtes arrivé" : nxt.kind === "arrive" ? "Destination" : sentence({ ...nxt }, null).replace(/\.$/, "")}</b>
          <small>{arrived ? route.target.props?.nom ?? "" : `${fmtD(ahead)}${nxt.kind === "arrive" && nxt.street ? " · " + nxt.street : ""}`}</small></div>
      </div>
      {msg && <div className="gx-guide-say">🔊 {msg}</div>}
      {voiceNote && <div className="gx-guide-note">Aucune voix française détectée sur cet appareil : la voix par défaut est utilisée. Installez une voix française dans les paramètres système pour un meilleur rendu.</div>}
      <div className="gx-guide-bar">
        <div className="gx-guide-eta"><b>{fmtD(remaining)}</b><span>{fmtTime(etaS)} · {MODES[mode].label}</span></div>
        <div className="gx-guide-ctl">
          <button onClick={() => setMuted(m => { if (!m) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } } return !m; })} aria-label={muted ? "Activer la voix" : "Couper la voix"}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <button onClick={() => speak(last.current, { muted })} aria-label="Répéter la consigne"><RotateCcw size={18} /></button>
          <button onClick={() => setPaused(p => !p)} aria-label={paused ? "Reprendre" : "Pause"}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
          <button className={sim ? "on" : ""} onClick={() => setSim(s => !s)} title="Simulation du trajet / suivi GPS réel">{sim ? "Simulation" : "GPS réel"}</button>
          {sim && <button onClick={() => setFactor(f => (f === 1 ? 3 : f === 3 ? 8 : 1))} aria-label="Vitesse de simulation">×{factor}</button>}
          <button className={relief ? "on" : ""} onClick={() => setRelief(r => !r)} title="Relief des quartiers (hauteur ∝ population)"><Mountain size={18} /></button>
          <button className="stop" onClick={onExit} aria-label="Quitter le guidage"><Square size={16} /> Quitter</button>
        </div>
      </div>
    </div>
  );
}
