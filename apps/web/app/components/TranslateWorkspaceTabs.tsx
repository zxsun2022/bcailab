import { Link } from "@remix-run/react";
import { useT } from "~/i18n/context";

export function TranslateWorkspaceTabs({ active }: { active: "translate" | "saved" }) {
  const t = useT();
  return (
    <nav className="workspace-tabs translate-tabs" aria-label={t("translate.tabsLabel")}>
      {active === "translate" ? (
        <span className="workspace-tab is-active" aria-current="page">{t("translate.tab.translate")}</span>
      ) : (
        <Link to="/translate" className="workspace-tab">{t("translate.tab.translate")}</Link>
      )}
      {active === "saved" ? (
        <span className="workspace-tab is-active" aria-current="page">{t("translate.tab.saved")}</span>
      ) : (
        <Link to="/translate/saved" className="workspace-tab">{t("translate.tab.saved")}</Link>
      )}
    </nav>
  );
}
