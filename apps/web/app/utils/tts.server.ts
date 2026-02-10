import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { SpeechAlignment, SpeechTimepoint } from "~/utils/tts";
import { MAX_TTS_SSML_BYTES } from "~/utils/tts";

type MdNode = {
  type: string;
  value?: string;
  alt?: string;
  children?: MdNode[];
};

export type SpeechToken = {
  markName: string;
  startChar: number;
  endChar: number;
};

export type SpeechPlan = {
  processedText: string;
  displayText: string;
  ssml: string;
  tokens: SpeechToken[];
};

const BLOCK_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "list",
  "listItem",
  "table",
  "tableRow",
  "code"
]);

const WORD_LEVEL_LANGUAGE_PREFIXES = ["en-", "fr-", "es-"];
const CHAR_LEVEL_LANGUAGE_PREFIXES = ["ja-"];

export class TtsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsValidationError";
  }
}

const normalizeLineEndings = (value: string): string =>
  value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).length;

const markdownToSpeechText = (markdown: string): string => {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdNode;
  const chunks: string[] = [];

  const walk = (node: MdNode) => {
    if (node.type === "text" || node.type === "inlineCode") {
      if (node.value) chunks.push(node.value);
      return;
    }

    if (node.type === "code") {
      if (node.value) chunks.push(node.value);
      chunks.push("\n");
      return;
    }

    if (node.type === "image") {
      if (node.alt) chunks.push(node.alt);
      return;
    }

    if (node.type === "break") {
      chunks.push("\n");
      return;
    }

    if (node.type === "html") {
      return;
    }

    if (node.children?.length) {
      node.children.forEach(walk);
      if (BLOCK_NODE_TYPES.has(node.type)) {
        chunks.push("\n");
      }
    }
  };

  walk(tree);
  return chunks
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

const isWordLevelLanguage = (languageCode: string) =>
  WORD_LEVEL_LANGUAGE_PREFIXES.some((prefix) => languageCode.startsWith(prefix));

const isCharLevelLanguage = (languageCode: string) =>
  CHAR_LEVEL_LANGUAGE_PREFIXES.some((prefix) => languageCode.startsWith(prefix));

const tokenizeByCharacters = (text: string): SpeechToken[] => {
  const tokens: SpeechToken[] = [];
  let cursor = 0;
  let markIndex = 0;
  for (const glyph of text) {
    const nextCursor = cursor + glyph.length;
    if (!/\s/u.test(glyph)) {
      tokens.push({
        markName: `m_${markIndex}`,
        startChar: cursor,
        endChar: nextCursor
      });
      markIndex += 1;
    }
    cursor = nextCursor;
  }
  return tokens;
};

const tokenizeByWords = (text: string): SpeechToken[] => {
  const tokens: SpeechToken[] = [];
  const pattern = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
  let match: RegExpExecArray | null = null;
  let markIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    const startChar = match.index;
    const endChar = startChar + match[0].length;
    tokens.push({
      markName: `m_${markIndex}`,
      startChar,
      endChar
    });
    markIndex += 1;
  }
  return tokens;
};

const tokenizeSpeechText = (text: string, languageCode: string): SpeechToken[] => {
  if (isCharLevelLanguage(languageCode)) {
    return tokenizeByCharacters(text);
  }

  if (isWordLevelLanguage(languageCode)) {
    const tokens = tokenizeByWords(text);
    if (tokens.length > 0) return tokens;
  }

  return tokenizeByCharacters(text);
};

const buildSsml = (displayText: string, tokens: SpeechToken[]): string => {
  let cursor = 0;
  const body: string[] = [];

  for (const token of tokens) {
    body.push(escapeXml(displayText.slice(cursor, token.startChar)));
    body.push(`<mark name="${token.markName}"/>`);
    body.push(escapeXml(displayText.slice(token.startChar, token.endChar)));
    cursor = token.endChar;
  }

  body.push(escapeXml(displayText.slice(cursor)));
  return `<speak>${body.join("")}</speak>`;
};

export const buildSpeechPlan = (input: {
  content: string;
  languageCode: string;
  withTiming: boolean;
}): SpeechPlan => {
  const normalized = normalizeLineEndings(input.content);
  const candidateText = markdownToSpeechText(normalized);
  const processedText = candidateText
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!processedText) {
    throw new TtsValidationError("Text cannot be empty after preprocessing.");
  }

  const tokens = tokenizeSpeechText(processedText, input.languageCode);
  if (tokens.length === 0) {
    throw new TtsValidationError("No readable tokens were found in the input.");
  }

  const ssml = buildSsml(processedText, tokens);
  const payloadBytes = input.withTiming
    ? utf8ByteLength(ssml)
    : utf8ByteLength(processedText);
  if (payloadBytes > MAX_TTS_SSML_BYTES) {
    throw new TtsValidationError(
      `Input is too long. Google TTS allows at most ${MAX_TTS_SSML_BYTES.toLocaleString()} bytes per request (${payloadBytes.toLocaleString()} bytes provided after preprocessing).`
    );
  }

  return {
    processedText,
    displayText: processedText,
    ssml,
    tokens
  };
};

export const buildSpeechAlignment = (input: {
  displayText: string;
  tokens: SpeechToken[];
  timepoints: SpeechTimepoint[];
}): SpeechAlignment => {
  const timeByMark = new Map<string, number>();
  for (const point of input.timepoints) {
    if (!Number.isFinite(point.timeSeconds)) continue;
    timeByMark.set(point.markName, point.timeSeconds);
  }

  const marks = input.tokens
    .map((token) => {
      const startSec = timeByMark.get(token.markName);
      if (startSec === undefined) return null;
      return {
        name: token.markName,
        startSec,
        startChar: token.startChar,
        endChar: token.endChar
      };
    })
    .filter((mark): mark is SpeechAlignment["marks"][number] => mark !== null)
    .sort((a, b) => a.startSec - b.startSec);

  return {
    displayText: input.displayText,
    marks
  };
};
