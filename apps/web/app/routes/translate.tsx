import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useActionData, useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import { getOptionalUser } from "~/utils/auth.server";
import { translateText } from "~/utils/translate.server";
import { prepareTranslateRequest } from "~/utils/translate-request.server";
import {
  ensureAnonId,
  getClientIp,
  getTranslateQuotaStatus,
  recordTranslateUsage
} from "~/utils/translate-quota.server";
import {
  TRANSLATE_LANGUAGES,
  isTranslateLanguageCode,
  translateLanguageLabel as languageLabel,
  type TranslateLanguageCode
} from "~/utils/translate-languages";
import { openLoginPopup } from "~/utils/login-popup";
import { StudioShell } from "~/components/StudioShell";
import {
  StudioPage,
  StudioPageBody,
  StudioPageHeader,
  StudioPageTabs
} from "~/components/StudioPage";
import { TranslateWorkspaceTabs } from "~/components/TranslateWorkspaceTabs";
import {
  tryCreateTranslationSaveProof,
  translateSaveProofSubject,
  type TranslationSaveSnapshot
} from "~/utils/translate-save-proof.server";

export const handle = {
  breadcrumb: { label: "translate", href: "/translate" },
  hideHeader: true,
  hideHeaderUserMenu: true
};

export const meta: MetaFunction = () => [
  { title: "Translate · bcailab" },
  { name: "description", content: "LLM-powered translation between English, Chinese, and more. Free to try — no account needed." }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  const { anonId, setCookie } = ensureAnonId(request);
  const quota = await getTranslateQuotaStatus(context.env.DB, {
    userId: user?.id ?? null,
    anonId,
    ip: getClientIp(request)
  });
  return json(
    {
      authed: Boolean(user),
      quota,
      user: user
        ? { name: user.name, email: user.email, avatar_url: user.avatar_url }
        : null
    },
    setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined
  );
};

type ActionData =
  | {
      ok: true;
      translation: string;
      detectedSourceLanguage: TranslateLanguageCode | null;
      remainingToday: number;
      proof: string | null;
      snapshot: TranslationSaveSnapshot;
    }
  | { ok: false; error: string; code?: "quota_exceeded" | "too_long" };

/**
 * No-JS fallback. The page streams via `/translate/stream` whenever JavaScript is
 * available; this action serves the plain document POST, so validation and quota live in
 * the shared `prepareTranslateRequest` rather than being duplicated across the two.
 */
export const action = async ({ request, context }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const prepared = await prepareTranslateRequest(request, context, formData);
  const extraHeaders = prepared.setCookie ? { "Set-Cookie": prepared.setCookie } : undefined;

  if (!prepared.ok) {
    return json<ActionData>(
      { ok: false, error: prepared.error, code: prepared.code },
      { status: prepared.status, headers: extraHeaders }
    );
  }

  try {
    const result = await translateText({
      env: context.env,
      task: prepared.task,
      text: prepared.text,
      sourceLang: prepared.sourceLang,
      targetLang: prepared.targetLang
    });
    const snapshot: TranslationSaveSnapshot = {
      sourceLanguage: prepared.sourceLang,
      detectedSourceLanguage: result.detectedSourceLanguage,
      targetLanguage: prepared.targetLang,
      sourceText: prepared.text,
      translatedText: result.translation
    };
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
      snapshot
    });
    return json<ActionData>(
      {
        ok: true,
        translation: result.translation,
        detectedSourceLanguage: result.detectedSourceLanguage,
        remainingToday: Math.max(0, prepared.remainingToday - 1),
        proof,
        snapshot
      },
      extraHeaders ? { headers: extraHeaders } : undefined
    );
  } catch (error) {
    console.error("translate action failed", {
      errorClass: error instanceof Error ? error.name : "unknown"
    });
    // Keep handled provider failures in the normal data path. In production,
    // Cloudflare can replace a 502 response body with its HTML error page,
    // which Remix cannot deserialize and promotes to the route error boundary.
    return json<ActionData>(
      { ok: false, error: "Translation failed. Please try again in a moment." },
      extraHeaders ? { headers: extraHeaders } : undefined
    );
  }
};

/** Wire events emitted by `/translate/stream`; see that route for the format. */
type StreamEvent =
  | { type: "detected"; language: TranslateLanguageCode | null }
  | { type: "delta"; text: string }
  | { type: "done"; remainingToday: number; proof: string | null }
  | { type: "error"; error: string; code?: "quota_exceeded" | "too_long" };

const parseStreamEvent = (block: string): StreamEvent | null => {
  const payload = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!payload) return null;
  try {
    return JSON.parse(payload) as StreamEvent;
  } catch {
    return null;
  }
};

/** Client-side view of one streaming translation. */
type StreamState = {
  status: "idle" | "streaming" | "done" | "error";
  translation: string;
  detected: TranslateLanguageCode | null;
  error: string | null;
  quotaExceeded: boolean;
  remainingToday: number | null;
  proof: string | null;
  snapshot: TranslationSaveSnapshot | null;
};

const IDLE_STREAM: StreamState = {
  status: "idle",
  translation: "",
  detected: null,
  error: null,
  quotaExceeded: false,
  remainingToday: null,
  proof: null,
  snapshot: null
};

export default function TranslatePage() {
  const { authed, quota, user } = useLoaderData<typeof loader>();
  // Only reachable without JavaScript, where the form posts to this route's action.
  const fallbackData = useActionData<typeof action>() as ActionData | undefined;
  const revalidator = useRevalidator();
  const [text, setText] = React.useState(fallbackData?.ok ? fallbackData.snapshot.sourceText : "");
  const [source, setSource] = React.useState<string>(
    fallbackData?.ok ? fallbackData.snapshot.sourceLanguage : "auto"
  );
  const [target, setTarget] = React.useState<TranslateLanguageCode>(
    fallbackData?.ok ? fallbackData.snapshot.targetLanguage : "en"
  );
  const [copied, setCopied] = React.useState(false);
  const [stream, setStream] = React.useState<StreamState>(IDLE_STREAM);
  const [saveOutcome, setSaveOutcome] = React.useState<{
    proof: string;
    savedId?: string;
    error?: string;
  } | null>(null);
  const saveFetcher = useFetcher<{ savedId?: string; error?: string }>();
  const pendingSaveProofRef = React.useRef<string | null>(null);
  const saveTransportRef = React.useRef<HTMLInputElement | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const outputPaneRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const busy = stream.status === "streaming";
  const started = stream.status !== "idle";
  const translation = started ? stream.translation : fallbackData?.ok ? fallbackData.translation : "";
  const detected = started
    ? stream.detected
    : fallbackData?.ok
      ? fallbackData.detectedSourceLanguage
      : null;
  const errorMessage = started
    ? stream.error
    : fallbackData && !fallbackData.ok
      ? fallbackData.error
      : null;
  const quotaExceeded = started
    ? stream.quotaExceeded
    : Boolean(fallbackData && !fallbackData.ok && fallbackData.code === "quota_exceeded");
  const remainingToday =
    stream.remainingToday ??
    (fallbackData?.ok ? fallbackData.remainingToday : quota.remainingToday);
  const completionProof = started ? stream.proof : fallbackData?.ok ? fallbackData.proof : null;
  const completedSnapshot = started ? stream.snapshot : fallbackData?.ok ? fallbackData.snapshot : null;
  const sourceChanged = Boolean(
    completedSnapshot && (
      completedSnapshot.sourceText !== text ||
      completedSnapshot.sourceLanguage !== source ||
      completedSnapshot.targetLanguage !== target
    )
  );

  React.useEffect(() => {
    const proof = pendingSaveProofRef.current;
    if (!proof || !saveFetcher.data) return;
    if (saveFetcher.data.savedId) {
      setSaveOutcome({ proof, savedId: saveFetcher.data.savedId });
    } else if (saveFetcher.data.error) {
      setSaveOutcome({ proof, error: saveFetcher.data.error });
    }
    pendingSaveProofRef.current = null;
  }, [saveFetcher.data]);

  React.useEffect(() => {
    if (stream.status !== "done" || !stream.translation || !outputPaneRef.current) return;
    const bounds = outputPaneRef.current.getBoundingClientRect();
    if (bounds.top < window.innerHeight && bounds.bottom > 0) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    outputPaneRef.current.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start"
    });
  }, [stream.status, stream.translation]);

  // Refresh quota display after login completes in the popup.
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "bcailab-auth" && event.data?.ok) {
        revalidator.revalidate();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [revalidator]);

  const submit = React.useCallback(async () => {
    const form = formRef.current;
    if (!form || !text.trim() || busy) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStream({
      ...IDLE_STREAM,
      status: "streaming",
      snapshot: {
        sourceLanguage: source === "auto" ? "auto" : (source as TranslateLanguageCode),
        detectedSourceLanguage: null,
        targetLanguage: target,
        sourceText: text,
        translatedText: ""
      }
    });

    const apply = (event: StreamEvent) => {
      setStream((prev) => {
        switch (event.type) {
          case "detected":
            return {
              ...prev,
              detected: event.language,
              snapshot: prev.snapshot
                ? { ...prev.snapshot, detectedSourceLanguage: event.language }
                : null
            };
          case "delta":
            return {
              ...prev,
              translation: prev.translation + event.text,
              snapshot: prev.snapshot
                ? {
                    ...prev.snapshot,
                    translatedText: prev.snapshot.translatedText + event.text
                  }
                : null
            };
          case "done":
            return {
              ...prev,
              status: "done",
              remainingToday: event.remainingToday,
              proof: event.proof
            };
          case "error":
            return {
              ...prev,
              status: "error",
              error: event.error,
              quotaExceeded: event.code === "quota_exceeded"
            };
        }
      });
    };

    try {
      const response = await fetch("/translate/stream", {
        method: "POST",
        body: new FormData(form),
        signal: controller.signal
      });
      if (!response.ok || !response.body) throw new Error(`Stream failed (${response.status})`);

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const event = parseStreamEvent(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          if (event) apply(event);
          boundary = buffer.indexOf("\n\n");
        }
      }
      // A stream that ends without `done` or `error` was cut off mid-flight.
      setStream((prev) =>
        prev.status === "streaming"
          ? { ...prev, status: "error", error: "Translation was interrupted. Please try again." }
          : prev
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("translate stream failed", {
        errorClass: error instanceof Error ? error.name : "unknown"
      });
      setStream((prev) => ({
        ...prev,
        status: "error",
        error: "Translation failed. Please try again in a moment."
      }));
    }
  }, [text, source, target, busy]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  const handleSwap = () => {
    const effectiveSource = source === "auto" ? detected : (source as TranslateLanguageCode);
    if (!effectiveSource || effectiveSource === target) return;
    setSource(target);
    setTarget(effectiveSource);
    if (translation) setText(translation);
  };

  const handleCopy = async () => {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by browser permissions.
    }
  };

  const overLimit = text.length > quota.maxChars;

  return (
    <StudioShell user={user} canvasClassName="translate-shell-canvas">
      <StudioPage width="wide">
        <StudioPageHeader
          title="Translate"
          description="Translate text with natural phrasing and preserved formatting."
        />
        <StudioPageTabs>
          <TranslateWorkspaceTabs active="translate" />
        </StudioPageTabs>
        <StudioPageBody className="translate-page">
      {!authed ? (
        <div className="translate-quota-banner">
          <span>
            Free to try: {remainingToday} of {quota.dailyRequests} translations left today ·
            up to {quota.maxChars.toLocaleString()} characters each.
          </span>
          <button type="button" className="translate-quota-cta" onClick={() => openLoginPopup()}>
            Sign in for more
          </button>
        </div>
      ) : null}

      <form
        method="post"
        action="/translate"
        ref={formRef}
        className="translate-board"
        onSubmit={(event) => {
          // JS path streams from /translate/stream; the native POST above is the fallback.
          event.preventDefault();
          void submit();
        }}
      >
        <div className="translate-toolbar">
          <label className="translate-lang-group">
            <span className="translate-lang-caption">From</span>
            <select
              className="studio-select"
              name="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-label="Source language"
            >
              <option value="auto">
                {source === "auto" && detected
                  ? `Detected: ${languageLabel(detected)}`
                  : "Detect language"}
              </option>
              {TRANSLATE_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="translate-swap"
            onClick={handleSwap}
            disabled={(source === "auto" && !detected) || busy}
            aria-label="Swap languages"
            title="Swap languages"
          >
            &#8646;
          </button>

          <label className="translate-lang-group">
            <span className="translate-lang-caption">To</span>
            <select
              className="studio-select"
              name="target"
              value={target}
              onChange={(e) => {
                const value = e.target.value;
                if (isTranslateLanguageCode(value)) setTarget(value);
              }}
              aria-label="Target language"
            >
              {TRANSLATE_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="translate-panes">
          <div className="translate-pane">
            <textarea
              className="translate-input"
              name="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type or paste text here…"
              aria-label="Text to translate"
              rows={12}
            />
            <div className="translate-pane-foot">
              <span className={`translate-count${overLimit ? " is-over" : ""}`}>
                {text.length.toLocaleString()} / {quota.maxChars.toLocaleString()}
              </span>
              {text ? (
                <button
                  type="button"
                  className="translate-pane-action"
                  onClick={() => {
                    setText("");
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div
            ref={outputPaneRef}
            className={`translate-pane is-output${busy ? " is-busy" : ""}`}
          >
            <div
              className="translate-output"
              aria-label="Translation result"
              aria-busy={busy}
            >
              {translation ? (
                <>
                  {translation}
                  {busy ? <span className="translate-caret" aria-hidden="true" /> : null}
                </>
              ) : busy ? (
                <span className="translate-pending">Translating…</span>
              ) : (
                <span className="translate-placeholder">Translation appears here.</span>
              )}
            </div>
            <div className="translate-pane-foot">
              {detected && source === "auto" ? (
                <span className="translate-detected">Detected {languageLabel(detected)}</span>
              ) : (
                <span />
              )}
              <div className="translate-pane-actions">
                {translation && !busy ? (
                  <button type="button" className="translate-pane-action" onClick={handleCopy}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                ) : null}
                {translation && !busy && completionProof && completedSnapshot ? (
                  authed ? (
                    <button
                      type="submit"
                      form="translate-save-form"
                      className="translate-pane-action"
                      disabled={
                        saveFetcher.state !== "idle" ||
                        (saveOutcome?.proof === completionProof && Boolean(saveOutcome.savedId))
                      }
                      onClick={() => {
                        pendingSaveProofRef.current = completionProof;
                        if (saveTransportRef.current) saveTransportRef.current.value = "fetcher";
                      }}
                    >
                      {saveFetcher.state !== "idle"
                        ? "Saving…"
                        : saveOutcome?.proof === completionProof && saveOutcome.savedId
                          ? "Saved"
                          : "Save"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="translate-pane-action"
                      onClick={() => openLoginPopup()}
                    >
                      Sign in to save
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="translate-actions">
          <span className="sr-only" role="status" aria-live="polite">
            {busy
              ? "Translation started."
              : stream.status === "done"
                ? "Translation complete."
                : stream.status === "error"
                  ? "Translation failed."
                  : ""}
          </span>
          {saveOutcome?.proof === completionProof && saveOutcome.error ? (
            <span className="translate-error" role="alert">{saveOutcome.error}</span>
          ) : sourceChanged ? (
            <span className="translate-hint">Last translation — source changed. Save keeps the displayed result.</span>
          ) : saveOutcome?.proof === completionProof && saveOutcome.savedId ? (
            <Link className="translate-saved-link" to={`/translate/saved/${saveOutcome.savedId}`}>
              View saved translation
            </Link>
          ) : errorMessage ? (
            <span className="translate-error">
              {errorMessage}
              {quotaExceeded && !authed ? (
                <button
                  type="button"
                  className="translate-quota-cta"
                  onClick={() => openLoginPopup()}
                >
                  Sign in
                </button>
              ) : null}
            </span>
          ) : (
            <span className="translate-hint"><kbd>⌘/Ctrl</kbd> + <kbd>Enter</kbd></span>
          )}
          <button
            type="submit"
            className="translate-submit"
            disabled={!text.trim() || overLimit || busy}
          >
            {busy ? "Translating…" : "Translate"}
          </button>
        </div>
      </form>
      {authed && completionProof && completedSnapshot ? (
        <saveFetcher.Form id="translate-save-form" method="post" action="/translate/saved" hidden>
          <input ref={saveTransportRef} type="hidden" name="_transport" defaultValue="document" />
          <input type="hidden" name="proof" value={completionProof} />
          <input type="hidden" name="sourceLanguage" value={completedSnapshot.sourceLanguage} />
          <input type="hidden" name="detectedSourceLanguage" value={completedSnapshot.detectedSourceLanguage ?? ""} />
          <input type="hidden" name="targetLanguage" value={completedSnapshot.targetLanguage} />
          <input type="hidden" name="sourceText" value={completedSnapshot.sourceText} />
          <input type="hidden" name="translatedText" value={completedSnapshot.translatedText} />
        </saveFetcher.Form>
      ) : null}
        </StudioPageBody>
      </StudioPage>
    </StudioShell>
  );
}
