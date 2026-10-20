import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * GET /media/associations/<organization>/<image>.webp — an association image,
 * read AS A VISITOR (anon, no cookies): the Storage policy answers whether a
 * public page uses it in its published version. A draft, an unpublished or
 * withheld page, a suspended association, a replaced image: 404, for
 * everyone, at once. Short public cache (5 min) so unpublishing takes effect
 * quickly; the image optimizer cache is bounded the same way (next.config).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const notFound = () => new Response("Image introuvable.", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ org: string; file: string }> }) {
  const { org, file } = await params;
  const media = file.endsWith(".webp") ? file.slice(0, -5) : "";
  if (!UUID.test(org) || !UUID.test(media)) return notFound();

  let supabase;
  try {
    supabase = createSupabasePublicClient();
  } catch {
    return notFound();
  }
  const { data, error } = await supabase.storage.from("association-media").download(`${org}/${media}.webp`);
  if (error || !data) return notFound();

  return new Response(data, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
