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

export const handle = {
  breadcrumb: { label: "history" }
};

export const meta: MetaFunction = () => [{ title: "Speech history · English Studio · bcailab" }];

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

  return (
    <StudioPage width="standard">
      <StudioPageHeader
        title="Speech"
        description="Turn text into natural audio and revisit each generation in History."
      />
      <StudioPageTabs>
        <SpeechWorkspaceTabs />
      </StudioPageTabs>
      <StudioPageBody className="speech-workspace">
        {generations.length === 0 ? (
          <div className="speech-history-empty">
            <h2>No generations yet</h2>
            <p>Generated speech will appear here.</p>
          </div>
        ) : (
          <div className="speech-history-list">
            {generations.map((generation) => (
              <article key={generation.id} className="speech-history-row">
                <Link to={`/speech?record=${generation.id}`} className="speech-history-row-main">
                  <h2>{generation.text.trim() || "Untitled generation"}</h2>
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
                    dialogTitle="Delete speech generation?"
                    dialogDescription="This removes the generated audio and its history entry. This cannot be undone."
                  >
                    Delete
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
