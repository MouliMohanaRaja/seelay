import type { Candidate, EntityMatch } from "./types";

// Stage 3 — Entity Resolver. One interface, exactly one implementation
// (TMDB). A registry/config/second implementation is rejected until a second
// vertical exists (ARCHITECTURE.md).

export interface EntityResolver {
  resolve(candidate: Candidate): Promise<EntityMatch[]>;
}

const TMDB = "https://api.themoviedb.org/3";

type TmdbEntity = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  popularity?: number;
  media_type?: string;
};

function auth(): { query: string; headers: Record<string, string> } {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("Missing TMDB_API_KEY — see .env.example");
  if (key.startsWith("eyJ")) {
    return { query: "", headers: { Authorization: `Bearer ${key}` } };
  }
  return { query: `api_key=${key}`, headers: {} };
}

async function tmdbGet(
  path: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const a = auth();
  const qs = new URLSearchParams(params).toString();
  const url = `${TMDB}${path}?${[qs, a.query].filter(Boolean).join("&")}`;
  // TMDB reachability can be flaky (transient ECONNRESET, notably from some
  // Indian ISPs) — retry with a short backoff before giving up. On final
  // failure the item stays raw: captured, visible, resolvable later (Law 1).
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * attempt));
    try {
      const res = await fetch(url, {
        headers: a.headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function toMatch(
  r: TmdbEntity,
  mediaType: "movie" | "tv",
  matchQuality: number
): EntityMatch {
  const date = r.release_date || r.first_air_date || "";
  return {
    tmdbId: r.id,
    mediaType,
    title: r.title || r.name || "",
    year: date ? Number(date.slice(0, 4)) : null,
    posterRef: r.poster_path ?? null,
    matchQuality,
  };
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return ((2 * inter) / (ta.size + tb.size)) * 0.7;
}

export class TmdbResolver implements EntityResolver {
  async resolve(c: Candidate): Promise<EntityMatch[]> {
    // Direct id lookup — certain.
    if (c.tmdbId && c.mediaType) {
      const d = (await tmdbGet(`/${c.mediaType}/${c.tmdbId}`)) as TmdbEntity;
      return [toMatch(d, c.mediaType, 1)];
    }

    // IMDb id → TMDB find — certain.
    if (c.imdbId) {
      const d = await tmdbGet(`/find/${c.imdbId}`, {
        external_source: "imdb_id",
      });
      const movie = (d.movie_results as TmdbEntity[] | undefined)?.[0];
      const tv = (d.tv_results as TmdbEntity[] | undefined)?.[0];
      const r = movie ?? tv;
      if (!r) return [];
      return [toMatch(r, movie ? "movie" : "tv", 1)];
    }

    // Title → fuzzy search.
    if (c.title) {
      const d = await tmdbGet("/search/multi", {
        query: c.title,
        include_adult: "false",
      });
      const results = ((d.results as TmdbEntity[] | undefined) ?? []).filter(
        (r) => r.media_type === "movie" || r.media_type === "tv"
      );
      const scored = results.map((r) => {
        let sim = titleSimilarity(c.title as string, r.title || r.name || "");
        // soft media-type hint: mismatch dampens, never excludes
        if (c.mediaType && r.media_type !== c.mediaType) sim *= 0.7;
        return { r, sim };
      });
      scored.sort(
        (x, y) => y.sim - x.sim || (y.r.popularity ?? 0) - (x.r.popularity ?? 0)
      );
      return scored
        .slice(0, 3)
        .map(({ r, sim }) =>
          toMatch(r, r.media_type === "tv" ? "tv" : "movie", sim)
        );
    }

    return [];
  }
}
