#!/usr/bin/env node
// Fail if a built bundle carries the e2e-only test harness from src/main.ts: the mock-wallet and
// client hooks on `window`, or the stub client's fabricated publish digest. A production build
// tree-shakes that block; finding any marker means VITE_E2E leaked into a non-e2e build.
//
// Usage: node scripts/check-prod-bundle.mjs [distDir]   (default: dist)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const dist = process.argv[2] ?? 'dist'

const MARKERS = [
  { name: '__registerMockWallet hook', re: /__registerMockWallet/ },
  { name: '__getSuiClient hook', re: /__getSuiClient/ },
  { name: '__e2eAddress hook', re: /__e2eAddress/ },
  // 'E2E' + 'a'.repeat(41) — as source (minified) or folded into a literal.
  { name: 'fabricated E2E publish digest', re: /["'`]E2E["'`]\s*\+\s*["'`]a["'`]\.repeat\(\s*41\s*\)|E2Ea{41}/ },
]

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (/\.(m?js|html)$/.test(name)) yield path
  }
}

let scanned = 0
const hits = []
try {
  for (const file of files(dist)) {
    scanned++
    const text = readFileSync(file, 'utf8')
    for (const { name, re } of MARKERS) if (re.test(text)) hits.push(`${relative(dist, file)}: ${name}`)
  }
} catch (e) {
  console.error(`check-prod-bundle: cannot read ${dist}/ (${e.message}) — build first.`)
  process.exit(1)
}

if (scanned === 0) {
  console.error(`check-prod-bundle: no .js/.html files under ${dist}/ — build first.`)
  process.exit(1)
}
if (hits.length > 0) {
  console.error('check-prod-bundle: e2e test harness found in the bundle:\n  ' + hits.join('\n  '))
  process.exit(1)
}
console.log(`check-prod-bundle: ${scanned} files clean (no e2e hooks or fabricated digest).`)
