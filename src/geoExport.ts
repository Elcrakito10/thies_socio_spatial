// Export PNG d'une carte thématique « prête pour le mémoire » : titre, aplat par quartier,
// légende, flèche du nord, échelle graphique, source et date. Dessinée directement depuis les géométries.
type Feat = { geometry: any; nom?: string };
export type ExportLegendRow = { color: string; label: string };

export function exportThematicPng(opts: {
  title: string; subtitle?: string; features: Feat[]; colorOf: (i: number) => string; legend: ExportLegendRow[]; legendTitle?: string; source: string; filename: string;
}) {
  const polys: { rings: number[][][]; i: number }[] = [];
  opts.features.forEach((f, i) => {
    const g = f.geometry; if (!g) return;
    if (g.type === "Polygon") polys.push({ rings: g.coordinates, i });
    else if (g.type === "MultiPolygon") g.coordinates.forEach((p: number[][][]) => polys.push({ rings: p, i }));
  });
  if (!polys.length) return;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  polys.forEach(p => p.rings[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const W = 2000, H = 1500, M = 70, top = 175, side = 520;
  const mapW = W - side - M * 2, mapH = H - top - M - 40;
  const gw = (x1 - x0) * k, gh = y1 - y0, sc = Math.min(mapW / gw, mapH / gh);
  const ox = M + (mapW - gw * sc) / 2, oy = top + (mapH - gh * sc) / 2;
  const px = (x: number) => ox + (x - x0) * k * sc, py = (y: number) => oy + (y1 - y) * sc;

  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#12303f"; g.lineWidth = 3; g.strokeRect(20, 20, W - 40, H - 40);
  g.fillStyle = "#0b2a3b"; g.font = "700 54px Segoe UI, Arial, sans-serif"; g.fillText(opts.title, M, 100);
  if (opts.subtitle) { g.fillStyle = "#4a6779"; g.font = "400 28px Segoe UI, Arial, sans-serif"; g.fillText(opts.subtitle, M, 140); }
  g.fillStyle = "#eef3f6"; g.fillRect(M - 10, top - 10, mapW + 20, mapH + 20);
  g.lineJoin = "round"; g.strokeStyle = "#45586a"; g.lineWidth = 1.2;
  polys.forEach(p => {
    g.beginPath();
    p.rings.forEach(r => r.forEach(([x, y], j) => (j ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y)))));
    g.fillStyle = opts.colorOf(p.i); g.fill("evenodd"); g.stroke();
  });
  // Légende
  const lx = W - side - M + 40; let ly = top + 20;
  g.fillStyle = "#0b2a3b"; g.font = "700 30px Segoe UI, Arial, sans-serif"; g.fillText(opts.legendTitle || "Légende", lx, ly + 20); ly += 60;
  g.font = "400 26px Segoe UI, Arial, sans-serif";
  opts.legend.forEach(r => { g.fillStyle = r.color; g.fillRect(lx, ly, 46, 30); g.strokeStyle = "#45586a"; g.lineWidth = 1; g.strokeRect(lx, ly, 46, 30); g.fillStyle = "#16303f"; g.fillText(r.label, lx + 64, ly + 24); ly += 46; });
  // Nord
  const nx = W - M - 70, ny = top + mapH - 40;
  g.fillStyle = "#0b2a3b"; g.beginPath(); g.moveTo(nx, ny - 80); g.lineTo(nx + 24, ny); g.lineTo(nx, ny - 16); g.lineTo(nx - 24, ny); g.closePath(); g.fill();
  g.font = "700 30px Segoe UI, Arial, sans-serif"; g.textAlign = "center"; g.fillText("N", nx, ny - 92); g.textAlign = "left";
  // Échelle graphique (≈ km à la latitude moyenne)
  const pxKm = sc / 111.32; // sc = pixels par degré de latitude ; 1° de latitude ≈ 111,32 km
  const stepKm = [0.5, 1, 2, 5].find(s => s * pxKm >= 140) ?? 5;
  const sx = lx, sy = top + mapH - 30;
  g.fillStyle = "#0b2a3b"; g.fillRect(sx, sy, stepKm * pxKm / 2, 12); g.fillStyle = "#fff"; g.fillRect(sx + stepKm * pxKm / 2, sy, stepKm * pxKm / 2, 12);
  g.strokeStyle = "#0b2a3b"; g.lineWidth = 2; g.strokeRect(sx, sy, stepKm * pxKm, 12);
  g.fillStyle = "#16303f"; g.font = "400 22px Segoe UI, Arial, sans-serif"; g.fillText("0", sx - 4, sy - 8); g.fillText(`${stepKm} km`, sx + stepKm * pxKm - 20, sy - 8);
  // Pied
  g.fillStyle = "#4a6779"; g.font = "400 22px Segoe UI, Arial, sans-serif";
  g.fillText(`Source : ${opts.source} • WGS 84 • Réalisation : A. A. Dione & M. O. S. Sy • ${new Date().toLocaleDateString("fr-FR")}`, M, H - 38);
  c.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = opts.filename; a.click(); URL.revokeObjectURL(u); }, "image/png");
}
