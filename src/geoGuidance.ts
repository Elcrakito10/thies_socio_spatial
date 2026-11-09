// ============================================================
// Guidage : manoeuvres (tourner a gauche / droite...), phrases en francais,
// projection d'une position sur l'itineraire. Aucun service externe.
// ============================================================
import type { Route, Mode } from "./geoRouting";
type LL = [number, number]; // lat, lng

const R = 6371008.8, rad = Math.PI / 180;
export const dist = (a: LL, b: LL) => { const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
export const bearing = (a: LL, b: LL) => { const y = Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad); const x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad); return (Math.atan2(y, x) / rad + 360) % 360; };
const wrap = (d: number) => ((d + 540) % 360) - 180; // (-180, 180]

export type Kind = "start" | "straight" | "slight-left" | "slight-right" | "left" | "right" | "sharp-left" | "sharp-right" | "uturn" | "arrive";
export type Maneuver = { at: number; kind: Kind; street: string; point: LL; turn: number };
export type Plan = { cum: number[]; total: number; maneuvers: Maneuver[]; bearings: number[] };

const kindOf = (turn: number): Kind | null => {
  const a = Math.abs(turn), left = turn < 0;
  if (a < 35) return null; if (a < 65) return left ? "slight-left" : "slight-right"; if (a < 125) return left ? "left" : "right"; if (a < 160) return left ? "sharp-left" : "sharp-right"; return "uturn";
};

export function planRoute(route: Route): Plan {
  const L = route.line; const cum = [0]; for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + dist(L[i - 1], L[i]));
  const total = cum[cum.length - 1]; const bearings = L.slice(1).map((p, i) => bearing(L[i], p));
  const pointAt = (d: number): LL => { d = Math.max(0, Math.min(total, d)); let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [L[i - 1][0] + (L[i][0] - L[i - 1][0]) * t, L[i - 1][1] + (L[i][1] - L[i - 1][1]) * t]; };
  const nameAfter = (i: number) => { for (let k = i; k < route.segNames.length; k++) if (route.segNames[k]) return route.segNames[k]; return ""; };
  const ms: Maneuver[] = [{ at: 0, kind: "start", street: nameAfter(0), point: L[0], turn: 0 }];
  // Sur chaque sommet : cap moyen sur ~25 m avant et apres, pour ignorer les virages de courbure douce.
  for (let i = 1; i < L.length - 1; i++) {
    const d = cum[i]; if (d < 12 || total - d < 12 || d < route.connectors.start + 15) continue; // pas de consigne pendant le raccord vers le reseau
    const b0 = bearing(pointAt(d - 25), L[i]), b1 = bearing(L[i], pointAt(d + 25)); const turn = wrap(b1 - b0); const k = kindOf(turn); if (!k) continue;
    const last = ms[ms.length - 1];
    if (last.kind !== "start" && d - last.at < 25) { if (Math.abs(turn) <= Math.abs(last.turn)) continue; ms.pop(); }
    ms.push({ at: d, kind: k, street: nameAfter(i), point: L[i], turn });
  }
  ms.push({ at: total, kind: "arrive", street: route.target.props?.nom ?? "", point: L[L.length - 1], turn: 0 });
  return { cum, total, maneuvers: ms, bearings };
}

const COMPASS = ["le nord", "le nord-est", "l'est", "le sud-est", "le sud", "le sud-ouest", "l'ouest", "le nord-ouest"];
export const compass = (b: number) => COMPASS[Math.round(b / 45) % 8];

export function fmtSpoken(m: number): string {
  if (m >= 950) { const km = Math.round(m / 100) / 10; return `${String(km).replace(".", ",")} ${km >= 2 ? "kilomètres" : "kilomètre"}`; }
  const r = m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10); return `${r} mètres`;
}
const VERB: Record<Kind, string> = {
  start: "", straight: "continuez tout droit", "slight-left": "tournez légèrement à gauche", "slight-right": "tournez légèrement à droite", left: "tournez à gauche", right: "tournez à droite",
  "sharp-left": "tournez franchement à gauche", "sharp-right": "tournez franchement à droite", uturn: "faites demi-tour", arrive: "vous êtes arrivé à destination",
};
export const verbOf = (k: Kind) => VERB[k];
/** Phrase annoncee : « Dans 150 mètres, tournez à gauche sur Avenue X ». */
export function sentence(m: Maneuver, distAhead: number | null, modeWord = ""): string {
  if (m.kind === "start") return `C'est parti${modeWord ? " " + modeWord : ""}. Dirigez-vous vers ${compass(0)}`; // remplace par le cap reel via sentenceStart
  const street = m.street && m.kind !== "arrive" ? ` sur ${m.street}` : m.kind === "arrive" && m.street ? ` : ${m.street}` : "";
  if (m.kind === "arrive") { const nm = m.street ? ` : ${m.street}` : ""; return distAhead === null || distAhead < 25 ? `Vous êtes arrivé à destination${nm}.` : `Dans ${fmtSpoken(distAhead)}, vous arriverez à destination${nm}.`; }
  const v = VERB[m.kind]; const base = `${v}${street}`;
  if (distAhead === null || distAhead < 20) return base.charAt(0).toUpperCase() + base.slice(1) + ".";
  return `Dans ${fmtSpoken(distAhead)}, ${base}.`;
}
export const sentenceStart = (b: number, street: string, modeWord: string) => `C'est parti${modeWord}. Dirigez-vous vers ${compass(b)}${street ? ` sur ${street}` : ""}.`;

/** Projette une position sur l'itineraire : distance parcourue, ecart lateral, cap local. */
export function project(plan: Plan, route: Route, p: LL, hint = 0): { along: number; off: number; heading: number } {
  const L = route.line; let best = { along: 0, off: Infinity, heading: plan.bearings[0] ?? 0 };
  const kx = Math.cos(p[0] * rad) * R * rad, ky = R * rad;
  for (let i = 0; i < L.length - 1; i++) {
    if (plan.cum[i + 1] < hint - 80) continue; // on ne revient pas en arriere de plus de 80 m
    const ax = (L[i][1] - p[1]) * kx, ay = (L[i][0] - p[0]) * ky, bx = (L[i + 1][1] - p[1]) * kx, by = (L[i + 1][0] - p[0]) * ky;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const off = Math.hypot(ax + dx * t, ay + dy * t);
    if (off < best.off) best = { along: plan.cum[i] + t * Math.sqrt(len2), off, heading: plan.bearings[i] };
  }
  return best;
}
export const pointAlong = (plan: Plan, route: Route, d: number): LL => {
  const L = route.line; d = Math.max(0, Math.min(plan.total, d)); let i = 1; while (i < plan.cum.length - 1 && plan.cum[i] < d) i++;
  const t = (d - plan.cum[i - 1]) / ((plan.cum[i] - plan.cum[i - 1]) || 1); return [L[i - 1][0] + (L[i][0] - L[i - 1][0]) * t, L[i - 1][1] + (L[i][1] - L[i - 1][1]) * t];
};
export const MODE_WORD: Record<Mode, string> = { foot: " à pied", bike: " à vélo", car: " en voiture" };

/** Voix : synthese vocale du navigateur (Web Speech API), voix francaise si installee. */
const speakable = (t: string) => t.replace(/\bRN[- ]?(\d+)/gi, "route nationale $1").replace(/\bPS\b/g, "poste de santé").replace(/\bDVF\b/g, "D V F");
export function speak(text: string, opts: { muted?: boolean } = {}): boolean {
  if (opts.muted || typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    const synth = window.speechSynthesis; synth.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text)); u.lang = "fr-FR"; u.rate = 0.98;
    const v = synth.getVoices().find(x => /^fr[-_]FR/i.test(x.lang)) ?? synth.getVoices().find(x => /^fr/i.test(x.lang)); if (v) u.voice = v;
    synth.speak(u); return true;
  } catch { return false; }
}
export const hasFrenchVoice = () => { try { return window.speechSynthesis.getVoices().some(v => /^fr/i.test(v.lang)); } catch { return false; } };
