import * as React from "react";
import { Button } from "@bcailab/ui";
import type { User } from "@bcailab/db";
import { Link, useLocation, useMatches } from "@remix-run/react";
import {
  READING_OUTPUT_LANGUAGE_OPTIONS,
  type ReadingOutputLanguage
} from "~/utils/reading-settings";
import { useReadingOutputLanguage } from "~/utils/use-reading-output-language";

const AUTH_MESSAGE_TYPE = "bcailab-auth";
const THEME_STORAGE_KEY = "bcailab-theme-preference";

type ThemePreference = "system" | "light" | "dark";

type BreadcrumbHandle = {
  breadcrumb?: { label: string; href?: string };
};

const getStoredThemePreference = (): ThemePreference => {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
};

export const Header: React.FC<{ user: User | null }> = ({ user }) => {
  const matches = useMatches();
  const location = useLocation();
  const breadcrumbs = matches
    .filter((match) => (match.handle as BreadcrumbHandle)?.breadcrumb)
    .map((match) => (match.handle as BreadcrumbHandle).breadcrumb!);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [themePreference, setThemePreference] = React.useState<ThemePreference>("system");
  const [outputLanguage, setOutputLanguage] = useReadingOutputLanguage();
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const isReadingRoute =
    location.pathname === "/esl/reading" || location.pathname.startsWith("/esl/reading/");

  const applyThemePreference = React.useCallback((preference: ThemePreference) => {
    const resolved =
      preference === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : preference;
    const root = document.documentElement;
    root.dataset.themePreference = preference;
    root.dataset.resolvedTheme = resolved;
  }, []);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === AUTH_MESSAGE_TYPE && event.data?.ok) {
        window.location.reload();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setSettingsOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  React.useEffect(() => {
    if (!isReadingRoute) {
      setSettingsOpen(false);
    }
  }, [isReadingRoute]);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const preference = getStoredThemePreference();
    setThemePreference(preference);
    applyThemePreference(preference);

    const handleSystemThemeChange = () => {
      const currentPreference = getStoredThemePreference();
      if (currentPreference === "system") {
        applyThemePreference("system");
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [applyThemePreference]);

  const handleLogin = () => {
    const width = 520;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      "/auth/google",
      "bcailab-auth",
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  const handleThemeChange = (preference: ThemePreference) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    setThemePreference(preference);
    applyThemePreference(preference);
  };

  const handleOutputLanguageChange = (next: ReadingOutputLanguage) => {
    setOutputLanguage(next);
    setSettingsOpen(false);
  };

  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="header-nav">
          <Link to="/" className="logo">
            <img
              className="logo-image"
              src="/brand/logo-64.png"
              srcSet="/brand/logo-64.png 1x, /brand/logo-128.png 2x"
              width={36}
              height={36}
              alt="bcailab"
            />
            <span className="logo-text">bc<span className="logo-ai">ai</span>lab</span>
          </Link>
          {breadcrumbs.length > 0 && (
            <nav className="breadcrumb">
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={i}>
                  <span className="breadcrumb-sep">/</span>
                  {crumb.href ? (
                    <Link to={crumb.href} className="breadcrumb-link">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="breadcrumb-current">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}
        </div>
        <div className="nav-actions" ref={menuRef}>
          {!user ? (
            <Button type="button" onClick={handleLogin}>
              Continue with Google
            </Button>
          ) : (
            <>
              {isReadingRoute ? (
                <div className="menu-shell">
                  <button
                    type="button"
                    className={`header-icon-button ${settingsOpen ? "is-open" : ""}`}
                    onClick={() => {
                      setSettingsOpen((prev) => !prev);
                      setMenuOpen(false);
                    }}
                    aria-label="Open reading settings"
                    aria-haspopup="menu"
                    aria-expanded={settingsOpen}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 7h5M13 7h7M4 12h10M18 12h2M4 17h3M11 17h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="16" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="9" cy="17" r="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </button>
                  {settingsOpen ? (
                    <div className="menu menu-settings">
                      <div className="menu-section">
                        <div className="menu-label">Reading Settings</div>
                        <div className="menu-setting-row">
                          <div className="menu-setting-title">Output Language</div>
                          <div className="menu-setting-hint">
                            New feedback and retries use this language.
                          </div>
                        </div>
                        <div className="menu-option-grid menu-option-grid-two">
                          {READING_OUTPUT_LANGUAGE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`menu-option-button ${
                                outputLanguage === option.value ? "is-active" : ""
                              }`}
                              aria-pressed={outputLanguage === option.value}
                              onClick={() => handleOutputLanguageChange(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="menu-shell">
                <button
                  type="button"
                  className="avatar-button"
                  onClick={() => {
                    setMenuOpen((prev) => !prev);
                    setSettingsOpen(false);
                  }}
                  aria-label="Open user menu"
                >
                  <img
                    className="avatar-image"
                    src={user.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp"}
                    alt={user.name ?? user.email ?? "User"}
                  />
                </button>
                {menuOpen ? (
                  <div className="menu">
                    <div className="menu-profile">
                      <div className="menu-name">{user.name ?? "Signed in"}</div>
                      <div className="menu-muted">{user.email}</div>
                    </div>
                    <div className="menu-section">
                      <div className="menu-label">Theme</div>
                      <div className="menu-theme-options">
                        {([
                          { value: "system", label: "Auto" },
                          { value: "light", label: "Light" },
                          { value: "dark", label: "Dark" }
                        ] as const).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`menu-theme-option ${
                              themePreference === option.value ? "is-active" : ""
                            }`}
                            aria-pressed={themePreference === option.value}
                            onClick={() => handleThemeChange(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <form method="post" action="/logout">
                      <button type="submit" className="menu-item">
                        Log out
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
