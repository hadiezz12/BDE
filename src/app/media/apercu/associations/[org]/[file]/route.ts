import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /media/apercu/associations/<organization>/<image>.webp — an image as
 * the SIGNED-IN person may read it: the association's page team sees its
 * drafts (editor, library, preview). Never cached anywhere, never optimized
 * (the shared optimizer cache would hand it to the next requester): see
 * src/lib/media-url.ts. Anyone else gets a 404.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const notFound = () => new Response("Image introuvable.", { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ org: string; file: string }> }) {
  const { org, file } = await params;
  const media = file.endsWith(".webp") ? file.slice(0, -5) : "";
  if (!UUID.test(org) || !UUID.test(media)) return notFound();

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return notFound();
  }
  const { data, error } = await supabase.storage.from("association-media").download(`${org}/${media}.webp`);
  if (error || !data) return notFound();

  return new Response(data, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
