import type { MetaFunction } from "@remix-run/cloudflare";
import { useRouteLoaderData } from "@remix-run/react";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { useThemePreference } from "~/utils/use-theme-preference";
import { READING_OUTPUT_LANGUAGE_OPTIONS } from "~/utils/reading-settings";
import { useReadingOutputLanguage } from "~/utils/use-reading-output-language";
import type { loader as readingLoader } from "~/routes/reading";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";

export const handle = {
  breadcrumb: { label: "settings", href: "/reading/settings" }
};

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.readingSettings.title") }
];

export default function ReadingSettingsPage() {
  const data = useRouteLoaderData<typeof readingLoader>("routes/reading");
  const user = data?.user;

  const t = useT();
  const [themePreference, setThemePreference] = useThemePreference();
  const [outputLanguage, setOutputLanguage] = useReadingOutputLanguage();

  const avatarSrc = user?.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp";
  const displayName = user?.name ?? user?.email ?? t("common.account");

  return (
    <StudioPage width="standard">
      <StudioPageHeader
        title={t("settings.readingTitle")}
        description={t("settings.feedbackDescription")}
      />
      <StudioPageBody className="tool-settings-page">
        <div className="tool-settings-card">

        {/* User profile */}
        <section className="tool-settings-section">
          <div className="settings-user-profile">
            <img className="settings-user-avatar" src={avatarSrc} alt={displayName} />
            <div className="settings-user-info">
              {user?.name ? <div className="settings-user-name">{user.name}</div> : null}
              {user?.email ? <div className="settings-user-email">{user.email}</div> : null}
            </div>
          </div>
          <form method="post" action="/logout">
            <button type="submit" className="settings-signout-btn">{t("settings.signOut")}</button>
          </form>
        </section>

        {/* General: theme */}
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

        {/* Reading-specific: output language */}
        <section className="tool-settings-section">
          <div className="menu-label">{t("settings.readingFeedback")}</div>
          <div className="menu-setting-row">
            <div className="menu-setting-title">{t("settings.outputLanguage")}</div>
            <div className="menu-setting-hint">
              {t("settings.readingLanguageHint")}
            </div>
          </div>
          <div className="menu-option-grid menu-option-grid-two">
            {READING_OUTPUT_LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`menu-option-button${outputLanguage === option.value ? " is-active" : ""}`}
                aria-pressed={outputLanguage === option.value}
                onClick={() => setOutputLanguage(option.value)}
              >
                {t(option.value === "zh" ? "feedbackLang.zh" : "feedbackLang.en")}
              </button>
            ))}
          </div>
        </section>
        </div>
      </StudioPageBody>
    </StudioPage>
  );
}
