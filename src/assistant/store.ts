// Petit bus partage : les pages publient le contexte cartographique courant,
// l'assistant le lit ; n'importe quel bouton peut demander une analyse.
export type MapCtx = {
  source: "geoportail" | "cartotheque" | "dashboard";
  indicatorId: string;          // id d'indicateur (voir engine.findInd)
  layer?: "quartiers" | "grille";
  quartierId?: number | null;
  families?: string[];          // familles d'equipements affichees (points)
};
type State = { route: string; map: MapCtx | null };
let state: State = { route: "/", map: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export const assistantStore = {
  get: () => state,
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  setRoute(route: string) { if (state.route !== route) { state = { ...state, route }; emit(); } },
  setMap(map: MapCtx | null) {
    const a = JSON.stringify(state.map), b = JSON.stringify(map);
    if (a !== b) { state = { ...state, map }; emit(); }
  },
};

export type AssistantRequest = { type: "analyze"; ctx?: MapCtx } | { type: "ask"; text: string };
export const ASSISTANT_EVENT = "assistant:request";
/** Ouvre l'assistant et lui transmet une demande (ex. « Analyser cette carte »). */
export function askAssistant(req: AssistantRequest) {
  window.dispatchEvent(new CustomEvent(ASSISTANT_EVENT, { detail: req }));
}
