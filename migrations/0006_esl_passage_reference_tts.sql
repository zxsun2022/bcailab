ALTER TABLE esl_passages
ADD COLUMN reference_tts_status TEXT;

ALTER TABLE esl_passages
ADD COLUMN reference_tts_voice_name TEXT;

ALTER TABLE esl_passages
ADD COLUMN reference_tts_r2_key TEXT;

ALTER TABLE esl_passages
ADD COLUMN reference_tts_audio_bytes INTEGER;

ALTER TABLE esl_passages
ADD COLUMN reference_tts_created_at TEXT;
