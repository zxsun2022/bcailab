import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getPassageForUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { buildReferenceFallbackR2Key } from "~/utils/esl-passage-reference.server";

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const passage = await getPassageForUser(context.env.DB, { id, userId: user.id });
  if (!passage) {
    throw new Response("Not found", { status: 404 });
  }

  // The legacy fallback key is owner-scoped, so it only makes sense for the caller's
  // own passages. Library reference audio always has an explicit stored key.
  const r2Key =
    passage.reference_audio_status === "completed" && passage.reference_audio_r2_key
      ? passage.reference_audio_r2_key
      : passage.user_id === user.id
        ? buildReferenceFallbackR2Key(user.id, passage.id)
        : null;
  if (!r2Key) {
    throw new Response("Not found", { status: 404 });
  }
  const object = await context.env.R2.get(r2Key);
  if (!object) {
    throw new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "audio/mpeg");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");

  return new Response(object.body, {
    status: 200,
    headers
  });
};
