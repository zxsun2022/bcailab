import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { clearSessionCookie, destroySession, getSessionId } from "@bcailab/auth";
import { getAuthEnv } from "~/utils/auth-env.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const authEnv = getAuthEnv(context.env);
  const sessionId = await getSessionId(request, authEnv);
  await destroySession(context.env.DB, sessionId);
  const setCookie = await clearSessionCookie(request, authEnv);
  return redirect("/", {
    headers: {
      "Set-Cookie": setCookie
    }
  });
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  return action({ request, context, params: {} });
};
