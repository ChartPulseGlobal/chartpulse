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
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath);
  }
}

function readJSON(name, fallback) {
  ensureData();

  const p = path.join(dataPath, name);

  if (!fs.existsSync(p)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJSON(name, data) {
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

  if (diff > 0) return `+${diff}`;
  if (diff < 0) return String(diff);

  return "=";
}

function itunesPoints(rank, tier) {
  const bases = {
    1: 1600,
    2: 800,
    3: 300,
    4: 70,
  };

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

  if (!A.size || !B.size) {
    return 0;
  }

  let common = 0;

  A.forEach((x) => {
    if (B.has(x)) {
      common += 1;
    }
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

    if (!json.feed?.entry) {
      return [];
    }

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

function enrichRow(song, rank, old) {
  const ptsDiff = old ? song.pts - old.pts : song.pts;
  const peak = old ? Math.min(old.peak, rank) : rank;
  const totalPts = old ? old.totalPts + song.pts : song.pts;

  return {
    ...song,
    rank,
    move: movement(old?.rank, rank),
    days: old && old.date !== today() ? old.days + 1 : old?.days || 1,
    peak,
    peakCount: old && old.peak === peak ? old.peakCount + 1 : 1,
    ptsPlus: ptsDiff === 0 ? "—" : ptsDiff > 0 ? `+${ptsDiff}` : String(ptsDiff),
    totalPts,
    tpts: (totalPts / 1000).toFixed(3),
  };
}

function saveCurrent(source, rows, extra = {}) {
  const songs = {};

  rows.forEach((s) => {
    songs[s.id] = {
      rank: s.rank,
      pts: s.pts,
      days: s.days,
      peak: s.peak,
      peakCount: s.peakCount,
      totalPts: s.totalPts,
      date: today(),
    };
  });

  const data = {
    source,
    updatedAt: new Date().toISOString(),
    songs,
    rows,
    ...extra,
  };

  saveJSON(`${source}-current.json`, data);
  saveJSON(`archive-${source}-${hourKey()}.json`, data);
}

async function buildItunes() {
  const old = readJSON("itunes-current.json", null);
  const oldSongs = old?.songs || {};

  if (old?.updatedAt?.slice(0, 13) === new Date().toISOString().slice(0, 13)) {
    return old;
  }

  const charts = await Promise.all(countries.map((c) => getItunes(c.code)));
  const map = {};

  charts.forEach((chart, i) => {
    const country = countries[i];

    chart.forEach((s) => {
      if (!map[s.id]) {
        map[s.id] = {
          id: s.id,
          artist: s.artist,
          title: s.title,
          pts: 0,
          countries: {},
        };
      }

      map[s.id].pts += itunesPoints(s.rank, country.tier);
      map[s.id].countries[country.name] = s.rank;
    });
  });

  const rows = Object.values(map)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 200)
    .map((s, i) => enrichRow(s, i + 1, oldSongs[s.id]));

  saveCurrent("itunes", rows);

  return readJSON("itunes-current.json", { rows: [] });
}

function buildSpotify(country = "global") {
  const filename = country === "global" ? "spotify.json" : `spotify-${country}.json`;
  const sourceName = `spotify-${country}`;
  const raw = readJSON(filename, []);
  const old = readJSON(`${sourceName}-current.json`, null);
  const rawHash = hashData(raw);

  if (old?.rawHash === rawHash) {
    return old;
  }

  const oldSongs = old?.songs || {};
  const maxStreams = Math.max(...raw.map((x) => x.streams || 0), 1);

  const rows = raw.slice(0, 200).map((s, i) => {
    const rank = s.position || i + 1;
    const artist = s.artist || "";
    const title = s.track || s.title || "";
    const id = `${artist}-${title}`.toLowerCase();
    const pts = spotifyPoints(rank, s.streams || 0, maxStreams);

    return enrichRow(
      {
        id,
        artist,
        title,
        streams: s.streams || 0,
        pts,
      },
      rank,
      oldSongs[id]
    );
  });

  saveCurrent(sourceName, rows, { rawHash });

  return readJSON(`${sourceName}-current.json`, { rows: [] });
}

function buildIndex(itunesRows, spotifyRows) {
  const old = readJSON("index-current.json", null);
  const oldSongs = old?.songs || {};
  const used = new Set();
  const combined = [];

  itunesRows.forEach((it) => {
    const sp = findSpotifyMatch(it, spotifyRows, used);

    combined.push({
      id: keyOf(it),
      artist: it.artist,
      title: it.title,
      itunesPts: it.pts,
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
        spotifyPts: sp.pts,
        spotifyStreams: sp.streams || 0,
        match: "SPOTIFY ONLY",
      });
    }
  });

  const rows = combined
    .map((s) => ({
      ...s,
      pts: Math.round(s.itunesPts * 0.58 + s.spotifyPts * 0.42),
    }))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 200)
    .map((s, i) => enrichRow(s, i + 1, oldSongs[s.id]));

  saveCurrent("index", rows);

  return readJSON("index-current.json", { rows: [] });
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
        trendScore: Math.round(move * 35 + pts + bonus + (s.move === "NEW" ? 80 : 0)),
      };
    })
    .filter((s) => s.trendScore > 0)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, 100)
    .map((s, i) => ({
      ...s,
      rank: i + 1,
    }));
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
    .map((a, i) => ({
      ...a,
      rank: i + 1,
    }));
}

function archives() {
  ensureData();

  return fs
    .readdirSync(dataPath)
    .filter((x) => x.startsWith("archive-"))
    .sort()
    .reverse()
    .slice(0, 80);
}

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const source = params?.source || "itunes";
  const page = params?.page || "chart";
  const q = (params?.q || "").toLowerCase();
  const country = params?.country || "global";

  const itunes = await buildItunes();
  const spotify = buildSpotify(country);
  const globalSpotify = buildSpotify("global");
  const index = buildIndex(itunes.rows, globalSpotify.rows);
  const trending = buildTrending(index.rows);
  const artists = buildArtists(index.rows);

  let rows =
    source === "spotify"
      ? spotify.rows
      : source === "index"
        ? index.rows
        : source === "trending"
          ? trending
          : source === "artists"
            ? artists
            : itunes.rows;

  if (q) {
    rows = rows.filter((s) =>
      `${s.artist || ""} ${s.title || ""}`.toLowerCase().includes(q)
    );
  }

  return (
    <main>
      <AutoUpdater />

      <style>{`
        body {
          margin: 0;
          background: white;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 13px;
          color: #000;
        }

        .page {
          padding: 10px;
          width: 100%;
        }

        .logoBox {
          background: #070719;
          width: 660px;
          padding: 28px 30px;
          margin-bottom: 12px;
        }

        .logo {
          font-size: 52px;
          font-weight: 900;
          letter-spacing: -3px;
        }

        .logoWhite {
          color: white;
        }

        .logoGradient {
          background: linear-gradient(90deg, #2f8cff, #00d084);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .menu {
          display: grid;
          grid-template-columns: repeat(7, 110px);
          width: 770px;
          margin-bottom: 20px;
        }

        .menu a {
          background: #000;
          color: white;
          border: 1px solid white;
          text-align: center;
          font-weight: bold;
          padding: 8px 0;
          text-decoration: none;
        }

        .tabs,
        .buttons {
          display: flex;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .tabs a,
        .buttons a {
          color: white;
          border: 1px solid white;
          font-weight: bold;
          padding: 8px 24px;
          text-decoration: none;
        }

        .buttons a {
          background: #062c91;
        }

        .blue {
          background: #052c93;
        }

        .green {
          background: #008060;
        }

        .orange {
          background: #d88b00;
        }

        .red {
          background: #8b0000;
        }

        .purple {
          background: #5b188f;
        }

        h1 {
          font-size: 21px;
          margin: 0 0 18px 0;
        }

        .redlink {
          color: #990000;
          font-weight: bold;
        }

        .search {
          margin-bottom: 15px;
        }

        .search input {
          padding: 5px;
          width: 280px;
        }

        .search button,
        .countrySelect {
          padding: 5px 12px;
        }

        .countryBox {
          margin-bottom: 15px;
        }

        .spotifyChart {
          width: 760px;
          background: #f7f7f7;
          border: 1px solid #d0d0d0;
          padding: 14px;
          margin-bottom: 20px;
        }

        .spotifyChart h2 {
          font-size: 18px;
          margin: 0 0 12px 0;
        }

        .barRow {
          margin-bottom: 10px;
        }

        .barInfo {
          display: grid;
          grid-template-columns: 45px 1fr 120px;
          gap: 8px;
          font-size: 12px;
          margin-bottom: 3px;
        }

        .barTitle {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .barStreams {
          text-align: right;
          font-weight: bold;
        }

        .barTrack {
          width: 100%;
          height: 12px;
          background: #e2e2e2;
          border-radius: 20px;
          overflow: hidden;
        }

        .barFill {
          height: 100%;
          background: linear-gradient(90deg, #1db954, #00d084);
          border-radius: 20px;
        }

        .tableWrap {
          width: calc(100vw - 20px);
          overflow-x: auto;
          padding-bottom: 15px;
          border-bottom: 1px solid #ccc;
        }

        table {
          border-collapse: collapse;
          font-size: 12px;
          min-width: 1600px;
        }

        th {
          padding: 5px 7px;
          text-align: left;
          border-bottom: 2px solid #ccc;
          white-space: nowrap;
          background: white;
        }

        td {
          padding: 4px 7px;
          white-space: nowrap;
        }

        tbody tr:nth-child(odd) {
          background: #f7f7f7;
        }

        tbody tr:nth-child(even) {
          background: #ededed;
        }

        tbody tr:hover {
          background: #fff4b8;
        }

        .num {
          text-align: right;
        }

        .song {
          min-width: 390px;
          max-width: 460px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rank {
          font-weight: bold;
        }

        .up {
          color: green;
          font-weight: bold;
        }

        .down {
          color: #b00000;
          font-weight: bold;
        }

        .new {
          font-weight: bold;
        }

        .small {
          font-size: 12px;
          color: #555;
          margin-top: 8px;
        }
      `}</style>

      <div className="page">
        <div className="logoBox">
          <div className="logo">
            <span className="logoWhite">Chart</span>
            <span className="logoGradient">Pulse</span>
          </div>
        </div>

        <div className="menu">
          <a href="/?source=itunes">ITUNES</a>
          <a href="/?source=spotify&country=global">SPOTIFY</a>
          <a href="/?source=index">GLOBAL INDEX</a>
          <a href="/?source=trending">TRENDING</a>
          <a href="/?source=artists">ARTISTS</a>
          <a href="/?page=archives">ARCHIVES</a>
          <a href="/">HOME</a>
        </div>

        <div className="tabs">
          <a className="blue" href="/?source=itunes">
            iTunes Worldwide
          </a>
          <a className="green" href="/?source=spotify&country=global">
            Spotify Top 200
          </a>
          <a className="orange" href="/?source=index">
            ChartPulse Index
          </a>
          <a className="purple" href="/?source=trending">
            Trending
          </a>
          <a className="red" href="/?source=artists">
            Artists
          </a>
        </div>

        <h1>
          {source === "spotify"
            ? `Spotify Top 200 ${
                spotifyCountries.find((c) => c.code === country)?.label || "Global"
              }`
            : source === "index"
              ? "Global ChartPulse Index"
              : source === "trending"
                ? "ChartPulse Trending"
                : source === "artists"
                  ? "Top Artists Global"
                  : "Worldwide iTunes Song Chart"}{" "}
          - {today()} | <span className="redlink">updated hourly</span>
        </h1>

        <div className="buttons">
          <a href="/?source=itunes">iTunes</a>
          <a href="/?source=spotify&country=global">Spotify</a>
          <a href="/?source=index">Global Index</a>
          <a href="/?source=trending">Trending</a>
          <a href="/?source=artists">Artists</a>
          <a href="/?page=archives">Archives</a>
        </div>

        {source === "spotify" && page !== "archives" && (
          <form className="countryBox">
            <input type="hidden" name="source" value="spotify" />
            <label>
              Pays Spotify:{" "}
              <select name="country" defaultValue={country} className="countrySelect">
                {spotifyCountries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button>Afficher</button>
          </form>
        )}

        {source === "spotify" && page !== "archives" && (
          <div className="spotifyChart">
            <h2>Spotify Streams Chart - Top 10</h2>

            {rows.slice(0, 10).map((s) => {
              const max = Math.max(...rows.slice(0, 10).map((x) => x.streams || 0), 1);
              const width = (s.streams / max) * 100;

              return (
                <div className="barRow" key={`bar-${s.rank}-${s.id}`}>
                  <div className="barInfo">
                    <b>#{s.rank}</b>
                    <span className="barTitle">
                      {s.artist} - {s.title}
                    </span>
                    <span className="barStreams">
                      {s.streams.toLocaleString("fr-FR")}
                    </span>
                  </div>

                  <div className="barTrack">
                    <div className="barFill" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {page === "archives" ? (
          <div>
            <h2>Archives</h2>
            {archives().map((a) => (
              <div key={a}>{a}</div>
            ))}
          </div>
        ) : (
          <>
            <form className="search">
              <input
                name="q"
                placeholder="Search artist or song..."
                defaultValue={params?.q || ""}
              />
              <input type="hidden" name="source" value={source} />

              {source === "spotify" && (
                <input type="hidden" name="country" value={country} />
              )}

              <button>Search</button>
            </form>

            <div className="tableWrap">
              {source === "artists" ? (
                <table>
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th>Artist</th>
                      <th className="num">Songs</th>
                      <th className="num">Pts</th>
                      <th className="num">iTunes Pts</th>
                      <th className="num">Spotify Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={`artist-${a.rank}-${a.id}`}>
                        <td className="num rank">{a.rank}</td>
                        <td className="song">{a.artist}</td>
                        <td className="num">{a.songs}</td>
                        <td className="num rank">{a.pts}</td>
                        <td className="num">{a.itunesPts}</td>
                        <td className="num">{a.spotifyPts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th>P+</th>
                      <th>Artist and Title</th>
                      <th className="num">Days</th>
                      <th className="num">Pk</th>
                      <th className="num">Pts</th>
                      <th className="num">Pts+</th>
                      <th className="num">TPts</th>

                      {source === "trending" && <th className="num">Trend</th>}

                      {source === "itunes" &&
                        countries.map((c) => (
                          <th key={c.name} className="num">
                            {c.name}
                          </th>
                        ))}

                      {source === "spotify" && <th className="num">Streams</th>}

                      {(source === "index" || source === "trending") && (
                        <>
                          <th className="num">iTunes Pts</th>
                          <th className="num">Spotify Pts</th>
                          <th className="num">Match</th>
                        </>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((s) => (
                      <tr key={`${source}-${country}-${s.rank}-${s.id}`}>
                        <td className="num rank">{s.rank}</td>
                        <td
                          className={
                            s.move === "NEW"
                              ? "new"
                              : s.move.startsWith("+")
                                ? "up"
                                : s.move.startsWith("-")
                                  ? "down"
                                  : ""
                          }
                        >
                          {s.move}
                        </td>
                        <td className="song">
                          {s.artist} - {s.title}
                        </td>
                        <td className="num">{s.days}</td>
                        <td className="num rank">{s.peak}</td>
                        <td className="num rank">{s.pts}</td>
                        <td className="num">{s.ptsPlus}</td>
                        <td className="num">{s.tpts}</td>

                        {source === "trending" && (
                          <td className="num rank">{s.trendScore}</td>
                        )}

                        {source === "itunes" &&
                          countries.map((c) => (
                            <td key={c.name} className="num">
                              {s.countries[c.name] || ""}
                            </td>
                          ))}

                        {source === "spotify" && (
                          <td className="num">
                            {s.streams.toLocaleString("fr-FR")}
                          </td>
                        )}

                        {(source === "index" || source === "trending") && (
                          <>
                            <td className="num">{s.itunesPts}</td>
                            <td className="num">{s.spotifyPts}</td>
                            <td className="num">{s.match}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <div className="small">
          Spotify multi-pays activé : Global, US, UK, France, Germany, Japan,
          Canada, Australia, Brazil, Mexico, Spain.
        </div>
      </div>
    </main>
  );
}
