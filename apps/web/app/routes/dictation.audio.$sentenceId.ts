import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDictationSentenceById } from "@bcailab/db";

/**
 * Public per-sentence MP3 stream.
 *
 * Deliberately different from `/speech/audio/:id` and `/esl/audio/:id`, which serve
 * private user recordings behind `requireUser`. Dictation material is global app
 * content, id-addressed and never rewritten (a regenerated passage gets a new id),
 * so it is served with no auth check and an immutable long cache. The DB lookup
 * joins the passage, so unpublished or soft-deleted material stops being served.
 *
 * Range support is not implemented in v1 — clips are a few seconds long (design §6).
 */
export const loader = async ({ context, params }: LoaderFunctionArgs) => {
  const sentenceId = params.sentenceId;
  if (!sentenceId) {
    throw new Response("Not found", { status: 404 });
  }

  const sentence = await getDictationSentenceById(context.env.DB, sentenceId);
  if (!sentence) {
    throw new Response("Not found", { status: 404 });
  }

  const object = await context.env.R2.get(sentence.r2_key);
  if (!object) {
    throw new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "audio/mpeg");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Disposition", "inline");

  return new Response(object.body, { status: 200, headers });
};
