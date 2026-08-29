import fs from "node:fs";
import path from "node:path";
import NationalWorkbench from "@/components/national/NationalWorkbench";
import type { OfficialDataset } from "@/lib/national/official-data";

export const dynamic = "force-static";

function loadDataset(): OfficialDataset {
  const file = path.join(process.cwd(), "public", "data", "official-national-observations.json");
  const raw = fs.readFileSync(file, "utf-8");
  return JSON.parse(raw) as OfficialDataset;
}

function compactForInitialRender(dataset: OfficialDataset): OfficialDataset {
  return {
    ...dataset,
    insee: {
      ...dataset.insee,
      melodi: {
        ...dataset.insee.melodi,
        auditableSubset: dataset.insee.melodi.auditableSubset.slice(0, 25),
      },
    },
    ssmsi: {
      ...dataset.ssmsi,
      observations: dataset.ssmsi.observations.slice(0, 200),
      sexProfiles: [],
    },
  };
}

export default function Home() {
  const dataset = loadDataset();
  return <NationalWorkbench dataset={compactForInitialRender(dataset)} />;
}
