import { useEffect, useRef, useState } from "react";
import { GeoJSON, MapContainer, Rectangle, TileLayer } from "react-leaflet";
import L from "leaflet";
import { Fullscreen, Minus, Plus } from "lucide-react";

// ---------- calculs geographiques (aucune dependance externe) ----------
export const haversine = (a: L.LatLng, b: L.LatLng) => a.distanceTo(b);
/** Aire d'un polygone sur la sphere (m²), formule de Chamberlain-Duquette. */
export function ringArea(pts: L.LatLng[]) {
  if (pts.length < 3) return 0;
  const R = 6378137; let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    s += ((p2.lng - p1.lng) * Math.PI / 180) * (2 + Math.sin(p1.lat * Math.PI / 180) + Math.sin(p2.lat * Math.PI / 180));
  }
  return Math.abs(s * R * R / 2);
}
export const fmtLen = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);
export const fmtArea = (m2: number) => (m2 >= 1e6 ? `${(m2 / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km²` : `${Math.round(m2).toLocaleString("fr-FR")} m²`);

// ---------- boutons de zoom / plein ecran ----------
export function ZoomStack({ map, wrap }: { map: L.Map | null; wrap: React.RefObject<HTMLDivElement | null> }) {
  const toggleFs = () => { const el = wrap.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.().catch(() => {}); };
  return (
    <div className="gx-zoom">
      <button onClick={() => map?.zoomIn()} aria-label="Zoomer"><Plus size={16} /></button>
      <button onClick={() => map?.zoomOut()} aria-label="Dézoomer"><Minus size={16} /></button>
      <button onClick={toggleFs} aria-label="Plein écran"><Fullscreen size={15} /></button>
    </div>
  );
}

// ---------- barre d'etat : EPSG, coordonnees du curseur, echelle ----------
export function StatusBar({ map }: { map: L.Map | null }) {
  const [pos, setPos] = useState<L.LatLng | null>(null);
  const [zoom, setZoom] = useState(13);
  const last = useRef(0);
  useEffect(() => {
    if (!map) return;
    setZoom(map.getZoom()); setPos(map.getCenter());
    const mv = (e: L.LeafletMouseEvent) => { const t = performance.now(); if (t - last.current > 60) { last.current = t; setPos(e.latlng); } };
    const zm = () => setZoom(map.getZoom());
    map.on("mousemove", mv); map.on("zoomend", zm);
    return () => { map.off("mousemove", mv); map.off("zoomend", zm); };
  }, [map]);
  const lat = pos?.lat ?? 14.79, lng = pos?.lng ?? -16.93;
  const denom = 559082264.028 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
  const scale = Math.round(denom / 500) * 500;
  return (
    <div className="gx-status">
      <span>EPSG:4326</span>
      <span>{Math.abs(lat).toFixed(4)}° {lat >= 0 ? "N" : "S"}, {Math.abs(lng).toFixed(4)}° {lng >= 0 ? "E" : "W"}</span>
      <span>Échelle 1:{scale.toLocaleString("fr-FR")}</span>
    </div>
  );
}

// ---------- mini-carte de situation ----------
export function MiniMap({ map, communeGeo, baseUrl, subdomains }: { map: L.Map | null; communeGeo: any; baseUrl: string; subdomains?: string }) {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [mini, setMini] = useState<L.Map | null>(null);
  useEffect(() => {
    if (!map) return;
    const up = () => setBounds(map.getBounds());
    up(); map.on("moveend", up);
    return () => { map.off("moveend", up); };
  }, [map]);
  useEffect(() => {
    if (!mini || !communeGeo) return;
    const b = L.geoJSON(communeGeo).getBounds();
    if (b.isValid()) mini.fitBounds(b, { padding: [10, 10] });
  }, [mini, communeGeo]);
  useEffect(() => {
    if (!mini) return;
    const click = (e: L.LeafletMouseEvent) => map?.panTo(e.latlng);
    mini.on("click", click); return () => { mini.off("click", click); };
  }, [mini, map]);
  return (
    <div className="gx-mini" aria-label="Carte de situation">
      <MapContainer ref={setMini} center={[14.8, -16.93]} zoom={11} zoomControl={false} attributionControl={false}
        dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} keyboard={false} boxZoom={false} className="gx-mini-map">
        {baseUrl && <TileLayer url={baseUrl} subdomains={subdomains ?? "abc"} />}
        {communeGeo && <GeoJSON data={communeGeo} style={{ color: "#38bdf8", weight: 1.2, fillOpacity: 0.05 }} interactive={false} />}
        {bounds && <Rectangle bounds={bounds} pathOptions={{ color: "#f8fafc", weight: 1.6, fillColor: "#f8fafc", fillOpacity: 0.12 }} interactive={false} />}
      </MapContainer>
    </div>
  );
}
