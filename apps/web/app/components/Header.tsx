import * as React from "react";
import { Button } from "@bcailab/ui";
import type { User } from "@bcailab/db";
import { Link, useMatches } from "@remix-run/react";
import { openLoginPopup } from "~/utils/login-popup";
import { useT } from "~/i18n/context";
import type { MessageKey } from "~/i18n/translate";
import { LanguageSwitcher } from "~/components/LanguageSwitcher";

const AUTH_MESSAGE_TYPE = "bcailab-auth";

type BreadcrumbHandle = {
  /** `labelKey` is translated; `label` is shown as written (for names, not prose). */
  breadcrumb?: { label: string; labelKey?: MessageKey; href?: string };
  hideHeaderUserMenu?: boolean;
};

export const Header: React.FC<{ user: User | null }> = ({ user }) => {
  const t = useT();
  const matches = useMatches();
  const breadcrumbs = matches
    .filter((match) => (match.handle as BreadcrumbHandle)?.breadcrumb)
    .map((match) => (match.handle as BreadcrumbHandle).breadcrumb!);
  const hideUserMenu = matches.some(
    (match) => (match.handle as BreadcrumbHandle)?.hideHeaderUserMenu
  );
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

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

  const handleLogin = () => {
    openLoginPopup();
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
                      {crumb.labelKey ? t(crumb.labelKey) : crumb.label}
                    </Link>
                  ) : (
                    <span className="breadcrumb-current">
                      {crumb.labelKey ? t(crumb.labelKey) : crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}
        </div>
        {!hideUserMenu ? (
          <div className="nav-actions" ref={menuRef}>
            <LanguageSwitcher />
            {!user ? (
              <Button type="button" onClick={handleLogin}>
                {t("common.signIn")}
              </Button>
            ) : (
              <div className="menu-shell">
                <button
                  type="button"
                  className="avatar-button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-label={t("common.openUserMenu")}
                >
                  {/* Google serves avatars from lh3.googleusercontent.com, which answers
                      503 to requests carrying a Referer it does not recognise. Suppressing
                      the header is the documented fix, and it also stops leaking the page
                      URL to Google on every render. */}
                  <img
                    className="avatar-image"
                    src={user.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp"}
                    alt={user.name ?? user.email ?? t("common.user")}
                    referrerPolicy="no-referrer"
                  />
                </button>
                {menuOpen ? (
                  <div className="menu">
                    <div className="menu-profile">
                      <div className="menu-name">{user.name ?? t("common.signedIn")}</div>
                      <div className="menu-muted">{user.email}</div>
                    </div>
                    <Link to="/settings" className="menu-item" onClick={() => setMenuOpen(false)}>
                      {t("common.settings")}
                    </Link>
                    <form method="post" action="/logout">
                      <button type="submit" className="menu-item">
                        {t("common.logOut")}
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
};
