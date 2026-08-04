# Mapdown performance baseline

Baseline captured on 2026-08-04 with Node 26.5.0. The deterministic workload uses Chinese
node text and a balanced two-sided tree, and reports the median of seven measured runs after
one warm-up.

Run it from the repository root:

```bash
pnpm benchmark:mapdown
```

| Nodes | Layout | Create child | Markdown export | SVG export |
|---:|---:|---:|---:|---:|
| 100 | 0.159ms | 0.197ms | 0.071ms | 0.427ms |
| 500 | 0.424ms | 0.628ms | 0.189ms | 1.537ms |
| 2,000 | 2.204ms | 3.028ms | 0.766ms | 6.578ms |

The 500-node layout remains well below one 16.7ms frame. SVG serialization is the largest
pure-logic cost at 2,000 nodes, but is still below half a frame on the baseline machine.
Rendering remains the more likely large-map bottleneck, so computed node coordinates stay
outside React state.

## Production build

The production build's initial resources are:

- application JavaScript: 248.60KB raw / 81.55KB gzip;
- application CSS: 4.14KB raw / 1.50KB gzip;
- CommonMark import parser: 164.94KB raw / 57.58KB gzip, loaded only when the user opens a
  Markdown file.

A local production-preview load transferred 81,625 bytes of JavaScript and 1,520 bytes of CSS,
with a 5ms TTFB and 77ms load event. The exact timing is machine-dependent; bundle composition
and the deterministic benchmark above are the regression signals to compare between changes.

## Guardrails

Markdown import rejects files over 5MB, trees over 10,000 nodes, nesting deeper than 100, and
individual node labels over 10,000 Unicode code points. These limits keep malformed or hostile
inputs from monopolizing the UI thread or memory.
