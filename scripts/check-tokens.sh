#!/usr/bin/env bash
# Token discipline check. Fails if forbidden literals found in source.
# Usage: bash scripts/check-tokens.sh [path1] [path2] ...
# Defaults to scanning components/, app/, and src/ if no paths given.

set -euo pipefail

TARGETS=("$@")
if [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS=(components app src)
fi

# Filter to existing paths only
EXISTING=()
for t in "${TARGETS[@]}"; do
  [ -e "$t" ] && EXISTING+=("$t")
done

if [ ${#EXISTING[@]} -eq 0 ]; then
  echo "✓ Token check skipped (no source dirs found at: ${TARGETS[*]})"
  exit 0
fi

VIOLATION_TYPES=0

check() {
  local pattern="$1"
  local message="$2"
  local matches
  matches=$(grep -rEn \
    --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.css" \
    "$pattern" "${EXISTING[@]}" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo "✗ $message"
    echo "$matches" | sed 's/^/    /'
    echo ""
    VIOLATION_TYPES=$((VIOLATION_TYPES + 1))
  fi
}

# The Tailwind palette literals — most common offender
TAILWIND_COLORS='red|blue|green|yellow|purple|pink|indigo|gray|zinc|slate|stone|neutral|orange|amber|lime|emerald|teal|cyan|sky|violet|fuchsia|rose'

check "(^|[^-])bg-(${TAILWIND_COLORS})-[0-9]+" \
  "Hardcoded Tailwind color background. Use semantic tokens (bg-background, bg-card, bg-accent, etc.)."

check "(^|[^-])text-(${TAILWIND_COLORS})-[0-9]+" \
  "Hardcoded Tailwind color text. Use semantic tokens (text-foreground, text-muted-foreground, text-accent, etc.)."

check "(^|[^-])border-(${TAILWIND_COLORS})-[0-9]+" \
  "Hardcoded Tailwind color border. Use semantic tokens (border-border, border-accent, etc.)."

check "(^|[^-])ring-(${TAILWIND_COLORS})-[0-9]+" \
  "Hardcoded Tailwind ring color. Use semantic tokens."

# Hex colors inside className strings
check 'className=[^>]*#[0-9a-fA-F]{3,8}' \
  "Hex literal inside className. Use OKLCH tokens via @theme inline."

# Inline hex colors via style prop
check 'style=\{\{[^}]*color:[^}]*[\"'"'"']#[0-9a-fA-F]{3,8}' \
  "Inline hex color in style prop. Use a semantic token."

# Forbidden default fonts
check '(font-family|fontFamily)[^a-zA-Z0-9].*[\"'"'"'](Inter|Roboto|Open Sans|Lato|Arial)[\"'"'"', ]' \
  "Forbidden default font (Inter, Roboto, Open Sans, Lato, Arial). Use the brand fonts from DESIGN.md."

# Material default easing — this is the dead giveaway of generic motion
check 'cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)' \
  "Material default easing. Use the project ease curves from DESIGN.md."

if [ "$VIOLATION_TYPES" -gt 0 ]; then
  echo "❌ Token check failed. $VIOLATION_TYPES violation type(s) found."
  echo "   Fix the above, or update DESIGN.md if the rule itself is wrong."
  exit 1
fi

echo "✓ Token check passed."
