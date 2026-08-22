import { jsonResponse, requireSameOriginMutation, withApiErrors } from "../../_shared/http";
import { clearMapdownSession } from "../../_shared/session";

export const onRequestPost: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  requireSameOriginMutation(context.request);
  const cookie = await clearMapdownSession(context.env.DB, context.request);
  const response = jsonResponse({ ok: true });
  response.headers.append("Set-Cookie", cookie);
  return response;
}, context.request);
