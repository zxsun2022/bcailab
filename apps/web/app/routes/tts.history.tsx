import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useActionData, useLoaderData } from "@remix-run/react";
import { Button, Card } from "@bcailab/ui";
import {
  getTtsGenerationById,
  listTtsGenerationsByUser,
  softDeleteTtsGeneration
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";

export const handle = {
  breadcrumb: { label: "history" }
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const generations = await listTtsGenerationsByUser(context.env.DB, user.id);
  return json({ generations });
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "");

  if (intent !== "delete") {
    return json({});
  }

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return json({ error: "Missing record id." }, { status: 400 });
  }

  const generation = await getTtsGenerationById(context.env.DB, id, {
    includeDeleted: true
  });
  if (!generation || generation.user_id !== user.id || generation.deleted_at) {
    return json({ error: "Not found." }, { status: 404 });
  }

  try {
    await context.env.R2.delete(generation.r2_key);
    await softDeleteTtsGeneration(context.env.DB, { id, userId: user.id });
    return redirect("/tts/history");
  } catch {
    return json(
      { error: "Failed to delete the audio asset. Please try again." },
      { status: 500 }
    );
  }
};

export default function TtsHistoryPage() {
  const { generations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errorMessage =
    actionData &&
    typeof actionData === "object" &&
    "error" in actionData &&
    typeof actionData.error === "string"
      ? actionData.error
      : undefined;

  return (
    <div className="tool-page">
      <div className="posts-header">
        <p className="tool-desc">Your generated Speech history.</p>
        <Link to="/tts" className="btn btn-primary">
          New generation
        </Link>
      </div>

      {errorMessage ? <div className="form-error">{errorMessage}</div> : null}

      {generations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No speech generated yet</div>
          <p className="empty-state-desc">
            Generate your first speech audio and it will appear here.
          </p>
        </div>
      ) : (
        <div className="tts-history-list">
          {generations.map((generation) => (
            <Card key={generation.id} className="tts-history-row">
              <div className="tts-history-meta">
                <span>{formatDate(generation.created_at)}</span>
                <span>{generation.language_code}</span>
                <span>{generation.voice_name}</span>
              </div>
              <div className="tts-history-text">{generation.input_text}</div>
              <div className="tts-history-actions">
                <audio controls preload="metadata" src={`/tts/audio/${generation.id}`} />
                <a className="btn btn-ghost btn-sm" href={`/tts/audio/${generation.id}?download=1`}>
                  Download
                </a>
                <form
                  method="post"
                  onSubmit={(event) => {
                    if (!confirm("Delete this generation? This cannot be undone.")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="_intent" value="delete" />
                  <input type="hidden" name="id" value={generation.id} />
                  <Button type="submit" variant="danger" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
