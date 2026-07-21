import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import {
  createDictationAttempt,
  getDictationPassageById,
  listDictationSentences
} from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import {
  getFeatureQuotaStatus,
  recordFeatureUsage,
  resolveQuotaSubject
} from "~/utils/feature-quota.server";
import { scorePassage, scoreSentence, storableOps, type DiffOp } from "~/utils/dictation-diff";
import { openLoginPopup } from "~/utils/login-popup";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.passage ? `${data.passage.title} · Dictation · bcailab` : "Dictation · bcailab" }
];

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const passageId = params.passageId;
  if (!passageId) throw new Response("Not found", { status: 404 });

  const passage = await getDictationPassageById(context.env.DB, passageId);
  if (!passage) throw new Response("Not found", { status: 404 });

  const user = await getOptionalUser(request, context);
  const subject = resolveQuotaSubject(request, user?.id ?? null);
  const quota = await getFeatureQuotaStatus(context.env.DB, "dictation", subject);

  const sentences = await listDictationSentences(context.env.DB, passageId);

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

  const passage = await getDictationPassageById(context.env.DB, passageId);
  if (!passage) throw new Response("Not found", { status: 404 });

  const user = await getOptionalUser(request, context);
  const subject = resolveQuotaSubject(request, user?.id ?? null);
  const extraHeaders = subject.setCookie ? { "Set-Cookie": subject.setCookie } : undefined;

  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "");
  const sentences = await listDictationSentences(context.env.DB, passageId);

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

/* ---------- page ---------- */

export default function DictationSession() {
  const { authed, quota, passage, sentences } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();

  const [current, setCurrent] = React.useState(0);
  const [answers, setAnswers] = React.useState<string[]>(() => sentences.map(() => ""));
  const [replays, setReplays] = React.useState<number[]>(() => sentences.map(() => 0));
  const [checked, setChecked] = React.useState<Record<number, { accuracy: number; ops: DiffOp[]; reference: string }>>({});
  const [summary, setSummary] = React.useState<{ accuracy: number; results: SentenceResult[] } | null>(null);
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

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

  const total = sentences.length;
  const isLast = current === total - 1;
  const currentSentence = sentences[current];
  const currentChecked = checked[current];

  // Apply the speed toggle to whichever clip is loaded.
  React.useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, current]);

  // Autoplay on advance, and put the cursor in the input.
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
    audio.play().catch(() => {
      // Autoplay can be blocked before any user gesture; the replay button covers it.
    });
    inputRef.current?.focus();
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
      setSummary({ accuracy: data.accuracy, results: data.results });
    }
  }, [fetcher.data]);

  const busy = fetcher.state !== "idle";

  const replay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.playbackRate = speed;
    audio.play().catch(() => {});
    setReplays((prev) => {
      const next = [...prev];
      next[current] = (next[current] ?? 0) + 1;
      return next;
    });
  };

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
          replays: JSON.stringify(replays)
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
        />
      ) : null}

      <div className="dictation-controls">
        <button type="button" className="dictation-primary" onClick={replay}>
          ▶ Replay
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
