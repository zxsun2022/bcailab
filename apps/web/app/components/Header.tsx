import * as React from "react";
import { Button } from "@bcailab/ui";
import type { User } from "@bcailab/db";
import { Link, useMatches } from "@remix-run/react";

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
  const breadcrumbs = matches
    .filter((match) => (match.handle as BreadcrumbHandle)?.breadcrumb)
    .map((match) => (match.handle as BreadcrumbHandle).breadcrumb!);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [themePreference, setThemePreference] = React.useState<ThemePreference>("system");
  const menuRef = React.useRef<HTMLDivElement | null>(null);

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
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

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
              <div className="menu-shell">
                <button
                  type="button"
                  className="avatar-button"
                  onClick={() => {
                    setMenuOpen((prev) => !prev);
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
