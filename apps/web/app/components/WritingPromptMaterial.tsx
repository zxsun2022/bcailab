import type { WritingAssignmentSnapshot, WritingTaskMaterial } from "@bcailab/db";
import { useLocale, useT } from "~/i18n/context";

// Header words are interface copy; the material itself — titles, categories, values — is the
// assignment and stays English.
const ChartDataTable = ({
  material
}: {
  material: Extract<WritingTaskMaterial, { kind: "line_graph" | "bar_chart" | "pie_chart" }>;
}) => {
  const t = useT();
  const locale = useLocale();
  return (
  <table lang="en">
    <caption>{material.title} · {material.unit}</caption>
    <thead>
      <tr>
        <th scope="col" lang={locale}>{t("writingMaterial.series")}</th>
        {material.categories.map((category) => <th scope="col" key={category}>{category}</th>)}
      </tr>
    </thead>
    <tbody>
      {material.series.map((series) => (
        <tr key={series.name}>
          <th scope="row">{series.name}</th>
          {series.values.map((value, index) => <td key={material.categories[index]}>{value}</td>)}
        </tr>
      ))}
    </tbody>
  </table>
  );
};

const TableData = ({ material }: { material: Extract<WritingTaskMaterial, { kind: "table" }> }) => {
  const t = useT();
  const locale = useLocale();
  return (
  <table lang="en">
    <caption>{material.title} · {material.unit}</caption>
    <thead>
      <tr>
        <th scope="col" lang={locale}>{t("writingMaterial.place")}</th>
        {material.columns.map((column) => <th scope="col" key={column}>{column}</th>)}
      </tr>
    </thead>
    <tbody>
      {material.rows.map((row) => (
        <tr key={row.label}>
          <th scope="row">{row.label}</th>
          {row.values.map((value, index) => <td key={material.columns[index]}>{value}</td>)}
        </tr>
      ))}
    </tbody>
  </table>
  );
};

const AccessibleMaterial = ({ material }: { material: WritingTaskMaterial }) => {
  const t = useT();
  const locale = useLocale();
  if (material.kind === "process") {
    return (
      <ol className="writing-material-steps" lang="en">
        {material.stages.map((stage) => (
          <li key={stage.label}><strong>{stage.label}</strong> — {stage.description}</li>
        ))}
      </ol>
    );
  }
  if (material.kind === "map") {
    return (
      <table lang="en">
        <caption>{material.title}</caption>
        <thead><tr><th scope="col" lang={locale}>{t("writingMaterial.area")}</th><th scope="col">{material.beforeLabel}</th><th scope="col">{material.afterLabel}</th></tr></thead>
        <tbody>
          {material.features.map((feature) => (
            <tr key={feature.place}><th scope="row">{feature.place}</th><td>{feature.before}</td><td>{feature.after}</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  return material.kind === "table"
    ? <TableData material={material} />
    : <ChartDataTable material={material} />;
};

export function WritingPromptMaterial({
  assignment
}: {
  assignment: WritingAssignmentSnapshot;
}) {
  const t = useT();
  if (!assignment.asset || !assignment.taskMaterial) return null;
  return (
    <section className="writing-material" aria-labelledby="writing-material-title">
      <h2 id="writing-material-title" className="sr-only">{t("writingMaterial.heading")}</h2>
      <img
        src={assignment.asset.path}
        alt={assignment.asset.altText}
        className="writing-material-visual"
      />
      <details className="writing-material-data">
        <summary>{t("writingMaterial.viewData")}</summary>
        <p lang="en">{assignment.asset.accessibleDescription}</p>
        <div className="writing-material-table-wrap">
          <AccessibleMaterial material={assignment.taskMaterial} />
        </div>
      </details>
    </section>
  );
}
