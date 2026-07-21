import * as React from "react";
import { Link, NavLink, useLocation } from "@remix-run/react";
import { useThemePreference } from "~/utils/use-theme-preference";
import { openLoginPopup } from "~/utils/login-popup";

export type NavUser = {
  name: string | null;
  email: string | null;
  avatar_url: string | null;
};

/**
 * The English Studio modules, in the order they appear in the switcher.
 *
 * Every tool that uses this rail is an English Studio module, which is why the rail can
 * own this list and why its logo goes to `/english` rather than the site root: a learner
 * inside a module should move between modules without leaving the product.
 */
export const ENGLISH_STUDIO_MODULES = [
  { name: "Dictation", to: "/dictation" },
  { name: "Reading", to: "/reading" },
  { name: "Writing", to: "/writing" },
  { name: "Translate", to: "/translate" },
  { name: "Speech", to: "/speech" }
] as const;

export type PinnedAction = {
  icon: React.ReactNode;
  label: string;
  to: string;
  active?: boolean;
};

type ToolNavRailProps = {
  toolName: string;
  collapsedKey: string;
  pinnedActions: PinnedAction[];
  /** Omit for anonymous-friendly tools that have no settings page for signed-out users. */
  settingsTo?: string;
  /** `null` for anonymous visitors: the bottom slot becomes a sign-in button. */
  user: NavUser | null;
  children?: React.ReactNode;
};

/* ---------- shared icons ---------- */

export function IconNew() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="nav-rail-icon">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconProgress() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="nav-rail-icon">
      <path d="M4 18L8 12L12 15L16 9L20 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

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
  toolName,
  collapsedKey,
  pinnedActions,
  settingsTo,
  user,
  children,
}: ToolNavRailProps) {
  const location = useLocation();

  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem(collapsedKey) === "true"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [moduleMenuOpen, setModuleMenuOpen] = React.useState(false);
  // Apply stored theme preference on tool pages (no site header rendered here)
  useThemePreference();

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(collapsedKey, String(next)); } catch {}
      return next;
    });
  };

  React.useEffect(() => {
    setMobileOpen(false);
    setModuleMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (!moduleMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".nav-rail-module-switch")) return;
      setModuleMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [moduleMenuOpen]);

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

        {/* Tool header: logo + name + toggle */}
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

          {/* The tool name doubles as the module switcher, so moving between modules is
              one click rather than a trip out to the landing page. */}
          <div className="nav-rail-module-switch">
            <button
              type="button"
              className="nav-rail-tool-name is-switch"
              aria-haspopup="menu"
              aria-expanded={moduleMenuOpen}
              onClick={() => setModuleMenuOpen((open) => !open)}
            >
              {toolName}
              <span className="nav-rail-tool-caret" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="nav-rail-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
          </button>
        </div>

        {/* Module switcher, expanded. Rendered in the rail's own flow rather than as a
            floating menu: the header and the rail are both overflow:hidden for the
            collapse behaviour, which would clip an absolutely positioned dropdown. */}
        {moduleMenuOpen ? (
          <div className="nav-rail-module-menu" role="menu">
            <div className="nav-rail-module-menu-label">English Studio</div>
            {ENGLISH_STUDIO_MODULES.map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                role="menuitem"
                className={`nav-rail-module-item${entry.name === toolName ? " is-current" : ""}`}
              >
                {entry.name}
              </Link>
            ))}
            <Link to="/" role="menuitem" className="nav-rail-module-item is-out">
              All bcailab products
            </Link>
          </div>
        ) : null}

        {/* Pinned top */}
        <div className="nav-rail-pinned-top">
          {pinnedActions.map((action) => (
            <NavLink
              key={action.to}
              to={action.to}
              end
              className={({ isActive }) =>
                `nav-rail-action${(action.active ?? isActive) ? " is-active" : ""}`
              }
            >
              {action.icon}
              <span className="nav-rail-label">{action.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Scrollable list */}
        {children ? (
          <nav className="nav-rail-list">
            {children}
          </nav>
        ) : null}

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

/* ---------- shared list item primitives ---------- */

type NavRailItemProps = {
  to: string;
  isActive: boolean;
  title: string;
  meta?: React.ReactNode;
  onMenuOpen: () => void;
  menuOpen: boolean;
  menuContent: React.ReactNode;
};

export function NavRailItem({
  to,
  isActive,
  title,
  meta,
  onMenuOpen,
  menuOpen,
  menuContent,
}: NavRailItemProps) {
  return (
    <div className={`nav-rail-item-shell${isActive ? " is-active" : ""}${menuOpen ? " is-menu-open" : ""}`}>
      <Link to={to} className={`nav-rail-item${isActive ? " is-active" : ""}`}>
        <div className="nav-rail-item-title">{title}</div>
        {meta ? <div className="nav-rail-item-meta">{meta}</div> : null}
      </Link>
      <div
        className={`nav-rail-item-actions${menuOpen ? " is-open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="nav-rail-item-menu-btn"
          aria-label="Open item menu"
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); onMenuOpen(); }}
        >
          <span /><span /><span />
        </button>
        {menuOpen ? (
          <div className="nav-rail-item-menu">{menuContent}</div>
        ) : null}
      </div>
    </div>
  );
}
