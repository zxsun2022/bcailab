#!/usr/bin/env bash
#
# context-pack.sh — Generate a self-contained project context pack for consulting
# an external AI (ChatGPT, Gemini, another Claude session, …) about this repo.
#
# Design principle: docs/ carries *intent and conventions*; everything factual
# (routes, schema, env var names, dependencies, git state) is derived live from
# the repo at generation time, so the pack captures code facts at generation time; hand-written claims may still drift.
#
# Default environment extraction includes names only; review explicitly requested sources for secrets.
#
# Usage:
#   scripts/context-pack.sh                          # docs + derived facts
#   scripts/context-pack.sh -q "Why is X slow?"      # embed the question up top
#   scripts/context-pack.sh -p arch                  # profile: arch | product | debug | full
#   scripts/context-pack.sh -s apps/web/app/utils/llm.server.ts -s apps/web/app/routes/translate.tsx
#   scripts/context-pack.sh -o /tmp/pack.md
#
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROFILE="full"
QUESTION=""
OUT=""
SOURCES=()

usage() {
  sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--profile|-q|--question|-o|--out|-s|--source)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; } ;;
  esac
  case "$1" in
    -p|--profile) PROFILE="$2"; shift 2 ;;
    -q|--question) QUESTION="$2"; shift 2 ;;
    -o|--out) OUT="$2"; shift 2 ;;
    -s|--source) SOURCES+=("$2"); shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done

case "$PROFILE" in
  arch|product|debug|full) ;;
  *) echo "Unknown profile: $PROFILE (expected arch|product|debug|full)" >&2; exit 1 ;;
esac

STAMP="$(date +%Y%m%d-%H%M)"
OUT="${OUT:-$ROOT/.context/context-pack-$PROFILE-$STAMP.md}"


# ---------- helpers ----------

# Emit a preflight-validated file under a heading. Missing input is an error.
#
# Markdown is inlined rather than fenced — the docs contain their own ``` blocks,
# which would terminate an outer fence early and corrupt everything after it.
# Their headings are demoted three levels so they nest under this pack's outline.
# Everything else is fenced with a language tag.
emit_file() {
  local path="$1" lang="${2:-}"
  [[ -f "$path" ]] || { echo "Required input disappeared: $path" >&2; return 1; }
  if [[ "$lang" == "markdown" ]]; then
    printf '\n### `%s` *(%s)*\n\n' "$path" "$(file_role "$path")"
    sed -E 's/^(#{1,3}) /\1### /' "$path"
    printf '\n'
  else
    printf '\n### `%s`\n\n```%s\n' "$path" "$lang"
    cat "$path"
    printf '\n```\n'
  fi
}

# Emit a fenced block from a command's stdout.
emit_cmd() {
  local title="$1" lang="$2"; shift 2
  printf '\n### %s\n\n```%s\n' "$title" "$lang"
  if ! "$@"; then
    printf '\n[unavailable: command failed; do not treat this section as complete evidence]\n'
    printf 'WARNING: context section unavailable: %s\n' "$title" >&2
  fi
  printf '```\n'
}

want() { # want <profile>... -> true if current PROFILE matches one
  local p
  for p in "$@"; do [[ "$PROFILE" == "$p" ]] && return 0; done
  return 1
}

# Redact things that look like credentials or resource ids before they leave the repo.
redact() {
  sed -E \
    -e 's/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/<uuid-redacted>/g' \
    -e 's/(sk-|re_|AIza)[A-Za-z0-9_\-]{8,}/<key-redacted>/g'
}

# Hand-written history never becomes current derived evidence, even when explicitly requested.
file_role() {
  case "$1" in
    *docs/changelog.md|*docs/documentation-audit.md|*docs/roadmap-accepted-history.md) echo history ;;
    *.md) echo intent ;;
    *) echo derived ;;
  esac
}

# Validate selected input sets before touching output. Globs must not silently match nothing.
shopt -s nullglob
REQUIRED=(README.md docs/README.md docs/architecture.md package.json apps/web/package.json apps/mapdown/package.json wrangler.toml)
if want product full; then
  REQUIRED+=(docs/roadmap.md docs/access-model.md docs/changelog.md)
  TOOL_DOCS=(docs/tools/*.md)
  [[ ${#TOOL_DOCS[@]} -gt 0 ]] || { echo "Missing required tool documents" >&2; exit 1; }
  REQUIRED+=("${TOOL_DOCS[@]}")
fi
if want arch product full; then
  DECISIONS=(docs/decisions/*.md)
  [[ ${#DECISIONS[@]} -gt 0 ]] || { echo "Missing required decision records" >&2; exit 1; }
  REQUIRED+=("${DECISIONS[@]}" docs/mapdown/decisions.md AGENTS.md)
fi
if want arch full; then
  REQUIRED+=(docs/infra-cloudflare.md docs/design-system.md docs/css-layout-conventions.md docs/verification.md)
fi
MIGRATIONS=(migrations/*.sql)
ROUTES=(apps/web/app/routes/*)
[[ ${#MIGRATIONS[@]} -gt 0 && ${#ROUTES[@]} -gt 0 ]] || { echo "Missing required migrations or routes" >&2; exit 1; }
REQUIRED+=("${MIGRATIONS[@]}")
if [[ ${#SOURCES[@]} -gt 0 ]]; then
  want debug full || { echo "Requested sources require -p debug or -p full" >&2; exit 1; }
  for source in "${SOURCES[@]}"; do
    case "${source##*/}" in
      .dev.vars*|.env*|*service-account*.json) echo "Refusing credential source: $source" >&2; exit 1 ;;
    esac
    [[ ! -L "$source" ]] || { echo "Refusing symlink source: $source" >&2; exit 1; }
    REQUIRED+=("$source")
  done
fi
for input in "${REQUIRED[@]}"; do
  [[ -f "$input" && -r "$input" ]] || { echo "Missing or unreadable required input: $input" >&2; exit 1; }
done
git rev-parse --is-inside-work-tree >/dev/null || { echo "Context pack needs a Git checkout" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"
TEMP_OUT="$(mktemp "${OUT}.tmp.XXXXXX")"
trap 'rm -f "$TEMP_OUT"' EXIT
trap 'echo "Context generation failed at line $LINENO; previous output preserved." >&2' ERR

# ---------- build ----------

{

cat <<EOF
# bcailab — Project Context Pack

Generated: $(date '+%Y-%m-%d %H:%M %Z') · Profile: \`$PROFILE\` · Commit: \`$(git rev-parse --short HEAD)\` on \`$(git rev-parse --abbrev-ref HEAD)\`
Working tree: $(if [[ -n "$(git status --porcelain)" ]]; then echo "**dirty** ($(git status --porcelain | wc -l | tr -d ' ') changed files)"; else echo "clean"; fi)

---

## How to use this document

You are being consulted about a codebase you cannot browse. This document is the
*entire* context you have — it was generated mechanically from the repository, so
the derived sections reflect the checkout at generation time (including any uncommitted
changes noted above). This is not an inspection of production or a guarantee that prose is current.

Ground rules for your answer:

- **Do not invent files, routes, or APIs.** If something you need is not in this
  pack, say explicitly what you'd need to see rather than guessing.
- **Distinguish the three kinds of section below.** Sections marked *(intent)* are
  hand-written docs describing goals and conventions — they may lag the code.
  Sections marked *(derived)* were extracted from the code at generation time and
  establish checkout facts within the extractor's limits, not remote deployment state.
  Sections marked *(history)* preserve dated observations; they are not current facts,
  active authorization, or proof that their old open questions remain open.
- **Where intent and derived facts disagree, flag the drift** — that gap is often
  itself the bug.
- Prefer concrete, diff-level recommendations over general advice. The reader is
  the sole maintainer and works through AI coding agents, so answers that name
  exact files and describe exact changes are directly actionable.
EOF

if [[ -n "$QUESTION" ]]; then
cat <<EOF

---

## The question

$QUESTION
EOF
fi

cat <<'EOF'

---

## 1. What this project is *(intent)*
EOF

emit_file README.md markdown
emit_file docs/README.md markdown
emit_file docs/architecture.md markdown

if want product full; then
cat <<'EOF'

---

## 2. Product direction and current iteration *(intent)*
EOF
emit_file docs/roadmap.md markdown
emit_file docs/access-model.md markdown
fi

if want arch product full; then
cat <<'EOF'

---

## 2b. Decision records *(intent — read each status)*

Decision records retain their own status and corrections. Accepted records say *why* the project is shaped the way it is, and which
questions are closed. Do not propose reopening one without addressing its recorded reasoning.
EOF
  for f in docs/decisions/*.md; do emit_file "$f" markdown; done
  emit_file docs/mapdown/decisions.md markdown
fi

if want product full; then
cat <<'EOF'

---

## 2c. Delivery record *(history)*

What has shipped and what was learned. History, not a plan.
EOF
emit_file docs/changelog.md markdown
fi

if want arch product full; then
cat <<'EOF'

---

## 3. Working conventions for this repo *(intent)*

These are the rules any agent editing this repo must follow. If you propose changes,
they should be consistent with these conventions.
EOF
emit_file AGENTS.md markdown
fi

if want product full; then
cat <<'EOF'

---

## 4. Per-tool documentation *(intent)*
EOF
  for f in docs/tools/*.md; do emit_file "$f" markdown; done
fi

if want arch full; then
cat <<'EOF'

---

## 5. Infrastructure and design system *(intent)*
EOF
  emit_file docs/infra-cloudflare.md markdown
  emit_file docs/design-system.md markdown
  emit_file docs/css-layout-conventions.md markdown
  emit_file docs/verification.md markdown
fi

cat <<'EOF'

---

## 6. Actual route inventory *(derived)*

Remix flat-file routes in `apps/web/app/routes/`. The filename encodes the URL —
dots are path separators, `$` marks a dynamic segment, and a trailing `_` on a
segment escapes layout nesting (see the routing conventions above).
EOF

printf '\n```\n'
ls apps/web/app/routes | sed 's/^/apps\/web\/app\/routes\//'
printf '```\n'

cat <<'EOF'

### Route module exports *(derived)*

Which routes have a `loader`, an `action`, or a default component — useful for
telling data endpoints apart from pages.
EOF

printf '\n```\n'
for f in apps/web/app/routes/*; do
  name="$(basename "$f")"
  ex=""
  grep -qE '(export (async )?function loader|export const loader)' "$f" && ex="${ex}loader "
  grep -qE '(export (async )?function action|export const action)' "$f" && ex="${ex}action "
  grep -qE 'export default' "$f" && ex="${ex}component "
  printf '%-34s %s\n' "$name" "${ex:-—}"
done
printf '```\n'

cat <<'EOF'

---

## 7. Server-side modules *(derived)*

`*.server.ts` files run only on the Cloudflare Worker. Line counts hint at where
the complexity lives.
EOF

printf '\n```\n'
find apps/web/app packages -name '*.ts' -o -name '*.tsx' 2>/dev/null \
  | grep -v node_modules \
  | xargs wc -l 2>/dev/null \
  | sort -rn \
  | sed '/ total$/d' \
  | sed -n '1,40p'
printf '```\n'

cat <<'EOF'

---

## 8. Database schema *(derived)*

Cloudflare D1 (SQLite). Migrations are applied in filename order; the schema below
is the ordered migration history, not a reconstructed schema or a live database inspection.
EOF

for f in migrations/*.sql; do emit_file "$f" sql; done

cat <<'EOF'

---

## 9. Runtime bindings and configuration *(derived)*

Cloudflare Pages + Workers configuration. Resource IDs are redacted.
EOF

printf '\n### `wrangler.toml`\n\n```toml\n'
redact < wrangler.toml
printf '```\n'

cat <<'EOF'

### Environment bindings *(derived — names only, values never included)*

Everything the app reads off `env` at runtime. `DB` and `R2` are Cloudflare
bindings declared in `wrangler.toml`; the rest are secrets/vars, set in production
via `wrangler pages secret put` (Production env) or the Pages dashboard (Preview env).
EOF

printf '\n```\n'
{
  [[ -f .dev.vars ]] && grep -oE '^[A-Z_][A-Z0-9_]*' .dev.vars
  grep -rhoE 'env\.[A-Z_][A-Z0-9_]*' apps/web/app packages 2>/dev/null | sed 's/^env\.//'
} | sort -u
printf '```\n'

cat <<'EOF'

---

## 10. Dependencies *(derived)*
EOF

emit_file package.json json
emit_file apps/web/package.json json
emit_file apps/mapdown/package.json json

cat <<'EOF'

---

## 11. Recent history *(derived)*

What has actually been changing lately — useful for judging whether a problem is
new, and for seeing the maintainer's working rhythm.
EOF

emit_cmd "Last 25 commits" "" git log --oneline -25
emit_cmd "Files changed most in the last 60 days" "" bash -o pipefail -c \
  "git log --since='60 days ago' --name-only --pretty=format: | grep -v '^\$' | sort | uniq -c | sort -rn | sed -n '1,25p'"

if want debug full && [[ ${#SOURCES[@]} -gt 0 ]]; then
cat <<'EOF'

---

## 12. Requested files (each labelled intent, history or derived)
EOF
  for s in "${SOURCES[@]}"; do
    if [[ -f "$s" ]]; then
      ext="${s##*.}"
      printf '\n### `%s` *(%s)*\n\n```%s\n' "$s" "$(file_role "$s")" "$ext"
      redact < "$s"
      printf '```\n'
    else
      echo "Requested input disappeared: $s" >&2; exit 1
    fi
  done
fi

cat <<'EOF'

---

## Appendix: full file inventory *(derived)*
EOF

printf '\n```\n'
git ls-files | grep -vE '^(pnpm-lock.yaml|docs/.*\.docx)$'
printf '```\n'

} | redact > "$TEMP_OUT"
mv "$TEMP_OUT" "$OUT"

# ---------- report ----------

BYTES=$(wc -c < "$OUT" | tr -d ' ')
TOKENS=$(( BYTES / 4 ))

echo "Wrote $OUT"
echo "  profile: $PROFILE"
echo "  size:    $(( BYTES / 1024 )) KB  (~${TOKENS} tokens)"
if [[ $TOKENS -gt 150000 ]]; then
  echo "  NOTE: large. Consider a narrower profile (-p arch or -p product)."
fi
