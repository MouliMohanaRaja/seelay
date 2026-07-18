import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolutionResult } from "@/lib/resolve/types";

// Shared: write a pipeline result onto an item row. Used by the capture
// route (async resolution) and the hint route (re-resolution).
export async function applyResolutionToItem(
  db: SupabaseClient,
  itemId: string,
  result: ResolutionResult,
  fallbackWho: string | null
): Promise<string | null> {
  const { error } = await db
    .from("items")
    .update({
      state: result.state,
      tmdb_id: result.match?.tmdbId ?? null,
      title: result.match?.title ?? null,
      year: result.match?.year ?? null,
      media_type: result.match?.mediaType ?? null,
      poster_ref: result.match?.posterRef ?? null,
      confidence: result.score,
      who: result.whoHint ?? fallbackWho,
      resolved_at: new Date().toISOString(),
      metadata: { tier: result.tierUsed, llm_used: result.llmUsed },
    })
    .eq("id", itemId);
  return error ? error.message : null;
}
