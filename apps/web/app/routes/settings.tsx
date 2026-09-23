import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { StudioShell } from "~/components/StudioShell";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { requireUser } from "~/utils/auth.server";
import { useThemePreference } from "~/utils/use-theme-preference";
import { FEEDBACK_LANGUAGE_PREFERENCES } from "~/utils/feedback-language";
import { useFeedbackLanguagePreference } from "~/utils/use-feedback-language";
import { useLocale, useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { LOCALES, LOCALE_AUTONYMS } from "~/i18n/locale";

export const handle = {
  hideHeader: true,
  hideHeaderUserMenu: true
};

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.settings.title") }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  return json({ user: { name: user.name, email: user.email, avatar_url: user.avatar_url } });
};

/**
 * The one settings page, reached from the account menu in every tool.
 *
 * Interface language lives here rather than in the rail: it is chosen once, not switched
 * while practising, and the first choice is already made for the learner from
 * `Accept-Language`. Theme and the feedback language are shared by every tool, so tools no
 * longer keep settings pages of their own.
 */
export default function SettingsPage() {
  const { user } = useLoaderData<typeof loader>();
  const t = useT();
  const locale = useLocale();
  const [themePreference, setThemePreference] = useThemePreference();
  // The preference, not the resolved language: "follow interface" is a choice of its own.
  const [feedbackLanguage, setFeedbackLanguage] = useFeedbackLanguagePreference();

  const avatarSrc = user.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp";
  const displayName = user.name ?? user.email ?? t("common.account");

  return (
    <StudioShell user={user}>
      <div className="studio-main-scroll">
        <StudioPage width="standard">
          <StudioPageHeader title={t("settings.title")} description={t("settings.description")} />
          <StudioPageBody className="tool-settings-page">
            <div className="tool-settings-card">
              <section className="tool-settings-section">
                <div className="settings-user-profile">
                  <img
                    className="settings-user-avatar"
                    src={avatarSrc}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                  <div className="settings-user-info">
                    <div className="settings-user-name">{displayName}</div>
                    {user.name && user.email ? (
                      <div className="settings-user-email">{user.email}</div>
                    ) : null}
                  </div>
                </div>
                <div className="settings-account-actions">
                  <Link to="/profile" className="settings-signout-btn">
                    {t("common.profile")}
                  </Link>
                  <form method="post" action="/logout">
                    <button type="submit" className="settings-signout-btn">
                      {t("settings.signOut")}
                    </button>
                  </form>
                </div>
              </section>

              {/* A form post, like every language switch: it works without JavaScript and the
                  server re-renders the whole document in the new language (design §3.2). */}
              <section className="tool-settings-section">
                <div className="menu-label">{t("settings.interfaceLanguage")}</div>
                <div className="menu-setting-row">
                  <div className="menu-setting-hint">{t("settings.interfaceLanguageHint")}</div>
                </div>
                <form method="post" action="/locale" className="menu-option-grid menu-option-grid-two">
                  <input type="hidden" name="returnTo" value="/settings" />
                  {LOCALES.map((value) => (
                    <button
                      key={value}
                      type="submit"
                      name="locale"
                      value={value}
                      lang={value}
                      className={`menu-option-button${locale === value ? " is-active" : ""}`}
                      aria-pressed={locale === value}
                    >
                      {LOCALE_AUTONYMS[value]}
                    </button>
                  ))}
                </form>
              </section>

              <section className="tool-settings-section">
                <div className="menu-label">{t("settings.feedbackLanguage")}</div>
                <div className="menu-setting-row">
                  <div className="menu-setting-hint">
                    {t("settings.feedbackLanguageHint")} {t("settings.feedbackFollowHint")}
                  </div>
                </div>
                <div className="menu-option-grid menu-option-grid-three">
                  {FEEDBACK_LANGUAGE_PREFERENCES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`menu-option-button${feedbackLanguage === option ? " is-active" : ""}`}
                      aria-pressed={feedbackLanguage === option}
                      onClick={() => setFeedbackLanguage(option)}
                    >
                      {t(`feedbackLang.${option}`)}
                    </button>
                  ))}
                </div>
              </section>

              <section className="tool-settings-section">
                <div className="menu-label">{t("settings.appearance")}</div>
                <div className="menu-setting-row">
                  <div className="menu-setting-title">{t("settings.colorMode")}</div>
                </div>
                <div className="menu-option-grid menu-option-grid-three">
                  {(["system", "light", "dark"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`menu-option-button${themePreference === value ? " is-active" : ""}`}
                      aria-pressed={themePreference === value}
                      onClick={() => setThemePreference(value)}
                    >
                      {t(value === "system" ? "theme.auto" : value === "light" ? "theme.light" : "theme.dark")}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </StudioPageBody>
        </StudioPage>
      </div>
    </StudioShell>
  );
}
