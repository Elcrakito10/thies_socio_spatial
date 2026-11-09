import { useEffect, useState } from "react";
import { Volume2, LocateFixed, MousePointerClick, Route as RouteIcon, CircleDot, X, Footprints, Bike, Car, Loader2 } from "lucide-react";
import { MODES, TARGET_SPECS, fmtTime, type Mode } from "./geoRouting";
import type { TargetSpec } from "./geoQuery";

export type FamMeta = { key: string; label: string; color: string };
export type AroundView = { km: number; fams: string[]; total: number; byFam: (FamMeta & { count: number })[]; nearest: { name: string; type: string; fam: string; d: number }[]; spec?: TargetSpec } | null;
export type RouteView = {
  mode: Mode; spec: TargetSpec; pick: number; steps: { name: string; dist: number }[]; warn?: string;
  per: Partial<Record<Mode, { distM: number; timeS: number; name: string; type: string } | null>>;
  alts: { name: string; type: string; distM: number; timeS: number }[];
} | null;

type Props = {
  fams: FamMeta[]; pos: { lat: number; lng: number } | null; msg: string; busy: boolean; placing: boolean;
  onLocate: () => void; onPlace: () => void; onClearPos: () => void;
  around: AroundView; aroundReq: { km: number; fams: string[] } | null; onAround: (km: number, fams: string[]) => void; onClearAround: () => void;
  route: RouteView; routeReq: { mode: Mode; spec: TargetSpec } | null; onRoute: (mode: Mode, spec: TargetSpec) => void; onSwitchMode: (m: Mode) => void; onPick: (i: number) => void; onClearRoute: () => void; onGuide: (sim: boolean) => void;
};
const ICON = { foot: Footprints, bike: Bike, car: Car };
const fmtD = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);
const sameSpec = (a: TargetSpec, b: TargetSpec) => (a.fam ?? "") === (b.fam ?? "") && (a.type ?? "") === (b.type ?? "");

export default function GeoNearbyPanel(p: Props) {
  const [km, setKm] = useState("1");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [specIdx, setSpecIdx] = useState(1);
  const [mode, setMode] = useState<Mode>("foot");
  useEffect(() => { if (p.aroundReq) { setKm(String(p.aroundReq.km)); setSel(new Set(p.aroundReq.fams)); } }, [p.aroundReq]);
  useEffect(() => { if (p.routeReq) { setMode(p.routeReq.mode); const i = TARGET_SPECS.findIndex(s => sameSpec(s, p.routeReq!.spec)); setSpecIdx(i >= 0 ? i : TARGET_SPECS.length - 1); } }, [p.routeReq]);
  const toggle = (k: string) => setSel(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const kmN = Number(km.replace(",", "."));

  return (
    <div className="gx-nb">
      <div className="gx-nb-pos">
        <b>Ma position</b>
        {p.pos ? <span className="gx-nb-coord">{p.pos.lat.toFixed(5)}, {p.pos.lng.toFixed(5)} <button onClick={p.onClearPos} aria-label="Retirer ma position"><X size={12} /></button></span> : <span className="gx-nb-coord muted">non définie</span>}
        <div className="gx-q-row">
          <button className="gx-q-add" onClick={p.onLocate} disabled={p.busy}>{p.busy ? <Loader2 size={14} className="spin" /> : <LocateFixed size={14} />} Me localiser</button>
          <button className={`gx-q-add alt ${p.placing ? "on" : ""}`} onClick={p.onPlace}><MousePointerClick size={14} /> {p.placing ? "Cliquez sur la carte…" : "Pointer sur la carte"}</button>
        </div>
        {p.msg && <small className="gx-q-hint">{p.msg}</small>}
      </div>

      <details className="gx-q-build" open={!!p.around || undefined}>
        <summary><CircleDot size={13} /> Infrastructures dans un rayon</summary>
        <div className="gx-q-grid">
          <div className="gx-q-row"><span>Rayon</span><input inputMode="decimal" value={km} onChange={e => setKm(e.target.value)} aria-label="Rayon en kilomètres" style={{ width: 60, flex: "none" }} /><span>km</span></div>
          <div className="gx-nb-fams" role="group" aria-label="Types d'infrastructures">
            {p.fams.map(f => <button key={f.key} className={sel.has(f.key) ? "on" : ""} style={{ ["--c" as any]: f.color }} onClick={() => toggle(f.key)}>{f.label}</button>)}
          </div>
          <small className="gx-q-hint">{sel.size ? "Types choisis uniquement." : "Aucun type coché : tous les types."}</small>
          <div className="gx-q-row">
            <button className="gx-q-add" disabled={!(kmN > 0)} onClick={() => p.onAround(kmN, [...sel])}>Tracer le buffer et lister</button>
            {p.around && <button className="gx-q-add alt" onClick={p.onClearAround}>Effacer</button>}
          </div>
          {p.around && <div className="gx-nb-res">
            <b>{p.around.total} infrastructure(s) à moins de {p.around.km.toLocaleString("fr-FR")} km</b>
            <ul className="gx-nb-bars">{p.around.byFam.filter(f => f.count).map(f => <li key={f.key}><i style={{ background: f.color }} />{f.label}<b>{f.count}</b></li>)}</ul>
            {p.around.nearest.length > 0 && <><small className="gx-q-hint">Les plus proches :</small><ol className="gx-nb-near">{p.around.nearest.map((n, i) => <li key={i}><span>{n.name || "(sans nom)"} <small>{n.type}</small></span><b>{fmtD(n.d)}</b></li>)}</ol></>}
          </div>}
        </div>
      </details>

      <details className="gx-q-build" open={!!p.route || undefined}>
        <summary><RouteIcon size={13} /> Itinéraire vers l'équipement le plus proche</summary>
        <div className="gx-q-grid">
          <select value={specIdx} onChange={e => setSpecIdx(Number(e.target.value))} aria-label="Destination">{TARGET_SPECS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}</select>
          <div className="gx-nb-modes" role="group" aria-label="Mode de déplacement">
            {(Object.keys(MODES) as Mode[]).map(m => { const I = ICON[m]; return <button key={m} className={mode === m ? "on" : ""} onClick={() => { setMode(m); if (p.route) p.onSwitchMode(m); }}><I size={15} /> {MODES[m].label}</button>; })}
          </div>
          <div className="gx-q-row">
            <button className="gx-q-add" disabled={p.busy} onClick={() => p.onRoute(mode, TARGET_SPECS[specIdx])}>Tracer l'itinéraire</button>
            {p.route && <button className="gx-q-add alt" onClick={p.onClearRoute}>Effacer</button>}
          </div>
          {p.route && <div className="gx-nb-res">
            {p.route.warn && <small className="gx-q-hint warnc">{p.route.warn}</small>}
            {(() => { const r = p.route.per[p.route.mode]; return r ? <b>{r.name || "(sans nom)"} <small>{r.type}</small><br />{fmtD(r.distM)} · {fmtTime(r.timeS)} ({MODES[p.route.mode].short})</b> : <b>Aucun trajet trouvé</b>; })()}
            <div className="gx-nb-cmp">{(Object.keys(MODES) as Mode[]).map(m => { const r = p.route!.per[m]; const I = ICON[m]; return <button key={m} className={p.route!.mode === m ? "on" : ""} onClick={() => { setMode(m); p.onSwitchMode(m); }} style={{ ["--c" as any]: MODES[m].color }}><I size={14} /><span>{r ? `${fmtTime(r.timeS)}` : "—"}</span><small>{r ? fmtD(r.distM) : ""}</small></button>; })}</div>
            <div className="gx-q-row"><button className="gx-q-add" onClick={() => p.onGuide(false)}><Volume2 size={14} /> Guidage vocal 3D</button><button className="gx-q-add alt" onClick={() => p.onGuide(true)} title="Rejoue le trajet à l'écran, sans bouger">Simuler</button></div>
            {p.route.alts.length > 1 && <><small className="gx-q-hint">Autres destinations proches :</small><ol className="gx-nb-near">{p.route.alts.map((a, i) => <li key={i} className={i === p.route!.pick ? "cur" : ""}><button onClick={() => p.onPick(i)}><span>{a.name || "(sans nom)"} <small>{a.type}</small></span><b>{fmtD(a.distM)} · {fmtTime(a.timeS)}</b></button></li>)}</ol></>}
            <details><summary className="gx-q-hint">Étapes ({p.route.steps.length})</summary><ol className="gx-nb-steps">{p.route.steps.map((s, i) => <li key={i}>{s.name} <b>{fmtD(s.dist)}</b></li>)}</ol></details>
            <small className="gx-q-hint">Réseau OpenStreetMap de Thiès. Vitesses estimées (pied 5 km/h, vélo 15, voiture 25 à 50 selon la voie) ; sens uniques et trafic non pris en compte.</small>
          </div>}
        </div>
      </details>
    </div>
  );
}
