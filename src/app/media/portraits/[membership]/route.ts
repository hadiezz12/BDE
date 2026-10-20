import { createSupabasePublicClient } from "@/lib/supabase/public";
import { preparePortrait } from "@/lib/associations/images";

/**
 * GET /media/portraits/<membership> — a member's photo on a public team page,
 * only if they chose to show it, appear on that page's published team and the
 * page is public (public.public_portrait_path + the avatars Storage policy,
 * both answered as a visitor). Re-encoded on the way out: square, WebP, no
 * metadata, whatever the original was. Anything else: 404.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const notFound = () => new Response("Photo introuvable.", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ membership: string }> }) {
  const { membership } = await params;
  if (!UUID.test(membership)) return notFound();

  let supabase;
  try {
    supabase = createSupabasePublicClient();
  } catch {
    return notFound();
  }
  const { data: path, error } = await supabase.rpc("public_portrait_path", { p_membership_id: membership });
  if (error || typeof path !== "string" || !path) return notFound();
  const { data: file } = await supabase.storage.from("avatars").download(path);
  if (!file) return notFound();
  const image = await preparePortrait(new Uint8Array(await file.arrayBuffer()));
  if (!image) return notFound();

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
