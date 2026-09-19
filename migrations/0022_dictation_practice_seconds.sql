-- Active practice time for a dictation attempt, so dictation contributes to
-- esl_learner_profiles.total_practice_seconds instead of adding 0.
--
-- The client measures active time (idle and hidden-tab time excluded; docs/tools/dictation.md)
-- and reports the attempt's running total with every check. The server only ever raises the
-- stored value, so a retried request or a resumed attempt cannot count the same time twice.
--
-- Existing rows default to 0: historical attempts are not back-estimated. Backward compatible,
-- so apply before deploying the code that writes it (ADR 0008).

ALTER TABLE dictation_attempts ADD COLUMN practice_seconds INTEGER NOT NULL DEFAULT 0;
