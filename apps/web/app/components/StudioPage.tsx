import * as React from "react";

type StudioPageWidth = "standard" | "wide" | "workspace";

const join = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

/**
 * The content contract inside the Studio app shell.
 *
 * Every top-level tool page gets the same frame and vertical rhythm. `width` changes
 * how much room the page body may use; it never changes the page's left-hand origin.
 */
export function StudioPage({
  width = "wide",
  className,
  children
}: {
  width?: StudioPageWidth;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={join("studio-page", `studio-page--${width}`, className)}>
      {children}
    </div>
  );
}

export function StudioPageHeader({
  title,
  description,
  action,
  className
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={join("studio-page-header", className)}>
      <div className="studio-page-header-copy">
        <h1 className="studio-page-title">{title}</h1>
        {description ? <p className="studio-page-description">{description}</p> : null}
      </div>
      {action ? <div className="studio-page-header-action">{action}</div> : null}
    </header>
  );
}

export function StudioPageTabs({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={join("studio-page-tabs", className)}>{children}</div>;
}

export function StudioPageBody({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={join("studio-page-body", className)}>{children}</div>;
}
