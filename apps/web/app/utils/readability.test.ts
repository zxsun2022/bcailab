import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Token-pair regression only; browser checks still establish actual backgrounds and states.
const css = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");
const color = (value: string): number[] => value.startsWith("#")
  ? value.slice(1).match(/../g)!.map((part) => parseInt(part, 16))
  : value.match(/[\d.]+/g)!.map(Number);
const composite = (foreground: number[], background: number[]) => foreground.slice(0, 3)
  .map((value, i) => value * (foreground[3] ?? 1) + background[i] * (1 - (foreground[3] ?? 1)));
const luminance = (rgb: number[]) => rgb.map((channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: number[], b: number[]) => {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};
const themes = [
  ["light", css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)"))],
  ["auto dark", css.slice(css.indexOf(":root:not([data-resolved-theme])"), css.indexOf(':root[data-resolved-theme="dark"]'))],
  ["explicit dark", css.slice(css.indexOf(':root[data-resolved-theme="dark"]')).split("}")[0]]
];
describe("readable supporting colors", () => {
  for (const [name, block] of themes) {
    const token = (key: string) => color(block.match(new RegExp(`--${key}:\\s*([^;]+);`))![1]);
    it(`${name}: necessary supporting text clears 4.5 on page and card surfaces`, () => {
      for (const surface of ["bg", "bg-alt", "bg-card"]) {
        for (const text of ["text-muted", "text-faint"]) {
          expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it(`${name}: control boundaries clear 3 including alpha composition`, () => {
      for (const surface of ["bg", "bg-alt", "bg-card"]) {
        const background = token(surface);
        expect(contrast(composite(token("border-control"), background), background)).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
