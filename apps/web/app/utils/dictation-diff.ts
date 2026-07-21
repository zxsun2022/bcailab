/**
 * Deterministic dictation scoring — token-level alignment between the reference
 * transcript and what the learner typed.
 *
 * This module is deliberately **pure**: no server imports, no DOM, no framework.
 * The session page uses it for instant per-sentence feedback and the completion
 * action uses it to recompute the authoritative score from stored reference text
 * (client scores are never trusted). Both must agree, so there is exactly one
 * implementation. Design: docs/dictation-v1-design.md §7.
 */

export type DiffOp =
  | { op: "match"; ref: string; got: string }
  | { op: "substitute"; ref: string; got: string }
  /** A reference word the learner missed. */
  | { op: "delete"; ref: string }
  /** An extra word the learner typed. */
  | { op: "insert"; got: string };

export type SentenceDiff = {
  /** Full alignment in reading order, including matches (used for token rendering). */
  ops: DiffOp[];
  matches: number;
  referenceTokenCount: number;
  /** matches / referenceTokenCount, 0..1 */
  accuracy: number;
};

export type PassageDiff = {
  sentences: SentenceDiff[];
  /** Reference-token-weighted across sentences, so long sentences count for more. */
  accuracy: number;
};

/**
 * Lowercase, collapse whitespace, and drop punctuation — except apostrophes and
 * hyphens *inside* a word, so "don't" and "twenty-five" stay single tokens and a
 * missing comma never costs the learner points.
 */
export const normalizeText = (input: string): string =>
  input
    .toLowerCase()
    // Curly apostrophes and unicode dashes normalize to their ASCII forms first, so
    // the punctuation filter below does not split "don't" or "twenty-five".
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenize = (input: string): string[] =>
  normalizeText(input)
    .split(" ")
    // Strip edge apostrophes/hyphens left behind by quoting or dashes ("'hello'", "well--").
    .map((token) => token.replace(/^['-]+/, "").replace(/['-]+$/, ""))
    .filter((token) => token.length > 0);

/**
 * British/American spelling equivalence (owner, 2026-07-20): the library text may use
 * either convention and the learner may type either — neither should cost points.
 * Canonicalization is used ONLY for equality testing during alignment; displayed
 * tokens keep their original spelling.
 *
 * Coverage is deliberately conservative: a dictionary of common variant pairs plus
 * two suffix rules (-our→-or, -ise→-ize). The suffix rules run on both sides, so a
 * word they mangle identically (e.g. "promise"→"promize") still compares correctly;
 * the only cost is accepting a matching misspelling of that rare shape.
 */
const SPELLING_EQUIVALENTS: Record<string, string> = {
  centre: "center",
  centres: "centers",
  centred: "centered",
  theatre: "theater",
  theatres: "theaters",
  metre: "meter",
  metres: "meters",
  litre: "liter",
  litres: "liters",
  fibre: "fiber",
  fibres: "fibers",
  grey: "gray",
  greys: "grays",
  practise: "practice",
  practises: "practices",
  practised: "practiced",
  practising: "practicing",
  licence: "license",
  licences: "licenses",
  defence: "defense",
  defences: "defenses",
  offence: "offense",
  offences: "offenses",
  pretence: "pretense",
  programme: "program",
  programmes: "programs",
  cheque: "check",
  cheques: "checks",
  tyre: "tire",
  tyres: "tires",
  kerb: "curb",
  kerbs: "curbs",
  mould: "mold",
  moulds: "molds",
  moulded: "molded",
  moustache: "mustache",
  pyjamas: "pajamas",
  plough: "plow",
  ploughs: "plows",
  aluminium: "aluminum",
  storey: "story",
  storeys: "stories",
  jewellery: "jewelry",
  marvellous: "marvelous",
  woollen: "woolen",
  traveller: "traveler",
  travellers: "travelers",
  travelled: "traveled",
  travelling: "traveling",
  cancelled: "canceled",
  cancelling: "canceling",
  labelled: "labeled",
  labelling: "labeling",
  modelled: "modeled",
  modelling: "modeling",
  counsellor: "counselor",
  counsellors: "counselors",
  counselling: "counseling",
  quarrelled: "quarreled",
  signalled: "signaled",
  fuelled: "fueled",
  enrolment: "enrollment",
  fulfil: "fulfill",
  fulfilment: "fulfillment",
  instalment: "installment",
  skilful: "skillful",
  learnt: "learned",
  dreamt: "dreamed",
  spelt: "spelled",
  burnt: "burned",
  spoilt: "spoiled",
  leant: "leaned"
};

const canonicalizeSpelling = (token: string): string => {
  const direct = SPELLING_EQUIVALENTS[token];
  if (direct) return direct;
  let canonical = token;
  // -our- → -or- (colour, flavoured, favourite, neighbourhood…): "our" at the end or
  // before a common suffix. The length guard keeps short words where "our" is part of
  // the stem (four, hours, tours, pour, sour, ours) intact.
  if (canonical.length >= 6) {
    canonical = canonical.replace(/our(s|ed|ing|ite|ites|ful|fully|able|hood)?$/, "or$1");
  }
  // -ise family → -ize (realise/realised/realising/realisation, organiser…).
  canonical = canonical.replace(/is(e[sdr]?|ers|ing|ations?)$/, "iz$1");
  return canonical;
};

const tokensEqual = (a: string, b: string): boolean =>
  a === b || canonicalizeSpelling(a) === canonicalizeSpelling(b);

type Move = "match" | "substitute" | "delete" | "insert";

/**
 * Token-level Levenshtein with backtrace. Sentences are ≤ ~20 tokens, so the full
 * matrix is cheap and the explicit backtrace keeps the alignment readable.
 */
const align = (reference: string[], user: string[]): DiffOp[] => {
  const m = reference.length;
  const n = user.length;
  const cost: number[][] = [];
  const from: Move[][] = [];

  for (let i = 0; i <= m; i += 1) {
    cost[i] = new Array<number>(n + 1).fill(0);
    from[i] = new Array<Move>(n + 1).fill("match");
  }
  for (let i = 1; i <= m; i += 1) {
    cost[i]![0] = i;
    from[i]![0] = "delete";
  }
  for (let j = 1; j <= n; j += 1) {
    cost[0]![j] = j;
    from[0]![j] = "insert";
  }

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const same = tokensEqual(reference[i - 1]!, user[j - 1]!);
      const diagonal = cost[i - 1]![j - 1]! + (same ? 0 : 1);
      const deletion = cost[i - 1]![j]! + 1;
      const insertion = cost[i]![j - 1]! + 1;
      let best = diagonal;
      let move: Move = same ? "match" : "substitute";
      if (deletion < best) {
        best = deletion;
        move = "delete";
      }
      if (insertion < best) {
        best = insertion;
        move = "insert";
      }
      cost[i]![j] = best;
      from[i]![j] = move;
    }
  }

  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const move = i === 0 ? "insert" : j === 0 ? "delete" : from[i]![j]!;
    if (move === "match" || move === "substitute") {
      ops.push({ op: move, ref: reference[i - 1]!, got: user[j - 1]! });
      i -= 1;
      j -= 1;
    } else if (move === "delete") {
      ops.push({ op: "delete", ref: reference[i - 1]! });
      i -= 1;
    } else {
      ops.push({ op: "insert", got: user[j - 1]! });
      j -= 1;
    }
  }
  return ops.reverse();
};

export const scoreSentence = (reference: string, userText: string): SentenceDiff => {
  const referenceTokens = tokenize(reference);
  const userTokens = tokenize(userText);
  const ops = align(referenceTokens, userTokens);
  const matches = ops.reduce((total, entry) => (entry.op === "match" ? total + 1 : total), 0);
  const referenceTokenCount = referenceTokens.length;
  // Flooding guard (owner, 2026-07-20): extra words are free — a learner should not
  // lose points for hedging — but only while the answer stays under 2× the reference
  // length. Beyond that, each overflow token cancels a match, so pasting a wall of
  // text cannot score.
  const overflow = Math.max(0, userTokens.length - 2 * referenceTokenCount);
  const effectiveMatches = Math.max(0, matches - overflow);
  return {
    ops,
    matches,
    referenceTokenCount,
    accuracy: referenceTokenCount === 0 ? 1 : effectiveMatches / referenceTokenCount
  };
};

export const scorePassage = (
  entries: Array<{ reference: string; userText: string }>
): PassageDiff => {
  const sentences = entries.map((entry) => scoreSentence(entry.reference, entry.userText));
  const totalReference = sentences.reduce((sum, s) => sum + s.referenceTokenCount, 0);
  // Weight by per-sentence accuracy (not raw matches) so the flooding guard above
  // carries through to the passage score.
  const weighted = sentences.reduce((sum, s) => sum + s.accuracy * s.referenceTokenCount, 0);
  return {
    sentences,
    accuracy: totalReference === 0 ? 0 : weighted / totalReference
  };
};

/**
 * The subset of ops persisted in `dictation_attempts.sentence_results`. Matches are
 * dropped because they are recoverable from the reference text, and this JSON is the
 * stable observation format Dictation v2 aggregates — keep it minimal and factual.
 */
export const storableOps = (ops: DiffOp[]): DiffOp[] => ops.filter((entry) => entry.op !== "match");
