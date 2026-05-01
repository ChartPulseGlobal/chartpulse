import requests
from bs4 import BeautifulSoup
import json
import os
import re
from datetime import datetime

COUNTRIES = {
    "global": "global",
    "us": "us",
    "gb": "uk",
    "de": "de",
    "fr": "fr",
    "jp": "jp",
    "ca": "ca",
    "au": "au",
    "br": "br",
    "mx": "mx",
    "es": "es",
}

DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

headers = {
    "User-Agent": "Mozilla/5.0"
}


def to_int(text):
    text = re.sub(r"[^0-9]", "", text)
    return int(text) if text else 0


def load_json(path, fallback):
    if not os.path.exists(path):
        return fallback

    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return fallback


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def spotify_points(rank, streams, max_streams):
    stream_score = (streams / max_streams) * 1000 if max_streams else 0
    rank_score = max(1, 201 - rank) * 2
    return round(stream_score + rank_score)


def movement(old_rank, new_rank):
    if not old_rank:
        return "NEW"

    diff = old_rank - new_rank

    if diff > 0:
        return f"+{diff}"
    if diff < 0:
        return str(diff)

    return "="


def song_id(song):
    artist = song.get("artist", "")
    track = song.get("track", song.get("title", ""))
    return f"{artist}-{track}".lower().strip()


def enrich_rows(source, rows):
    current_path = f"{DATA_DIR}/{source}-current.json"
    old_data = load_json(current_path, {})
    old_songs = old_data.get("songs", {})

    today = datetime.utcnow().strftime("%Y-%m-%d")
    hour = datetime.utcnow().strftime("%Y-%m-%d-%H")

    max_streams = max([r.get("streams", 0) for r in rows], default=1)

    enriched = []
    songs = {}

    for i, row in enumerate(rows):
        rank = row.get("position") or i + 1
        sid = song_id(row)

        old = old_songs.get(sid)

        pts = spotify_points(rank, row.get("streams", 0), max_streams)

        old_rank = old.get("rank") if old else None
        old_pts = old.get("pts") if old else 0
        old_days = old.get("days") if old else 0
        old_peak = old.get("peak") if old else rank
        old_total_pts = old.get("totalPts") if old else 0
        old_peak_count = old.get("peakCount") if old else 0

        peak = min(old_peak, rank)
        total_pts = old_total_pts + pts

        enriched_song = {
            "id": sid,
            "rank": rank,
            "artist": row.get("artist", ""),
            "title": row.get("track", row.get("title", "")),
            "track": row.get("track", row.get("title", "")),
            "streams": row.get("streams", 0),
            "pts": pts,
            "move": movement(old_rank, rank),
            "days": old_days + 1,
            "peak": peak,
            "peakCount": old_peak_count + 1 if peak == rank else old_peak_count,
            "ptsPlus": "—" if not old else pts - old_pts,
            "totalPts": total_pts,
            "tpts": round(total_pts / 1000, 3),
            "date": today,
        }

        enriched.append(enriched_song)

        songs[sid] = {
            "rank": rank,
            "pts": pts,
            "days": enriched_song["days"],
            "peak": enriched_song["peak"],
            "peakCount": enriched_song["peakCount"],
            "totalPts": total_pts,
            "date": today,
        }

    data = {
        "source": source,
        "updatedAt": datetime.utcnow().isoformat(),
        "songs": songs,
        "rows": enriched,
    }

    save_json(current_path, data)
    save_json(f"{DATA_DIR}/archive-{source}-{hour}.json", data)

    return data


def scrape_country(save_code, url_code):
    url = f"https://kworb.net/spotify/country/{url_code}_daily.html"
    print(f"Fetching {save_code} -> {url}")

    html = requests.get(url, headers=headers, timeout=30).text
    soup = BeautifulSoup(html, "html.parser")

    rows = []

    for tr in soup.select("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.select("td")]

        if len(cells) < 4:
            continue

        try:
            position = int(cells[0])
        except Exception:
            continue

        artist_title = ""

        for c in cells:
            if " - " in c:
                artist_title = c
                break

        if not artist_title:
            continue

        numbers = [to_int(c) for c in cells]
        streams = max(numbers)

        if " - " in artist_title:
            artist, track = artist_title.split(" - ", 1)
        else:
            artist = ""
            track = artist_title

        rows.append({
            "position": position,
            "artist": artist,
            "track": track,
            "streams": streams,
        })

        if len(rows) >= 200:
            break

    save_json(f"{DATA_DIR}/spotify-{save_code}.json", rows)

    if save_code == "global":
        save_json(f"{DATA_DIR}/spotify.json", rows)

    enrich_rows(f"spotify-{save_code}", rows)

    print(f"{save_code} OK ({len(rows)})")


for save_code, url_code in COUNTRIES.items():
    try:
        scrape_country(save_code, url_code)
    except Exception as e:
        print(f"Error {save_code}: {e}")

print("DONE")
