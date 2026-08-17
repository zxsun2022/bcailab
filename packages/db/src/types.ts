/// <reference types="@cloudflare/workers-types" />

export type Db = D1Database;

export type User = {
  id: string;
  google_sub: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Post = {
  id: string;
  user_id: string;
  content_md: string;
  content_html: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TtsGeneration = {
  id: string;
  user_id: string;
  input_text: string;
  processed_text: string;
  input_mode: string;
  language_code: string;
  voice_name: string;
  audio_format: string;
  r2_key: string;
  audio_bytes: number;
  created_at: string;
  deleted_at: string | null;
};

export type EslReadingAttempt = {
  id: string;
  passage_id: string;
  user_id: string;
  mode: string;
  audio_format: string;
  audio_mime_type: string;
  r2_key: string;
  audio_bytes: number;
  duration_ms: number | null;
  evaluation_status: "pending" | "completed" | "failed";
  created_at: string;
  deleted_at: string | null;
};

export type EslLearnerProfile = {
  id: string;
  user_id: string;
  persistent_issues_json: string;
  strengths_json: string;
  cefr_estimate: string | null;
  total_practice_seconds: number;
  total_attempts: number;
  eval_count_since_update: number;
  // Learner model (migration 0014). Deterministic per-tag mastery, plus level
  // self-selection resolved into cefr_estimate. Design: docs/learner-model-design.md.
  tag_mastery_json: string;
  cefr_declared: string | null;
  cefr_measured: string | null;
  cefr_measured_confidence: number;
  created_at: string;
  updated_at: string;
};

export type EslReadingEvaluation = {
  id: string;
  attempt_id: string;
  user_id: string;
  model_name: string;
  rubric_version: string;
  output_json: string;
  created_at: string;
};

export type EslReadingAttemptWithEvaluation = EslReadingAttempt & {
  passage_title: string | null;
  passage_content_text: string;
  evaluation_output_json: string;
};

export type WritingArticle = {
  id: string;
  user_id: string;
  title: string | null;
  essay_prompt: string | null;
  prompt_id: string | null;
  assignment_snapshot_json: string | null;
  start_key: string | null;
  agent_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WritingRevision = {
  id: string;
  article_id: string;
  user_id: string;
  round_number: number;
  user_text: string;
  word_count: number;
  feedback_json: string | null;
  feedback_status: "pending" | "completed" | "failed";
  model_name: string | null;
  feedback_generation: number;
  feedback_started_at: string | null;
  created_at: string;
};

export type GoogleProfile = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

export type LoginCode = {
  id: string;
  email: string;
  code_hash: string;
  ip: string | null;
  expires_at: number;
  attempts: number;
  consumed_at: string | null;
  created_at: string;
};


export type TranslateUsage = {
  subject: string;
  day: string;
  requests: number;
  chars: number;
};


export type FeatureUsage = {
  feature: string;
  subject: string;
  day: string;
  requests: number;
  units: number;
};


export type DictationPassage = {
  id: string;
  band: string;
  topic: string;
  title: string;
  voice_name: string;
  sentence_count: number;
  status: string;
  created_at: string;
  deleted_at: string | null;
};

export type DictationSentence = {
  id: string;
  passage_id: string;
  idx: number;
  text: string;
  r2_key: string;
  audio_bytes: number;
};

export type DictationAttempt = {
  id: string;
  user_id: string;
  passage_id: string;
  accuracy: number;
  sentence_results: string;
  feedback_json: string | null;
  /** 'in_progress' while the learner is still working through the passage. */
  status: string;
  sentences_done: number;
  created_at: string;
  deleted_at: string | null;
};

export type Passage = {
  id: string;
  /** NULL for global library content. */
  user_id: string | null;
  title: string;
  content_text: string;
  band: string | null;
  topic: string | null;
  word_count: number;
  sentence_count: number;
  mean_sentence_words: number;
  rare_word_ratio: number;
  has_sentence_audio: number;
  is_trial: number;
  /** Mirrors the old esl_passages status union so callers can switch on it. */
  reference_audio_status: "pending" | "completed" | "failed" | null;
  reference_audio_r2_key: string | null;
  reference_audio_bytes: number | null;
  reference_voice_name: string | null;
  reference_audio_created_at: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PassageSentence = {
  id: string;
  passage_id: string;
  idx: number;
  text: string;
  r2_key: string | null;
  audio_bytes: number | null;
};

export type PassageTag = { tag: string; count: number };

export type RecentReadingAttempt = {
  id: string;
  passage_id: string;
  passage_title: string | null;
  created_at: string;
  /** 0..100 overall score from the latest evaluation, null while it is still pending. */
  overall_score: number | null;
};

export type ReadingPassageStat = {
  passage_id: string;
  attempts: number;
  /** 0..100 best overall score, null while nothing has been evaluated yet. */
  best_score: number | null;
  /** Attempts still waiting on an evaluation. */
  pending: number;
};

export type PassageStats = {
  passage_id: string;
  mode: string;
  attempt_count: number;
  accuracy_sum: number;
};

export type LearnerTagObservationRow = {
  tag: string;
  exposure: number;
  hits: number;
  source: "deterministic" | "llm";
};
