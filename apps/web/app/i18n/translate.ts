import type { Locale } from "./locale";
import { en, type MessageKey } from "./messages/en";
import { zh } from "./messages/zh";

export type { MessageKey } from "./messages/en";

/** Values a message may interpolate. */
export type MessageVars = Record<string, string | number>;

export type Translate = (key: MessageKey, vars?: MessageVars) => string;

/**
 * Both catalogues are bundled and selected at render time (design §3.3). At two locales this
 * costs less than splitting them, and client navigation never waits on a catalogue fetch.
 */
export const CATALOGUES: Record<Locale, Record<MessageKey, string>> = { en, zh };

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Replaces `{name}` placeholders. A placeholder with no value is left visible rather than
 * blanked, so a missing variable shows up in review instead of silently deleting words.
 */
export const interpolate = (template: string, vars?: MessageVars): string =>
  vars
    ? template.replace(PLACEHOLDER, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
      )
    : template;

/** The placeholder names a template uses, for the catalogue parity test. */
export const placeholdersOf = (template: string): string[] =>
  [...template.matchAll(PLACEHOLDER)].map((match) => match[1]!).sort();

export const createTranslator = (locale: Locale): Translate => {
  const catalogue = CATALOGUES[locale];
  return (key, vars) => interpolate(catalogue[key], vars);
};

/**
 * Splits a template around `{name}` placeholders so React nodes can stand in for them —
 * for copy whose word order differs by language around an element such as `<strong>`.
 */
export const splitTemplate = (
  template: string
): Array<{ kind: "text"; value: string } | { kind: "slot"; name: string }> => {
  const parts: Array<{ kind: "text"; value: string } | { kind: "slot"; name: string }> = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ kind: "text", value: template.slice(last, index) });
    parts.push({ kind: "slot", name: match[1]! });
    last = index + match[0].length;
  }
  if (last < template.length) parts.push({ kind: "text", value: template.slice(last) });
  return parts;
};
