-- One Reading evaluation run at a time, identified and timed.
--
-- Staleness used to be measured from the attempt's created_at, so a retry was stale on its first
-- poll: the page stopped waiting and offered another retry. And nothing stopped two retries from
-- each starting a model call.
--
-- evaluation_run_id: the run that currently owns the attempt. A run is claimed with one
-- conditional UPDATE, so only one of two concurrent requests can start a model call, and a
-- failure is written only by the run that still owns the attempt.
-- evaluation_started_at: when that run started; staleness is measured from here.
--
-- Both nullable: attempts from before this migration fall back to created_at. Backward
-- compatible, so apply before deploying the code that writes them (ADR 0008).

ALTER TABLE esl_reading_attempts ADD COLUMN evaluation_run_id TEXT;
ALTER TABLE esl_reading_attempts ADD COLUMN evaluation_started_at TEXT;
