import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { startGoogleOAuth } from "@bcailab/auth";
import { getAuthEnv } from "~/utils/auth-env.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const authEnv = getAuthEnv(context.env);
  const { redirectUrl, headers } = await startGoogleOAuth(request, authEnv);
  return redirect(redirectUrl, { headers });
};
