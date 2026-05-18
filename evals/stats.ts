/**
 * Wilcoxon signed-rank test, paired, two-sided, normal approximation with
 * continuity correction and tie-rank averaging.
 *
 * For n ≥ ~10, the normal approximation is acceptable. The eval test set
 * launches at n=30 (PRD §7), so this is appropriate. For exact small-n p-values
 * we'd need the full table; that's out of scope until we run sub-10 slices.
 */
export type WilcoxonResult = {
  n: number;
  n_nonzero: number;
  w_plus: number;
  w_minus: number;
  z: number;
  p_two_sided: number;
  mean_delta: number;
};

export function wilcoxonSignedRank(oldScores: number[], newScores: number[]): WilcoxonResult {
  if (oldScores.length !== newScores.length) {
    throw new Error(`paired arrays must match: old=${oldScores.length}, new=${newScores.length}`);
  }
  const n = oldScores.length;
  const diffs = newScores.map((v, i) => v - oldScores[i]);
  const meanDelta = diffs.reduce((a, b) => a + b, 0) / Math.max(1, n);

  // Drop zero differences, then rank by absolute value with tie-averaging.
  const nonzero = diffs
    .map((d, i) => ({ d, i }))
    .filter((x) => x.d !== 0);
  const nz = nonzero.length;
  if (nz === 0) {
    return { n, n_nonzero: 0, w_plus: 0, w_minus: 0, z: 0, p_two_sided: 1, mean_delta: meanDelta };
  }
  const sorted = nonzero
    .map((x) => ({ ...x, abs: Math.abs(x.d) }))
    .sort((a, b) => a.abs - b.abs);

  // Tie-averaged ranks.
  const ranks = new Array<number>(sorted.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].abs === sorted[i].abs) j++;
    const avg = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }

  let wPlus = 0;
  let wMinus = 0;
  for (let k = 0; k < sorted.length; k++) {
    if (sorted[k].d > 0) wPlus += ranks[k];
    else wMinus += ranks[k];
  }

  // Normal approximation with continuity correction and tie correction.
  const mean = (nz * (nz + 1)) / 4;
  // Tie-corrected variance: subtract sum(t^3 - t)/48 over tie groups.
  const tieGroups = new Map<number, number>();
  for (const s of sorted) tieGroups.set(s.abs, (tieGroups.get(s.abs) ?? 0) + 1);
  let tieCorrection = 0;
  for (const t of tieGroups.values()) tieCorrection += (t * t * t - t) / 48;
  const variance = (nz * (nz + 1) * (2 * nz + 1)) / 24 - tieCorrection;
  const sd = Math.sqrt(Math.max(variance, 0));

  const z = sd === 0 ? 0 : (wPlus - mean - 0.5 * Math.sign(wPlus - mean)) / sd;
  const p = 2 * (1 - standardNormalCdf(Math.abs(z)));

  return { n, n_nonzero: nz, w_plus: wPlus, w_minus: wMinus, z, p_two_sided: p, mean_delta: meanDelta };
}

// Abramowitz & Stegun 7.1.26 erf approximation; max error ~1.5e-7.
function erf(x: number): number {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function standardNormalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}
