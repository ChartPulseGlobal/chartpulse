export type Role = "victimes" | "mis_en_cause";

export type InseeObservation = {
  year: number;
  group: string;
  employmentRate: number;
  activityRate: number;
  unemploymentRate: number;
  inactivityRate: number;
  unit: "%";
  age: string;
  field: string;
  definition: string;
  source: string;
  sourceUrl: string;
};

export type SsmiObservation = {
  role: Role;
  indicator: string;
  year: number;
  sex: string;
  age: string;
  majority: string;
  nationality: string;
  nationalityRaw: string;
  value: number | null;
  secret: boolean;
  disseminationStatus: string;
  sheet: string;
};

export type OfficialDataset = {
  meta: {
    title: string;
    generatedAtUtc: string;
    synthetic: false;
    scope: string;
    yearsRequested: string;
    rules: Record<string, string>;
  };
  sources: Record<string, { producer: string; url: string; dataset?: string; [key: string]: unknown }>;
  insee: {
    year: number;
    observations: InseeObservation[];
    melodi: {
      annual: Record<string, unknown>;
      series: Record<string, unknown>;
      auditableSubset: Record<string, unknown>[];
    };
  };
  ssmsi: {
    observations: SsmiObservation[];
    annualTotals: SsmiObservation[];
    ageProfiles: SsmiObservation[];
    sexProfiles: SsmiObservation[];
    years: number[];
    indicators: Record<Role, string[]>;
  };
  justice: {
    status: string;
    message: string;
    reason: string;
  };
  quality: {
    inseeObservationCount: number;
    observationCount: number;
    annualTotalCount: number;
    ageProfileCount: number;
    sexProfileCount: number;
    secretCount: number;
    completenessPercent: number;
    reconciliationIssueCount: number;
    reconciliationIssues: unknown[];
    warnings: string[];
    files: Array<Record<string, unknown>>;
    availableVariables: string[];
    unavailableVariables: string[];
  };
};

export type NationalityShare = {
  french: number;
  foreign: number;
  foreignShare: number;
  total: number;
};

export type AssociationPoint = {
  year: number;
  victimsShare: number;
  suspectsShare: number;
};

export type AssociationStats = {
  n: number;
  pearson: number | null;
  spearman: number | null;
  r2: number | null;
  pValue: number | null;
};

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} %`;
}

export function formatDecimal(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function rowFor(
  rows: SsmiObservation[],
  role: Role,
  indicator: string,
  year: number,
  nationality: string,
): SsmiObservation | undefined {
  return rows.find(
    (row) =>
      row.role === role &&
      row.indicator === indicator &&
      row.year === year &&
      row.nationality === nationality,
  );
}

export function nationalityShare(
  dataset: OfficialDataset,
  role: Role,
  indicator: string,
  year: number,
): NationalityShare | null {
  const rows = dataset.ssmsi.annualTotals;
  const french = rowFor(rows, role, indicator, year, "Française");
  const foreign = rowFor(rows, role, indicator, year, "Étrangère");
  const total = rowFor(rows, role, indicator, year, "Ensemble");

  if (!french || !foreign || !total) return null;
  if (french.secret || foreign.secret || total.secret) return null;
  if (french.value === null || foreign.value === null || total.value === null) return null;
  const denominator = french.value + foreign.value;
  if (denominator <= 0) return null;

  return {
    french: french.value,
    foreign: foreign.value,
    total: total.value,
    foreignShare: (foreign.value / denominator) * 100,
  };
}

export function annualSeries(
  dataset: OfficialDataset,
  role: Role,
  indicator: string,
): Array<{ year: number; value: number | null; secret: boolean }> {
  return dataset.ssmsi.annualTotals
    .filter(
      (row) => row.role === role && row.indicator === indicator && row.nationality === "Ensemble",
    )
    .sort((a, b) => a.year - b.year)
    .map((row) => ({ year: row.year, value: row.value, secret: row.secret }));
}

export function ageProfile(
  dataset: OfficialDataset,
  role: Role,
  indicator: string,
  year: number,
): SsmiObservation[] {
  return dataset.ssmsi.ageProfiles.filter(
    (row) => row.role === role && row.indicator === indicator && row.year === year,
  );
}

export function associationPoints(dataset: OfficialDataset, indicator: string): AssociationPoint[] {
  const years = dataset.ssmsi.years;
  const points: AssociationPoint[] = [];
  for (const year of years) {
    const victims = nationalityShare(dataset, "victimes", indicator, year);
    const suspects = nationalityShare(dataset, "mis_en_cause", indicator, year);
    if (!victims || !suspects) continue;
    points.push({
      year,
      victimsShare: victims.foreignShare,
      suspectsShare: suspects.foreignShare,
    });
  }
  return points;
}

export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

function ranks(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j += 1;
    const averageRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) out[sorted[k].index] = averageRank;
    i = j;
  }
  return out;
}

export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  return pearson(ranks(xs), ranks(ys));
}

function logGamma(z: number): number {
  const coeff = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = 0.99999999999980993;
  const zz = z - 1;
  for (let i = 0; i < coeff.length; i += 1) x += coeff[i] / (zz + i + 1);
  const t = zz + coeff.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const eps = 3e-12;
  const fpmin = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return h;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

export function correlationPValue(r: number, n: number): number | null {
  if (n < 3 || !Number.isFinite(r) || Math.abs(r) >= 1) {
    return Math.abs(r) === 1 && n >= 3 ? 0 : null;
  }
  const df = n - 2;
  const t = Math.abs(r) * Math.sqrt(df / (1 - r * r));
  const x = df / (df + t * t);
  return regularizedBeta(x, df / 2, 0.5);
}

export function associationStats(points: AssociationPoint[]): AssociationStats {
  if (points.length < 3) return { n: points.length, pearson: null, spearman: null, r2: null, pValue: null };
  const xs = points.map((point) => point.victimsShare);
  const ys = points.map((point) => point.suspectsShare);
  const r = pearson(xs, ys);
  const rho = spearman(xs, ys);
  return {
    n: points.length,
    pearson: r,
    spearman: rho,
    r2: r === null ? null : r * r,
    pValue: r === null ? null : correlationPValue(r, points.length),
  };
}

export function commonIndicators(dataset: OfficialDataset): string[] {
  const victims = new Set(dataset.ssmsi.indicators.victimes);
  return dataset.ssmsi.indicators.mis_en_cause.filter((indicator) => victims.has(indicator));
}

export function latestYear(dataset: OfficialDataset): number {
  return Math.max(...dataset.ssmsi.years);
}
