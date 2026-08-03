/*
 * Scaffold placeholder. Not product UI.
 *
 * The editor does not exist yet: Phase 0 has to retire three architectural risks first
 * (docs/mapdown/spec/phases.md). Spikes land in src/spikes/ and are deleted once their
 * findings are written back into the specification.
 */

const SPIKES = [
  {
    id: "ime",
    title: "Chinese IME inside canvas text editing",
    why: "Enter and Tab are both editor commands and IME confirmation keys. The outcome decides the editing architecture — contentEditable, an overlaid textarea, or a hidden input — so everything else waits on it."
  },
  {
    id: "svg-export",
    title: "CJK-safe SVG export",
    why: "An exported SVG may carry no external dependency, so the system font stack has to survive the round trip with Chinese glyphs intact. Cheapest of the three to answer."
  },
  {
    id: "layout",
    title: "Variable-size tidy-tree layout",
    why: "The algorithm is well-trodden; the wrinkle is node sizes measured from text, plus the stability rule that a local edit may only cause local movement."
  }
] as const;

export function App() {
  return (
    <main style={{ maxWidth: "46rem", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.25rem" }}>Mapdown</h1>
      <p style={{ color: "var(--chrome-text-muted)", margin: "0 0 2rem" }}>
        Markdown in, mind map out.
      </p>

      <p>
        Scaffold only — there is no editor yet. The specification lives in{" "}
        <code>docs/mapdown/</code>; start at its README, and read <code>decisions.md</code>{" "}
        before reopening a settled question.
      </p>

      <h2 style={{ fontSize: "1rem", marginTop: "2.5rem" }}>Phase 0 — spikes to run first</h2>
      <ol style={{ paddingLeft: "1.25rem" }}>
        {SPIKES.map((spike) => (
          <li key={spike.id} style={{ marginBottom: "1rem" }}>
            <strong>{spike.title}</strong>
            <div style={{ color: "var(--chrome-text-muted)" }}>{spike.why}</div>
          </li>
        ))}
      </ol>
    </main>
  );
}
