import { redirect } from "@remix-run/cloudflare";
import { getSessionUser } from "@bcailab/auth";
import type { AppLoadContext } from "@remix-run/cloudflare";

export const requireUser = async (request: Request, context: AppLoadContext) => {
  const user = await getSessionUser(request, context.env, context.env.DB);
  if (!user) {
    throw redirect("/?login=1");
  }
  return user;
};

export const getOptionalUser = (request: Request, context: AppLoadContext) => {
  return getSessionUser(request, context.env, context.env.DB);
};
