// Petit serveur intermediaire : garde la cle API secrete et appelle l'API Claude.
// Lancer :  ANTHROPIC_API_KEY=sk-ant-... node server/index.mjs   (port 8787)
import http from "node:http";
import fs from "node:fs";
// Charge le fichier .env (a la racine du frontend) : aucune syntaxe de variable a taper, valable sous Windows.
try { for (const l of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !l.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* pas de .env */ }
const PORT = Number(process.env.PORT || 8787);
const KEY = process.env.ANTHROPIC_API_KEY;
const BASE = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const SYS_EXPLAIN = `Tu es l'Assistant Spatial de Thiès (Sénégal), intégré à un WebGIS sur la ségrégation socio-spatiale.
Tu reçois la question de l'utilisateur et un "paquet de faits" calculé par l'application (JSON).
RÈGLES ABSOLUES :
- Utilise UNIQUEMENT les nombres et faits du paquet. N'invente jamais de valeur, d'année, de cause ni de quartier.
- Si le paquet ne permet pas de répondre, dis : "Cette information n'est pas encore disponible dans les données."
- Distingue clairement : données observées, calculs, interprétation, hypothèses (à signaler comme non testées).
- Une corrélation n'est pas une causalité. Les résultats de ségrégation (Gini, Theil, dissimilarité, Moran, LISA, profils K-means) sont ceux de l'analyse validée ; ne cite que ceux du paquet de faits.
- Réponds en français, de façon claire et concise (max ~180 mots), sans répéter les tableaux déjà affichés.`;
const SYS_REWRITE = `Tu transformes une question libre en une question courte et canonique que le moteur de l'application comprend.
Tu reçois la question, la liste des quartiers et la liste des indicateurs (id + libellé).
Réponds UNIQUEMENT par un JSON : {"query":"..."} où query reprend les noms EXACTS de quartiers/communes (Thiès Nord, Thiès Est, Thiès Ouest) et les libellés d'indicateurs, avec un verbe simple (compare, pourquoi, quels quartiers sont les moins/plus ..., profil de ..., synthèse, explique ...).
Si la question demande autre chose que ces données, réponds {"query":""}.`;

async function claude(system, user, max = 700) {
  const r = await fetch(`${BASE}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: max, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const j = await r.json();
  return (j.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
}
const body = req => new Promise((ok, ko) => { let s = ""; req.on("data", c => { s += c; if (s.length > 2e5) { ko(new Error("too big")); req.destroy(); } }); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { ko(e); } }); });
const send = (res, code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };

http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/assistant/health") return send(res, 200, { ok: !!KEY, model: MODEL });
    if (!KEY) return send(res, 503, { error: "ANTHROPIC_API_KEY manquante" });
    if (req.method !== "POST") return send(res, 404, { error: "not found" });
    const b = await body(req);
    if (req.url === "/api/assistant/explain") {
      const q = String(b.question || "").slice(0, 600);
      const text = await claude(SYS_EXPLAIN, `Question : ${q}\n\nPaquet de faits (JSON) :\n${JSON.stringify(b.facts).slice(0, 12000)}`);
      return send(res, 200, { text });
    }
    if (req.url === "/api/assistant/rewrite") {
      const q = String(b.question || "").slice(0, 600);
      const out = await claude(SYS_REWRITE, `Question : ${q}\nQuartiers : ${(b.quartiers || []).join(" | ")}\nIndicateurs : ${(b.indicators || []).map(i => `${i.id}=${i.label}`).join(" | ")}`, 200);
      let query = ""; try { query = JSON.parse(out.replace(/^```json|```$/g, "").trim()).query || ""; } catch { /* sortie non JSON */ }
      return send(res, 200, { query: String(query).slice(0, 300) });
    }
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, 502, { error: String(e.message || e) }); }
}).listen(PORT, () => console.log(`Assistant API sur :${PORT} (modele ${MODEL}, cle ${KEY ? "ok" : "ABSENTE"})`));
