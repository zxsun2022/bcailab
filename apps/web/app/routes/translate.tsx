import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher } from "@remix-run/react";
import { requireUser } from "~/utils/auth.server";
import { translateText } from "~/utils/translate.server";
import {
  TRANSLATE_LANGUAGES,
  TRANSLATE_MAX_CHARS,
  isTranslateLanguageCode,
  translateLanguageLabel as languageLabel,
  type TranslateLanguageCode
} from "~/utils/translate-languages";

export const handle = {
  breadcrumb: { label: "translate", href: "/translate" }
};

export const meta: MetaFunction = () => [
  { title: "Translate · bcailab" },
  { name: "description", content: "LLM-powered translation between English, Chinese, and more." }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  await requireUser(request, context);
  return json({ ok: true });
};

type ActionData =
  | {
      ok: true;
      translation: string;
      detectedSourceLanguage: TranslateLanguageCode | null;
    }
  | { ok: false; error: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  await requireUser(request, context);
  const formData = await request.formData();
  const text = String(formData.get("text") ?? "");
  const sourceRaw = String(formData.get("source") ?? "auto");
  const targetRaw = String(formData.get("target") ?? "en");

  if (!text.trim()) {
    return json<ActionData>({ ok: false, error: "Enter some text to translate." }, { status: 400 });
  }
  if (text.length > TRANSLATE_MAX_CHARS) {
    return json<ActionData>(
      { ok: false, error: `Text is too long (max ${TRANSLATE_MAX_CHARS} characters).` },
      { status: 400 }
    );
  }
  const sourceLang = sourceRaw === "auto" || !isTranslateLanguageCode(sourceRaw) ? "auto" : sourceRaw;
  if (!isTranslateLanguageCode(targetRaw)) {
    return json<ActionData>({ ok: false, error: "Unsupported target language." }, { status: 400 });
  }
  if (sourceLang !== "auto" && sourceLang === targetRaw) {
    return json<ActionData>(
      { ok: false, error: "Source and target languages are the same." },
      { status: 400 }
    );
  }

  try {
    const result = await translateText({
      env: context.env,
      text,
      sourceLang,
      targetLang: targetRaw
    });
    return json<ActionData>({
      ok: true,
      translation: result.translation,
      detectedSourceLanguage: result.detectedSourceLanguage
    });
  } catch (error) {
    console.error("translate action failed", error);
    return json<ActionData>(
      { ok: false, error: "Translation failed. Please try again in a moment." },
      { status: 502 }
    );
  }
};

export default function TranslatePage() {
  const fetcher = useFetcher<ActionData>();
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

  const overLimit = text.length > TRANSLATE_MAX_CHARS;

  return (
    <div className="translate-page">
      <div className="translate-head">
        <h1 className="translate-title">Translate</h1>
        <p className="translate-sub">LLM-powered translation. Natural phrasing, formatting preserved.</p>
      </div>

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
              maxLength={TRANSLATE_MAX_CHARS + 500}
            />
            <div className="translate-pane-foot">
              <span className={`translate-count${overLimit ? " is-over" : ""}`}>
                {text.length} / {TRANSLATE_MAX_CHARS}
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
          {errorMessage ? <span className="translate-error">{errorMessage}</span> : <span />}
          <button
            type="submit"
            className="translate-submit"
            disabled={!text.trim() || overLimit || busy}
          >
            {busy ? "Translating…" : "Translate"}
          </button>
        </div>
        <p className="translate-hint">Tip: press ⌘/Ctrl + Enter to translate.</p>
      </fetcher.Form>
    </div>
  );
}
