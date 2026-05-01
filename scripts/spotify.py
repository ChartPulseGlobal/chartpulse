import requests
from bs4 import BeautifulSoup
import json
import os
import re

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

os.makedirs("data", exist_ok=True)

headers = {
    "User-Agent": "Mozilla/5.0"
}

def to_int(text):
    text = re.sub(r"[^0-9]", "", text)
    return int(text) if text else 0

def scrape_country(save_code, url_code):
    url = f"https://kworb.net/spotify/country/{url_code}_daily.html"
    print(f"Fetching {save_code} -> {url}")

    html = requests.get(url, headers=headers, timeout=30).text
    soup = BeautifulSoup(html, "html.parser")

    data = []

    for tr in soup.select("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.select("td")]

        if len(cells) < 4:
            continue

        try:
            position = int(cells[0])
        except:
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

        data.append({
            "position": position,
            "artist": artist,
            "track": track,
            "streams": streams
        })

        if len(data) >= 200:
            break

    with open(f"data/spotify-{save_code}.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    if save_code == "global":
        with open("data/spotify.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"{save_code} OK ({len(data)})")

for save_code, url_code in COUNTRIES.items():
    try:
        scrape_country(save_code, url_code)
    except Exception as e:
        print(f"Error {save_code}: {e}")

print("DONE")