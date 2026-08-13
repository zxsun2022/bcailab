import { Link } from "@remix-run/react";

type StudioBreadcrumb = {
  label: string;
  to?: string;
};

export function StudioBreadcrumbs({ items }: { items: StudioBreadcrumb[] }) {
  return (
    <nav className="studio-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.to && !current ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span aria-current={current ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
