import { jsonResponse, withApiErrors } from "../../_shared/http";
import { optionalMapdownUser } from "../../_shared/session";

export const onRequestGet: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  return jsonResponse({ user: await optionalMapdownUser(context.env.DB, context.request) });
}, context.request);
