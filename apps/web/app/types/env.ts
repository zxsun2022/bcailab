/// <reference types="@cloudflare/workers-types" />

export type Env = {
  DB: D1Database;
  R2: R2Bucket;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  OAUTH_REDIRECT_URL: string;
  SESSION_SECRET: string;
};
