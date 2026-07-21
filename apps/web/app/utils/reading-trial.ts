/**
 * The fixed sample passage for the anonymous reading trial (design Appendix A).
 *
 * Global content, like the dictation library — it belongs to no user and lives in
 * code rather than `esl_passages`, because the trial evaluates audio directly and
 * never creates a passage or attempt row. `evaluateEslReadingAttempt` takes the
 * passage text as a plain string, so no DB round trip is needed.
 *
 * Client-safe module (no `.server` suffix): the trial page renders this text for
 * the learner to read aloud, and the action passes the same constant to the
 * evaluator. One source of truth, so the scored text always matches what was shown.
 *
 * Chosen to exercise the things the evaluator scores — varied sentence lengths for
 * rhythm, a few consonant clusters and linking opportunities, no proper nouns or
 * unusual vocabulary that would make a beginner stumble on meaning rather than
 * pronunciation. Roughly 30 seconds at a natural pace.
 */
export const READING_TRIAL_PASSAGE_TITLE = "The Morning Walk";

export const READING_TRIAL_PASSAGE_TEXT = `Every morning before work, I take the same short walk through the park near my flat. The path curves past a small pond where a few ducks always seem to be arguing about something. In autumn the ground is covered with wet leaves, and the air smells like rain even when the sky is clear. I used to rush through it, checking my phone and thinking about the day ahead. Now I try to walk slowly and notice things instead. It sounds like a small change, but it makes the whole day feel less crowded.`;
