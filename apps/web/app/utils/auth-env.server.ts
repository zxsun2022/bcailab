import type { Env } from "~/types/env";
import type { AuthEnv } from "@bcailab/auth";
import { requireEnv } from "~/utils/env.server";

export const getAuthEnv = (env: Env): AuthEnv => ({
  GOOGLE_CLIENT_ID: requireEnv(env, "GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requireEnv(env, "GOOGLE_CLIENT_SECRET"),
  OAUTH_REDIRECT_URL: requireEnv(env, "OAUTH_REDIRECT_URL"),
  SESSION_SECRET: requireEnv(env, "SESSION_SECRET")
});
