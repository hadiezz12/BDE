import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { getAccessOrganization } from "@/lib/governance/access";
import { governanceErrorCode, governanceErrorMessage } from "@/lib/governance/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { prepareImage, UPLOAD_MAX_BYTES, type MediaKind } from "@/lib/associations/images";

/**
 * POST /manage/<asso>/media/upload — adds an image to the association's
 * library (multipart: file, kind, alt). A route handler rather than a Server
 * Action so the browser can show upload progress.
 *
 * Order matters, because Storage and the database are two systems with no
 * shared transaction:
 *   1. the server re-encodes the image (src/lib/associations/images.ts);
 *   2. it stores it under a fresh name, with the person's own session, so the
 *      Storage policy checks media.manage for that folder;
 *   3. it records it (public.register_association_media checks again, and
 *      audits). If that fails, the file is deleted; if even that fails, it is
 *      an orphan no one can see, listed for cleanup (docs: media lifecycle).
 * Nothing replaces an existing file: a new image never overwrites an old one.
 */

const KINDS: MediaKind[] = ["logo", "cover", "image"];

const json = (status: number, body: object) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * Route handlers do not get the Server Actions' origin check: refuse a
 * request sent from another site (the browser always sets Origin on a POST).
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ asso: string }> }) {
  const { asso } = await params;
  if (!sameOrigin(request)) return json(403, { error: "Envoi refusé : il doit partir du site lui-même." });
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return json(401, { error: governanceErrorMessage("not_authenticated") });

  const organization = await getAccessOrganization(asso);
  if (!organization || !organization.permissions.includes("media.manage")) {
    return json(403, { error: governanceErrorMessage("insufficient_permission") });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > UPLOAD_MAX_BYTES + 512 * 1024) {
    return json(413, { error: "Image trop lourde : 12 Mo au plus. Exporte-la plus petite, puis réessaie." });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: "L'envoi n'a pas abouti. Réessaie." });
  }
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "image") as MediaKind;
  const alt = String(form.get("alt") ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!(file instanceof File) || !KINDS.includes(kind)) return json(400, { error: "Choisis une image à envoyer." });

  const image = await prepareImage(new Uint8Array(await file.arrayBuffer()), kind);
  if (!image.ok) return json(422, { error: image.message });

  const supabase = await createSupabaseServerClient();
  const mediaId = randomUUID();
  const path = `${organization.id}/${mediaId}.webp`;
  const stored = await supabase.storage
    .from("association-media")
    .upload(path, image.buffer, { contentType: "image/webp", upsert: false, cacheControl: "300" });
  if (stored.error) {
    logDataError("association_media.upload", { code: "storage", message: "" });
    return json(403, { error: "L'image n'a pas pu être enregistrée : vérifie que ton poste te permet toujours de gérer les images." });
  }

  const { error } = await supabase.rpc("register_association_media", {
    p_organization_id: organization.id,
    p_media_id: mediaId,
    p_kind: kind,
    p_width: image.width,
    p_height: image.height,
    p_bytes: image.bytes,
    p_alt_text: alt || undefined,
  });
  if (error) {
    // Undo step 2 (the delete policy allows a file the library never recorded).
    await supabase.storage.from("association-media").remove([path]);
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("register_association_media", error);
    return json(code === "insufficient_permission" ? 403 : 422, { error: governanceErrorMessage(code) });
  }

  revalidatePath(`/manage/${asso}`, "layout");
  return json(201, {
    media: { id: mediaId, path, width: image.width, height: image.height, alt: alt || null, kind },
  });
}
