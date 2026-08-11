import type { WritingAssignmentSnapshot, WritingTaskMaterial } from "@bcailab/db";

const ChartDataTable = ({
  material
}: {
  material: Extract<WritingTaskMaterial, { kind: "line_graph" | "bar_chart" | "pie_chart" }>;
}) => (
  <table>
    <caption>{material.title} · {material.unit}</caption>
    <thead>
      <tr>
        <th scope="col">Series</th>
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

const TableData = ({ material }: { material: Extract<WritingTaskMaterial, { kind: "table" }> }) => (
  <table>
    <caption>{material.title} · {material.unit}</caption>
    <thead>
      <tr>
        <th scope="col">Place</th>
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

const AccessibleMaterial = ({ material }: { material: WritingTaskMaterial }) => {
  if (material.kind === "process") {
    return (
      <ol className="writing-material-steps">
        {material.stages.map((stage) => (
          <li key={stage.label}><strong>{stage.label}</strong> — {stage.description}</li>
        ))}
      </ol>
    );
  }
  if (material.kind === "map") {
    return (
      <table>
        <caption>{material.title}</caption>
        <thead><tr><th scope="col">Area</th><th scope="col">{material.beforeLabel}</th><th scope="col">{material.afterLabel}</th></tr></thead>
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
  if (!assignment.asset || !assignment.taskMaterial) return null;
  return (
    <section className="writing-material" aria-labelledby="writing-material-title">
      <h2 id="writing-material-title" className="sr-only">Assignment material</h2>
      <img
        src={assignment.asset.path}
        alt={assignment.asset.altText}
        className="writing-material-visual"
      />
      <details className="writing-material-data">
        <summary>View data and full description</summary>
        <p>{assignment.asset.accessibleDescription}</p>
        <div className="writing-material-table-wrap">
          <AccessibleMaterial material={assignment.taskMaterial} />
        </div>
      </details>
    </section>
  );
}
