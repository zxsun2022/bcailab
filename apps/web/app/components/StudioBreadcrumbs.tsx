import { Link } from "@remix-run/react";
import { useT } from "~/i18n/context";

type StudioBreadcrumb = {
  label: string;
  to?: string;
  /** Set to "en" when the label is learning material, such as an assignment title. */
  lang?: string;
};

export function StudioBreadcrumbs({ items }: { items: StudioBreadcrumb[] }) {
  const t = useT();
  return (
    <nav className="studio-breadcrumbs" aria-label={t("common.breadcrumb")}>
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.to && !current ? (
                <Link to={item.to} lang={item.lang}>{item.label}</Link>
              ) : (
                <span aria-current={current ? "page" : undefined} lang={item.lang}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
