import * as React from "react";
import { Button } from "@bcailab/ui";
import type { User } from "@bcailab/db";
import { Link } from "@remix-run/react";

const AUTH_MESSAGE_TYPE = "bcailab-auth";

export const Header: React.FC<{ user: User | null }> = ({ user }) => {
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

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="logo">
          bcailab
        </Link>
        <div className="nav-actions" ref={menuRef}>
          {!user ? (
            <Button type="button" onClick={handleLogin}>
              Continue with Google
            </Button>
          ) : (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="avatar-button"
                onClick={() => setMenuOpen((prev) => !prev)}
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
                  <div style={{ padding: "8px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{user.name ?? "Signed in"}</div>
                    <div className="menu-muted">{user.email}</div>
                  </div>
                  <Link to="/about" className="menu-item">
                    About bcailab
                  </Link>
                  <form method="post" action="/logout">
                    <button type="submit" className="menu-item">
                      Log out
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
