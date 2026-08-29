"use client";

import { formatDecimal, formatInt, formatPct } from "@/lib/national/official-data";

export type ChartDatum = { label: string; value: number; detail?: string };
export type SeriesDatum = { year: number; value: number | null };

const pad = { left: 56, right: 18, top: 20, bottom: 38 };

export function HorizontalBars({ data, unit = "" }: { data: ChartDatum[]; unit?: string }) {
  const width = 760;
  const rowH = 34;
  const height = Math.max(210, data.length * rowH + 54);
  const labelW = 260;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="chartFrame" role="img" aria-label="Classement en barres horizontales">
      <svg viewBox={`0 0 ${width} ${height}`} className="chartSvg">
        {data.map((d, index) => {
          const y = 18 + index * rowH;
          const barW = ((width - labelW - 82) * d.value) / max;
          return (
            <g key={`${d.label}-${index}`}>
              <text x={labelW - 12} y={y + 17} textAnchor="end" className="chartLabel">
                {d.label.length > 34 ? `${d.label.slice(0, 34)}…` : d.label}
              </text>
              <rect x={labelW} y={y + 4} width={Math.max(1, barW)} height={18} rx={2} className="barPrimary">
                <title>{`${d.label} — ${formatInt(d.value)}${unit ? ` ${unit}` : ""}${d.detail ? ` — ${d.detail}` : ""}`}</title>
              </rect>
              <text x={labelW + barW + 8} y={y + 18} className="chartValue">{formatInt(d.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GroupedPercentBars({ rows }: { rows: Array<{ group: string; employment: number; activity: number; unemployment: number }> }) {
  const width = 760;
  const height = 330;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const groupW = plotW / Math.max(rows.length, 1);
  const barW = Math.min(42, groupW / 5);
  const series = [
    { key: "employment" as const, label: "Emploi", cls: "barPrimary" },
    { key: "activity" as const, label: "Activité", cls: "barSecondary" },
    { key: "unemployment" as const, label: "Chômage", cls: "barWarning" },
  ];
  const y = (value: number) => pad.top + plotH - (value / 100) * plotH;
  return (
    <div className="chartFrame">
      <svg viewBox={`0 0 ${width} ${height}`} className="chartSvg" role="img" aria-label="Taux d'emploi, d'activité et de chômage par statut migratoire">
        {[0, 20, 40, 60, 80, 100].map((tick) => (
          <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="gridLine" /><text x={pad.left - 9} y={y(tick) + 4} textAnchor="end" className="axisLabel">{tick}%</text></g>
        ))}
        {rows.map((row, i) => {
          const startX = pad.left + i * groupW + groupW / 2 - (barW * 3 + 10) / 2;
          return (
            <g key={row.group}>
              {series.map((s, j) => {
                const value = row[s.key];
                const x = startX + j * (barW + 5);
                return <g key={s.key}><rect x={x} y={y(value)} width={barW} height={pad.top + plotH - y(value)} rx={2} className={s.cls}><title>{`${row.group} — ${s.label}: ${formatPct(value)}`}</title></rect><text x={x + barW / 2} y={y(value) - 5} textAnchor="middle" className="chartValueSmall">{formatDecimal(value, 1)}</text></g>;
              })}
              <text x={pad.left + i * groupW + groupW / 2} y={height - 13} textAnchor="middle" className="axisLabel">{row.group === "Sans ascendance migratoire directe" ? "Sans ascendance directe" : row.group}</text>
            </g>
          );
        })}
        <g transform={`translate(${width - 286},9)`}>{series.map((s, i) => <g key={s.key} transform={`translate(${i * 94},0)`}><rect width="10" height="10" y="-7" className={s.cls} /><text x="15" y="2" className="legendText">{s.label}</text></g>)}</g>
      </svg>
    </div>
  );
}

export function DualLineChart({ victims, suspects }: { victims: SeriesDatum[]; suspects: SeriesDatum[] }) {
  const width = 760;
  const height = 300;
  const all = [...victims, ...suspects].filter((d): d is { year: number; value: number } => d.value !== null);
  const years = Array.from(new Set(all.map((d) => d.year))).sort((a, b) => a - b);
  const max = Math.max(1, ...all.map((d) => d.value));
  const minYear = years[0] ?? 2016;
  const maxYear = years.at(-1) ?? 2025;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (year: number) => pad.left + ((year - minYear) / Math.max(1, maxYear - minYear)) * plotW;
  const y = (value: number) => pad.top + plotH - (value / max) * plotH;
  const pathFor = (series: SeriesDatum[]) => {
    let started = false;
    return series.map((d) => {
      if (d.value === null) { started = false; return ""; }
      const command = started ? "L" : "M";
      started = true;
      return `${command}${x(d.year).toFixed(1)},${y(d.value).toFixed(1)}`;
    }).join(" ");
  };
  return (
    <div className="chartFrame"><svg viewBox={`0 0 ${width} ${height}`} className="chartSvg" role="img" aria-label="Séries temporelles victimes et mis en cause">
      {[0, .25, .5, .75, 1].map((ratio) => { const value = max * ratio; return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className="gridLine" /><text x={pad.left - 8} y={y(value) + 4} textAnchor="end" className="axisLabel">{formatInt(value)}</text></g>; })}
      {years.map((year) => <text key={year} x={x(year)} y={height - 12} textAnchor="middle" className="axisLabel">{year}</text>)}
      <path d={pathFor(victims)} className="linePrimary" fill="none" /><path d={pathFor(suspects)} className="lineSecondary" fill="none" />
      {victims.filter((d) => d.value !== null).map((d) => <circle key={`v-${d.year}`} cx={x(d.year)} cy={y(d.value as number)} r="4" className="dotPrimary"><title>{`Victimes ${d.year}: ${formatInt(d.value)}`}</title></circle>)}
      {suspects.filter((d) => d.value !== null).map((d) => <circle key={`m-${d.year}`} cx={x(d.year)} cy={y(d.value as number)} r="4" className="dotSecondary"><title>{`Mis en cause ${d.year}: ${formatInt(d.value)}`}</title></circle>)}
      <g transform={`translate(${width - 220},12)`}><circle cx="0" cy="0" r="4" className="dotPrimary" /><text x="10" y="4" className="legendText">Victimes</text><circle cx="92" cy="0" r="4" className="dotSecondary" /><text x="102" y="4" className="legendText">Mis en cause</text></g>
    </svg></div>
  );
}

export function Histogram({ data }: { data: ChartDatum[] }) {
  const width = 760, height = 300;
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - 55;
  const max = Math.max(1, ...data.map((d) => d.value));
  const barGap = 5, barW = Math.max(9, plotW / Math.max(1, data.length) - barGap);
  const y = (value: number) => pad.top + plotH - (value / max) * plotH;
  return <div className="chartFrame"><svg viewBox={`0 0 ${width} ${height}`} className="chartSvg" role="img" aria-label="Profil par classe d'âge">
    {[0, .5, 1].map((ratio) => <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={y(max * ratio)} y2={y(max * ratio)} className="gridLine" /><text x={pad.left - 8} y={y(max * ratio) + 4} textAnchor="end" className="axisLabel">{formatInt(max * ratio)}</text></g>)}
    {data.map((d, i) => { const x = pad.left + i * (barW + barGap); return <g key={`${d.label}-${i}`}><rect x={x} y={y(d.value)} width={barW} height={pad.top + plotH - y(d.value)} className="barPrimary" rx={2}><title>{`${d.label}: ${formatInt(d.value)}`}</title></rect><text x={x + barW / 2} y={height - 17} textAnchor="middle" className="axisLabel axisLabelSmall" transform={`rotate(-28 ${x + barW / 2} ${height - 17})`}>{d.label}</text></g>; })}
  </svg></div>;
}

export function StackedNationality({ data }: { data: Array<{ label: string; french: number; foreign: number; foreignShare: number }> }) {
  const width = 760, rowH = 42;
  const height = Math.max(220, data.length * rowH + 48), labelW = 265, plotW = width - labelW - 46;
  return <div className="chartFrame"><svg viewBox={`0 0 ${width} ${height}`} className="chartSvg" role="img" aria-label="Composition par nationalité française et étrangère">
    {data.map((d, i) => { const y = 16 + i * rowH, foreignW = (plotW * d.foreignShare) / 100, frenchW = plotW - foreignW; return <g key={d.label}><text x={labelW - 12} y={y + 19} textAnchor="end" className="chartLabel">{d.label.length > 34 ? `${d.label.slice(0, 34)}…` : d.label}</text><rect x={labelW} y={y + 5} width={frenchW} height={20} className="barMuted"><title>{`${d.label} — Française: ${formatPct(100 - d.foreignShare)}`}</title></rect><rect x={labelW + frenchW} y={y + 5} width={foreignW} height={20} className="barSecondary"><title>{`${d.label} — Étrangère: ${formatPct(d.foreignShare)} (${formatInt(d.foreign)} personnes)`}</title></rect><text x={width - 4} y={y + 19} textAnchor="end" className="chartValue">{formatPct(d.foreignShare)}</text></g>; })}
    <g transform={`translate(${labelW},${height - 12})`}><rect width="10" height="10" y="-8" className="barMuted" /><text x="15" y="0" className="legendText">Française</text><rect x="92" width="10" height="10" y="-8" className="barSecondary" /><text x="107" y="0" className="legendText">Étrangère</text></g>
  </svg></div>;
}

export function ScatterChart({ data }: { data: Array<{ year: number; x: number; y: number }> }) {
  const width = 760, height = 310, plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const xs = data.map((d) => d.x), ys = data.map((d) => d.y);
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
  const x = (v: number) => pad.left + ((v - minX) / Math.max(.001, maxX - minX)) * plotW;
  const y = (v: number) => pad.top + plotH - ((v - minY) / Math.max(.001, maxY - minY)) * plotH;
  const latest = data.reduce((acc, cur) => cur.year > acc.year ? cur : acc, data[0] ?? { year: 0, x: 0, y: 0 });
  return <div className="chartFrame"><svg viewBox={`0 0 ${width} ${height}`} className="chartSvg" role="img" aria-label="Nuage de points des parts étrangères annuelles">
    {[0, .5, 1].map((ratio) => { const xv = minX + (maxX - minX) * ratio, yv = minY + (maxY - minY) * ratio; return <g key={ratio}><line x1={x(xv)} x2={x(xv)} y1={pad.top} y2={pad.top + plotH} className="gridLine" /><line x1={pad.left} x2={pad.left + plotW} y1={y(yv)} y2={y(yv)} className="gridLine" /><text x={x(xv)} y={height - 12} textAnchor="middle" className="axisLabel">{formatDecimal(xv, 1)}%</text><text x={pad.left - 8} y={y(yv) + 4} textAnchor="end" className="axisLabel">{formatDecimal(yv, 1)}%</text></g>; })}
    {data.map((d) => <g key={d.year}><circle cx={x(d.x)} cy={y(d.y)} r={d.year === latest.year ? 7 : 5} className={d.year === latest.year ? "dotHighlight" : "dotPrimary"}><title>{`${d.year} — victimes: ${formatPct(d.x)} ; mis en cause: ${formatPct(d.y)}`}</title></circle>{d.year === latest.year ? <text x={x(d.x) + 9} y={y(d.y) - 7} className="chartValueSmall">{d.year}</text> : null}</g>)}
    <text x={pad.left + plotW / 2} y={height - 1} textAnchor="middle" className="axisTitle">Part étrangère parmi les victimes</text><text x="12" y={pad.top + plotH / 2} textAnchor="middle" className="axisTitle" transform={`rotate(-90 12 ${pad.top + plotH / 2})`}>Part étrangère parmi les mis en cause</text>
  </svg></div>;
}
