import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import {
  completeDictationAttempt,
  getDictationAttemptById,
  getInProgressDictationAttempt,
  getLibraryPassageById,
  listPassageSentences,
  recordPassageAttemptStat,
  saveDictationAttemptProgress
} from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import {
  getFeatureQuotaStatus,
  recordFeatureUsage,
  resolveQuotaSubject
} from "~/utils/feature-quota.server";
import { scorePassage, scoreSentence, storableOps, type DiffOp } from "~/utils/dictation-diff";
import {
  scheduleDictationFeedback,
  type DictationFeedback
} from "~/utils/dictation-feedback.server";
import { recordDictationObservations } from "~/utils/learner-model.server";
import {
  mergeSentenceResult,
  parseSentenceResults,
  type SentenceResult
} from "~/utils/dictation-progress";
import { openLoginPopup } from "~/utils/login-popup";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestTranslator } from "~/i18n/locale.server";
import {
  activeSeconds,
  clampAttemptPracticeSeconds,
  recordActivity,
  startActiveClock,
  suspendActiveClock
} from "~/utils/practice-time";

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const t = metaTranslator(matches);
  return [
    {
      title: data?.passage
        ? t("meta.dictationPassage.title", { title: data.passage.title })
        : t("meta.dictation.title")
    }
  ];
};

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const passageId = params.passageId;
  if (!passageId) throw new Response("Not found", { status: 404 });

  const passage = await getLibraryPassageById(context.env.DB, passageId);
  if (!passage) throw new Response("Not found", { status: 404 });

  const user = await getOptionalUser(request, context);
  const subject = resolveQuotaSubject(request, user?.id ?? null);
  const quota = await getFeatureQuotaStatus(context.env.DB, "dictation", subject);

  const sentences = await listPassageSentences(context.env.DB, passageId);

  // Resume an unfinished attempt rather than making the learner redo checked sentences.
  const inProgress = user
    ? await getInProgressDictationAttempt(context.env.DB, { userId: user.id, passageId })
    : null;
  let resume: {
    attemptId: string;
    answers: Record<number, string>;
    sentencesDone: number;
    practiceSeconds: number;
  } | null = null;
  if (inProgress) {
    const answers: Record<number, string> = {};
    for (const entry of parseSentenceResults(inProgress.sentence_results)) {
      answers[entry.idx] = entry.userText;
    }
    resume = {
      attemptId: inProgress.id,
      answers,
      sentencesDone: inProgress.sentences_done,
      // The client continues this total rather than restarting it, so a resumed attempt
      // reports stored time plus new time and nothing is counted twice.
      practiceSeconds: inProgress.practice_seconds
    };
  }

  return json(
    {
      authed: Boolean(user),
      resume,
      quota: { allowed: quota.allowed, remainingToday: quota.remainingToday },
      passage: {
        id: passage.id,
        title: passage.title,
        band: passage.band,
        topic: passage.topic
      },
      // Reference text is deliberately NOT sent to the client — it would let the
      // learner read the answer from the page source. Sentences carry only the id
      // needed to stream audio; scoring happens server-side per check.
      sentences: sentences.map((sentence) => ({ id: sentence.id, idx: sentence.idx }))
    },
    subject.setCookie ? { headers: { "Set-Cookie": subject.setCookie } } : undefined
  );
};

type ActionData =
  | {
      intent: "check";
      idx: number;
      accuracy: number;
      ops: DiffOp[];
      reference: string;
      attemptId: string | null;
    }
  | { intent: "complete"; accuracy: number; results: SentenceResult[]; attemptId: string | null }
  | { ok: false; error: string; code?: "quota_exceeded" };

/**
 * Two intents share this action:
 *
 * - `check` scores one sentence. The first check of a session is also the quota
 *   increment point (design §9) — not page view, so browsing the library is free.
 * - `complete` recomputes the whole passage from stored reference text (client
 *   scores are never trusted) and, for signed-in users, persists the attempt.
 */
export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const passageId = params.passageId;
  if (!passageId) throw new Response("Not found", { status: 404 });

  const passage = await getLibraryPassageById(context.env.DB, passageId);
  if (!passage) throw new Response("Not found", { status: 404 });

  const user = await getOptionalUser(request, context);
  const subject = resolveQuotaSubject(request, user?.id ?? null);
  const extraHeaders = subject.setCookie ? { "Set-Cookie": subject.setCookie } : undefined;
  // Errors below reach the learner as written, so they are worded in the interface language.
  const t = getRequestTranslator(request);

  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "");
  const sentences = await listPassageSentences(context.env.DB, passageId);
  // The attempt's running active-time total as the client measured it; sanitised and capped
  // here, and stored with MAX so a retry or resume cannot count time twice.
  const practiceSeconds = clampAttemptPracticeSeconds(formData.get("practiceSeconds"), sentences.length);

  if (intent === "check") {
    const idx = Number(formData.get("idx"));
    const userText = String(formData.get("text") ?? "");
    const sentence = sentences.find((item) => item.idx === idx);
    if (!sentence) {
      return json<ActionData>({ ok: false, error: t("dictation.unknownSentence") }, { status: 400, headers: extraHeaders });
    }

    // Quota is charged once per session, on the first sentence.
    if (idx === 0) {
      const quota = await getFeatureQuotaStatus(context.env.DB, "dictation", subject);
      if (!quota.allowed) {
        return json<ActionData>(
          {
            ok: false,
            code: "quota_exceeded",
            error: user ? t("dictation.quotaSignedIn") : t("dictation.quotaAnonymous")
          },
          { status: 429, headers: extraHeaders }
        );
      }
      await recordFeatureUsage(context.env.DB, "dictation", subject);
    }

    const diff = scoreSentence(sentence.text, userText);

    // Persist as we go, so stopping partway keeps the work. Signed-in only: anonymous
    // practice is session-only by design.
    let attemptId: string | null = null;
    if (user) {
      // Merge into what the server stored, not into what this page remembers: a resumed page
      // starts with no checked sentences and would otherwise drop everything checked earlier.
      const requestedId = String(formData.get("attemptId") ?? "");
      const claimed = requestedId
        ? await getDictationAttemptById(context.env.DB, { id: requestedId, userId: user.id })
        : await getInProgressDictationAttempt(context.env.DB, { userId: user.id, passageId });
      const open =
        claimed && claimed.status === "in_progress" && claimed.passage_id === passageId
          ? claimed
          : null;
      const merged = mergeSentenceResult(open?.sentence_results, {
        idx,
        userText,
        accuracy: diff.accuracy,
        replays: Number(formData.get("replays") ?? 0),
        ops: storableOps(diff.ops)
      });

      const checkedRefTokens = merged.reduce(
        (sum, entry) => sum + (sentences.find((s) => s.idx === entry.idx)?.text.split(/\s+/).length ?? 0),
        0
      );
      const runningAccuracy =
        checkedRefTokens === 0
          ? 0
          : merged.reduce((sum, entry) => sum + entry.accuracy, 0) / merged.length;

      attemptId = await saveDictationAttemptProgress(context.env.DB, {
        attemptId: open?.id ?? null,
        userId: user.id,
        passageId,
        accuracy: runningAccuracy,
        sentenceResults: JSON.stringify(merged),
        sentencesDone: merged.length,
        practiceSeconds
      });
    }

    return json<ActionData>(
      {
        intent: "check",
        idx,
        accuracy: diff.accuracy,
        ops: diff.ops,
        reference: sentence.text,
        attemptId
      },
      { headers: extraHeaders }
    );
  }

  if (intent === "complete") {
    let answers: string[];
    let replays: number[];
    try {
      answers = JSON.parse(String(formData.get("answers") ?? "[]")) as string[];
      replays = JSON.parse(String(formData.get("replays") ?? "[]")) as number[];
    } catch {
      return json<ActionData>({ ok: false, error: t("dictation.malformed") }, { status: 400, headers: extraHeaders });
    }

    const entries = sentences.map((sentence) => ({
      reference: sentence.text,
      userText: String(answers[sentence.idx] ?? "")
    }));
    const scored = scorePassage(entries);

    const results: SentenceResult[] = sentences.map((sentence, position) => ({
      idx: sentence.idx,
      userText: entries[position]!.userText,
      accuracy: scored.sentences[position]!.accuracy,
      replays: Number(replays[sentence.idx] ?? 0),
      ops: storableOps(scored.sentences[position]!.ops)
    }));

    // Empirical difficulty for the material layer, recorded before the signed-in
    // branch: an anonymous attempt says just as much about how hard a passage is,
    // and the row carries no identity.
    await recordPassageAttemptStat(context.env.DB, {
      passageId,
      mode: "dictation",
      accuracy: scored.accuracy
    });

    let attemptId: string | null = null;
    if (user) {
      // Finalize the row the check path has been building, rather than inserting a
      // second one. If the client lost its attempt id, fall back to whatever
      // in-progress attempt exists for this passage.
      const existing =
        String(formData.get("attemptId") ?? "") ||
        (await getInProgressDictationAttempt(context.env.DB, {
          userId: user.id,
          passageId
        }))?.id ||
        null;

      attemptId =
        existing ??
        (await saveDictationAttemptProgress(context.env.DB, {
          attemptId: null,
          userId: user.id,
          passageId,
          accuracy: scored.accuracy,
          sentenceResults: JSON.stringify(results),
          sentencesDone: results.length,
          practiceSeconds
        }));

      const completed = await completeDictationAttempt(context.env.DB, {
        attemptId,
        userId: user.id,
        accuracy: scored.accuracy,
        sentenceResults: JSON.stringify(results),
        sentencesDone: results.length,
        practiceSeconds
      });

      // Background: fills feedback_json, which the summary panel polls for.
      // Deliberately not awaited — feedback failure must not fail the attempt.
      await scheduleDictationFeedback(context, {
        attemptId,
        userId: user.id,
        // Library passages are always banded; the column is nullable only because
        // user-supplied passages share the table and are left untagged (design §5.4). An
        // unbanded passage is described without a band rather than handed an invented one.
        band: passage.band,
        results
      });

      // Learner model: attribute this attempt's errors to the tag vocabulary and record
      // the observations (learner-model design §5.1). Signed-in only; fails soft.
      await recordDictationObservations(context, {
        userId: user.id,
        passageId,
        attemptId,
        sentences: sentences.map((sentence, position) => ({
          reference: sentence.text,
          ops: results[position]!.ops
        })),
        practiceSeconds: completed.practiceSeconds
      });
    }

    return json<ActionData>(
      { intent: "complete", accuracy: scored.accuracy, results, attemptId },
      { headers: extraHeaders }
    );
  }

  return json<ActionData>({ ok: false, error: t("common.unknownAction") }, { status: 400, headers: extraHeaders });
};

/* ---------- diff rendering ---------- */

function DiffTokens({ ops }: { ops: DiffOp[] }) {
  return (
    <p className="dictation-diff" lang="en">
      {ops.map((op, index) => {
        if (op.op === "match") {
          return (
            <span key={index} className="dictation-token is-match">
              {op.got}
            </span>
          );
        }
        if (op.op === "substitute") {
          return (
            <span key={index} className="dictation-token is-wrong">
              <span className="dictation-token-got">{op.got}</span>
              <span className="dictation-token-ref">{op.ref}</span>
            </span>
          );
        }
        if (op.op === "delete") {
          return (
            <span key={index} className="dictation-token is-missing">
              {op.ref}
            </span>
          );
        }
        return (
          <span key={index} className="dictation-token is-extra">
            {op.got}
          </span>
        );
      })}
    </p>
  );
}

/* ---------- feedback panel ---------- */

type FeedbackStatus = { ready: boolean; feedback: DictationFeedback | null };

const FEEDBACK_POLL_MS = 2000;
const FEEDBACK_POLL_LIMIT = 15; // ~30s, then stop and leave the panel out.

/**
 * Polls the attempt-status route until the background LLM task fills
 * `feedback_json`. Renders nothing at all if feedback never arrives — a failed
 * feedback call is not an error the learner needs to see (design §8).
 */
function FeedbackPanel({ attemptId }: { attemptId: string }) {
  const t = useT();
  const [feedback, setFeedback] = React.useState<DictationFeedback | null>(null);
  const [givenUp, setGivenUp] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let tries = 0;

    const poll = async () => {
      if (cancelled) return;
      tries += 1;
      try {
        const response = await fetch(`/dictation/attempt/${attemptId}/status`);
        if (response.ok) {
          const data = (await response.json()) as FeedbackStatus;
          if (data.ready && data.feedback) {
            if (!cancelled) setFeedback(data.feedback);
            return;
          }
        }
      } catch {
        // Network hiccup — fall through and retry until the limit.
      }
      if (tries >= FEEDBACK_POLL_LIMIT) {
        if (!cancelled) setGivenUp(true);
        return;
      }
      if (!cancelled) setTimeout(poll, FEEDBACK_POLL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (givenUp && !feedback) return null;

  if (!feedback) {
    return (
      <div className="dictation-feedback-panel is-pending">
        <p className="dictation-feedback-panel-title">{t("dictation.feedbackPending")}</p>
      </div>
    );
  }

  return (
    <div className="dictation-feedback-panel">
      <p className="dictation-feedback-panel-title">{t("dictation.feedbackTitle")}</p>
      {/* The patterns are model output in English until feedback follows the interface
          language (Chinese UI stage 3); marking them keeps a zh page pronouncing them right. */}
      <ul className="dictation-pattern-list" lang="en">
        {feedback.patterns.map((pattern, index) => (
          <li key={index} className="dictation-pattern">
            <p className="dictation-pattern-name">{pattern.pattern}</p>
            {pattern.evidence ? (
              <p className="dictation-pattern-evidence">{pattern.evidence}</p>
            ) : null}
            <p className="dictation-pattern-tip">{pattern.tip}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- page ---------- */

export default function DictationSession() {
  const { authed, resume, quota, passage, sentences } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const t = useT();

  // Resume drops the learner back where they stopped instead of at sentence one.
  const [current, setCurrent] = React.useState(() =>
    resume ? Math.min(resume.sentencesDone, Math.max(0, sentences.length - 1)) : 0
  );
  const [answers, setAnswers] = React.useState<string[]>(() =>
    sentences.map((sentence) => resume?.answers[sentence.idx] ?? "")
  );
  const [attemptId, setAttemptId] = React.useState<string | null>(resume?.attemptId ?? null);
  // Total listens per sentence. `replays` in the stored result is this minus the first
  // listen, so the field means what its name says regardless of how playback started.
  const [playCounts, setPlayCounts] = React.useState<number[]>(() => sentences.map(() => 0));
  const [checked, setChecked] = React.useState<Record<number, { accuracy: number; ops: DiffOp[]; reference: string }>>({});
  const [summary, setSummary] = React.useState<{
    accuracy: number;
    results: SentenceResult[];
    attemptId: string | null;
  } | null>(null);
  const [speed, setSpeed] = React.useState(1);
  // Anonymous visitors who are already out of quota see the gate before starting;
  // the action returns the same gate if the limit is hit between load and first check.
  const [gate, setGate] = React.useState<string | null>(
    quota.allowed
      ? null
      : authed
        ? t("dictation.quotaSignedIn")
        : t("dictation.quotaAnonymous")
  );

  const [audioState, setAudioState] = React.useState<"idle" | "loading" | "playing">("idle");
  const [progress, setProgress] = React.useState(0);

  // Active practice time for this page visit, continued from what a resumed attempt already
  // stored. Idle and hidden-tab time are excluded by the rule in `~/utils/practice-time`.
  const clockRef = React.useRef(startActiveClock());
  // Read once at mount. Every check revalidates the loader, whose `resume.practiceSeconds`
  // then already includes this visit's time; re-reading it would count that time twice.
  const [baselineSeconds] = React.useState(() => resume?.practiceSeconds ?? 0);
  const markActivity = React.useCallback(() => {
    clockRef.current = recordActivity(clockRef.current, Date.now());
  }, []);
  const practiceSecondsSoFar = () => {
    markActivity();
    return String(baselineSeconds + activeSeconds(clockRef.current));
  };

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clockRef.current = suspendActiveClock(clockRef.current, Date.now());
      }
    };
    window.addEventListener("keydown", markActivity);
    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("input", markActivity);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("input", markActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [markActivity]);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  // Landing on the page must not blast audio at the user; playback is theirs to start.
  // Once they have, advancing to the next sentence autoplays to keep the rhythm going.
  const startedRef = React.useRef(false);

  const total = sentences.length;
  const isLast = current === total - 1;
  const currentSentence = sentences[current];
  const currentChecked = checked[current];
  const currentPlays = playCounts[current] ?? 0;

  // Apply the speed toggle to whichever clip is loaded.
  React.useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, current]);

  const play = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    startedRef.current = true;
    audio.currentTime = 0;
    audio.playbackRate = speed;
    setProgress(0);
    void audio.play().catch(() => {
      // Autoplay policy or a decode error: fall back to idle so the button stays usable.
      setAudioState("idle");
    });
    setPlayCounts((prev) => {
      const nextCounts = [...prev];
      nextCounts[current] = (nextCounts[current] ?? 0) + 1;
      return nextCounts;
    });
  }, [current, speed]);

  // On advance: reset playback state, autoplay only if the session is already underway,
  // and put the cursor in the input either way.
  React.useEffect(() => {
    setAudioState("idle");
    setProgress(0);
    if (startedRef.current) play();
    inputRef.current?.focus();
    // `play` is intentionally excluded — including it would re-fire on every speed change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Fold action results into local state.
  React.useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if ("ok" in data && data.ok === false) {
      if (data.code === "quota_exceeded") setGate(data.error);
      return;
    }
    if ("intent" in data && data.intent === "check") {
      if (data.attemptId) setAttemptId(data.attemptId);
      setChecked((prev) => ({
        ...prev,
        [data.idx]: { accuracy: data.accuracy, ops: data.ops, reference: data.reference }
      }));
    }
    if ("intent" in data && data.intent === "complete") {
      setSummary({ accuracy: data.accuracy, results: data.results, attemptId: data.attemptId });
    }
  }, [fetcher.data]);

  const busy = fetcher.state !== "idle";

  const check = () => {
    // Only this sentence is sent: the server merges it into the attempt's stored results, which
    // survive a resume, and scores it from the reference text the client never receives.
    fetcher.submit(
      {
        _intent: "check",
        idx: String(current),
        text: answers[current] ?? "",
        replays: String(Math.max(0, (playCounts[current] ?? 0) - 1)),
        attemptId: attemptId ?? "",
        practiceSeconds: practiceSecondsSoFar()
      },
      { method: "post" }
    );
  };

  const next = () => {
    if (isLast) {
      fetcher.submit(
        {
          _intent: "complete",
          attemptId: attemptId ?? "",
          answers: JSON.stringify(answers),
          // Replays are listens beyond the first, so a sentence heard once reports 0.
          replays: JSON.stringify(playCounts.map((count) => Math.max(0, count - 1))),
          practiceSeconds: practiceSecondsSoFar()
        },
        { method: "post" }
      );
      return;
    }
    setCurrent((value) => value + 1);
  };

  if (gate) {
    return (
      <div className="dictation-gate">
        <h1 className="dictation-gate-title">{t("dictation.gateTitle")}</h1>
        <p className="dictation-gate-body">{gate}</p>
        {!authed ? (
          <button type="button" className="btn btn-primary" onClick={() => openLoginPopup()}>
            {t("common.signInFree")}
          </button>
        ) : null}
        <Link to="/dictation" className="dictation-secondary">
          {t("dictation.backToLibrary")}
        </Link>
      </div>
    );
  }

  if (summary) {
    return (
      <div className="dictation-summary">
        <header className="dictation-summary-header">
          <span className="dictation-summary-band">{passage.band}</span>
          <h1 className="dictation-summary-title" lang="en">{passage.title}</h1>
          <p className="dictation-summary-score">{Math.round(summary.accuracy * 100)}%</p>
          <p className="dictation-summary-label">{t("dictation.overallAccuracy")}</p>
        </header>

        <ol className="dictation-summary-list">
          {summary.results.map((result) => (
            <li key={result.idx} className="dictation-summary-item">
              <div className="dictation-summary-item-head">
                <span className="dictation-summary-item-idx">{result.idx + 1}</span>
                <span className="dictation-summary-item-score">
                  {Math.round(result.accuracy * 100)}%
                </span>
                {result.replays > 0 ? (
                  <span className="dictation-summary-item-replays">
                    {t(result.replays === 1 ? "dictation.replayOne" : "dictation.replayMany", {
                      count: result.replays
                    })}
                  </span>
                ) : null}
              </div>
              {result.userText ? (
                <p className="dictation-summary-item-text" lang="en">{result.userText}</p>
              ) : (
                <p className="dictation-summary-item-text">
                  <em className="dictation-blank">{t("dictation.blank")}</em>
                </p>
              )}
              {result.ops.length > 0 ? <DiffTokens ops={result.ops} /> : null}
            </li>
          ))}
        </ol>

        {summary.attemptId ? <FeedbackPanel attemptId={summary.attemptId} /> : null}

        {/* One passage, two modes. The handoff belongs here rather than in a browse UI:
            having just transcribed the text, the learner already knows the words, which
            is exactly when reading it aloud is the natural next step. */}
        {authed ? (
          <div className="mode-handoff">
            <p className="mode-handoff-text">{t("dictation.handoff")}</p>
            <Link to={`/reading/${passage.id}`} className="btn btn-primary">
              {t("dictation.readAloud")}
            </Link>
          </div>
        ) : null}

        {!authed ? (
          <div className="dictation-cta">
            <p className="dictation-cta-text">{t("dictation.signInCta")}</p>
            <button type="button" className="btn btn-primary" onClick={() => openLoginPopup()}>
              {t("common.signInFree")}
            </button>
          </div>
        ) : null}

        <Link to="/dictation" className="dictation-secondary">
          {t("dictation.backToLibrary")}
        </Link>
      </div>
    );
  }

  return (
    <div className="dictation-session">
      <header className="dictation-session-header">
        <Link to="/dictation" className="session-project-return">
          {t("dictation.backToDictation")}
        </Link>
        <span className="dictation-session-band">{passage.band}</span>
        <h1 className="dictation-session-title" lang="en">{passage.title}</h1>
        <p className="dictation-progress">
          {t("dictation.sentenceOf", { current: current + 1, total })}
        </p>
      </header>

      {currentSentence ? (
        <audio
          ref={audioRef}
          src={`/dictation/audio/${currentSentence.id}`}
          preload="auto"
          className="dictation-audio"
          onWaiting={() => setAudioState("loading")}
          onPlaying={() => setAudioState("playing")}
          onPause={() => setAudioState("idle")}
          onEnded={() => {
            setAudioState("idle");
            setProgress(1);
          }}
          onTimeUpdate={(event) => {
            // Listening is practice even when the learner is not touching anything.
            markActivity();
            const el = event.currentTarget;
            if (el.duration > 0) setProgress(el.currentTime / el.duration);
          }}
          onError={() => setAudioState("idle")}
        />
      ) : null}

      <div className="dictation-controls">
        {/* Play is ghost, not primary: Check is the sentence's one commit action, and
            two filled buttons on screen read as two equal choices. */}
        <button
          type="button"
          className={`btn btn-ghost dictation-play${audioState === "playing" ? " is-playing" : ""}`}
          onClick={play}
          aria-label={currentPlays === 0 ? t("dictation.playSentence") : t("dictation.playAgain")}
        >
          <span className="dictation-play-icon" aria-hidden="true" />
          <span className="dictation-play-label">
            {audioState === "loading"
              ? t("dictation.loading")
              : audioState === "playing"
                ? t("dictation.playing")
                : currentPlays === 0
                  ? t("dictation.play")
                  : t("dictation.replay")}
          </span>
          <span
            className="dictation-play-progress"
            style={{ transform: `scaleX(${audioState === "idle" && progress === 0 ? 0 : progress})` }}
          />
        </button>

        <div className="dictation-speed" role="group" aria-label={t("dictation.playbackSpeed")}>
          {[0.75, 1].map((rate) => (
            <button
              key={rate}
              type="button"
              className={`dictation-speed-btn${speed === rate ? " is-active" : ""}`}
              onClick={() => setSpeed(rate)}
            >
              {rate}×
            </button>
          ))}
        </div>

        {currentPlays > 1 ? (
          <span className="dictation-play-count">
            {t("dictation.listens", { count: currentPlays })}
          </span>
        ) : null}
      </div>

      <label className="writing-label" htmlFor="dictation-answer">{t("dictation.yourAnswer")}</label>
      <textarea
        id="dictation-answer"
        ref={inputRef}
        className="dictation-input"
        value={answers[current] ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          setAnswers((prev) => {
            const nextAnswers = [...prev];
            nextAnswers[current] = value;
            return nextAnswers;
          });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (currentChecked) next();
            else check();
          }
        }}
        placeholder={t("dictation.placeholder")}
        rows={3}
        disabled={Boolean(currentChecked)}
      />

      {currentChecked ? (
        <div className="dictation-feedback">
          <p className="dictation-feedback-score">
            {t("dictation.correct", { pct: Math.round(currentChecked.accuracy * 100) })}
          </p>
          <DiffTokens ops={currentChecked.ops} />
          <p className="dictation-reference" lang="en">{currentChecked.reference}</p>
        </div>
      ) : null}

      <div className="dictation-actions">
        {currentChecked ? (
          <button type="button" className="btn btn-primary" onClick={next} disabled={busy}>
            {isLast ? (busy ? t("dictation.scoring") : t("dictation.finish")) : t("dictation.nextSentence")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={check} disabled={busy}>
            {busy ? t("dictation.checking") : t("dictation.check")}
          </button>
        )}
      </div>
    </div>
  );
}
