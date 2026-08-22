import { sha256 } from "../../_shared/crypto";
import { verifyMapdownHandoff } from "../../_shared/handoff";
import { ApiError, jsonResponse, readBoundedJson, requireSameOriginMutation, withApiErrors } from "../../_shared/http";
import { createMapdownSession } from "../../_shared/session";

export const onRequestPost: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  requireSameOriginMutation(context.request);
  const audience = new URL(context.request.url).origin;
  const hostname = new URL(context.request.url).hostname;
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
  if (!local && audience !== context.env.MAPDOWN_ORIGIN) {
    throw new ApiError(403, "origin", "This host cannot create a Mapdown session.");
  }
  const body = await readBoundedJson(context.request, 8 * 1024) as { token?: unknown };
  if (!body || typeof body.token !== "string") {
    throw new ApiError(400, "handoff", "The sign-in handoff is missing.");
  }
  let verified;
  try {
    verified = await verifyMapdownHandoff({
      secret: context.env.MAPDOWN_HANDOFF_SECRET,
      token: body.token,
      audience
    });
  } catch {
    throw new ApiError(401, "handoff", "This sign-in handoff is invalid or expired.");
  }
  const nonceHash = await sha256(`bcailab:mapdown-nonce:v1.${verified.nonce}`);
  const consumed = await context.env.DB.prepare(`
    UPDATE mapdown_handoff_nonces
    SET consumed_at = ?
    WHERE nonce_hash = ? AND user_id = ? AND audience = ?
      AND consumed_at IS NULL AND expires_at >= ?
  `).bind(Date.now(), nonceHash, verified.userId, audience, Date.now()).run();
  if (Number(consumed.meta.changes) !== 1) {
    throw new ApiError(401, "handoff", "This sign-in handoff is invalid or was already used.");
  }
  const cookie = await createMapdownSession(context.env.DB, context.request, verified.userId);
  const user = await context.env.DB.prepare(
    "SELECT id, email, name, avatar_url FROM users WHERE id = ? LIMIT 1"
  ).bind(verified.userId).first<{ id: string; email: string; name: string | null; avatar_url: string | null }>();
  if (!user) throw new ApiError(401, "handoff", "This account could not be found.");
  const response = jsonResponse({
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url }
  });
  response.headers.append("Set-Cookie", cookie);
  return response;
}, context.request);
