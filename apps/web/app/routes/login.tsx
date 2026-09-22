import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { createSession, createSessionCookie } from "@bcailab/auth";
import { getUserCredentialByEmail, setUserPassword } from "@bcailab/db";
import { getAuthEnv } from "~/utils/auth-env.server";
import { getOptionalUser } from "~/utils/auth.server";
import {
  normalizeEmail,
  requestLoginCode,
  verifyLoginCode,
  type LoginCodeFailure
} from "~/utils/email-otp.server";
import { hashPassword, verifyPassword } from "~/utils/password.server";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "~/utils/password";
import { getClientIp } from "~/utils/translate-quota.server";
import { useThemePreference } from "~/utils/use-theme-preference";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestLocale, getRequestTranslator } from "~/i18n/locale.server";
import type { MessageKey } from "~/i18n/translate";

const AUTH_MESSAGE_TYPE = "bcailab-auth";

export const handle = {
  hideHeader: true
};

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.login.title") }
];

const LOGIN_CODE_FAILURE: Record<LoginCodeFailure, MessageKey> = {
  rate_limited: "login.error.rateLimited",
  send_failed: "login.error.sendFailed",
  expired: "login.error.expired",
  too_many_attempts: "login.error.tooManyAttempts",
  incorrect: "login.error.incorrectCode"
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  const url = new URL(request.url);
  const handoffOrigin = url.searchParams.get("handoff") === "mapdown"
    ? url.searchParams.get("origin")
    : null;
  return json({ alreadySignedIn: Boolean(user), handoffOrigin });
};

type Intent = "request" | "verify" | "password" | "reset";

type ActionData =
  | { intent: "request"; ok: true; email: string; devCode?: string }
  | { intent: "verify" | "password" | "reset"; ok: true }
  | { intent: Intent; ok: false; error: string };

const asIntent = (raw: string): Intent =>
  raw === "verify" || raw === "password" || raw === "reset" ? raw : "request";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = asIntent(String(formData.get("intent") ?? ""));
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  // Every error below is shown to the visitor as written, in the interface language.
  const t = getRequestTranslator(request);

  if (!email) {
    return json<ActionData>(
      { intent, ok: false, error: t("login.error.email") },
      { status: 400 }
    );
  }

  if (intent === "password") {
    const password = String(formData.get("password") ?? "");
    // Deliberately generic: never reveal whether the email exists or has a password.
    // PBKDF2's cost is the primary brute-force mitigation on this endpoint.
    const invalid = json<ActionData>(
      { intent: "password", ok: false, error: t("login.error.credentials") },
      { status: 400 }
    );
    if (!password) return invalid;
    const credential = await getUserCredentialByEmail(context.env.DB, email);
    if (!credential?.passwordHash) return invalid;
    if (!(await verifyPassword(password, credential.passwordHash))) return invalid;
    const session = await createSession(context.env.DB, credential.userId);
    const setCookie = await createSessionCookie(request, getAuthEnv(context.env), session.id);
    return json<ActionData>({ intent: "password", ok: true }, { headers: { "Set-Cookie": setCookie } });
  }

  if (intent === "reset") {
    // Reset reuses the same email OTP as login: request a code (intent "request"), then
    // submit it here with a new password. A valid code both sets the password and signs in.
    const code = String(formData.get("code") ?? "").trim();
    const newPassword = String(formData.get("password") ?? "");
    if (!/^\d{6}$/.test(code)) {
      return json<ActionData>(
        { intent: "reset", ok: false, error: t("login.error.codeFormat") },
        { status: 400 }
      );
    }
    if (validatePasswordStrength(newPassword)) {
      return json<ActionData>(
        {
          intent: "reset",
          ok: false,
          error: t("login.error.passwordLength", { min: MIN_PASSWORD_LENGTH })
        },
        { status: 400 }
      );
    }
    const result = await verifyLoginCode({ db: context.env.DB, env: context.env, email, code });
    if (!result.ok) {
      return json<ActionData>(
        { intent: "reset", ok: false, error: t(LOGIN_CODE_FAILURE[result.code]) },
        { status: 400 }
      );
    }
    await setUserPassword(context.env.DB, result.user.id, await hashPassword(newPassword));
    const session = await createSession(context.env.DB, result.user.id);
    const setCookie = await createSessionCookie(request, getAuthEnv(context.env), session.id);
    return json<ActionData>({ intent: "reset", ok: true }, { headers: { "Set-Cookie": setCookie } });
  }

  if (intent === "request") {
    const result = await requestLoginCode({
      db: context.env.DB,
      env: context.env,
      email,
      ip: getClientIp(request),
      locale: getRequestLocale(request)
    });
    if (!result.ok) {
      return json<ActionData>(
        { intent: "request", ok: false, error: t(LOGIN_CODE_FAILURE[result.code]) },
        { status: 429 }
      );
    }
    if (result.devCode) {
      // No email provider configured. Exposing the code in the response is a
      // local-development convenience only — on any deployed host it would let
      // anyone sign in as any email.
      const hostname = new URL(request.url).hostname;
      const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
      if (!isLocal) {
        return json<ActionData>(
          { intent: "request", ok: false, error: t("login.error.notConfigured") },
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
        { intent: "verify", ok: false, error: t("login.error.codeFormat") },
        { status: 400 }
      );
    }
    const result = await verifyLoginCode({ db: context.env.DB, env: context.env, email, code });
    if (!result.ok) {
      return json<ActionData>(
        { intent: "verify", ok: false, error: t(LOGIN_CODE_FAILURE[result.code]) },
        { status: 400 }
      );
    }
    const session = await createSession(context.env.DB, result.user.id);
    const setCookie = await createSessionCookie(request, getAuthEnv(context.env), session.id);
    return json<ActionData>({ intent: "verify", ok: true }, { headers: { "Set-Cookie": setCookie } });
  }

  return json<ActionData>({ intent: "request", ok: false, error: t("common.unknownAction") }, { status: 400 });
};

type Mode = "code" | "password" | "reset";

export default function LoginPage() {
  const { alreadySignedIn, handoffOrigin } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("code");
  // For the code and reset flows: "email" collects the address, "code" collects the OTP.
  const [step, setStep] = React.useState<"email" | "code">("email");
  useThemePreference();
  const t = useT();

  const busy = fetcher.state !== "idle";
  const data = fetcher.data;
  const errorMessage = data && !data.ok ? data.error : null;
  const devCode = data?.ok && data.intent === "request" ? data.devCode : undefined;

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep("email");
  };

  const finishLogin = React.useCallback(() => {
    if (handoffOrigin) {
      window.location.assign(`/auth/mapdown?origin=${encodeURIComponent(handoffOrigin)}`);
      return;
    }
    try {
      if (window.opener) {
        window.opener.postMessage({ type: AUTH_MESSAGE_TYPE, ok: true }, window.location.origin);
        window.close();
        return;
      }
    } catch {
      // Popup messaging is best effort; fall back to in-page navigation.
    }
    navigate("/", { replace: true });
  }, [handoffOrigin, navigate]);

  React.useEffect(() => {
    if (data?.ok && data.intent === "request") setStep("code");
    if (data?.ok && (data.intent === "verify" || data.intent === "password" || data.intent === "reset")) {
      finishLogin();
    }
  }, [data, finishLogin]);

  React.useEffect(() => {
    if (alreadySignedIn) finishLogin();
  }, [alreadySignedIn, finishLogin]);

  const emailField = (
    <>
      <label className="login-label" htmlFor="login-email">
        {t("login.email")}
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
    </>
  );

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
        <h1 className="login-title">{t("login.title")}</h1>

        <button
          type="button"
          className="login-google"
          onClick={() => {
            window.location.href = handoffOrigin
              ? `/auth/google?handoff=mapdown&origin=${encodeURIComponent(handoffOrigin)}`
              : "/auth/google";
          }}
        >
          {t("login.google")}
        </button>

        <div className="login-divider">
          <span>{t("login.orEmail")}</span>
        </div>

        {mode === "password" ? (
          <fetcher.Form method="post" className="login-form">
            <input type="hidden" name="intent" value="password" />
            {emailField}
            <label className="login-label" htmlFor="login-password">
              {t("login.password")}
            </label>
            <input
              id="login-password"
              className="login-input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
            <button type="submit" className="login-submit" disabled={busy || !email.trim()}>
              {busy ? t("login.signingIn") : t("common.signIn")}
            </button>
            <button type="button" className="login-alt" onClick={() => switchMode("code")}>
              {t("login.useCode")}
            </button>
            <button type="button" className="login-alt" onClick={() => switchMode("reset")}>
              {t("login.forgot")}
            </button>
          </fetcher.Form>
        ) : mode === "reset" ? (
          step === "email" ? (
            <fetcher.Form method="post" className="login-form">
              <input type="hidden" name="intent" value="request" />
              {emailField}
              <button type="submit" className="login-submit" disabled={busy || !email.trim()}>
                {busy ? t("login.sending") : t("login.sendReset")}
              </button>
              <button type="button" className="login-alt" onClick={() => switchMode("password")}>
                {t("login.backToPassword")}
              </button>
            </fetcher.Form>
          ) : (
            <fetcher.Form method="post" className="login-form">
              <input type="hidden" name="intent" value="reset" />
              <input type="hidden" name="email" value={email} />
              <label className="login-label" htmlFor="reset-code">
                {t("login.enterCode", { email })}
              </label>
              <input
                id="reset-code"
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
              <label className="login-label" htmlFor="reset-password">
                {t("login.newPassword")}
              </label>
              <input
                id="reset-password"
                className="login-input"
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                placeholder={t("login.passwordMin", { min: MIN_PASSWORD_LENGTH })}
                required
              />
              {devCode ? (
                <p className="login-devcode">{t("login.devCode", { code: devCode })}</p>
              ) : null}
              <button type="submit" className="login-submit" disabled={busy}>
                {busy ? t("login.saving") : t("login.setPassword")}
              </button>
              <button type="button" className="login-alt" onClick={() => setStep("email")}>
                {t("login.differentEmail")}
              </button>
            </fetcher.Form>
          )
        ) : step === "email" ? (
          <fetcher.Form method="post" className="login-form">
            <input type="hidden" name="intent" value="request" />
            {emailField}
            <button type="submit" className="login-submit" disabled={busy || !email.trim()}>
              {busy ? t("login.sending") : t("login.sendCode")}
            </button>
            <button type="button" className="login-alt" onClick={() => switchMode("password")}>
              {t("login.usePassword")}
            </button>
          </fetcher.Form>
        ) : (
          <fetcher.Form method="post" className="login-form">
            <input type="hidden" name="intent" value="verify" />
            <input type="hidden" name="email" value={email} />
            <label className="login-label" htmlFor="login-code">
              {t("login.enterCode", { email })}
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
              <p className="login-devcode">{t("login.devCode", { code: devCode })}</p>
            ) : null}
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? t("login.verifying") : t("login.verify")}
            </button>
            <button
              type="button"
              className="login-alt"
              onClick={() => {
                setStep("email");
              }}
            >
              {t("login.differentEmail")}
            </button>
          </fetcher.Form>
        )}

        {errorMessage ? (
          <p className="login-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
