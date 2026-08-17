import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  createSessionCookie,
  getSessionId,
  type AuthEnv
} from "./index";

/**
 * The session cookie must stay host-only. A `Domain` attribute reaches every subdomain
 * (RFC 6265 §5.2.3), which would hand `bcailab_session` to map.bcailab.com — a static app
 * with no account feature. `SameSite=lax` does not separate subdomains, because they are
 * same-site; omitting `Domain` is what does.
 *
 * This is exactly the kind of bug that is silent: re-adding `domain` breaks nothing visible
 * and would only surface in a security review. See docs/mapdown/decisions.md D-10.
 */

const env: AuthEnv = {
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  OAUTH_REDIRECT_URL: "https://bcailab.com/auth/callback",
  SESSION_SECRET: "test-session-secret"
};

const requestFrom = (url: string) => new Request(url);

describe("session cookie scope", () => {
  it("sets no Domain attribute on the apex host", async () => {
    const cookie = await createSessionCookie(requestFrom("https://bcailab.com/"), env, "sid-1");
    expect(cookie).not.toMatch(/domain=/i);
  });

  it("sets no Domain attribute on a subdomain either", async () => {
    const cookie = await createSessionCookie(
      requestFrom("https://map.bcailab.com/"),
      env,
      "sid-2"
    );
    expect(cookie).not.toMatch(/domain=/i);
  });

  it("does not widen scope when clearing the session", async () => {
    const cookie = await clearSessionCookie(requestFrom("https://bcailab.com/"), env);
    expect(cookie).not.toMatch(/domain=/i);
  });

  it("keeps the protections that do not depend on Domain", async () => {
    const cookie = await createSessionCookie(requestFrom("https://bcailab.com/"), env, "sid-3");
    expect(cookie).toMatch(/httponly/i);
    expect(cookie).toMatch(/samesite=lax/i);
    expect(cookie).toMatch(/secure/i);
    expect(cookie).toMatch(/^bcailab_session=/);
  });

  it("omits Secure on localhost so local development still signs in", async () => {
    const cookie = await createSessionCookie(requestFrom("http://localhost:5173/"), env, "sid-4");
    expect(cookie).not.toMatch(/secure/i);
  });

  it("accepts cookies signed with the previous secret during rotation", async () => {
    const oldCookie = await createSessionCookie(
      requestFrom("https://bcailab.com/"),
      { ...env, SESSION_SECRET: "old-session-secret" },
      "sid-old"
    );

    const request = new Request("https://bcailab.com/", {
      headers: { Cookie: oldCookie }
    });
    await expect(
      getSessionId(request, {
        ...env,
        SESSION_SECRET: "new-session-secret",
        SESSION_SECRET_PREVIOUS: "old-session-secret"
      })
    ).resolves.toBe("sid-old");
  });
});
