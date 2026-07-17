import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client — server only, bypasses RLS. The "server-only" import
// makes any accidental client-side import a build error, keeping the service
// key out of every browser bundle.
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — copy .env.example to .env.local and fill it in"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
