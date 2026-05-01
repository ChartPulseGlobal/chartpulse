import fs from "fs";
import path from "path";
import crypto from "crypto";
import AutoUpdater from "./AutoUpdater";

export const dynamic = "force-dynamic";

const spotifyCountries = [
  { code: "global", label: "🌍 Global" },
  { code: "us", label: "🇺🇸 US" },
  { code: "gb", label: "🇬🇧 UK" },
  { code: "fr", label: "🇫🇷 France" },
  { code: "de", label: "🇩🇪 Germany" },
  { code: "jp", label: "🇯🇵 Japan" },
  { code: "ca", label: "🇨🇦 Canada" },
  { code: "au", label: "🇦🇺 Australia" },
  { code: "br", label: "🇧🇷 Brazil" },
  { code: "mx", label: "🇲🇽 Mexico" },
  { code: "es", label: "🇪🇸 Spain" },
];

const countries = [
  { code: "us", name: "US", tier: 1 },
  { code: "gb", name: "UK", tier: 1 },
  { code: "de", name: "DE", tier: 1 },
  { code: "au", name: "AU", tier: 1 },
  { code: "jp", name: "JP", tier: 1 },
  { code: "ca", name: "CA", tier: 2 },
  { code: "fr", name: "FR", tier: 2 },
  { code: "it", name: "IT", tier: 2 },
  { code: "es", name: "ES", tier: 2 },
  { code: "mx", name: "MX", tier: 2 },
  { code: "nl", name: "NL", tier: 2 },
  { code: "br", name: "BR", tier: 3 },
  { code: "dk", name: "DK", tier: 3 },
  { code: "ie", name: "IE", tier: 3 },
  { code: "no", name: "NO", tier: 3 },
  { code: "nz", name: "NZ", tier: 3 },
  { code: "se", name: "SE", tier: 3 },
];

const dataPath = path.join(process.cwd(), "data");

function ensureData() {
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath);
}

function readJSON(name, fallback) {
  ensureData();
  const p = path.join(dataPath, name);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

// ✅ MODIFIÉ ICI
function saveJSON(name, data) {
  if (process.env.VERCEL) return;

  ensureData();
  fs.writeFileSync(path.join(dataPath, name), JSON.stringify(data, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hourKey() {
  return new Date().toISOString().slice(0, 13).replaceAll(":", "-");
}

function hashData(data) {
  return crypto.createHash("md5").update(JSON.stringify(data)).digest("hex");
}

function movement(oldRank, rank) {
  if (!oldRank) return "NEW";
  const diff = oldRank - rank;
  if (diff > 0) return "+" + diff;
  if (diff < 0) return String(diff);
  return "=";
}

function itunesPoints(rank, tier) {
  const bases = { 1: 1600, 2: 800, 3: 300, 4: 70 };
  return Math.round((bases[tier] || 70) * Math.pow(0.98374, rank - 1));
}

function spotifyPoints(rank, streams, maxStreams) {
  const streamScore = maxStreams ? (streams / maxStreams) * 1000 : 0;
  const rankScore = Math.max(1, 201 - rank) * 2;
  return Math.round(streamScore + rankScore);
}

function clean(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/feat\.?|ft\.?|featuring|remix|radio edit|explicit/gi, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keyOf(song) {
  return `${clean(song.artist)} ${clean(song.title)}`;
}

function similarity(a, b) {
  const A = new Set(clean(a).split(" ").filter(Boolean));
  const B = new Set(clean(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let common = 0;
  A.forEach((x) => {
    if (B.has(x)) common++;
  });
  return common / Math.max(A.size, B.size);
}

function findSpotifyMatch(song, spotifyRows, used) {
  let best = null;
  let score = 0;

  for (const sp of spotifyRows) {
    if (used.has(sp.id)) continue;

    const s =
      similarity(song.artist, sp.artist) * 0.45 +
      similarity(song.title, sp.title) * 0.55;

    if (s > score) {
      score = s;
      best = sp;
    }
  }

  if (best && score >= 0.58) {
    used.add(best.id);
    return best;
  }

  return null;
}

async function getItunes(country) {
  try {
    const res = await fetch(
      `https://itunes.apple.com/${country}/rss/topsongs/limit=100/json`,
      { cache: "no-store" }
    );

    const json = await res.json();
    if (!json.feed?.entry) return [];

    return json.feed.entry.map((s, i) => ({
      id: s.id.attributes["im:id"],
      rank: i + 1,
      artist: s["im:artist"].label,
      title: s["im:name"].label,
    }));
  } catch {
    return [];
  }
}

// ... (le reste du code est strictement inchangé)