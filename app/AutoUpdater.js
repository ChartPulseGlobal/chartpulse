"use client";

import { useEffect } from "react";

export default function AutoUpdater() {
  useEffect(() => {
    async function updateSpotify() {
      try {
        await fetch("/api/update-spotify");
      } catch (error) {
        console.error("Spotify update failed", error);
      }
    }

    updateSpotify();

    const interval = setInterval(updateSpotify, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return null;
}