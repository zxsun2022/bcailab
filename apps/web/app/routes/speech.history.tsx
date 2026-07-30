import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { listTtsGenerationsByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { LocalDateTime } from "~/components/LocalDateTime";
import { SpeechWorkspaceTabs } from "~/components/SpeechWorkspaceTabs";
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
    <StudioPage width="workspace">
      <StudioPageHeader
        title="Speech"
        description="Turn text into natural-sounding audio, then revisit previous generations from this workspace."
      />
      <StudioPageTabs>
        <SpeechWorkspaceTabs />
      </StudioPageTabs>
      <StudioPageBody className="speech-workspace">
        <div className="speech-center-stage">
        <div className="speech-content-column">
          <header className="speech-history-header">
            <div>
              <h1>History</h1>
              <p>Previous speech generations stay here, inside the Speech workspace.</p>
            </div>
            <Link to="/speech" className="btn btn-primary btn-sm">
              New generation
            </Link>
          </header>

          {generations.length === 0 ? (
            <div className="speech-history-empty">
              <h2>No generations yet</h2>
              <p>Generate speech from some text and it will appear here.</p>
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
                  <form
                    method="post"
                    action="/speech?index"
                    onSubmit={(event) => {
                      if (!confirm("Delete this generation? This cannot be undone.")) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="_intent" value="delete" />
                    <input type="hidden" name="id" value={generation.id} />
                    <input type="hidden" name="returnTo" value="/speech/history" />
                    <button type="submit" className="speech-history-delete">
                      Delete
                    </button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      </StudioPageBody>
    </StudioPage>
  );
}
