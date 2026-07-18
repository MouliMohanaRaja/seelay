import type { Candidate, NormalizedCapture } from "../types";

// T1 — page metadata. Network, deterministic, no AI. YouTube goes through
// oEmbed (no key needed); everything else through og:title / <title>.

export async function extractT1(
  capture: NormalizedCapture
): Promise<Candidate | null> {
  if (!capture.url) return null;
  let u: URL;
  try {
    u = new URL(capture.url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");

  try {
    if (host === "youtube.com" && u.searchParams.get("v")) {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(capture.url)}&format=json`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) return null;
      const j = (await res.json()) as { title?: string };
      const title = cleanVideoTitle(String(j.title ?? ""));
      return title ? { tier: "T1", confidence: 0.7, title } : null;
    }

    const res = await fetch(capture.url, {
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; seelay-dev)",
        accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const og =
      html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
      ) ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i
      );
    const raw = og?.[1] ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    if (!raw) return null;
    const title = cleanPageTitle(decodeEntities(raw));
    return title ? { tier: "T1", confidence: 0.65, title } : null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanVideoTitle(raw: string): string {
  let t = raw;
  // "RRR Official Trailer (Hindi) …" → text before the trailer marker
  const m = t.match(/^(.*?)\s*[|([]?\s*official\s+(trailer|teaser)/i);
  if (m && m[1].trim()) {
    t = m[1];
  } else {
    const cut = t.search(/\b(trailer|teaser)\b/i);
    if (cut > 0) t = t.slice(0, cut);
  }
  t = t.split("|")[0];
  t = t.replace(/[([][^)\]]*[)\]]/g, " ");
  return t
    .replace(/[-–—:|]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPageTitle(raw: string): string {
  let t = raw.split("|")[0];
  t = t.replace(
    /\s*[-–—]\s*(IMDb|Letterboxd|Netflix|Prime Video|Wikipedia|The Movie Database|TMDB|YouTube)\s*$/i,
    ""
  );
  t = t.replace(/^\s*watch\s+/i, "");
  return t.replace(/\s+/g, " ").trim();
}
