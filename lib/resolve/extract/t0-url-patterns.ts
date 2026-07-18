import type { Candidate, NormalizedCapture } from "../types";

// T0 — deterministic URL patterns. No network, no AI, near-certain output.

export function extractT0(capture: NormalizedCapture): Candidate | null {
  if (!capture.url) return null;
  let u: URL;
  try {
    u = new URL(capture.url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");
  const path = u.pathname;

  if (host === "imdb.com") {
    const m = path.match(/\/title\/(tt\d+)/);
    if (m) return { tier: "T0", confidence: 0.98, imdbId: m[1] };
  }

  if (host === "themoviedb.org") {
    const m = path.match(/\/(movie|tv)\/(\d+)(?:-([a-z0-9-]+))?/);
    if (m) {
      return {
        tier: "T0",
        confidence: 0.99,
        tmdbId: Number(m[2]),
        mediaType: m[1] === "tv" ? "tv" : "movie",
        title: m[3]?.replace(/-/g, " "),
      };
    }
  }

  if (host === "letterboxd.com") {
    const m = path.match(/\/film\/([a-z0-9-]+)/);
    if (m) {
      return {
        tier: "T0",
        confidence: 0.85,
        title: m[1].replace(/-/g, " "),
        mediaType: "movie",
      };
    }
  }

  return null;
}
