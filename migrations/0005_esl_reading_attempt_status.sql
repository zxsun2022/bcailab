ALTER TABLE esl_reading_attempts
ADD COLUMN evaluation_status TEXT NOT NULL DEFAULT 'completed';
