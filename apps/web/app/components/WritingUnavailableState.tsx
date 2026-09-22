import { useT } from "~/i18n/context";

export function WritingUnavailableState() {
  const t = useT();
  return (
    <div className="writing-status-card">
      <div className="writing-status-title">{t("writing.unavailableTitle")}</div>
      <p className="writing-status-desc">{t("writing.unavailableBody")}</p>
    </div>
  );
}
