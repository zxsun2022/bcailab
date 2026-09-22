import type { ActionFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Card, Textarea } from "@bcailab/ui";
import { createUserPassage, softDeleteUserPassage } from "@bcailab/db";
import { EslAttemptComposer, EslModeToggle } from "~/components/EslAttemptComposer";
import { EslReadingHistoryRail } from "~/components/EslReadingHistoryRail";
import { requireUser } from "~/utils/auth.server";
import {
  createAndScheduleEslReadingAttempt,
  EslAttemptSubmissionError,
  eslSubmissionErrorText,
  parseEslAttemptSubmission
} from "~/utils/esl-reading-attempt.server";
import { schedulePassageReferenceSynthesis } from "~/utils/esl-passage-reference.server";
import { generatePassageTitle } from "~/utils/esl-reading-eval.server";
import { MAX_ESL_PASSAGE_CHARS, normalizeEslPassageText, type EslReadingMode } from "~/utils/esl-reading";
import * as React from "react";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestTranslator } from "~/i18n/locale.server";

type ActionData = { error?: string; redirectTo?: string };
const HISTORY_RAIL_COLLAPSED_KEY = "reading-history-rail-collapsed";

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.readingNew.title") }
];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "submitAttempt");
  const transport = String(formData.get("_transport") ?? "document");
  const t = getRequestTranslator(request);
  if (intent !== "submitAttempt") {
    return json<ActionData>({ error: t("reading.error.unsupported") }, { status: 400 });
  }

  const content = normalizeEslPassageText(String(formData.get("content") ?? "")).trim();
  if (!content) {
    return json<ActionData>({ error: t("reading.error.passageEmpty") }, { status: 400 });
  }
  if (content.length > MAX_ESL_PASSAGE_CHARS) {
    return json<ActionData>(
      { error: t("reading.error.passageTooLong", { max: MAX_ESL_PASSAGE_CHARS.toLocaleString() }) },
      { status: 400 }
    );
  }

  let submission;
  try {
    submission = await parseEslAttemptSubmission(formData);
  } catch (error) {
    if (error instanceof EslAttemptSubmissionError) {
      return json<ActionData>({ error: eslSubmissionErrorText(error, t) }, { status: error.status });
    }
    return json<ActionData>({ error: t("reading.error.submitFailed") }, { status: 500 });
  }

  const title = await generatePassageTitle(context.env, content);
  let created: Awaited<ReturnType<typeof createUserPassage>> | null = null;

  try {
    created = await createUserPassage(context.env.DB, {
      userId: user.id,
      title,
      contentText: content
    });
    const { attemptId } = await createAndScheduleEslReadingAttempt(context, {
      userId: user.id,
      passage: created,
      submission
    });
    await schedulePassageReferenceSynthesis(context, {
      userId: user.id,
      passage: created
    });
    const redirectTo = `/reading/${created.id}?attempt=${attemptId}`;
    return transport === "fetcher"
      ? json({ redirectTo })
      : redirect(redirectTo);
  } catch (error) {
    if (created) {
      await softDeleteUserPassage(context.env.DB, { id: created.id, userId: user.id });
    }

    if (error instanceof EslAttemptSubmissionError) {
      return json<ActionData>({ error: eslSubmissionErrorText(error, t) }, { status: error.status });
    }
    return json<ActionData>({ error: t("reading.error.submitFailed") }, { status: 500 });
  }
};

export default function EslReadingIndexPage() {
  const t = useT();
  const [content, setContent] = React.useState("");
  const [mode, setMode] = React.useState<EslReadingMode>("reading");
  const [historyRailCollapsed, setHistoryRailCollapsed] = React.useState(true);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_RAIL_COLLAPSED_KEY);
      setHistoryRailCollapsed(stored === null ? true : stored === "true");
    } catch {
      // localStorage may be unavailable in private browsing contexts.
    }
  }, []);

  const handleHistoryRailToggle = React.useCallback(() => {
    setHistoryRailCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(HISTORY_RAIL_COLLAPSED_KEY, String(next));
      } catch {
        // localStorage may be unavailable in private browsing contexts.
      }
      return next;
    });
  }, []);

  return (
    <div className={`esl-practice-layout reading-workspace${historyRailCollapsed ? " is-history-collapsed" : ""}`}>
      <div className="reading-center-stage">
        <div className="reading-content-column">
          <div className="esl-center-panel">
            <div className="esl-welcome">
              <h1>{t("reading.newPassage")}</h1>
              <EslModeToggle mode={mode} onModeChange={setMode} />
            </div>

            <EslAttemptComposer
              action="/reading/new"
              submitLabel={t("reading.submit")}
              canSubmit={Boolean(content.trim())}
              mode={mode}
              onModeChange={setMode}
            >
              {({ hideText, recorder }) => (
                <Card className="tool-card-stack esl-compose-card esl-compose-draft-card">
                  <div className={`esl-compose-editor${hideText ? " is-masked" : ""}`}>
                    <Textarea
                      name="content"
                      rows={18}
                      className={`esl-compose-textarea${hideText ? " is-masked" : ""}`}
                      placeholder={t("reading.pastePlaceholder")}
                      value={content}
                      readOnly={hideText}
                      onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setContent(event.currentTarget.value)
                      }
                    />
                    {hideText ? (
                      <div className="esl-compose-mask" aria-hidden="true">
                        <div className="esl-compose-mask-chip">{t("reading.reciteChip")}</div>
                        <div className="esl-compose-mask-copy">{t("reading.reciteMaskCopy")}</div>
                      </div>
                    ) : null}
                    <div
                      className={`esl-compose-count ${
                        content.length > 0 ? "is-visible" : ""
                      } ${content.length > MAX_ESL_PASSAGE_CHARS ? "is-over-limit" : ""}`}
                    >
                      <span className="textarea-count">
                        {content.length.toLocaleString()} / {MAX_ESL_PASSAGE_CHARS.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {recorder}
                </Card>
              )}
            </EslAttemptComposer>
          </div>
        </div>
      </div>

      <div className="reading-detail-rail">
        <EslReadingHistoryRail
          attempts={[]}
          disableNewAttempt
          collapsed={historyRailCollapsed}
          onToggle={handleHistoryRailToggle}
        />
      </div>
    </div>
  );
}
