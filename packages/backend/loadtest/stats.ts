// Small, dependency-free statistics for the load test report.
// Latency samples are skewed and heavy-tailed, so everything here is
// non-parametric: medians, percentiles, bootstrap CIs and Mann-Whitney U.

export function quantile(sorted: ReadonlyArray<number>, q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const loValue = sorted[lo] ?? Number.NaN;
  const hiValue = sorted[hi] ?? loValue;
  return loValue + (hiValue - loValue) * (pos - lo);
}

export function sortedCopy(values: ReadonlyArray<number>): Array<number> {
  return [...values].sort((a, b) => a - b);
}

export function median(values: ReadonlyArray<number>): number {
  return quantile(sortedCopy(values), 0.5);
}

/** Deterministic PRNG so the report is reproducible from the same samples. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile bootstrap 95% CI for the median. */
export function bootstrapMedianCi(
  values: ReadonlyArray<number>,
  iterations = 2000,
): { lo: number; hi: number } {
  if (values.length === 0) return { lo: Number.NaN, hi: Number.NaN };
  const rand = mulberry32(0x5eed);
  const medians: Array<number> = [];
  const resample: Array<number> = Array.from({ length: values.length });
  for (let i = 0; i < iterations; i++) {
    for (let j = 0; j < values.length; j++) {
      resample[j] = values[Math.floor(rand() * values.length)] ?? 0;
    }
    medians.push(median(resample));
  }
  const sorted = sortedCopy(medians);
  return { lo: quantile(sorted, 0.025), hi: quantile(sorted, 0.975) };
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 erf approximation (|error| < 1.5e-7).
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Two-sided Mann-Whitney U test (normal approximation with tie correction)
 * plus Cliff's delta effect size. delta > 0 means `a` tends to be larger.
 */
export function mannWhitney(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): { u: number; p: number; cliffsDelta: number } {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) return { u: Number.NaN, p: Number.NaN, cliffsDelta: Number.NaN };
  const pooled = [
    ...a.map((value) => ({ value, group: 0 })),
    ...b.map((value) => ({ value, group: 1 })),
  ].sort((x, y) => x.value - y.value);
  const ranks: Array<number> = Array.from({ length: pooled.length });
  let tieTerm = 0;
  for (let i = 0; i < pooled.length; ) {
    let j = i;
    while (j + 1 < pooled.length && pooled[j + 1]?.value === pooled[i]?.value) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = rank;
    const ties = j - i + 1;
    tieTerm += ties ** 3 - ties;
    i = j + 1;
  }
  let rankSumA = 0;
  pooled.forEach((entry, index) => {
    if (entry.group === 0) rankSumA += ranks[index] ?? 0;
  });
  const u1 = rankSumA - (n1 * (n1 + 1)) / 2;
  const n = n1 + n2;
  const meanU = (n1 * n2) / 2;
  const varU = ((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1)));
  const z = varU > 0 ? (u1 - meanU - Math.sign(u1 - meanU) * 0.5) / Math.sqrt(varU) : 0;
  const p = varU > 0 ? 2 * (1 - normalCdf(Math.abs(z))) : u1 === meanU ? 1 : 0;
  // Cliff's delta from U: P(a > b) - P(a < b).
  const cliffsDelta = (2 * u1) / (n1 * n2) - 1;
  return { u: u1, p, cliffsDelta };
}
