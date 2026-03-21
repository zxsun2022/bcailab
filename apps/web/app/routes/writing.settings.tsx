import { useRouteLoaderData } from "@remix-run/react";
import { useThemePreference } from "~/utils/use-theme-preference";
import { useWritingFeedbackLanguage } from "~/utils/use-writing-feedback-language";
import { WRITING_FEEDBACK_LANGUAGE_OPTIONS } from "~/utils/writing-settings";
import type { loader as writingLoader } from "~/routes/writing";

export const handle = {
  breadcrumb: { label: "settings", href: "/writing/settings" }
};

export default function WritingSettingsPage() {
  const data = useRouteLoaderData<typeof writingLoader>("routes/writing");
  const user = data?.user;

  const [themePreference, setThemePreference] = useThemePreference();
  const [feedbackLanguage, setFeedbackLanguage] = useWritingFeedbackLanguage();

  const avatarSrc = user?.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp";
  const displayName = user?.name ?? user?.email ?? "Account";

  return (
    <div className="writing-main-scroll">
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

          {/* Writing-specific: feedback language */}
          <section className="tool-settings-section">
            <div className="menu-label">Writing feedback</div>
            <div className="menu-setting-row">
              <div className="menu-setting-title">Language</div>
              <div className="menu-setting-hint">
                New feedback and retry requests use this language.
              </div>
            </div>
            <div className="menu-option-grid menu-option-grid-two">
              {WRITING_FEEDBACK_LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`menu-option-button${feedbackLanguage === option.value ? " is-active" : ""}`}
                  aria-pressed={feedbackLanguage === option.value}
                  onClick={() => setFeedbackLanguage(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
