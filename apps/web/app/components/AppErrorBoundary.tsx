import { Link, isRouteErrorResponse, useRouteError } from "@remix-run/react";
import { useT } from "~/i18n/context";

/**
 * The last stop for anything thrown below the root.
 *
 * Without this, a bad link drops a signed-in learner onto the framework's unstyled
 * default page — no shell, no type system, no way back into the product. Keep it
 * purely presentational: it must render even when loaders, context, and session
 * data are all unavailable.
 */
export function AppErrorBoundary() {
  const error = useRouteError();
  const t = useT();

  let status = t("error.status");
  let title = t("error.title");
  let detail = t("error.detail");

  if (isRouteErrorResponse(error)) {
    status = String(error.status);
    if (error.status === 404) {
      title = t("error.notFoundTitle");
      detail = t("error.notFoundDetail");
    } else {
      // A server-supplied status text or message is shown as sent; it is not interface copy.
      title = error.statusText || t("error.title");
      detail =
        typeof error.data === "string" && error.data
          ? error.data
          : t("error.serverDetail");
    }
  }

  return (
    <div className="app-error">
      <p className="app-error-status">{status}</p>
      <h1 className="app-error-title">{title}</h1>
      <p className="app-error-detail">{detail}</p>
      <div className="app-error-actions">
        <Link to="/english/home" className="btn btn-primary">
          {t("error.goStudio")}
        </Link>
        <Link to="/" className="btn btn-ghost">
          {t("common.home")}
        </Link>
      </div>
    </div>
  );
}
