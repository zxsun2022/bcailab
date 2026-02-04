import type { Env } from "~/types/env";

export const requireEnv = (env: Env, key: keyof Env): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value as string;
};
