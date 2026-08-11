import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import {
  createSavedTranslation,
  listSavedTranslations,
  type SavedTranslationCursor
} from "@bcailab/db";
import { LocalDateTime } from "~/components/LocalDateTime";
import {
  StudioPage,
  StudioPageBody,
  StudioPageHeader,
  StudioPageTabs
} from "~/components/StudioPage";
import { StudioShell } from "~/components/StudioShell";
import { TranslateWorkspaceTabs } from "~/components/TranslateWorkspaceTabs";
import { requireUser } from "~/utils/auth.server";
import {
  isTranslateLanguageCode,
  translateLanguageLabel,
  type TranslateLanguageCode
} from "~/utils/translate-languages";
import { readAnonId } from "~/utils/translate-quota.server";
import {
  TranslationSaveProofError,
  verifyTranslationSaveProof,
  type TranslationSaveSnapshot
} from "~/utils/translate-save-proof.server";

const PAGE_SIZE = 25;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export const handle = {
  breadcrumb: { label: "saved translations", href: "/translate/saved" },
  hideHeader: true,
  hideHeaderUserMenu: true
};

export const meta: MetaFunction = () => [
  { title: "Saved translations · Translate · bcailab" },
  { name: "description", content: "Translations you explicitly chose to save." }
];

const isSavedSchemaMissing = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("no such table: saved_translations");

const parseCursor = (url: URL): SavedTranslationCursor | null => {
  const createdAt = url.searchParams.get("before");
  const id = url.searchParams.get("beforeId");
  if (!createdAt && !id) return null;
  if (
    !createdAt ||
    !id ||
    !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(createdAt) ||
    id.length > 200
  ) {
    throw new Response("Invalid cursor", { status: 400, headers: PRIVATE_HEADERS });
  }
  return { createdAt, id };
};

const languageLabel = (code: string | null): string => {
  if (!code) return "Unknown";
  return isTranslateLanguageCode(code) ? translateLanguageLabel(code) : code;
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const cursor = parseCursor(new URL(request.url));
  try {
    const rows = await listSavedTranslations(context.env.DB, {
      userId: user.id,
      cursor,
      limit: PAGE_SIZE + 1
    });
    const items = rows.slice(0, PAGE_SIZE);
    const last = items[items.length - 1] ?? null;
    return json(
      {
        user: { name: user.name, email: user.email, avatar_url: user.avatar_url },
        items,
        nextCursor: rows.length > PAGE_SIZE && last
          ? { createdAt: last.created_at, id: last.id }
          : null,
        deleted: new URL(request.url).searchParams.get("deleted") === "1"
      },
      { headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    if (isSavedSchemaMissing(error)) {
      throw new Response("Saved translations are unavailable until the latest database migration is applied.", {
        status: 503,
        headers: PRIVATE_HEADERS
      });
    }
    throw error;
  }
};

type ActionData = { savedId?: string; error?: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const transport = String(formData.get("_transport") ?? "document");
  const sourceLanguage = String(formData.get("sourceLanguage") ?? "auto");
  const detectedRaw = String(formData.get("detectedSourceLanguage") ?? "");
  const targetLanguage = String(formData.get("targetLanguage") ?? "");
  const snapshot: TranslationSaveSnapshot = {
    sourceLanguage: sourceLanguage as TranslateLanguageCode | "auto",
    detectedSourceLanguage: (detectedRaw || null) as TranslateLanguageCode | null,
    targetLanguage: targetLanguage as TranslateLanguageCode,
    sourceText: String(formData.get("sourceText") ?? ""),
    translatedText: String(formData.get("translatedText") ?? "")
  };
  const acceptedSubjects = [`user:${user.id}`];
  const anonId = readAnonId(request);
  if (anonId) acceptedSubjects.push(`anon:${anonId}`);

  try {
    const verified = await verifyTranslationSaveProof({
      secret: context.env.SESSION_SECRET,
      proof: String(formData.get("proof") ?? ""),
      acceptedSubjects,
      snapshot
    });
    const saved = await createSavedTranslation(context.env.DB, {
      userId: user.id,
      completionId: verified.completionId,
      proofVersion: 1,
      sourceLanguage: verified.snapshot.sourceLanguage,
      detectedSourceLanguage: verified.snapshot.detectedSourceLanguage,
      targetLanguage: verified.snapshot.targetLanguage,
      sourceText: verified.snapshot.sourceText,
      translatedText: verified.snapshot.translatedText
    });
    return transport === "fetcher"
      ? json<ActionData>({ savedId: saved.id }, { headers: PRIVATE_HEADERS })
      : redirect(`/translate/saved/${saved.id}`, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof TranslationSaveProofError) {
      return json<ActionData>(
        { error: "This result can no longer be saved. Translate it again and retry." },
        { status: 400, headers: PRIVATE_HEADERS }
      );
    }
    if (isSavedSchemaMissing(error)) {
      return json<ActionData>(
        { error: "Saved translations are not available on this environment yet." },
        { status: 503, headers: PRIVATE_HEADERS }
      );
    }
    return json<ActionData>(
      { error: "Could not save this translation. Please retry." },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }
};

export default function SavedTranslationsPage() {
  const { user, items, nextCursor, deleted } = useLoaderData<typeof loader>();
  return (
    <StudioShell user={user} canvasClassName="translate-shell-canvas">
      <StudioPage width="wide">
        <StudioPageHeader
          title="Saved translations"
          description="Only translations you explicitly save appear here."
        />
        <StudioPageTabs>
          <TranslateWorkspaceTabs active="saved" />
        </StudioPageTabs>
        <StudioPageBody className="translate-saved-page">
          {deleted ? <p className="translate-saved-notice" role="status">Translation permanently deleted.</p> : null}
          {items.length === 0 ? (
            <section className="translate-saved-empty">
              <p className="writing-section-eyebrow">Private workspace</p>
              <h2>No saved translations yet</h2>
              <p>Translate something useful, then choose Save after the result is complete.</p>
            </section>
          ) : (
            <div className="translate-saved-list">
              {items.map((item) => {
                const sourceCode = item.source_language === "auto"
                  ? item.detected_source_language
                  : item.source_language;
                return (
                  <Link key={item.id} to={`/translate/saved/${item.id}`} className="translate-saved-row">
                    <span className="translate-saved-row-copy">
                      <strong>{item.source_preview}</strong>
                      <small>{languageLabel(sourceCode)} → {languageLabel(item.target_language)}</small>
                    </span>
                    <LocalDateTime value={item.created_at} />
                  </Link>
                );
              })}
            </div>
          )}
          {nextCursor ? (
            <Link
              className="btn btn-secondary translate-saved-more"
              to={`?before=${encodeURIComponent(nextCursor.createdAt)}&beforeId=${encodeURIComponent(nextCursor.id)}`}
              rel="next"
            >
              Older translations
            </Link>
          ) : null}
        </StudioPageBody>
      </StudioPage>
    </StudioShell>
  );
}
