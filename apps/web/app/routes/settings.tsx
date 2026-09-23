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
 * It replaced `/profile` and the per-tool settings pages. Every item is one compact row —
 * label and a one-line purpose on the left, the current value or choice right-aligned — so
 * the page reads as a list and the controls line up on one edge.
 *
 * - **Account** rows show what is stored and an Edit button. Editing opens beneath the row
 *   and ends in an explicit Save or Cancel, because it writes to the server.
 * - **Preferences** are a choice among a few and apply the moment they are picked.
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
              <div className="settings-list">
                <AccountRows user={user} hasPassword={hasPassword} />
              </div>
            </section>

            <section className="settings-group" aria-labelledby="settings-preferences">
              <h2 id="settings-preferences" className="settings-group-title">
                {t("settings.preferencesGroup")}
              </h2>
              <div className="settings-list">
                <PreferenceRows />
              </div>
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
  children,
  editor
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** The value or control, right-aligned on the row. */
  children: React.ReactNode;
  /** An open editor, shown full width beneath the row. */
  editor?: React.ReactNode;
}) {
  return (
    <div className={`settings-row${editor ? " is-editing" : ""}`}>
      <div className="settings-row-copy">
        <div id={id} className="settings-row-label">
          {label}
        </div>
        {hint ? <p className="settings-row-hint">{hint}</p> : null}
      </div>
      <div className="settings-row-control">{children}</div>
      {editor ? <div className="settings-row-editor">{editor}</div> : null}
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
          <div className="settings-value">
            {/* Google avatars 503 when a foreign Referer is sent; see ToolNavRail. */}
            <img className="settings-avatar" src={avatarSrc} alt="" referrerPolicy="no-referrer" />
            <span className="settings-value-text">{user.email}</span>
          </div>
        </SettingRow>
      ) : null}
      <NameRow current={user.name ?? ""} />
      <PasswordRow hasPassword={hasPassword} />
    </>
  );
}

function StatusLine({ result, saved }: { result?: ActionData; saved?: string }) {
  if (result && !result.ok) {
    return <p className="settings-error" role="alert">{result.error}</p>;
  }
  if (saved) {
    return <p className="settings-status" role="status">{saved}</p>;
  }
  return null;
}

/** Tracks one fetcher's edit cycle: open, submit, and close with a note once it succeeds. */
function useEditor(fetcher: ReturnType<typeof useFetcher<ActionData>>, section: ActionData["section"]) {
  const [open, setOpen] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const result = fetcher.data?.section === section ? fetcher.data : undefined;

  React.useEffect(() => {
    if (fetcher.state === "idle" && result?.ok) {
      setOpen(false);
      setSaved(true);
    }
  }, [fetcher.state, result]);

  return {
    open,
    saved,
    result: open ? result : undefined,
    start: () => {
      setSaved(false);
      setOpen(true);
    },
    cancel: () => setOpen(false)
  };
}

function NameRow({ current }: { current: string }) {
  const t = useT();
  const fetcher = useFetcher<ActionData>();
  const editor = useEditor(fetcher, "name");
  const busy = fetcher.state !== "idle";

  return (
    <SettingRow
      id="settings-name"
      label={t("profile.displayName")}
      hint={t("profile.nameHint")}
      editor={
        editor.open ? (
          <fetcher.Form method="post" className="settings-editor">
            <input type="hidden" name="intent" value="update-name" />
            <input
              className="settings-input"
              type="text"
              name="name"
              defaultValue={current}
              maxLength={MAX_NAME_LENGTH}
              placeholder={t("profile.namePlaceholder")}
              aria-labelledby="settings-name"
              autoFocus
            />
            <StatusLine result={editor.result} />
            <EditorActions busy={busy} submitLabel={t("common.save")} onCancel={editor.cancel} />
          </fetcher.Form>
        ) : null
      }
    >
      {editor.open ? null : (
        <div className="settings-value">
          <span className={current ? "settings-value-text" : "settings-value-text is-empty"}>
            {current || t("profile.namePlaceholder")}
          </span>
          <button type="button" className="settings-edit" onClick={editor.start}>
            {t("settings.edit")}
          </button>
          {editor.saved ? <StatusLine saved={t("profile.saved")} /> : null}
        </div>
      )}
    </SettingRow>
  );
}

/**
 * The password form stays folded until asked for: most learners sign in with a code or Google
 * and never need it, so three empty fields should not be on the page by default.
 */
function PasswordRow({ hasPassword }: { hasPassword: boolean }) {
  const t = useT();
  const fetcher = useFetcher<ActionData>();
  const editor = useEditor(fetcher, "password");
  const busy = fetcher.state !== "idle";

  return (
    <SettingRow
      id="settings-password"
      label={t("settings.password")}
      hint={hasPassword ? t("profile.withPassword") : t("profile.withoutPassword")}
      editor={
        editor.open ? (
          <fetcher.Form method="post" className="settings-editor">
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
            <StatusLine result={editor.result} />
            <EditorActions
              busy={busy}
              submitLabel={hasPassword ? t("profile.updatePassword") : t("profile.setPasswordButton")}
              onCancel={editor.cancel}
            />
          </fetcher.Form>
        ) : null
      }
    >
      {editor.open ? null : (
        <div className="settings-value">
          <span className="settings-value-text is-quiet">
            {hasPassword ? t("settings.passwordIsSet") : t("settings.passwordNotSet")}
          </span>
          <button type="button" className="settings-edit" onClick={editor.start}>
            {hasPassword ? t("profile.changePassword") : t("profile.setPassword")}
          </button>
          {editor.saved ? <StatusLine saved={t("profile.passwordSaved")} /> : null}
        </div>
      )}
    </SettingRow>
  );
}

function EditorActions({
  busy,
  submitLabel,
  onCancel
}: {
  busy: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="settings-editor-actions">
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
        {t("common.cancel")}
      </button>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? t("common.saving") : submitLabel}
      </button>
    </div>
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
        hint={t("settings.feedbackLanguageHint")}
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
