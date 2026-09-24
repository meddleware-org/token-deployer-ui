#!/usr/bin/env bash
set -euo pipefail
# Copies the canonical sui-token-template text files into the app as a single
# JSON module (src/template-src/files.json), so the downloadable-package
# generator stays the single source of truth with the CLI generator. Re-run
# whenever the template's source/docs/scripts change.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HERE/.."
# Canonical template = the published @meddleware/sui-token-template package
# (resolved from node_modules); override with SUI_TOKEN_TEMPLATE_DIR for a local checkout.
T="${SUI_TOKEN_TEMPLATE_DIR:-$(cd "$APP_DIR" && node -e "process.stdout.write(require('path').dirname(require.resolve('@meddleware/sui-token-template/package.json')))" 2>/dev/null || true)}"
if [[ -z "${T:-}" || ! -f "$T/Move.toml" ]]; then
  echo "ERROR: sui-token-template sources not found. Install @meddleware/sui-token-template or set SUI_TOKEN_TEMPLATE_DIR to a local checkout." >&2
  exit 1
fi
OUT="$APP_DIR/src/template-src/files.json"
mkdir -p "$APP_DIR/src/template-src"

node - "$T" "$OUT" <<'NODE'
const fs = require('node:fs');
const [T, OUT] = process.argv.slice(2);
const read = (p) => fs.readFileSync(`${T}/${p}`, 'utf8');
const files = {
  'Move.toml': read('Move.toml'),
  'source.move': read('sources/sui_token_template.move'),
  'scripts/publish.sh': read('templates/publish.sh'),
  '.gitignore': read('templates/.gitignore'),
  'README.md': read('templates/README.md'),
  'deployments.md': read('templates/deployments.md'),
  'CLAUDE.md': read('templates/CLAUDE.md'),
  'AGENTS.md': read('templates/AGENTS.md'),
};
fs.writeFileSync(OUT, JSON.stringify(files, null, 2) + '\n');
console.log('wrote %s (%d files)', OUT, Object.keys(files).length);
NODE
