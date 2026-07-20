import { supabaseAdmin } from "@/lib/supabase-server";
import { downloadCaptureImage } from "@/lib/storage";

// Serves a stored screenshot (PLAN.md 2.1). The bucket is private; this
// same-origin proxy streams the bytes via the service role so no public
// storage URL is ever exposed. Captures are immutable, so the response is
// safely cacheable forever.
//
// Note: single-tenant, no auth yet (consistent with the rest of the app
// until Stage 5) — any capture id resolves its image.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: capture, error } = await db
    .from("captures")
    .select("payload_type, payload_image_ref")
    .eq("id", id)
    .single();

  if (
    error ||
    !capture ||
    capture.payload_type !== "image" ||
    !capture.payload_image_ref
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const { bytes, contentType } = await downloadCaptureImage(
      db,
      capture.payload_image_ref
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
