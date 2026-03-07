import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getEslReadingAttemptById } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const attempt = await getEslReadingAttemptById(context.env.DB, id);
  if (!attempt || attempt.user_id !== user.id) {
    throw new Response("Not found", { status: 404 });
  }

  const object = await context.env.R2.get(attempt.r2_key);
  if (!object) {
    throw new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? attempt.audio_mime_type);
  headers.set("Cache-Control", "private, no-store");
  headers.set(
    "Content-Disposition",
    download ? `attachment; filename="reading-${attempt.id}.${attempt.audio_format}"` : "inline"
  );

  return new Response(object.body, {
    status: 200,
    headers
  });
};
