import { Link, isRouteErrorResponse, useRouteError } from "@remix-run/react";

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

  let status = "Error";
  let title = "Something went wrong";
  let detail =
    "An unexpected error interrupted this page. Trying again often clears it.";

  if (isRouteErrorResponse(error)) {
    status = String(error.status);
    if (error.status === 404) {
      title = "This page does not exist";
      detail =
        "The link may be out of date, or the item it pointed at has been removed.";
    } else {
      title = error.statusText || "Something went wrong";
      detail =
        typeof error.data === "string" && error.data
          ? error.data
          : "The server could not complete this request.";
    }
  }

  return (
    <div className="app-error">
      <p className="app-error-status">{status}</p>
      <h1 className="app-error-title">{title}</h1>
      <p className="app-error-detail">{detail}</p>
      <div className="app-error-actions">
        <Link to="/english/home" className="btn btn-primary">
          Go to English Studio
        </Link>
        <Link to="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    </div>
  );
}
