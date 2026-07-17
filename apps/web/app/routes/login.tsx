import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { createSession, createSessionCookie } from "@bcailab/auth";
import { getAuthEnv } from "~/utils/auth-env.server";
import { getOptionalUser } from "~/utils/auth.server";
import { normalizeEmail, requestLoginCode, verifyLoginCode } from "~/utils/email-otp.server";
import { getClientIp } from "~/utils/translate-quota.server";
import { useThemePreference } from "~/utils/use-theme-preference";

const AUTH_MESSAGE_TYPE = "bcailab-auth";

export const handle = {
  hideHeader: true
};

export const meta: MetaFunction = () => [{ title: "Sign in · bcailab" }];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  return json({ alreadySignedIn: Boolean(user) });
};

type ActionData =
  | { intent: "request"; ok: true; email: string; devCode?: string }
  | { intent: "verify"; ok: true }
  | { intent: "request" | "verify"; ok: false; error: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  if (!email) {
    return json<ActionData>(
      { intent: intent === "verify" ? "verify" : "request", ok: false, error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (intent === "request") {
    const result = await requestLoginCode({
      db: context.env.DB,
      env: context.env,
      email,
      ip: getClientIp(request)
    });
    if (!result.ok) {
      return json<ActionData>({ intent: "request", ok: false, error: result.error }, { status: 429 });
    }
    if (result.devCode) {
      // No email provider configured. Exposing the code in the response is a
      // local-development convenience only — on any deployed host it would let
      // anyone sign in as any email.
      const hostname = new URL(request.url).hostname;
      const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
      if (!isLocal) {
        return json<ActionData>(
          { intent: "request", ok: false, error: "Email sign-in is not configured on this deployment." },
          { status: 503 }
        );
      }
    }
    return json<ActionData>({ intent: "request", ok: true, email, devCode: result.devCode });
  }

  if (intent === "verify") {
    const code = String(formData.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return json<ActionData>(
        { intent: "verify", ok: false, error: "Enter the 6-digit code from the email." },
        { status: 400 }
      );
    }
    const result = await verifyLoginCode({ db: context.env.DB, env: context.env, email, code });
    if (!result.ok) {
      return json<ActionData>({ intent: "verify", ok: false, error: result.error }, { status: 400 });
    }
    const session = await createSession(context.env.DB, result.user.id);
    const setCookie = await createSessionCookie(request, getAuthEnv(context.env), session.id);
    return json<ActionData>({ intent: "verify", ok: true }, { headers: { "Set-Cookie": setCookie } });
  }

  return json<ActionData>({ intent: "request", ok: false, error: "Unknown action." }, { status: 400 });
};

export default function LoginPage() {
  const { alreadySignedIn } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [step, setStep] = React.useState<"email" | "code">("email");
  useThemePreference();

  const busy = fetcher.state !== "idle";
  const data = fetcher.data;
  const errorMessage = data && !data.ok ? data.error : null;
  const devCode = data?.ok && data.intent === "request" ? data.devCode : undefined;

  const finishLogin = React.useCallback(() => {
    try {
      if (window.opener) {
        window.opener.postMessage({ type: AUTH_MESSAGE_TYPE, ok: true }, window.location.origin);
        window.close();
        return;
      }
    } catch {}
    navigate("/", { replace: true });
  }, [navigate]);

  React.useEffect(() => {
    if (data?.ok && data.intent === "request") setStep("code");
    if (data?.ok && data.intent === "verify") finishLogin();
  }, [data, finishLogin]);

  React.useEffect(() => {
    if (alreadySignedIn) finishLogin();
  }, [alreadySignedIn, finishLogin]);

  return (
    <div className="login-page">
      <div className="login-card">
        <img
          src="/brand/logo-64.png"
          srcSet="/brand/logo-64.png 1x, /brand/logo-128.png 2x"
          alt="bcailab"
          width={44}
          height={44}
          className="login-logo"
        />
        <h1 className="login-title">Sign in to bcailab</h1>

        <button
          type="button"
          className="login-google"
          onClick={() => {
            window.location.href = "/auth/google";
          }}
        >
          Continue with Google
        </button>

        <div className="login-divider">
          <span>or use email</span>
        </div>

        {step === "email" ? (
          <fetcher.Form method="post" className="login-form">
            <input type="hidden" name="intent" value="request" />
            <label className="login-label" htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              className="login-input"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <button type="submit" className="login-submit" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send sign-in code"}
            </button>
          </fetcher.Form>
        ) : (
          <fetcher.Form method="post" className="login-form">
            <input type="hidden" name="intent" value="verify" />
            <input type="hidden" name="email" value={email} />
            <label className="login-label" htmlFor="login-code">
              Enter the 6-digit code sent to {email}
            </label>
            <input
              id="login-code"
              className="login-input login-input-code"
              type="text"
              name="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
              autoFocus
              required
            />
            {devCode ? (
              <p className="login-devcode">Dev mode: your code is {devCode}</p>
            ) : null}
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? "Verifying…" : "Verify & sign in"}
            </button>
            <button
              type="button"
              className="login-alt"
              onClick={() => {
                setStep("email");
              }}
            >
              Use a different email
            </button>
          </fetcher.Form>
        )}

        {errorMessage ? <p className="login-error">{errorMessage}</p> : null}
      </div>
    </div>
  );
}
