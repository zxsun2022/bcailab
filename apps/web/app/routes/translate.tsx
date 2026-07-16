import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import { getOptionalUser } from "~/utils/auth.server";
import { translateText } from "~/utils/translate.server";
import {
  TRANSLATE_TIERS,
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

export const handle = {
  breadcrumb: { label: "translate", href: "/translate" }
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
    { authed: Boolean(user), quota },
    setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined
  );
};

type ActionData =
  | {
      ok: true;
      translation: string;
      detectedSourceLanguage: TranslateLanguageCode | null;
      remainingToday: number;
    }
  | { ok: false; error: string; code?: "quota_exceeded" | "too_long" };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  const { anonId, setCookie } = ensureAnonId(request);
  const ip = getClientIp(request);
  const identity = { userId: user?.id ?? null, anonId, ip };
  const tierConfig = user ? TRANSLATE_TIERS.free : TRANSLATE_TIERS.anonymous;
  const extraHeaders = setCookie ? { "Set-Cookie": setCookie } : undefined;

  const formData = await request.formData();
  const text = String(formData.get("text") ?? "");
  const sourceRaw = String(formData.get("source") ?? "auto");
  const targetRaw = String(formData.get("target") ?? "en");

  if (!text.trim()) {
    return json<ActionData>(
      { ok: false, error: "Enter some text to translate." },
      { status: 400, headers: extraHeaders }
    );
  }
  if (text.length > tierConfig.maxChars) {
    return json<ActionData>(
      {
        ok: false,
        code: "too_long",
        error: user
          ? `Text is too long (max ${tierConfig.maxChars.toLocaleString()} characters).`
          : `Text is too long for anonymous use (max ${tierConfig.maxChars.toLocaleString()} characters). Sign in to translate up to ${TRANSLATE_TIERS.free.maxChars.toLocaleString()}.`
      },
      { status: 400, headers: extraHeaders }
    );
  }
  const sourceLang = sourceRaw === "auto" || !isTranslateLanguageCode(sourceRaw) ? "auto" : sourceRaw;
  if (!isTranslateLanguageCode(targetRaw)) {
    return json<ActionData>(
      { ok: false, error: "Unsupported target language." },
      { status: 400, headers: extraHeaders }
    );
  }
  if (sourceLang !== "auto" && sourceLang === targetRaw) {
    return json<ActionData>(
      { ok: false, error: "Source and target languages are the same." },
      { status: 400, headers: extraHeaders }
    );
  }

  const quota = await getTranslateQuotaStatus(context.env.DB, identity);
  if (quota.remainingToday <= 0) {
    return json<ActionData>(
      {
        ok: false,
        code: "quota_exceeded",
        error: user
          ? "Daily translation limit reached. Please come back tomorrow."
          : "You've used today's free translations. Sign in to continue — it's free."
      },
      { status: 429, headers: extraHeaders }
    );
  }

  try {
    const result = await translateText({
      env: context.env,
      task: tierConfig.task,
      text,
      sourceLang,
      targetLang: targetRaw
    });
    await recordTranslateUsage(context.env.DB, { ...identity, chars: text.length });
    return json<ActionData>(
      {
        ok: true,
        translation: result.translation,
        detectedSourceLanguage: result.detectedSourceLanguage,
        remainingToday: quota.remainingToday - 1
      },
      extraHeaders ? { headers: extraHeaders } : undefined
    );
  } catch (error) {
    console.error("translate action failed", error);
    return json<ActionData>(
      { ok: false, error: "Translation failed. Please try again in a moment." },
      { status: 502, headers: extraHeaders }
    );
  }
};

export default function TranslatePage() {
  const { authed, quota } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const revalidator = useRevalidator();
  const [text, setText] = React.useState("");
  const [source, setSource] = React.useState<string>("auto");
  const [target, setTarget] = React.useState<TranslateLanguageCode>("en");
  const [copied, setCopied] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement | null>(null);

  const busy = fetcher.state !== "idle";
  const data = fetcher.data;
  const translation = data?.ok ? data.translation : "";
  const detected = data?.ok ? data.detectedSourceLanguage : null;
  const errorMessage = data && !data.ok ? data.error : null;
  const quotaExceeded = data && !data.ok && data.code === "quota_exceeded";
  const remainingToday = data?.ok ? data.remainingToday : quota.remainingToday;

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

  const submit = React.useCallback(() => {
    if (!text.trim() || busy) return;
    fetcher.submit(formRef.current);
  }, [fetcher, text, busy]);

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
    } catch {}
  };

  const overLimit = text.length > quota.maxChars;

  return (
    <div className="translate-page">
      <div className="translate-head">
        <h1 className="translate-title">Translate</h1>
        <p className="translate-sub">LLM-powered translation. Natural phrasing, formatting preserved.</p>
      </div>

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

      <fetcher.Form method="post" ref={formRef} className="translate-board">
        <div className="translate-toolbar">
          <div className="translate-lang-group">
            <select
              className="translate-lang-select"
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
          </div>

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

          <div className="translate-lang-group">
            <select
              className="translate-lang-select"
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
          </div>
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

          <div className={`translate-pane is-output${busy ? " is-busy" : ""}`}>
            <div className="translate-output" aria-live="polite">
              {busy ? (
                <span className="translate-pending">Translating…</span>
              ) : translation ? (
                translation
              ) : (
                <span className="translate-placeholder">Translation appears here.</span>
              )}
            </div>
            <div className="translate-pane-foot">
              {detected && source === "auto" && !busy ? (
                <span className="translate-detected">Detected {languageLabel(detected)}</span>
              ) : (
                <span />
              )}
              {translation && !busy ? (
                <button type="button" className="translate-pane-action" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="translate-actions">
          {errorMessage ? (
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
            <span className="translate-hint">Tip: press ⌘/Ctrl + Enter to translate.</span>
          )}
          <button
            type="submit"
            className="translate-submit"
            disabled={!text.trim() || overLimit || busy}
          >
            {busy ? "Translating…" : "Translate"}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
