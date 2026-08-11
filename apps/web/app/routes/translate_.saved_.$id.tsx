import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { deleteSavedTranslation, getSavedTranslationById } from "@bcailab/db";
import { ConfirmSubmitButton } from "~/components/ConfirmDialog";
import { LocalDateTime } from "~/components/LocalDateTime";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { StudioShell } from "~/components/StudioShell";
import { TranslateWorkspaceTabs } from "~/components/TranslateWorkspaceTabs";
import { requireUser } from "~/utils/auth.server";
import { isTranslateLanguageCode, translateLanguageLabel } from "~/utils/translate-languages";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export const handle = {
  breadcrumb: { label: "saved translation", href: "/translate/saved" },
  hideHeader: true,
  hideHeaderUserMenu: true
};

export const meta: MetaFunction = () => [
  { title: "Saved translation · Translate · bcailab" }
];

const languageLabel = (code: string | null): string => {
  if (!code) return "Unknown";
  return isTranslateLanguageCode(code) ? translateLanguageLabel(code) : code;
};

const notFound = () => new Response("Not found", { status: 404, headers: PRIVATE_HEADERS });

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const id = params.id;
  if (!id) throw notFound();
  const item = await getSavedTranslationById(context.env.DB, user.id, id);
  if (!item) throw notFound();
  return json(
    {
      user: { name: user.name, email: user.email, avatar_url: user.avatar_url },
      item
    },
    { headers: PRIVATE_HEADERS }
  );
};

export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const id = params.id;
  if (!id) throw notFound();
  const formData = await request.formData();
  if (formData.get("_intent") !== "delete") {
    throw new Response("Unsupported action", { status: 400, headers: PRIVATE_HEADERS });
  }
  const deleted = await deleteSavedTranslation(context.env.DB, { userId: user.id, id });
  if (!deleted) throw notFound();
  return redirect("/translate/saved?deleted=1", { headers: PRIVATE_HEADERS });
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button type="button" className="translate-pane-action" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
export default function SavedTranslationDetailPage() {
  const { user, item } = useLoaderData<typeof loader>();
  const sourceCode = item.source_language === "auto"
    ? item.detected_source_language
    : item.source_language;
  return (
    <StudioShell user={user} canvasClassName="translate-shell-canvas">
      <StudioPage width="standard">
        <Link to="/translate/saved" className="session-project-return">Saved translations</Link>
        <StudioPageHeader
          title={`${languageLabel(sourceCode)} → ${languageLabel(item.target_language)}`}
          description={<><LocalDateTime value={item.created_at} /> · Explicitly saved and private to your account.</>}
          action={
            <Form method="post">
              <input type="hidden" name="_intent" value="delete" />
              <ConfirmSubmitButton
                className="btn btn-danger"
                dialogTitle="Permanently delete this translation?"
                dialogDescription="The saved source and translation will be deleted immediately. This cannot be undone."
                confirmLabel="Delete permanently"
              >
                Delete
              </ConfirmSubmitButton>
            </Form>
          }
        />
        <StudioPageBody className="translate-saved-detail">
          <TranslateWorkspaceTabs active="saved" />
          <section className="translate-saved-text" aria-labelledby="saved-source-heading">
            <div className="translate-saved-text-heading">
              <div>
                <p className="writing-section-eyebrow">Source</p>
                <h2 id="saved-source-heading">{languageLabel(sourceCode)}</h2>
              </div>
              <CopyButton text={item.source_text} />
            </div>
            <p>{item.source_text}</p>
          </section>
          <section className="translate-saved-text is-result" aria-labelledby="saved-result-heading">
            <div className="translate-saved-text-heading">
              <div>
                <p className="writing-section-eyebrow">Translation</p>
                <h2 id="saved-result-heading">{languageLabel(item.target_language)}</h2>
              </div>
              <CopyButton text={item.translated_text} />
            </div>
            <p>{item.translated_text}</p>
          </section>
        </StudioPageBody>
      </StudioPage>
    </StudioShell>
  );
}
