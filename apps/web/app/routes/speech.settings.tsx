import { useRouteLoaderData } from "@remix-run/react";
import { useThemePreference } from "~/utils/use-theme-preference";
import type { loader as speechLoader } from "~/routes/speech";

export const handle = {
  breadcrumb: { label: "settings", href: "/speech/settings" }
};

export default function SpeechSettingsPage() {
  const data = useRouteLoaderData<typeof speechLoader>("routes/speech");
  const user = data?.user;

  const [themePreference, setThemePreference] = useThemePreference();

  const avatarSrc = user?.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp";
  const displayName = user?.name ?? user?.email ?? "Account";

  return (
    <div className="tool-settings-page">
      <div className="tool-settings-card">
        <div className="tool-settings-header">
          <h2>Settings</h2>
        </div>

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
            <button type="submit" className="settings-signout-btn">Sign out</button>
          </form>
        </section>

        {/* General: theme */}
        <section className="tool-settings-section">
          <div className="menu-label">Appearance</div>
          <div className="menu-setting-row">
            <div className="menu-setting-title">Color mode</div>
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
                {value === "system" ? "Auto" : value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
