// Estimation de l'occupation du sol a partir de l'imagerie satellite (tuiles Esri World Imagery),
// calculee dans le navigateur : chaque pixel situe DANS le quartier est classe selon sa couleur.
// Methode simple (RGB uniquement) : elle donne un ordre de grandeur, pas une cartographie validee.
export type LandCover = { veg: number; sol: number; sombre: number; px: number; zoom: number; m2px: number; date: string };

export const LC_CLASSES = [
  { key: "veg" as const, label: "Végétation", color: "#22c55e" },
  { key: "sol" as const, label: "Sol nu & bâti", color: "#f59e0b" },
  { key: "sombre" as const, label: "Zones sombres (ombre, eau)", color: "#64748b" },
];

/** Classe un pixel RGB : 0 = vegetation, 1 = sol nu / bati, 2 = zone sombre. */
export function classifyPixel(r: number, g: number, b: number): 0 | 1 | 2 {
  const lum = (r + g + b) / 3;
  if (lum < 42) return 2;
  const exg = 2 * g - r - b;           // indice de verdeur (Excess Green)
  if (exg > 14 && g >= r) return 0;
  return 1;
}

const TILE = 256;
const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * TILE * 2 ** z;
const latToY = (lat: number, z: number) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z; };

function rings(g: any): number[][][] {
  if (!g) return [];
  const polys: number[][][][] = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  return polys.flat();
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => rej(new Error("tuile")); im.src = url; });
}

export async function computeLandCover(geometry: any, onProgress?: (p: number) => void): Promise<LandCover> {
  const rs = rings(geometry);
  if (!rs.length) throw new Error("Géométrie absente");
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  rs.forEach(r => r.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }));
  // zoom le plus fin tel que le nombre de tuiles reste raisonnable (<= 40)
  let z = 18, tx0 = 0, tx1 = 0, ty0 = 0, ty1 = 0;
  for (; z >= 13; z--) {
    tx0 = Math.floor(lonToX(minX, z) / TILE); tx1 = Math.floor(lonToX(maxX, z) / TILE);
    ty0 = Math.floor(latToY(maxY, z) / TILE); ty1 = Math.floor(latToY(minY, z) / TILE);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 40) break;
  }
  const tiles: [number, number][] = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tiles.push([tx, ty]);

  const mask = document.createElement("canvas"); mask.width = mask.height = TILE;
  const mctx = mask.getContext("2d", { willReadFrequently: true })!;
  const img = document.createElement("canvas"); img.width = img.height = TILE;
  const ictx = img.getContext("2d", { willReadFrequently: true })!;
  const out = { veg: 0, sol: 0, sombre: 0 };
  let done = 0, failed = 0;

  for (const [tx, ty] of tiles) {
    try {
      const im = await loadImg(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`);
      ictx.clearRect(0, 0, TILE, TILE); ictx.drawImage(im, 0, 0, TILE, TILE);
      const pix = ictx.getImageData(0, 0, TILE, TILE).data;      // leve une erreur si le canvas est "tainted" (CORS)
      mctx.clearRect(0, 0, TILE, TILE); mctx.fillStyle = "#000"; mctx.beginPath();
      rs.forEach(r => r.forEach(([lo, la], i) => { const px = lonToX(lo, z) - tx * TILE, py = latToY(la, z) - ty * TILE; i ? mctx.lineTo(px, py) : mctx.moveTo(px, py); }));
      mctx.fill("evenodd");
      const m = mctx.getImageData(0, 0, TILE, TILE).data;
      for (let i = 0; i < TILE * TILE; i++) {
        if (m[i * 4 + 3] < 128) continue;
        const c = classifyPixel(pix[i * 4], pix[i * 4 + 1], pix[i * 4 + 2]);
        if (c === 0) out.veg++; else if (c === 1) out.sol++; else out.sombre++;
      }
    } catch { failed++; }
    onProgress?.(++done / tiles.length);
  }
  const px = out.veg + out.sol + out.sombre;
  if (!px || failed === tiles.length) throw new Error("Imagerie satellite inaccessible (connexion ou CORS).");
  const lat = (minY + maxY) / 2;
  const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
  return { ...out, px, zoom: z, m2px: mpp * mpp, date: new Date().toISOString().slice(0, 10) };
}
