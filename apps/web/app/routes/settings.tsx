import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { getUserPasswordHash, setUserPassword, updateUserProfile } from "@bcailab/db";
import { StudioShell } from "~/components/StudioShell";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { requireUser } from "~/utils/auth.server";
import { hashPassword, verifyPassword } from "~/utils/password.server";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "~/utils/password";
import { useThemePreference, type ThemePreference } from "~/utils/use-theme-preference";
import {
  FEEDBACK_LANGUAGE_PREFERENCES,
  type FeedbackLanguagePreference
} from "~/utils/feedback-language";
import { useFeedbackLanguagePreference } from "~/utils/use-feedback-language";
import { useLocale, useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestTranslator } from "~/i18n/locale.server";
import { LOCALES, LOCALE_AUTONYMS } from "~/i18n/locale";

const MAX_NAME_LENGTH = 80;
const THEME_PREFERENCES = ["system", "light", "dark"] as const satisfies readonly ThemePreference[];
const THEME_LABEL_KEYS = { system: "theme.auto", light: "theme.light", dark: "theme.dark" } as const;

export const handle = {
  hideHeader: true,
  hideHeaderUserMenu: true
};

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.settings.title") }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const hasPassword = (await getUserPasswordHash(context.env.DB, user.id)) !== null;
  return json({
    user: { name: user.name, email: user.email, avatar_url: user.avatar_url },
    hasPassword
  });
};

type ActionData =
  | { section: "name" | "password"; ok: true }
  | { section: "name" | "password"; ok: false; error: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  // Errors below are shown as written, in the interface language.
  const t = getRequestTranslator(request);

  if (intent === "update-name") {
    const name = String(form.get("name") ?? "").trim();
    if (name.length > MAX_NAME_LENGTH) {
      return json<ActionData>(
        { section: "name", ok: false, error: t("profile.error.nameTooLong", { max: MAX_NAME_LENGTH }) },
        { status: 400 }
      );
    }
    // The avatar is not user-editable: it comes from Google, or falls back to the default
    // placeholder. This update deliberately touches the display name only.
    await updateUserProfile(context.env.DB, user.id, { name: name || null });
    return json<ActionData>({ section: "name", ok: true });
  }

  if (intent === "set-password") {
    const current = String(form.get("current_password") ?? "");
    const next = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    const existing = await getUserPasswordHash(context.env.DB, user.id);
    // Changing an existing password requires proving the current one; setting the first
    // password only requires the authenticated session.
    if (existing && !(await verifyPassword(current, existing))) {
      return json<ActionData>(
        { section: "password", ok: false, error: t("profile.error.currentIncorrect") },
        { status: 400 }
      );
    }
    if (validatePasswordStrength(next)) {
      return json<ActionData>(
        { section: "password", ok: false, error: t("login.error.passwordLength", { min: MIN_PASSWORD_LENGTH }) },
        { status: 400 }
      );
    }
    if (next !== confirm) {
      return json<ActionData>(
        { section: "password", ok: false, error: t("profile.error.mismatch") },
        { status: 400 }
      );
    }
    await setUserPassword(context.env.DB, user.id, await hashPassword(next));
    return json<ActionData>({ section: "password", ok: true });
  }

  return json<ActionData>({ section: "name", ok: false, error: t("common.unknownAction") }, { status: 400 });
};

/**
 * Account and preferences, on one page (owner decision, 2026-09-22).
 *
 * It replaced `/profile` and the per-tool settings pages. Every item is one row — what it is
 * and what it does on the left, the control on the right — in two groups:
 *
 * - **Account** is stored on the server, so each change is an explicit save.
 * - **Preferences** are one choice among a few; they apply the moment they are picked, and
 *   the group says so.
 *
 * Signing out lives in the account menu, not here.
 */
export default function SettingsPage() {
  const { user, hasPassword } = useLoaderData<typeof loader>();
  const t = useT();

  return (
    <StudioShell user={user}>
      <div className="studio-main-scroll">
        <StudioPage width="standard">
          <StudioPageHeader title={t("settings.title")} description={t("settings.description")} />
          <StudioPageBody className="settings-page">
            <section className="settings-group" aria-labelledby="settings-account">
              <h2 id="settings-account" className="settings-group-title">
                {t("settings.accountGroup")}
              </h2>
              <AccountRows user={user} hasPassword={hasPassword} />
            </section>

            <section className="settings-group" aria-labelledby="settings-preferences">
              <div className="settings-group-head">
                <h2 id="settings-preferences" className="settings-group-title">
                  {t("settings.preferencesGroup")}
                </h2>
                <p className="settings-group-note">{t("settings.preferencesNote")}</p>
              </div>
              <PreferenceRows />
            </section>
          </StudioPageBody>
        </StudioPage>
      </div>
    </StudioShell>
  );
}

function SettingRow({
  id,
  label,
  hint,
  children
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <div id={id} className="settings-row-label">
          {label}
        </div>
        {hint ? <p className="settings-row-hint">{hint}</p> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

type SettingsUser = { name: string | null; email: string | null; avatar_url: string | null };

function AccountRows({ user, hasPassword }: { user: SettingsUser; hasPassword: boolean }) {
  const t = useT();
  const avatarSrc = user.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp";

  return (
    <>
      {user.email ? (
        <SettingRow id="settings-email" label={t("settings.email")} hint={t("settings.emailHint")}>
          <div className="settings-identity">
            {/* Google avatars 503 when a foreign Referer is sent; see ToolNavRail. */}
            <img className="settings-identity-avatar" src={avatarSrc} alt="" referrerPolicy="no-referrer" />
            <span className="settings-identity-email">{user.email}</span>
          </div>
        </SettingRow>
      ) : null}

      <SettingRow id="settings-name" label={t("profile.displayName")} hint={t("profile.nameHint")}>
        <NameForm current={user.name ?? ""} />
      </SettingRow>

      <SettingRow
        id="settings-password"
        label={t("settings.password")}
        hint={hasPassword ? t("profile.withPassword") : t("profile.withoutPassword")}
      >
        <PasswordControl hasPassword={hasPassword} />
      </SettingRow>
    </>
  );
}

/** Save appears as a real action only once the name differs from what is stored. */
function NameForm({ current }: { current: string }) {
  const t = useT();
  const fetcher = useFetcher<ActionData>();
  const [value, setValue] = React.useState(current);
  const busy = fetcher.state !== "idle";
  const dirty = value.trim() !== current;
  const result = fetcher.data?.section === "name" ? fetcher.data : undefined;

  return (
    <fetcher.Form method="post" className="settings-inline-form">
      <input type="hidden" name="intent" value="update-name" />
      <div className="settings-inline-field">
        <input
          className="settings-input"
          type="text"
          name="name"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder={t("profile.namePlaceholder")}
          aria-labelledby="settings-name"
        />
        <button type="submit" className="btn btn-primary" disabled={!dirty || busy}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
      </div>
      {result?.ok && !dirty ? (
        <p className="settings-status" role="status">{t("profile.saved")}</p>
      ) : null}
      {result && !result.ok ? (
        <p className="settings-error" role="alert">{result.error}</p>
      ) : null}
    </fetcher.Form>
  );
}

/**
 * The password form stays folded until asked for: most learners sign in with a code or Google
 * and never need it, so three empty fields should not be the loudest thing on the page.
 */
function PasswordControl({ hasPassword }: { hasPassword: boolean }) {
  const t = useT();
  const fetcher = useFetcher<ActionData>();
  const [open, setOpen] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const busy = fetcher.state !== "idle";
  const result = fetcher.data?.section === "password" ? fetcher.data : undefined;

  React.useEffect(() => {
    if (fetcher.state === "idle" && result?.ok) {
      setOpen(false);
      setSaved(true);
    }
  }, [fetcher.state, result]);

  if (!open) {
    return (
      <div className="settings-password-summary">
        <span className="settings-password-state">
          {hasPassword ? t("settings.passwordIsSet") : t("settings.passwordNotSet")}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          aria-expanded={false}
          onClick={() => {
            setSaved(false);
            setOpen(true);
          }}
        >
          {hasPassword ? t("profile.changePassword") : t("profile.setPassword")}
        </button>
        {saved ? (
          <p className="settings-status" role="status">{t("profile.passwordSaved")}</p>
        ) : null}
      </div>
    );
  }

  return (
    <fetcher.Form method="post" className="settings-password-form">
      <input type="hidden" name="intent" value="set-password" />
      {hasPassword ? (
        <label className="settings-field">
          <span className="settings-field-label">{t("profile.currentPassword")}</span>
          <input
            className="settings-input"
            type="password"
            name="current_password"
            autoComplete="current-password"
            required
            autoFocus
          />
        </label>
      ) : null}
      <label className="settings-field">
        <span className="settings-field-label">{t("login.newPassword")}</span>
        <input
          className="settings-input"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          placeholder={t("login.passwordMin", { min: MIN_PASSWORD_LENGTH })}
          required
          autoFocus={!hasPassword}
        />
      </label>
      <label className="settings-field">
        <span className="settings-field-label">{t("profile.confirmPassword")}</span>
        <input
          className="settings-input"
          type="password"
          name="confirm"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </label>
      {result && !result.ok ? (
        <p className="settings-error" role="alert">{result.error}</p>
      ) : null}
      <div className="settings-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? t("common.saving")
            : hasPassword
              ? t("profile.updatePassword")
              : t("profile.setPasswordButton")}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </button>
      </div>
    </fetcher.Form>
  );
}

function PreferenceRows() {
  const t = useT();
  const locale = useLocale();
  const [themePreference, setThemePreference] = useThemePreference();
  // The preference, not the resolved language: "follow interface" is a choice of its own.
  const [feedbackLanguage, setFeedbackLanguage] = useFeedbackLanguagePreference();

  return (
    <>
      <SettingRow
        id="settings-interface-language"
        label={t("settings.interfaceLanguage")}
        hint={t("settings.interfaceLanguageHint")}
      >
        {/* A form post, like every language switch: it works without JavaScript and the
            server re-renders the whole document in the new language (design §3.2). */}
        <form
          method="post"
          action="/locale"
          className="settings-segmented"
          role="group"
          aria-labelledby="settings-interface-language"
        >
          <input type="hidden" name="returnTo" value="/settings" />
          {LOCALES.map((value) => (
            <button
              key={value}
              type="submit"
              name="locale"
              value={value}
              lang={value}
              className="settings-segment"
              aria-pressed={locale === value}
            >
              {LOCALE_AUTONYMS[value]}
            </button>
          ))}
        </form>
      </SettingRow>

      <SettingRow
        id="settings-feedback-language"
        label={t("settings.feedbackLanguage")}
        hint={`${t("settings.feedbackLanguageHint")} ${t("settings.feedbackFollowHint")}`}
      >
        <Segmented<FeedbackLanguagePreference>
          labelledBy="settings-feedback-language"
          options={FEEDBACK_LANGUAGE_PREFERENCES}
          value={feedbackLanguage}
          label={(option) => t(`feedbackLang.${option}`)}
          onChange={setFeedbackLanguage}
        />
      </SettingRow>

      <SettingRow id="settings-theme" label={t("settings.colorMode")}>
        <Segmented<ThemePreference>
          labelledBy="settings-theme"
          options={THEME_PREFERENCES}
          value={themePreference}
          label={(option) => t(THEME_LABEL_KEYS[option])}
          onChange={setThemePreference}
        />
      </SettingRow>
    </>
  );
}

function Segmented<T extends string>({
  labelledBy,
  options,
  value,
  label,
  onChange
}: {
  labelledBy: string;
  options: readonly T[];
  value: T;
  label: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <div className="settings-segmented" role="group" aria-labelledby={labelledBy}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className="settings-segment"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}
