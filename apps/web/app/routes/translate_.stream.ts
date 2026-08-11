import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { streamTranslateText } from "~/utils/translate.server";
import { prepareTranslateRequest } from "~/utils/translate-request.server";
import { recordTranslateUsage } from "~/utils/translate-quota.server";
import {
  tryCreateTranslationSaveProof,
  translateSaveProofSubject
} from "~/utils/translate-save-proof.server";
import type { TranslateLanguageCode } from "~/utils/translate-languages";

/**
 * Streaming translation endpoint (SSE), used by the `/translate` page whenever JavaScript
 * is available. The page's own `action` stays as the no-JS fallback.
 *
 * Wire format — one JSON object per `data:` line:
 *   {"type":"detected","language":"zh"|null}   at most once, before any delta
 *   {"type":"delta","text":"…"}                translation text, in arrival order
 *   {"type":"done","remainingToday":n,"proof":"…"|null} success terminator
 *   {"type":"error","error":"…","code":"…"}    terminal failure, may arrive at any point
 *
 * Every response is HTTP 200, including validation and quota rejections. Errors travel
 * in-band for the same reason the non-streaming action avoids 502s (Cloudflare can replace
 * error bodies with an HTML gateway page), and because a stream's status line is committed
 * before the model has produced anything.
 */
export const action = async ({ request, context }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const prepared = await prepareTranslateRequest(request, context, formData);

  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    // Streamed responses must not be buffered by an intermediary, or first-token latency
    // — the entire point of streaming — is lost.
    "X-Accel-Buffering": "no"
  });
  if (prepared.setCookie) headers.set("Set-Cookie", prepared.setCookie);

  const encoder = new TextEncoder();
  const frame = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

  if (!prepared.ok) {
    const body = frame({ type: "error", error: prepared.error, code: prepared.code });
    return new Response(body, { status: 200, headers });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let chars = 0;
      let translatedText = "";
      let detectedSourceLanguage: TranslateLanguageCode | null = null;
      try {
        for await (const chunk of streamTranslateText({
          env: context.env,
          task: prepared.task,
          text: prepared.text,
          sourceLang: prepared.sourceLang,
          targetLang: prepared.targetLang,
          signal: request.signal
        })) {
          if (chunk.type === "detected") detectedSourceLanguage = chunk.language;
          if (chunk.type === "delta") {
            chars += chunk.text.length;
            translatedText += chunk.text;
          }
          controller.enqueue(frame(chunk));
        }
        // A completed translation consumes quota even when its expanded output is too
        // large for the intentionally smaller Saved translations storage contract.
        await recordTranslateUsage(context.env.DB, {
          ...prepared.identity,
          chars: prepared.text.length
        });
        const proof = await tryCreateTranslationSaveProof({
          secret: context.env.SESSION_SECRET,
          subject: translateSaveProofSubject({
            userId: prepared.identity.userId,
            anonId: prepared.identity.anonId
          }),
          snapshot: {
            sourceLanguage: prepared.sourceLang,
            detectedSourceLanguage,
            targetLanguage: prepared.targetLang,
            sourceText: prepared.text,
            translatedText
          }
        });
        controller.enqueue(
          frame({
            type: "done",
            remainingToday: Math.max(0, prepared.remainingToday - 1),
            proof
          })
        );
      } catch (error) {
        console.error("translate stream failed", {
          errorClass: error instanceof Error ? error.name : "unknown",
          chars
        });
        controller.enqueue(
          frame({ type: "error", error: "Translation failed. Please try again in a moment." })
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { status: 200, headers });
};
