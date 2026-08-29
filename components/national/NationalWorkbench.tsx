"use client";

import { useEffect, useState } from "react";
import type { OfficialDataset } from "@/lib/national/official-data";
import { DISTINCTIONS } from "@/lib/national/sources";
import { AgeProfilePanel, AssociationsPanel, DataExplorer, EmploymentPanel, JusticePanel, NationalityPanel, ObservationOverview, QualityPanel, TrendPanel, VictimRankingPanel } from "./ObservableNationalViews";

const tabs = [
  ["observatoire", "Observatoire"], ["emploi", "Immigration & emploi"], ["violence", "Violence & infractions"], ["nationalite", "Nationalité"],
  ["associations", "Associations statistiques"], ["condamnations", "Condamnations"], ["donnees", "Données"], ["qualite", "Qualité & méthodologie"],
] as const;
type TabKey = (typeof tabs)[number][0];

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="headlineStat"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export default function NationalWorkbench() {
  const [dataset, setDataset] = useState<OfficialDataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/official-national-observations.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json() as OfficialDataset;
      })
      .then(setDataset)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Erreur de chargement inconnue");
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui" }}><div><strong>Impossible de charger les données officielles.</strong><p>{error}</p></div></main>;
  }
  if (!dataset) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui" }}><div><strong>Chargement des données officielles…</strong><p>INSEE · SSMSI · France entière</p></div></main>;
  }

  return <WorkbenchBody dataset={dataset} />;
}

function WorkbenchBody({ dataset }: { dataset: OfficialDataset }) {
  const [tab, setTab] = useState<TabKey>("observatoire");
  const immigrants = dataset.insee.observations.find((r) => r.group === "Immigrés");
  const years = dataset.ssmsi.years;
  const minYear = Math.min(...years), maxYear = Math.max(...years);
  return <div className="workbenchShell">
    <aside className="sidebar">
      <div className="brandBlock"><div className="brandMark">LI</div><div><div className="brandName">Laboratoire INSEE</div><div className="brandSub">Observatoire national</div></div></div>
      <div className="scopeBadge">France · séries annuelles</div>
      <nav className="sideNav" aria-label="Sections analytiques">{tabs.map(([key,label],i)=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}><span className="navIndex">{String(i+1).padStart(2,"0")}</span><span>{label}</span></button>)}</nav>
      <div className="sidebarAudit"><span>Données officielles</span><strong>{dataset.quality.observationCount.toLocaleString("fr-FR")}</strong><small>observations SSMSI normalisées</small><div className="auditDotLine"><i/>Extraction {dataset.meta.generatedAtUtc.slice(0,10)}</div></div>
    </aside>
    <main className="workspace">
      <header className="topHeader"><div><div className="topKicker">STATISTIQUE PUBLIQUE · APPLICATION REPRODUCTIBLE</div><h1>Immigration, emploi et sécurité enregistrée</h1><p>Enquêtes nationales et données administratives officielles. Les unités statistiques restent distinctes et aucune association agrégée n’est interprétée comme causalité.</p></div><div className="headerStatus"><span className="statusDot"/>Sources officielles chargées</div></header>
      <div className="mobileNav"><select value={tab} onChange={(e)=>setTab(e.target.value as TabKey)}>{tabs.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
      <section className="headlineGrid"><Stat label="Taux d’emploi · immigrés" value={immigrants?`${immigrants.employmentRate.toFixed(1).replace(".",",")} %`:"—"} detail="INSEE · 2025 · 15–64 ans"/><Stat label="Taux de chômage · immigrés" value={immigrants?`${immigrants.unemploymentRate.toFixed(1).replace(".",",")} %`:"—"} detail="BIT · 2025"/><Stat label="Période SSMSI" value={`${minYear}–${maxYear}`} detail={`${dataset.ssmsi.indicators.victimes.length} indicateurs victimes`}/><Stat label="Cellules secrétisées" value={dataset.quality.secretCount.toLocaleString("fr-FR")} detail="Conservées comme valeurs manquantes"/></section>
      <div className="distinctionRail">{DISTINCTIONS.map((x)=><span key={x}>{x}</span>)}</div>
      <div className="activeView">
        {tab==="observatoire"&&<ObservationOverview dataset={dataset}/>} {tab==="emploi"&&<EmploymentPanel dataset={dataset}/>} {tab==="violence"&&<div className="stackedPanels"><TrendPanel dataset={dataset}/><VictimRankingPanel dataset={dataset}/><AgeProfilePanel dataset={dataset}/></div>} {tab==="nationalite"&&<NationalityPanel dataset={dataset}/>} {tab==="associations"&&<AssociationsPanel dataset={dataset}/>} {tab==="condamnations"&&<JusticePanel dataset={dataset}/>} {tab==="donnees"&&<DataExplorer dataset={dataset}/>} {tab==="qualite"&&<QualityPanel dataset={dataset}/>} 
      </div>
      <footer className="workspaceFooter"><span>Laboratoire INSEE · reconstruction automatisée</span><span>Extraction UTC {dataset.meta.generatedAtUtc}</span><a href="/data/official-national-observations.json" download>Données JSON</a></footer>
    </main>
  </div>;
}
