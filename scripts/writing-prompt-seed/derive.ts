import { createHash } from "node:crypto";
import type {
  GeneratedWritingPrompt,
  WritingPromptSource,
  WritingTaskMaterial
} from "@bcailab/db";

const XML_REPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;"
};

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => XML_REPLACEMENTS[character]!);

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
};

export const stableJson = (value: unknown): string => JSON.stringify(stableValue(value));

export const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const PALETTE = ["#2457D6", "#D9663D", "#2F8F69", "#8B5FBF", "#B88914"];

type WritingChartMaterial = Extract<WritingTaskMaterial, { series: unknown }>;

const svgShell = (title: string, body: string, width = 960, height = 600): string =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">`,
    `<title id="title">${escapeXml(title)}</title>`,
    `<rect width="${width}" height="${height}" rx="24" fill="#FBFAF7"/>`,
    `<text x="48" y="55" fill="#18202B" font-family="system-ui, sans-serif" font-size="26" font-weight="700">${escapeXml(title)}</text>`,
    body,
    `</svg>`,
    ""
  ].join("\n");

const chartRange = (series: Array<{ values: number[] }>): { min: number; max: number } => {
  const values = series.flatMap((entry) => entry.values);
  return { min: Math.min(0, ...values), max: Math.max(1, ...values) };
};

const renderLegend = (names: string[], startY = 82): string =>
  names
    .map((name, index) => {
      const x = 50 + (index % 3) * 260;
      const y = startY + Math.floor(index / 3) * 28;
      return `<rect x="${x}" y="${y}" width="15" height="15" rx="3" fill="${PALETTE[index % PALETTE.length]}"/><text x="${x + 23}" y="${y + 13}" fill="#3C4655" font-family="system-ui, sans-serif" font-size="14">${escapeXml(name)}</text>`;
    })
    .join("\n");

const renderLineGraph = (
  material: WritingChartMaterial
): string => {
  const left = 90;
  const top = 175;
  const width = 790;
  const height = 350;
  const { min, max } = chartRange(material.series);
  const xFor = (index: number) =>
    left + (index * width) / Math.max(material.categories.length - 1, 1);
  const yFor = (value: number) => top + height - ((value - min) / (max - min)) * height;
  const grid = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const y = top + height - ratio * height;
    const value = Math.round((min + ratio * (max - min)) * 10) / 10;
    return `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="#D9DDE3"/><text x="${left - 12}" y="${y + 5}" text-anchor="end" fill="#596577" font-family="system-ui, sans-serif" font-size="13">${value}</text>`;
  }).join("\n");
  const labels = material.categories
    .map(
      (category, index) =>
        `<text x="${xFor(index)}" y="${top + height + 30}" text-anchor="middle" fill="#3C4655" font-family="system-ui, sans-serif" font-size="14">${escapeXml(category)}</text>`
    )
    .join("\n");
  const lines = material.series
    .map((series, seriesIndex) => {
      const points = series.values
        .map((value, index) => `${xFor(index)},${yFor(value)}`)
        .join(" ");
      const circles = series.values
        .map(
          (value, index) =>
            `<circle cx="${xFor(index)}" cy="${yFor(value)}" r="5" fill="${PALETTE[seriesIndex % PALETTE.length]}"/>`
        )
        .join("\n");
      return `<polyline points="${points}" fill="none" stroke="${PALETTE[seriesIndex % PALETTE.length]}" stroke-width="4" stroke-linejoin="round"/>\n${circles}`;
    })
    .join("\n");
  return svgShell(
    material.title,
    `${renderLegend(material.series.map((series) => series.name))}\n<text x="90" y="157" fill="#596577" font-family="system-ui, sans-serif" font-size="14">${escapeXml(material.unit)}</text>\n${grid}\n<line x1="${left}" y1="${top}" x2="${left}" y2="${top + height}" stroke="#596577" stroke-width="2"/>\n<line x1="${left}" y1="${top + height}" x2="${left + width}" y2="${top + height}" stroke="#596577" stroke-width="2"/>\n${labels}\n${lines}`,
    960,
    640
  );
};

const renderBarChart = (
  material: WritingChartMaterial
): string => {
  const left = 90;
  const top = 175;
  const width = 790;
  const height = 340;
  const max = Math.max(1, ...material.series.flatMap((series) => series.values));
  const groupWidth = width / material.categories.length;
  const barWidth = Math.min(48, (groupWidth * 0.75) / material.series.length);
  const grid = Array.from({ length: 6 }, (_, index) => {
    const value = (max * index) / 5;
    const y = top + height - (value / max) * height;
    return `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="#D9DDE3"/><text x="${left - 12}" y="${y + 5}" text-anchor="end" fill="#596577" font-family="system-ui, sans-serif" font-size="13">${Math.round(value)}</text>`;
  }).join("\n");
  const bars = material.categories
    .flatMap((category, categoryIndex) => {
      const groupStart = left + categoryIndex * groupWidth + groupWidth * 0.125;
      const categoryLabel = `<text x="${left + categoryIndex * groupWidth + groupWidth / 2}" y="${top + height + 28}" text-anchor="middle" fill="#3C4655" font-family="system-ui, sans-serif" font-size="13">${escapeXml(category)}</text>`;
      const seriesBars = material.series.map((series, seriesIndex) => {
        const value = series.values[categoryIndex]!;
        const barHeight = (value / max) * height;
        const x = groupStart + seriesIndex * barWidth;
        const y = top + height - barHeight;
        return `<rect x="${x}" y="${y}" width="${Math.max(barWidth - 5, 5)}" height="${barHeight}" rx="4" fill="${PALETTE[seriesIndex % PALETTE.length]}"/><text x="${x + (barWidth - 5) / 2}" y="${y - 6}" text-anchor="middle" fill="#3C4655" font-family="system-ui, sans-serif" font-size="12">${value}</text>`;
      });
      return [categoryLabel, ...seriesBars];
    })
    .join("\n");
  return svgShell(
    material.title,
    `${renderLegend(material.series.map((series) => series.name))}\n<text x="90" y="157" fill="#596577" font-family="system-ui, sans-serif" font-size="14">${escapeXml(material.unit)}</text>\n${grid}\n<line x1="${left}" y1="${top + height}" x2="${left + width}" y2="${top + height}" stroke="#596577" stroke-width="2"/>\n${bars}`,
    960,
    640
  );
};

const renderPieChart = (
  material: WritingChartMaterial
): string => {
  const pies = material.series
    .map((series, seriesIndex) => {
      const total = series.values.reduce((sum, value) => sum + value, 0);
      const cx = 245 + seriesIndex * 410;
      const cy = 300;
      const radius = 125;
      const circumference = 2 * Math.PI * radius;
      let offset = 0;
      const slices = series.values
        .map((value, categoryIndex) => {
          const fraction = value / total;
          const length = circumference * fraction;
          const slice = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${PALETTE[categoryIndex % PALETTE.length]}" stroke-width="86" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
          offset += length;
          return slice;
        })
        .join("\n");
      let labelOffset = 0;
      const labels = series.values
        .map((value) => {
          const fraction = value / total;
          const midpoint = labelOffset + fraction / 2;
          const angle = midpoint * Math.PI * 2 - Math.PI / 2;
          const labelX = cx + Math.cos(angle) * 126;
          const labelY = cy + Math.sin(angle) * 126;
          labelOffset += fraction;
          return `<text x="${labelX}" y="${labelY + 5}" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="13" font-weight="700">${value}%</text>`;
        })
        .join("\n");
      return `${slices}\n${labels}\n<circle cx="${cx}" cy="${cy}" r="78" fill="#FBFAF7"/><text x="${cx}" y="${cy + 6}" text-anchor="middle" fill="#18202B" font-family="system-ui, sans-serif" font-size="20" font-weight="700">${escapeXml(series.name)}</text>`;
    })
    .join("\n");
  const legend = material.categories
    .map((category, index) => {
      const x = 90 + (index % 3) * 275;
      const y = 520 + Math.floor(index / 3) * 28;
      return `<rect x="${x}" y="${y}" width="15" height="15" rx="3" fill="${PALETTE[index % PALETTE.length]}"/><text x="${x + 23}" y="${y + 13}" fill="#3C4655" font-family="system-ui, sans-serif" font-size="14">${escapeXml(category)}</text>`;
    })
    .join("\n");
  return svgShell(
    material.title,
    `<text x="48" y="92" fill="#596577" font-family="system-ui, sans-serif" font-size="14">${escapeXml(material.unit)}</text>\n${pies}\n${legend}`
  );
};

const renderTable = (material: Extract<WritingTaskMaterial, { kind: "table" }>): string => {
  const x = 45;
  const top = 130;
  const rowHeight = 62;
  const labelWidth = 170;
  const valueWidth = (870 - labelWidth) / material.columns.length;
  const header = ["", ...material.columns]
    .map((label, index) => {
      const cellX = x + (index === 0 ? 0 : labelWidth + (index - 1) * valueWidth);
      const cellWidth = index === 0 ? labelWidth : valueWidth;
      return `<rect x="${cellX}" y="${top}" width="${cellWidth}" height="${rowHeight}" fill="#E8EDF8" stroke="#BCC6D6"/><text x="${cellX + cellWidth / 2}" y="${top + 37}" text-anchor="middle" fill="#18202B" font-family="system-ui, sans-serif" font-size="13" font-weight="700">${escapeXml(label)}</text>`;
    })
    .join("\n");
  const rows = material.rows
    .map((row, rowIndex) => {
      const y = top + rowHeight * (rowIndex + 1);
      const label = `<rect x="${x}" y="${y}" width="${labelWidth}" height="${rowHeight}" fill="#F2F3F5" stroke="#BCC6D6"/><text x="${x + 14}" y="${y + 37}" fill="#18202B" font-family="system-ui, sans-serif" font-size="14" font-weight="700">${escapeXml(row.label)}</text>`;
      const cells = row.values
        .map((value, columnIndex) => {
          const cellX = x + labelWidth + columnIndex * valueWidth;
          return `<rect x="${cellX}" y="${y}" width="${valueWidth}" height="${rowHeight}" fill="#FFFFFF" stroke="#BCC6D6"/><text x="${cellX + valueWidth / 2}" y="${y + 37}" text-anchor="middle" fill="#3C4655" font-family="system-ui, sans-serif" font-size="15">${value}</text>`;
        })
        .join("\n");
      return `${label}\n${cells}`;
    })
    .join("\n");
  return svgShell(
    material.title,
    `<text x="48" y="95" fill="#596577" font-family="system-ui, sans-serif" font-size="14">${escapeXml(material.unit)}</text>\n${header}\n${rows}`,
    960,
    Math.max(520, top + rowHeight * (material.rows.length + 1) + 50)
  );
};

const renderProcess = (
  material: Extract<WritingTaskMaterial, { kind: "process" }>
): string => {
  const columns = 3;
  const cardWidth = 250;
  const cardHeight = 116;
  const gapX = 50;
  const gapY = 48;
  const positions = material.stages.map((_, index) => {
    const row = Math.floor(index / columns);
    const withinRow = index % columns;
    const column = row % 2 === 0 ? withinRow : columns - 1 - withinRow;
    return {
      x: 55 + column * (cardWidth + gapX),
      y: 115 + row * (cardHeight + gapY),
      row,
      column
    };
  });
  const connections = positions
    .slice(0, -1)
    .map((current, index) => {
      const next = positions[index + 1]!;
      if (current.row === next.row) {
        const goingRight = next.column > current.column;
        return `<line x1="${goingRight ? current.x + cardWidth : current.x}" y1="${current.y + cardHeight / 2}" x2="${goingRight ? next.x : next.x + cardWidth}" y2="${next.y + cardHeight / 2}" stroke="#667085" stroke-width="3" marker-end="url(#arrow)"/>`;
      }
      return `<line x1="${current.x + cardWidth / 2}" y1="${current.y + cardHeight}" x2="${next.x + cardWidth / 2}" y2="${next.y}" stroke="#667085" stroke-width="3" marker-end="url(#arrow)"/>`;
    })
    .join("\n");
  const cards = material.stages
    .map((stage, index) => {
      const { x, y } = positions[index]!;
      const number = `<circle cx="${x + 23}" cy="${y + 25}" r="17" fill="#2457D6"/><text x="${x + 23}" y="${y + 31}" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="14" font-weight="700">${index + 1}</text>`;
      return `<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="14" fill="#FFFFFF" stroke="#BCC6D6" stroke-width="2"/>${number}<text x="${x + 50}" y="${y + 31}" fill="#18202B" font-family="system-ui, sans-serif" font-size="16" font-weight="700">${escapeXml(stage.label)}</text><foreignObject x="${x + 18}" y="${y + 48}" width="${cardWidth - 36}" height="60"><div xmlns="http://www.w3.org/1999/xhtml" style="font: 13px system-ui, sans-serif; color: #3C4655; line-height: 1.35">${escapeXml(stage.description)}</div></foreignObject>`;
    })
    .join("\n");
  const rows = Math.ceil(material.stages.length / columns);
  return svgShell(
    material.title,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#667085"/></marker></defs>\n${connections}\n${cards}`,
    960,
    125 + rows * (cardHeight + gapY)
  );
};

const renderMap = (material: Extract<WritingTaskMaterial, { kind: "map" }>): string => {
  const panel = (label: string, after: boolean, x: number) => {
    const features = material.features
      .map((feature, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const cellX = x + 20 + column * 205;
        const cellY = 170 + row * 105;
        const description = after ? feature.after : feature.before;
        return `<rect x="${cellX}" y="${cellY}" width="185" height="84" rx="12" fill="${after ? "#E7F3EC" : "#F1F2F4"}" stroke="${after ? "#72A98B" : "#B8C0CC"}"/><text x="${cellX + 12}" y="${cellY + 24}" fill="#18202B" font-family="system-ui, sans-serif" font-size="13" font-weight="700">${escapeXml(feature.place)}</text><foreignObject x="${cellX + 12}" y="${cellY + 32}" width="160" height="45"><div xmlns="http://www.w3.org/1999/xhtml" style="font: 12px system-ui, sans-serif; color: #3C4655; line-height: 1.3">${escapeXml(description)}</div></foreignObject>`;
      })
      .join("\n");
    return `<rect x="${x}" y="115" width="430" height="395" rx="18" fill="#FFFFFF" stroke="#BCC6D6" stroke-width="2"/><text x="${x + 215}" y="148" text-anchor="middle" fill="#18202B" font-family="system-ui, sans-serif" font-size="19" font-weight="700">${escapeXml(label)}</text>${features}`;
  };
  return svgShell(
    material.title,
    `${panel(material.beforeLabel, false, 35)}\n${panel(material.afterLabel, true, 495)}`,
    960,
    550
  );
};

export const renderTaskMaterialSvg = (material: WritingTaskMaterial): string => {
  switch (material.kind) {
    case "line_graph":
      return renderLineGraph(material);
    case "bar_chart":
      return renderBarChart(material);
    case "pie_chart":
      return renderPieChart(material);
    case "table":
      return renderTable(material);
    case "process":
      return renderProcess(material);
    case "map":
      return renderMap(material);
  }
};

export const describeTaskMaterial = (material: WritingTaskMaterial): string => {
  if (material.kind === "process") {
    const stages = material.stages
      .map((stage, index) => `${index + 1}. ${stage.label}: ${stage.description}`)
      .join(" ");
    return `${material.title}. Stages in order: ${stages} Key features: ${material.keyFeatures.join(" ")}`;
  }
  if (material.kind === "map") {
    const features = material.features
      .map(
        (feature) =>
          `${feature.place}: ${material.beforeLabel} — ${feature.before}; ${material.afterLabel} — ${feature.after}.`
      )
      .join(" ");
    return `${material.title}. ${features} Key features: ${material.keyFeatures.join(" ")}`;
  }
  if (material.kind === "table") {
    const rows = material.rows
      .map(
        (row) =>
          `${row.label}: ${material.columns.map((column, index) => `${column} ${row.values[index]}`).join(", ")}.`
      )
      .join(" ");
    return `${material.title}. Unit: ${material.unit}. ${rows} Key features: ${material.keyFeatures.join(" ")} Comparisons: ${material.comparisons.join(" ")}`;
  }
  const series = material.series
    .map(
      (entry) =>
        `${entry.name}: ${material.categories.map((category, index) => `${category} ${entry.values[index]}`).join(", ")}.`
    )
    .join(" ");
  return `${material.title}. Unit: ${material.unit}. ${series} Key features: ${material.keyFeatures.join(" ")} Comparisons: ${material.comparisons.join(" ")}`;
};

export const deriveWritingPrompt = (
  prompt: WritingPromptSource
): { prompt: GeneratedWritingPrompt; svg: string | null } => {
  const svg = prompt.material ? renderTaskMaterialSvg(prompt.material) : null;
  const assetDigest = svg ? sha256(svg) : null;
  const assetPath = assetDigest ? `/writing/task1/${assetDigest}.svg` : null;
  const accessibleDescription = prompt.material ? describeTaskMaterial(prompt.material) : null;
  const taskMaterialJson = prompt.material ? stableJson(prompt.material) : null;
  const contentHash = sha256(
    stableJson({
      ...prompt,
      taskMaterialJson,
      assetPath,
      assetDigest,
      accessibleDescription
    })
  );
  return {
    prompt: {
      ...prompt,
      taskMaterialJson,
      assetPath,
      assetDigest,
      accessibleDescription,
      contentHash
    },
    svg
  };
};
