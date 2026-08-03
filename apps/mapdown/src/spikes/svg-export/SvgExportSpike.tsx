import { useEffect, useRef, useState } from "react";
import {
  FONT_STACK,
  buildSvg,
  escapeXml,
  measureText,
  rasterise,
  resolveFontFor,
  type ExportNode
} from "./measure";

/*
 * Phase 0 spike 2 — CJK-safe SVG and PNG export.
 *
 * The risk is not "can we draw Chinese" — it is whether an exported file is still correct on
 * someone else's machine. storage-export.md §12.3/§12.6 forbid any external dependency, so the
 * only option is a system font stack, and a system stack resolves differently per machine.
 *
 * Labels come from the 科判 fixture (decisions.md D-12): real deep CJK, mixed with the Latin and
 * punctuation cases that break naive serialisers.
 */

const SAMPLES: string[] = [
  "甲二 所讲之法",
  "乙一 共同外前行",
  "丙二 寿命无常",
  "丁六 思维死缘无定而修无常",
  "戊一 耳不注如覆器之过",
  "己三 八寒地狱",
  "Mixed 中英文 mixed 混排 test",
  'Escaping <&> "quotes" & \'apostrophes\'',
  "emoji 😀 and combining é ǎ ō"
];

type Check = { label: string; pass: boolean; detail: string };

export function SvgExportSpike() {
  const [fontSize, setFontSize] = useState(16);
  const [transparent, setTransparent] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [svgText, setSvgText] = useState("");
  const probe = useRef<SVGTextElement>(null);

  const nodes: ExportNode[] = SAMPLES.map((text, i) => ({
    text,
    x: 20,
    y: 20 + i * (fontSize * 2.4)
  }));

  const { svg, width, height } = buildSvg(nodes, fontSize, transparent ? null : "#ffffff");

  useEffect(() => {
    setSvgText(svg);
    let cancelled = false;

    const run = async () => {
      const results: Check[] = [];
      const cjk = "汉字测试";

      results.push({
        label: "A Han-capable family resolves from the stack",
        pass: !resolveFontFor(cjk, fontSize).startsWith("(no family"),
        detail: `resolved: ${resolveFontFor(cjk, fontSize)}`
      });

      // Canvas measurement is what layout will size node boxes with; the SVG text element is
      // what the export actually paints. If these disagree, every node is the wrong width.
      const sample = "丁六 思维死缘无定而修无常";
      const canvasWidth = measureText(sample, fontSize);
      const svgWidth = probe.current?.getComputedTextLength() ?? 0;
      const delta = Math.abs(canvasWidth - svgWidth);
      results.push({
        label: "Canvas measurement agrees with SVG layout",
        pass: svgWidth > 0 && delta < 1,
        detail: `canvas ${canvasWidth.toFixed(2)}px vs svg ${svgWidth.toFixed(2)}px — Δ ${delta.toFixed(3)}px`
      });

      // A Han glyph is full-width; Latin is proportional. If these came out equal the font
      // silently fell back to a Latin-only face and the export would be wrong elsewhere.
      const han = measureText("汉汉汉汉", fontSize);
      const latin = measureText("iiii", fontSize);
      results.push({
        label: "Han renders full-width, not as fallback boxes",
        pass: han > latin * 1.8,
        detail: `4 Han ${han.toFixed(1)}px vs 4 narrow Latin ${latin.toFixed(1)}px`
      });

      results.push({
        label: "No external reference in the SVG",
        pass: !/<image|xlink:href|@import|url\(\s*['"]?http/i.test(svg),
        detail: "scanned for <image>, xlink:href, @import, url(http…)"
      });

      results.push({
        label: "No script or foreignObject",
        pass: !/<script|<foreignObject/i.test(svg),
        detail: "storage-export.md §12.6"
      });

      results.push({
        label: "Markup in a label is escaped, not injected",
        pass:
          svg.includes(escapeXml('Escaping <&> "quotes" & \'apostrophes\'')) &&
          !svg.includes("<&>"),
        detail: "label containing <, &, quotes round-trips as entities"
      });

      try {
        const raster = await rasterise(svg, width, height, 2);
        if (cancelled) return;
        setPng(raster.url);
        results.push({
          label: "Rasterises to a non-blank PNG at 2×",
          pass: !raster.blank,
          detail: raster.blank
            ? "every pixel transparent — the export would ship empty"
            : `${Math.ceil(width * 2)}×${Math.ceil(height * 2)} px drawn`
        });
      } catch (err) {
        if (cancelled) return;
        results.push({
          label: "Rasterises to a non-blank PNG at 2×",
          pass: false,
          detail: err instanceof Error ? err.message : String(err)
        });
      }

      if (!cancelled) setChecks(results);
    };

    void document.fonts.ready.then(run);
    return () => {
      cancelled = true;
    };
  }, [svg, width, height, fontSize]);

  const download = (data: string, filename: string) => {
    const a = document.createElement("a");
    a.href = data;
    a.download = filename;
    a.click();
  };

  const passed = checks.filter((c) => c.pass).length;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <section style={{ display: "flex", gap: "1.25rem", alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Font size{" "}
          <input
            type="range"
            min={12}
            max={28}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />{" "}
          {fontSize}px
        </label>
        <label>
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
          />{" "}
          Transparent background
        </label>
        <button
          onClick={() =>
            download(
              "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
              "mapdown-spike.svg"
            )
          }
          style={{ font: "inherit", cursor: "pointer" }}
        >
          Download SVG
        </button>
        <button
          onClick={() => png && download(png, "mapdown-spike.png")}
          disabled={!png}
          style={{ font: "inherit", cursor: "pointer" }}
        >
          Download PNG
        </button>
      </section>

      <section>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
          Checks — {passed}/{checks.length} passing
        </h3>
        <div
          style={{
            border: "1px solid var(--chrome-border)",
            borderRadius: "var(--chrome-radius)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "12px"
          }}
        >
          {checks.map((c) => (
            <div
              key={c.label}
              style={{
                padding: "0.4rem 0.75rem",
                borderBottom: "1px solid var(--chrome-border)"
              }}
            >
              <span style={{ color: c.pass ? "var(--chrome-accent)" : "#d94f4f" }}>
                {c.pass ? "PASS" : "FAIL"}
              </span>{" "}
              {c.label}
              <div style={{ color: "var(--chrome-text-muted)" }}>{c.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <h3 style={{ fontSize: "0.95rem" }}>SVG, rendered inline</h3>
          <div
            style={{ border: "1px solid var(--chrome-border)", overflow: "auto" }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
        <div>
          <h3 style={{ fontSize: "0.95rem" }}>PNG, rasterised at 2×</h3>
          <div style={{ border: "1px solid var(--chrome-border)", overflow: "auto" }}>
            {png ? (
              <img src={png} alt="Rasterised export" style={{ width: "100%" }} />
            ) : (
              <p style={{ padding: "1rem", color: "var(--chrome-text-muted)" }}>rasterising…</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: "0.95rem" }}>Serialised output</h3>
        <textarea
          readOnly
          value={svgText}
          rows={6}
          style={{
            width: "100%",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "11px",
            background: "var(--chrome-bg-sunken)",
            color: "inherit",
            border: "1px solid var(--chrome-border)",
            borderRadius: "var(--chrome-radius)"
          }}
        />
      </section>

      {/* Off-screen probe: the browser's own text layout, to compare against canvas measurement. */}
      <svg width="0" height="0" style={{ position: "absolute", visibility: "hidden" }}>
        <text ref={probe} fontFamily={FONT_STACK} fontSize={fontSize}>
          丁六 思维死缘无定而修无常
        </text>
      </svg>
    </div>
  );
}
