import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getEslPassageById } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const passage = await getEslPassageById(context.env.DB, id);
  if (
    !passage ||
    passage.user_id !== user.id ||
    passage.reference_tts_status !== "completed" ||
    !passage.reference_tts_r2_key
  ) {
    throw new Response("Not found", { status: 404 });
  }

  const object = await context.env.R2.get(passage.reference_tts_r2_key);
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
