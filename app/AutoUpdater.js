"use client";

import { useEffect } from "react";

export default function AutoUpdater() {
  useEffect(() => {
    // ❌ désactive en production (Vercel)
    if (window.location.hostname !== "localhost") return;

    async function updateSpotify() {
      try {
        await fetch("/api/update-spotify");
        console.log("Update Spotify OK");
      } catch (e) {
        console.log("Update error");
      }
    }

    // update au chargement
    updateSpotify();

    // update toutes les 1h
    const interval = setInterval(updateSpotify, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return null;
}