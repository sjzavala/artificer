#!/usr/bin/env bash
# Prompts for the Anthropic API key and puts it where it needs to go:
# .env.local for development, and the Vercel production environment.
#
# The key is read from a hidden prompt and never written to shell history, a
# command line, or anything but the two destinations below.
#
#   ./scripts/set-api-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."

printf 'Paste your ANTHROPIC_API_KEY (input hidden), then press Enter: '
read -rs ARTIFICER_KEY
printf '\n'

if [ -z "${ARTIFICER_KEY}" ]; then
  echo "No key entered. Nothing changed." >&2
  exit 1
fi

export ARTIFICER_KEY

node -e '
  const fs = require("fs");
  const path = ".env.local";
  const key = process.env.ARTIFICER_KEY;
  let body = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
  body = /^ANTHROPIC_API_KEY=.*$/m.test(body)
    ? body.replace(/^ANTHROPIC_API_KEY=.*$/m, "ANTHROPIC_API_KEY=" + key)
    : body.replace(/\n*$/, "\n") + "ANTHROPIC_API_KEY=" + key + "\n";
  fs.writeFileSync(path, body);
  console.log("Wrote ANTHROPIC_API_KEY to .env.local");
'

if command -v vercel >/dev/null 2>&1 || [ -x node_modules/.bin/vercel ]; then
  npx vercel env rm ANTHROPIC_API_KEY production --yes >/dev/null 2>&1 || true
  printf '%s' "${ARTIFICER_KEY}" | npx vercel env add ANTHROPIC_API_KEY production
  echo "Added ANTHROPIC_API_KEY to the Vercel production environment"
else
  echo "Vercel CLI not found — skipped the production environment." >&2
fi

unset ARTIFICER_KEY
echo "Done."
