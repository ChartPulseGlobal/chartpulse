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

export default function Home() {
  return <NationalWorkbench dataset={loadDataset()} />;
}
