import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { listTtsGenerationsByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { LocalDateTime } from "~/components/LocalDateTime";
import { SpeechWorkspaceTabs } from "~/components/SpeechWorkspaceTabs";
import { ConfirmSubmitButton } from "~/components/ConfirmDialog";
import {
  StudioPage,
  StudioPageBody,
  StudioPageHeader,
  StudioPageTabs
} from "~/components/StudioPage";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";

export const handle = {
  breadcrumb: { label: "history" }
};

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.speechHistory.title") }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const generations = await listTtsGenerationsByUser(context.env.DB, user.id);
  return json({
    generations: generations.map((generation) => ({
      id: generation.id,
      text: generation.input_text,
      languageCode: generation.language_code,
      voiceName: generation.voice_name,
      createdAt: generation.created_at
    }))
  });
};

export default function SpeechHistoryPage() {
  const { generations } = useLoaderData<typeof loader>();
  const t = useT();

  return (
    <StudioPage width="standard">
      <StudioPageHeader
        title={t("speech.title")}
        description={t("speech.description")}
      />
      <StudioPageTabs>
        <SpeechWorkspaceTabs />
      </StudioPageTabs>
      <StudioPageBody className="speech-workspace">
        {generations.length === 0 ? (
          <div className="speech-history-empty">
            <h2>{t("speech.historyEmptyTitle")}</h2>
            <p>{t("speech.historyEmptyBody")}</p>
          </div>
        ) : (
          <div className="speech-history-list">
            {generations.map((generation) => (
              <article key={generation.id} className="speech-history-row">
                <Link to={`/speech?record=${generation.id}`} className="speech-history-row-main">
                  {generation.text.trim() ? (
                    <h2>{generation.text.trim()}</h2>
                  ) : (
                    <h2>{t("speech.untitled")}</h2>
                  )}
                  <div className="tts-history-meta">
                    <span>{generation.languageCode}</span>
                    <span>{generation.voiceName}</span>
                    <LocalDateTime value={generation.createdAt} />
                  </div>
                </Link>
                <form method="post" action="/speech?index">
                  <input type="hidden" name="_intent" value="delete" />
                  <input type="hidden" name="id" value={generation.id} />
                  <input type="hidden" name="returnTo" value="/speech/history" />
                  <ConfirmSubmitButton
                    className="speech-history-delete"
                    dialogTitle={t("speech.deleteTitle")}
                    dialogDescription={t("speech.deleteDescription")}
                  >
                    {t("common.delete")}
                  </ConfirmSubmitButton>
                </form>
              </article>
            ))}
          </div>
        )}
      </StudioPageBody>
    </StudioPage>
  );
}
