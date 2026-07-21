-- Persist partial dictation practice.
--
-- Until now an attempt row was only written when the learner finished every sentence of a
-- passage, so abandoning halfway produced nothing: no history, no feedback, no signal.
-- Production accumulated zero dictation attempts as a result.
--
-- An attempt row now exists from the first checked sentence and is updated as the learner
-- goes, which also makes resuming possible.

-- 'in_progress' | 'completed'. Existing rows were only ever written on completion, so the
-- default keeps them correct.
ALTER TABLE dictation_attempts ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';

-- How many sentences have been checked. Lets history distinguish "3 of 11" from a finished
-- attempt without parsing sentence_results.
ALTER TABLE dictation_attempts ADD COLUMN sentences_done INTEGER NOT NULL DEFAULT 0;

-- Resume looks up the learner's unfinished attempt for a passage.
CREATE INDEX dictation_attempts_resume_idx
  ON dictation_attempts(user_id, passage_id, status);
