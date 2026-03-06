import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getEslPassageById } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { buildReferenceFallbackR2Key } from "~/utils/esl-passage-reference.server";

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const passage = await getEslPassageById(context.env.DB, id);
  if (!passage || passage.user_id !== user.id) {
    throw new Response("Not found", { status: 404 });
  }

  const r2Key =
    passage.reference_tts_status === "completed" && passage.reference_tts_r2_key
      ? passage.reference_tts_r2_key
      : buildReferenceFallbackR2Key(user.id, passage.id);
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
