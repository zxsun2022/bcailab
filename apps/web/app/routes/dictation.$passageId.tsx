import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import {
  createDictationAttempt,
  getLibraryPassageById,
  listPassageSentences
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
import { openLoginPopup } from "~/utils/login-popup";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.passage ? `${data.passage.title} · Dictation · bcailab` : "Dictation · bcailab" }
];

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const passageId = params.passageId;
  if (!passageId) throw new Response("Not found", { status: 404 });

  const passage = await getLibraryPassageById(context.env.DB, passageId);
  if (!passage) throw new Response("Not found", { status: 404 });

  const user = await getOptionalUser(request, context);
  const subject = resolveQuotaSubject(request, user?.id ?? null);
  const quota = await getFeatureQuotaStatus(context.env.DB, "dictation", subject);

  const sentences = await listPassageSentences(context.env.DB, passageId);

  return json(
    {
      authed: Boolean(user),
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

type SentenceResult = {
  idx: number;
  userText: string;
  accuracy: number;
  replays: number;
  ops: DiffOp[];
};

type ActionData =
  | { intent: "check"; idx: number; accuracy: number; ops: DiffOp[]; reference: string }
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

  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "");
  const sentences = await listPassageSentences(context.env.DB, passageId);

  if (intent === "check") {
    const idx = Number(formData.get("idx"));
    const userText = String(formData.get("text") ?? "");
    const sentence = sentences.find((item) => item.idx === idx);
    if (!sentence) {
      return json<ActionData>({ ok: false, error: "Unknown sentence." }, { status: 400, headers: extraHeaders });
    }

    // Quota is charged once per session, on the first sentence.
    if (idx === 0) {
      const quota = await getFeatureQuotaStatus(context.env.DB, "dictation", subject);
      if (!quota.allowed) {
        return json<ActionData>(
          {
            ok: false,
            code: "quota_exceeded",
            error: user
              ? "Daily dictation limit reached. Please come back tomorrow."
              : "You've used today's free dictation practice. Sign in to keep going — it's free."
          },
          { status: 429, headers: extraHeaders }
        );
      }
      await recordFeatureUsage(context.env.DB, "dictation", subject);
    }

    const diff = scoreSentence(sentence.text, userText);
    return json<ActionData>(
      {
        intent: "check",
        idx,
        accuracy: diff.accuracy,
        ops: diff.ops,
        reference: sentence.text
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
      return json<ActionData>({ ok: false, error: "Malformed submission." }, { status: 400, headers: extraHeaders });
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

    let attemptId: string | null = null;
    if (user) {
      const attempt = await createDictationAttempt(context.env.DB, {
        userId: user.id,
        passageId,
        accuracy: scored.accuracy,
        sentenceResults: JSON.stringify(results)
      });
      attemptId = attempt.id;
      // Background: fills feedback_json, which the summary panel polls for.
      // Deliberately not awaited — feedback failure must not fail the attempt.
      await scheduleDictationFeedback(context, {
        attemptId: attempt.id,
        userId: user.id,
        // Library passages are always banded; the column is nullable only because
        // user-supplied passages share the table and are left untagged (design §5.4).
        band: passage.band ?? "B1",
        results
      });
    }

    return json<ActionData>(
      { intent: "complete", accuracy: scored.accuracy, results, attemptId },
      { headers: extraHeaders }
    );
  }

  return json<ActionData>({ ok: false, error: "Unknown action." }, { status: 400, headers: extraHeaders });
};

/* ---------- diff rendering ---------- */

function DiffTokens({ ops }: { ops: DiffOp[] }) {
  return (
    <p className="dictation-diff">
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
        <p className="dictation-feedback-panel-title">Looking for patterns in your errors…</p>
      </div>
    );
  }

  return (
    <div className="dictation-feedback-panel">
      <p className="dictation-feedback-panel-title">What to work on</p>
      <ul className="dictation-pattern-list">
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
  const { authed, quota, passage, sentences } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();

  const [current, setCurrent] = React.useState(0);
  const [answers, setAnswers] = React.useState<string[]>(() => sentences.map(() => ""));
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
        ? "Daily dictation limit reached. Please come back tomorrow."
        : "You've used today's free dictation practice. Sign in to keep going — it's free."
  );

  const [audioState, setAudioState] = React.useState<"idle" | "loading" | "playing">("idle");
  const [progress, setProgress] = React.useState(0);

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
    fetcher.submit(
      { _intent: "check", idx: String(current), text: answers[current] ?? "" },
      { method: "post" }
    );
  };

  const next = () => {
    if (isLast) {
      fetcher.submit(
        {
          _intent: "complete",
          answers: JSON.stringify(answers),
          // Replays are listens beyond the first, so a sentence heard once reports 0.
          replays: JSON.stringify(playCounts.map((count) => Math.max(0, count - 1)))
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
        <h1 className="dictation-gate-title">Come back tomorrow</h1>
        <p className="dictation-gate-body">{gate}</p>
        {!authed ? (
          <button type="button" className="dictation-primary" onClick={() => openLoginPopup()}>
            Sign in — it's free
          </button>
        ) : null}
        <Link to="/dictation" className="dictation-secondary">
          Back to library
        </Link>
      </div>
    );
  }

  if (summary) {
    return (
      <div className="dictation-summary">
        <header className="dictation-summary-header">
          <span className="dictation-summary-band">{passage.band}</span>
          <h1 className="dictation-summary-title">{passage.title}</h1>
          <p className="dictation-summary-score">{Math.round(summary.accuracy * 100)}%</p>
          <p className="dictation-summary-label">overall accuracy</p>
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
                    {result.replays} replay{result.replays === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <p className="dictation-summary-item-text">{result.userText || <em>(blank)</em>}</p>
              {result.ops.length > 0 ? <DiffTokens ops={result.ops} /> : null}
            </li>
          ))}
        </ol>

        {summary.attemptId ? <FeedbackPanel attemptId={summary.attemptId} /> : null}

        {!authed ? (
          <div className="dictation-cta">
            <p className="dictation-cta-text">
              Sign in to save your progress and get coach feedback on your error patterns.
            </p>
            <button type="button" className="dictation-primary" onClick={() => openLoginPopup()}>
              Sign in — it's free
            </button>
          </div>
        ) : null}

        <Link to="/dictation" className="dictation-secondary">
          Back to library
        </Link>
      </div>
    );
  }

  return (
    <div className="dictation-session">
      <header className="dictation-session-header">
        <Link to="/dictation" className="dictation-breadcrumb">
          ← Library
        </Link>
        <span className="dictation-session-band">{passage.band}</span>
        <h1 className="dictation-session-title">{passage.title}</h1>
        <p className="dictation-progress">
          Sentence {current + 1} of {total}
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
            const el = event.currentTarget;
            if (el.duration > 0) setProgress(el.currentTime / el.duration);
          }}
          onError={() => setAudioState("idle")}
        />
      ) : null}

      <div className="dictation-controls">
        <button
          type="button"
          className={`dictation-play${audioState === "playing" ? " is-playing" : ""}`}
          onClick={play}
          aria-label={currentPlays === 0 ? "Play sentence" : "Play sentence again"}
        >
          <span className="dictation-play-icon" aria-hidden="true" />
          <span className="dictation-play-label">
            {audioState === "loading"
              ? "Loading…"
              : audioState === "playing"
                ? "Playing…"
                : currentPlays === 0
                  ? "Play"
                  : "Replay"}
          </span>
          <span
            className="dictation-play-progress"
            style={{ transform: `scaleX(${audioState === "idle" && progress === 0 ? 0 : progress})` }}
          />
        </button>

        <div className="dictation-speed" role="group" aria-label="Playback speed">
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
            {currentPlays} listens
          </span>
        ) : null}
      </div>

      <textarea
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
        placeholder="Type what you hear…"
        rows={3}
        disabled={Boolean(currentChecked)}
      />

      {currentChecked ? (
        <div className="dictation-feedback">
          <p className="dictation-feedback-score">
            {Math.round(currentChecked.accuracy * 100)}% correct
          </p>
          <DiffTokens ops={currentChecked.ops} />
          <p className="dictation-reference">{currentChecked.reference}</p>
        </div>
      ) : null}

      <div className="dictation-actions">
        {currentChecked ? (
          <button type="button" className="dictation-primary" onClick={next} disabled={busy}>
            {isLast ? (busy ? "Scoring…" : "Finish") : "Next sentence"}
          </button>
        ) : (
          <button type="button" className="dictation-primary" onClick={check} disabled={busy}>
            {busy ? "Checking…" : "Check"}
          </button>
        )}
      </div>
    </div>
  );
}
