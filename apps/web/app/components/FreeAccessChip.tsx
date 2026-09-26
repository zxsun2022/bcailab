import { Link } from "@remix-run/react";
import { freeEntryPoints, moduleCopy, resolveEnglishModuleDestination } from "~/english-modules";
import { useT } from "~/i18n/context";

/**
 * "What works without an account", for signed-out visitors on the two landing pages. Generated
 * from the module registry, so it can never disagree with where the cards actually lead.
 */
export function FreeAccessChip({ className = "" }: { className?: string }) {
  const t = useT();
  const { open, trial } = freeEntryPoints();
  const groups = [
    { key: "open", label: t("freeAccess.open"), modules: open },
    { key: "trial", label: t("freeAccess.trial"), modules: trial }
  ].filter((group) => group.modules.length > 0);
  if (groups.length === 0) return null;

  return (
    <p className={`free-access ${className}`.trim()}>
      {groups.map((group) => (
        <span key={group.key} className="free-access-group">
          <span className="free-access-label">{group.label}</span>
          {group.modules.map((module, index) => (
            <span key={module.id}>
              {index > 0 ? <span aria-hidden="true"> · </span> : null}
              <Link to={resolveEnglishModuleDestination(module, false).href} className="free-access-link">
                {moduleCopy(t, module).label}
              </Link>
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
