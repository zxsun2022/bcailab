/// <reference types="@cloudflare/workers-types" />

export type Env = {
  DB: D1Database;
  R2: R2Bucket;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_TTS_SERVICE_ACCOUNT_JSON: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_BASE_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  OAUTH_REDIRECT_URL: string;
  SESSION_SECRET: string;
};

export type AppExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
};
