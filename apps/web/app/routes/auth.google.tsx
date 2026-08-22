import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { startGoogleOAuth } from "@bcailab/auth";
import { getAuthEnv } from "~/utils/auth-env.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const authEnv = getAuthEnv(context.env);
  const url = new URL(request.url);
  const handoffOrigin = url.searchParams.get("handoff") === "mapdown"
    ? url.searchParams.get("origin")
    : null;
  const returnTo = handoffOrigin
    ? `/auth/mapdown?origin=${encodeURIComponent(handoffOrigin)}`
    : undefined;
  const { redirectUrl, headers } = await startGoogleOAuth(request, authEnv, { returnTo });
  return redirect(redirectUrl, { headers });
};
