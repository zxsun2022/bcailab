import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getTtsGenerationById } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const generation = await getTtsGenerationById(context.env.DB, id);
  if (!generation || generation.user_id !== user.id) {
    throw new Response("Not found", { status: 404 });
  }

  const object = await context.env.R2.get(generation.r2_key);
  if (!object) {
    throw new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "audio/mpeg");
  headers.set("Cache-Control", "private, no-store");
  headers.set(
    "Content-Disposition",
    download ? `attachment; filename="speech-${generation.id}.mp3"` : "inline"
  );

  return new Response(object.body, {
    status: 200,
    headers
  });
};
