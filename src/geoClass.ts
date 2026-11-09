// Méthodes de discrétisation (4 classes) : quartiles, intervalles égaux, seuils naturels (Jenks).
export type ClassMethod = "quartiles" | "equal" | "jenks";
export const CLASS_METHODS: { key: ClassMethod; label: string; hint: string }[] = [
  { key: "quartiles", label: "Quartiles", hint: "Effectifs égaux : 25 % des quartiles par classe" },
  { key: "equal", label: "Intervalles égaux", hint: "Étendue (max − min) divisée en 4 amplitudes égales" },
  { key: "jenks", label: "Seuils naturels", hint: "Jenks : minimise la variance dans chaque classe" },
];

/** Retourne les 3 bornes supérieures des classes 1 à 3 (la classe 4 s'arrête au maximum). */
export function classBreaks(sorted: number[], method: ClassMethod, quartileBreaks: [number, number, number]): [number, number, number] {
  const n = sorted.length;
  if (method === "quartiles" || n < 8) return quartileBreaks;
  const min = sorted[0], max = sorted[n - 1];
  if (method === "equal") { const s = (max - min) / 4; return [min + s, min + 2 * s, min + 3 * s]; }
  // Jenks (Fisher) : programmation dynamique, k = 4
  const k = 4;
  const lower: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  const vari: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) { lower[1][j] = 1; vari[1][j] = 0; }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1, v = sorted[i3 - 1];
      w++; s1 += v; s2 += v * v;
      const variance = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) for (let j = 2; j <= k; j++) {
        if (vari[l][j] >= variance + vari[i4][j - 1]) { lower[l][j] = i3; vari[l][j] = variance + vari[i4][j - 1]; }
      }
    }
    lower[l][1] = 1; vari[l][1] = s2 - (s1 * s1) / w;
  }
  const out: number[] = new Array(k - 1);
  let kk = n;
  for (let j = k; j >= 2; j--) { const id = lower[kk][j] - 2; out[j - 2] = sorted[id]; kk = lower[kk][j] - 1; }
  return [out[0], out[1], out[2]];
}
