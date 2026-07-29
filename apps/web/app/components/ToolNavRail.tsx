import * as React from "react";
import { Link, NavLink, useLocation } from "@remix-run/react";
import { useThemePreference } from "~/utils/use-theme-preference";
import { openLoginPopup } from "~/utils/login-popup";
import {
  ENGLISH_MODULES,
  resolveEnglishModuleDestination,
  type EnglishModule,
  type EnglishModuleGroup
} from "~/english-modules";

export type NavUser = {
  name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type ToolNavRailProps = {
  /** Omit for anonymous-friendly tools that have no settings page for signed-out users. */
  settingsTo?: string;
  /** `null` for anonymous visitors: the bottom slot becomes a sign-in button. */
  user: NavUser | null;
};

/* ---------- shared icons ---------- */

export function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="nav-rail-icon">
      <path d="M4 7h5M13 7h7M4 12h10M18 12h2M4 17h3M11 17h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="17" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="nav-rail-icon">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="nav-rail-icon">
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- component ---------- */

export function ToolNavRail({
  settingsTo,
  user,
}: ToolNavRailProps) {
  const location = useLocation();
  const collapsedKey = "english-studio-nav-rail-collapsed";
  const isProgressView = [
    "/english/progress",
    "/reading/progress",
    "/writing/progress"
  ].includes(location.pathname);

  // The server cannot see localStorage. Start from the same state on server and client,
  // then restore the preference after hydration to avoid a chevron/class mismatch.
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // Apply stored theme preference on tool pages (no site header rendered here)
  useThemePreference();

  React.useEffect(() => {
    try { setCollapsed(localStorage.getItem(collapsedKey) === "true"); } catch {}
  }, [collapsedKey]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(collapsedKey, String(next)); } catch {}
      return next;
    });
  };

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const avatarSrc = user?.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp";
  const displayName = user?.name ?? user?.email ?? "Account";

  return (
    <>
      {/* Mobile toggle — opens drawer */}
      <button
        type="button"
        className="nav-rail-mobile-toggle"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <span /><span /><span />
      </button>

      {mobileOpen ? (
        <div className="nav-rail-backdrop" onClick={() => setMobileOpen(false)} />
      ) : null}

      <aside className={`tool-nav-rail${collapsed ? " is-collapsed" : ""}${mobileOpen ? " is-mobile-open" : ""}`}>

        {/* Stable product identity. Tool/page context lives below and in the canvas. */}
        <div className="nav-rail-tool-header">
          {/* Mobile close button — shown only on mobile inside the open drawer */}
          <button
            type="button"
            className="nav-rail-mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="nav-rail-icon">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <Link to="/english" className="nav-rail-logo" aria-label="Back to English Studio">
            <img
              src="/brand/logo-64.png"
              srcSet="/brand/logo-64.png 1x, /brand/logo-128.png 2x"
              alt="bcailab"
              className="nav-rail-logo-img"
            />
          </Link>

          <div className="nav-rail-tool-name">English Studio</div>
          <button
            type="button"
            className="nav-rail-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
          </button>
        </div>

        <nav className="nav-rail-studio-nav" aria-label="English Studio">
          {/* Signed-in learners go straight to the Home; `/english` would only redirect
              them there. Signed-out visitors get the public landing page. */}
          <Link
            to={user ? "/english/home" : "/english"}
            className={`nav-rail-studio-item${
              location.pathname === "/english" || location.pathname === "/english/home"
                ? " is-current"
                : ""
            }`}
          >
            <span className="nav-rail-module-mark" aria-hidden="true">H</span>
            <span className="nav-rail-label">Home</span>
          </Link>
          {user ? (
            <Link
              to="/english/progress"
              className={`nav-rail-studio-item${
                isProgressView ? " is-current" : ""
              }`}
            >
              <span className="nav-rail-module-mark" aria-hidden="true">P</span>
              <span className="nav-rail-label">Progress</span>
            </Link>
          ) : null}
          {(["practice", "utility"] as const).map((group) => (
            <EnglishModuleGroupLinks
              key={group}
              group={group}
              signedIn={Boolean(user)}
              pathname={location.pathname}
              suppressActive={isProgressView}
            />
          ))}
        </nav>

        {/* Pinned bottom: user + settings when signed in, sign-in prompt when not */}
        <div className="nav-rail-pinned-bottom">
          {user && settingsTo ? (
            <NavLink
              to={settingsTo}
              className={({ isActive }) => `nav-rail-user-btn${isActive ? " is-active" : ""}`}
            >
              <img
                className="nav-rail-avatar"
                src={avatarSrc}
                alt={displayName}
              />
              <span className="nav-rail-user-name">{displayName}</span>
            </NavLink>
          ) : user ? (
            /* Signed in, but this tool has no settings page — identity only. */
            <div className="nav-rail-user-btn is-static">
              <img className="nav-rail-avatar" src={avatarSrc} alt="" />
              <span className="nav-rail-user-name">{displayName}</span>
            </div>
          ) : (
            <button
              type="button"
              className="nav-rail-user-btn"
              onClick={() => openLoginPopup()}
            >
              <img className="nav-rail-avatar" src={avatarSrc} alt="" />
              <span className="nav-rail-user-name">Sign in</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function EnglishModuleGroupLinks({
  group,
  signedIn,
  pathname,
  suppressActive
}: {
  group: EnglishModuleGroup;
  signedIn: boolean;
  pathname: string;
  suppressActive: boolean;
}) {
  const modules = ENGLISH_MODULES.filter(
    (module) => module.status === "active" && module.group === group
  );

  const handleClick = (event: React.MouseEvent, module: EnglishModule) => {
    if (resolveEnglishModuleDestination(module, signedIn).requiresLogin) {
      event.preventDefault();
      openLoginPopup();
    }
  };

  return (
    <div className="nav-rail-studio-group">
      <div className="nav-rail-studio-group-label">
        {group === "practice" ? "Practice" : "Tools"}
      </div>
      {modules.map((module) => {
        const destination = resolveEnglishModuleDestination(module, signedIn);
        const active = !suppressActive &&
          (pathname === module.route || pathname.startsWith(`${module.route}/`));
        return (
          <Link
            key={module.id}
            to={destination.href}
            className={`nav-rail-studio-item${active ? " is-current" : ""}`}
            onClick={(event) => handleClick(event, module)}
          >
            <span className="nav-rail-module-mark" aria-hidden="true">
              {module.label.slice(0, 1)}
            </span>
            <span className="nav-rail-label">{module.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
