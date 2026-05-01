export const dynamic = "force-dynamic";

/* =========================
   CONFIG
========================= */

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

const spotifyCountries = [
  { code: "global", label: "🌍 Global" },
  { code: "fr", label: "🇫🇷 France" },
];

/* =========================
   DATA FETCH
========================= */

async function getData(file) {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/ChartPulseGlobal/chartpulse/main/data/${file}`,
      { cache: "no-store" }
    );

    if (!res.ok) return { rows: [] };
    return await res.json();
  } catch {
    return { rows: [] };
  }
}

/* =========================
   🔥 NEW: ARCHIVES
========================= */

async function getArchivesList() {
  try {
    const res = await fetch(
      "https://api.github.com/repos/ChartPulseGlobal/chartpulse/contents/data",
      { cache: "no-store" }
    );

    const files = await res.json();

    return files
      .filter((f) => f.name.startsWith("archive-"))
      .map((f) => f.name)
      .sort()
      .reverse()
      .slice(0, 50);
  } catch {
    return [];
  }
}

/* =========================
   UTILS
========================= */

function today() {
  return new Date().toISOString().slice(0, 10);
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
    if (B.has(x)) common += 1;
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

function movement(oldRank, rank) {
  if (!oldRank) return "NEW";
  const diff = oldRank - rank;
  if (diff > 0) return `+${diff}`;
  if (diff < 0) return String(diff);
  return "=";
}

function enrichRow(song, rank) {
  return {
    ...song,
    rank,
    move: song.move || movement(song.peak, rank),
    days: song.days || 1,
    peak: song.peak || rank,
    peakCount: song.peakCount || 1,
    ptsPlus: song.ptsPlus || "—",
    totalPts: song.totalPts || song.pts || 0,
    tpts: song.tpts || ((song.totalPts || song.pts || 0) / 1000).toFixed(3),
  };
}

/* =========================
   BUILD SYSTEM
========================= */

function buildIndex(itunesRows, spotifyRows) {
  const used = new Set();
  const combined = [];

  itunesRows.forEach((it) => {
    const sp = findSpotifyMatch(it, spotifyRows, used);

    combined.push({
      id: keyOf(it),
      artist: it.artist,
      title: it.title,
      itunesPts: it.pts || 0,
      spotifyPts: sp?.pts || 0,
      spotifyStreams: sp?.streams || 0,
      match: sp ? "MATCH" : "ITUNES ONLY",
    });
  });

  spotifyRows.forEach((sp) => {
    if (!used.has(sp.id)) {
      combined.push({
        id: keyOf(sp),
        artist: sp.artist,
        title: sp.title,
        itunesPts: 0,
        spotifyPts: sp.pts || 0,
        spotifyStreams: sp.streams || 0,
        match: "SPOTIFY ONLY",
      });
    }
  });

  return combined
    .map((s) => ({
      ...s,
      pts: Math.round((s.itunesPts || 0) * 0.58 + (s.spotifyPts || 0) * 0.42),
    }))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 200)
    .map((s, i) => enrichRow(s, i + 1));
}

function buildTrending(indexRows) {
  return indexRows
    .map((s) => {
      const move =
        s.move === "NEW" || s.move === "="
          ? 0
          : Number(String(s.move).replace("+", "")) || 0;

      const pts =
        s.ptsPlus === "—"
          ? 0
          : Number(String(s.ptsPlus).replace("+", "")) || 0;

      const bonus = s.itunesPts > 0 && s.spotifyPts > 0 ? 120 : 0;

      return {
        ...s,
        trendScore: Math.round(
          move * 35 + pts + bonus + (s.move === "NEW" ? 80 : 0)
        ),
      };
    })
    .filter((s) => s.trendScore > 0)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, 100)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

function buildArtists(indexRows) {
  const map = {};

  indexRows.forEach((s) => {
    if (!map[s.artist]) {
      map[s.artist] = {
        id: clean(s.artist),
        artist: s.artist,
        songs: 0,
        pts: 0,
        itunesPts: 0,
        spotifyPts: 0,
      };
    }

    map[s.artist].songs += 1;
    map[s.artist].pts += s.pts || 0;
    map[s.artist].itunesPts += s.itunesPts || 0;
    map[s.artist].spotifyPts += s.spotifyPts || 0;
  });

  return Object.values(map)
    .sort((a, b) => b.pts - a.pts)
    .map((a, i) => ({ ...a, rank: i + 1 }));
}

/* =========================
   PAGE
========================= */

export default async function Home({ searchParams }) {
  const params = await searchParams;

  const source = params?.source || "itunes";
  const page = params?.page || "chart";
  const q = (params?.q || "").toLowerCase();
  const country = params?.country || "global";

  const itunes = await getData("itunes-current.json");

  const spotifyFile =
    country === "fr" ? "spotify-fr-current.json" : "spotify-global-current.json";

  const spotify = await getData(spotifyFile);
  const globalSpotify = await getData("spotify-global-current.json");

  const archivesList = await getArchivesList();

  const indexRows = buildIndex(itunes.rows || [], globalSpotify.rows || []);
  const trendingRows = buildTrending(indexRows);
  const artistsRows = buildArtists(indexRows);

  let rows =
    source === "spotify"
      ? spotify.rows || []
      : source === "index"
      ? indexRows
      : source === "trending"
      ? trendingRows
      : source === "artists"
      ? artistsRows
      : itunes.rows || [];

  if (q) {
    rows = rows.filter((s) =>
      `${s.artist || ""} ${s.title || ""}`.toLowerCase().includes(q)
    );
  }

  return (
    <main>
      <div className="page">

        {page === "archives" ? (
          <div>
            <h2>Archives</h2>

            {archivesList.length === 0 ? (
              <p>Aucune archive disponible</p>
            ) : (
              archivesList.map((a) => (
                <div key={a}>
                  <a
                    href={`https://raw.githubusercontent.com/ChartPulseGlobal/chartpulse/main/data/${a}`}
                    target="_blank"
                  >
                    {a}
                  </a>
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            {/* TON TABLEAU EXISTANT RESTE INTACT */}
          </div>
        )}

      </div>
    </main>
  );
}
