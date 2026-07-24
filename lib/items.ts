import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemState, ResolutionResult } from "@/lib/resolve/types";

// Shared: mark an item's in-progress state (resolving / retrying) so the
// receipt reflects backend truth rather than a client-side timeout guess.
// Best-effort — a failed status write must never break resolution itself.
export async function markItemState(
  db: SupabaseClient,
  itemId: string,
  state: Extract<ItemState, "resolving" | "retrying">
): Promise<void> {
  const { error } = await db.from("items").update({ state }).eq("id", itemId);
  if (error) {
    console.error(`state -> ${state} failed for item ${itemId}: ${error.message}`);
  }
}

// A resolution run that threw (retries exhausted, or any other pipeline
// error) is backend truth too: the item goes to needs_hint with a flag
// distinguishing "we couldn't reach the identification service" from an
// ordinary low-confidence extraction, instead of staying stuck.
export async function markResolutionFailed(
  db: SupabaseClient,
  itemId: string,
  error: unknown
): Promise<void> {
  const { error: updateError } = await db
    .from("items")
    .update({
      state: "needs_hint",
      metadata: {
        resolution_failed: true,
        error: error instanceof Error ? error.message : String(error),
      },
    })
    .eq("id", itemId);
  if (updateError) {
    console.error(
      `failure-state update failed for item ${itemId}: ${updateError.message}`
    );
  }
}

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
      metadata: {
        tier: result.tierUsed,
        llm_used: result.llmUsed,
        // Recorded when the vision fallback was rejected with a transient
        // rate limit (HTTP 429) — explains an otherwise-ordinary needs_hint.
        ...(result.t4RateLimited ? { t4_rate_limited: true } : {}),
      },
    })
    .eq("id", itemId);
  return error ? error.message : null;
}
