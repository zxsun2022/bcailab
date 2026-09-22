import type { MetaFunction } from "@remix-run/cloudflare";
import { useRouteLoaderData } from "@remix-run/react";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { useThemePreference } from "~/utils/use-theme-preference";
import type { loader as speechLoader } from "~/routes/speech";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";

export const handle = {
  breadcrumb: { label: "settings", href: "/speech/settings" }
};

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.speechSettings.title") }
];

export default function SpeechSettingsPage() {
  const data = useRouteLoaderData<typeof speechLoader>("routes/speech");
  const user = data?.user;

  const t = useT();
  const [themePreference, setThemePreference] = useThemePreference();

  const avatarSrc = user?.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp";
  const displayName = user?.name ?? user?.email ?? t("common.account");

  return (
    <StudioPage width="standard">
      <StudioPageHeader
        title={t("settings.speechTitle")}
        description={t("settings.accountDescription")}
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
        </div>
      </StudioPageBody>
    </StudioPage>
  );
}
