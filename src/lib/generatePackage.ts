// Client-side generator for the downloadable source package. Mirrors the CLI
// generator (blockchain/sui/sui-token-template/scripts/03_create_token.sh) so the
// zip a user downloads matches what the CLI would produce (and the on-chain
// bytecode). Template text is synced verbatim via scripts/sync-template-src.sh.
//
// Published.toml: since Sui v1.63, the CLI writes deployed addresses to Published.toml
// (not Move.lock). Because the deployer bypasses the CLI, we generate it when a
// PublishResult is available so the downloaded package is immediately usable as a
// dependency reference without requiring the user to reconstruct the file manually.

import { zipSync, strToU8 } from 'fflate'
import templateFiles from '../template-src/files.json'
import type { PublishResult, TokenConfig } from './types.js'
import { SAFE_TEXT, deriveStructName, validateIdentifier, hasAllowedIconScheme } from './validation.js'

const files = templateFiles as Record<string, string>

/** License identifiers may only contain SPDX-safe characters. */
const LICENSE_ID = /^[A-Za-z0-9.\-+]*$/

/**
 * Defence in depth: re-assert the invariants the form validator enforces before
 * substituting any user value into Move source or the publish shell script. A
 * value that fails here (e.g. a newline or quote that could break out of a Move
 * `b"..."` literal) throws rather than producing a malformed/injectable package,
 * so the generator is safe even if called with an unvalidated config.
 */
function assertSafeConfig(cfg: TokenConfig): void {
  const idFields: Array<[string, string]> = [
    ['package name', cfg.packageName],
    ['module name', cfg.moduleName],
  ]
  for (const [label, value] of idFields) {
    const err = validateIdentifier(value)
    if (err) throw new Error(`Invalid ${label}: ${err}`)
  }
  if (cfg.structName !== deriveStructName(cfg.moduleName)) {
    throw new Error('Invalid struct name: must be the module name uppercased.')
  }
  const textFields: Array<[string, string]> = [
    ['symbol', cfg.symbol],
    ['name', cfg.name],
    ['description', cfg.description],
    ['icon URL', cfg.iconUrl],
  ]
  for (const [label, value] of textFields) {
    if (!SAFE_TEXT.test(value)) {
      throw new Error(`Invalid ${label}: contains quotes, backslashes or control characters.`)
    }
  }
  // Re-assert the icon-URL scheme allowlist here too (layered defence, independent of the
  // form): a non-empty icon URL must use https:// or ipfs:// before it is baked into metadata.
  if (cfg.iconUrl && !hasAllowedIconScheme(cfg.iconUrl)) {
    throw new Error('Invalid icon URL: only https:// or ipfs:// URLs are allowed.')
  }
  if (!Number.isInteger(cfg.decimals) || cfg.decimals < 0 || cfg.decimals > 18) {
    throw new Error('Invalid decimals: expected a whole number between 0 and 18.')
  }
  if (!LICENSE_ID.test(cfg.license)) {
    throw new Error('Invalid license identifier.')
  }
}

/** Escape a string for safe use as a literal RegExp. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Replace every occurrence of a plain-string needle. */
function replaceAll(input: string, needle: string, value: string): string {
  return input.replace(new RegExp(esc(needle), 'g'), () => value)
}

/** Apply the shared X…X documentation placeholders. */
function applyDocPlaceholders(input: string, cfg: TokenConfig): string {
  const map: Record<string, string> = {
    XPACKAGENAMEX: cfg.packageName,
    XMODULENAMEX: cfg.moduleName,
    XSTRUCTNAMEX: cfg.structName,
    XSYMBOLX: cfg.symbol,
    XNAMEX: cfg.name,
    XDESCRIPTIONX: cfg.description,
    XDECIMALSX: String(cfg.decimals),
    XPROJECTNAMEX: cfg.projectName,
    XPACKAGEDESCRIPTIONX: cfg.packageDescription,
  }
  let out = input
  for (const [k, v] of Object.entries(map)) out = replaceAll(out, k, v)
  return out
}

// Chain IDs for the two production networks (hex short form).
const CHAIN_IDS: Record<string, string> = {
  testnet: '4c78adac',
  mainnet: '35834a8a',
}

// Sui CLI version that compiled the shipped template bytecode. Keep in sync
// with TEMPLATE_MODULE_B64 in src/move-template/template.ts; updated by regen-template.sh.
const TEMPLATE_TOOLCHAIN_VERSION = '1.76.1'

const isProprietary = (license: string) =>
  ['none', 'unlicensed', 'noassertion', ''].includes(license.trim().toLowerCase())

function spdxId(license: string): string {
  return isProprietary(license) ? 'UNLICENSED' : license.trim()
}

/** Move.toml: package name + license field. */
function renderMoveToml(cfg: TokenConfig): string {
  let out = replaceAll(files['Move.toml'], 'sui_token_template', cfg.packageName)
  out = out.replace(/^license = .*$/m, `license = "${spdxId(cfg.license)}"`)
  return out
}

/** The Move source: identifiers, named constants, and the license header. */
function renderSource(cfg: TokenConfig): string {
  let out = files['source.move']

  // license header (lines 1-2)
  const lines = out.split('\n')
  if (isProprietary(cfg.license)) {
    lines[0] = '// SPDX-License-Identifier: UNLICENSED'
    lines[1] = '// All rights reserved. Proprietary and not licensed for redistribution.'
  } else if (spdxId(cfg.license) !== 'CC0-1.0') {
    lines[0] = `// SPDX-License-Identifier: ${spdxId(cfg.license)}`
    lines[1] = `// Licensed under the ${spdxId(cfg.license)} license; see the LICENSE file.`
  }
  out = lines.join('\n')

  out = replaceAll(
    out,
    'module sui_token_template::sui_token_template;',
    `module ${cfg.packageName}::${cfg.moduleName};`,
  )
  out = replaceAll(out, 'SUI_TOKEN_TEMPLATE', cfg.structName)
  out = replaceAll(out, 'XPACKAGEDESCRIPTIONX', cfg.packageDescription)
  out = replaceAll(out, 'XMODULENAMEX', cfg.moduleName)

  out = replaceAll(out, 'const DECIMALS: u8 = 9;', `const DECIMALS: u8 = ${cfg.decimals};`)
  out = replaceAll(out, 'b"TEMPLATE_SYMBOL"', `b"${cfg.symbol}"`)
  out = replaceAll(out, 'b"TEMPLATE_NAME"', `b"${cfg.name}"`)
  out = replaceAll(out, 'b"TEMPLATE_DESCRIPTION"', `b"${cfg.description}"`)
  out = replaceAll(out, 'b"TEMPLATE_ICON_URL"', `b"${cfg.iconUrl}"`)
  return out
}

function renderPublishScript(cfg: TokenConfig): string {
  let out = replaceAll(files['scripts/publish.sh'], 'SUI_TOKEN_TEMPLATE', cfg.structName)
  out = replaceAll(out, 'XMODULENAMEX', cfg.moduleName)
  out = replaceAll(out, 'XPACKAGENAMEX', cfg.packageName)
  return out
}

function renderReadme(cfg: TokenConfig): string {
  let out = applyDocPlaceholders(files['README.md'], cfg)
  const licenseName = cfg.licenseName || spdxId(cfg.license)
  if (isProprietary(cfg.license)) {
    out = out.replace(
      /^CC0 1\.0 Universal.*$/m,
      'All rights reserved. This package is proprietary and not licensed for redistribution.',
    )
  } else if (spdxId(cfg.license) !== 'CC0-1.0') {
    out = out.replace(/^CC0 1\.0 Universal.*$/m, `${licenseName} — see the LICENSE file.`)
  }
  return out
}

/**
 * Replace a single table row in a markdown section in-place.
 * Matches: `| <fieldName> | \`FILL_IN_AFTER_DEPLOY\` |`
 */
function fillRow(section: string, fieldName: string, value: string): string {
  return section.replace(
    `| ${fieldName} | \`FILL_IN_AFTER_DEPLOY\` |`,
    `| ${fieldName} | \`${value}\` |`,
  )
}

/**
 * Fill the deployment table rows for the specified network section only.
 * Operates on the substring between the section header and the next `## ` heading.
 */
function fillNetworkSection(doc: string, network: string, result: PublishResult): string {
  const header = `## ${network.charAt(0).toUpperCase() + network.slice(1)}\n`
  const start = doc.indexOf(header)
  if (start === -1) return doc
  const afterHeader = start + header.length
  const nextSection = doc.indexOf('\n## ', afterHeader)
  const end = nextSection === -1 ? doc.length : nextSection

  let section = doc.slice(start, end)

  section = fillRow(section, 'Package ID', result.packageId)
  if (result.treasuryCapId) section = fillRow(section, 'TreasuryCap ID', result.treasuryCapId)
  if (result.metadataCapId) section = fillRow(section, 'MetadataCap ID', result.metadataCapId)
  if (result.currencyId) section = fillRow(section, 'Currency object ID', result.currencyId)

  if (result.upgradeCapId) {
    section = fillRow(section, 'UpgradeCap ID (burned)', result.upgradeCapId)
    section = section.replace(
      '| Immutability confirmed | Yes (Y/N) |',
      '| Immutability confirmed | No (pending) |',
    )
  } else {
    section = fillRow(section, 'UpgradeCap ID (burned)', 'burned')
    section = section.replace(
      '| Immutability confirmed | Yes (Y/N) |',
      '| Immutability confirmed | Yes |',
    )
  }

  const deployed = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC'
  section = fillRow(section, 'Deployed', deployed)

  return doc.slice(0, start) + section + doc.slice(end)
}

/** Optionally fill deployments.md with the just-published IDs. */
function renderDeployments(cfg: TokenConfig, result?: PublishResult): string {
  let out = applyDocPlaceholders(files['deployments.md'], cfg)
  if (!result) return out

  // Fill the network-specific table section with known artefact IDs
  out = fillNetworkSection(out, result.network, result)

  // Fill the <PACKAGE_ID> placeholder in the downstream Move.toml reference block
  out = out.replace(/<PACKAGE_ID>/g, result.packageId)

  // Append extra data not represented in the table (coin type, digest)
  const note = [
    '',
    `<!-- Auto-filled by the Token Deployer on ${new Date().toISOString()} (${result.network}) -->`,
    `<!-- Coin type: ${result.coinType} -->`,
    `<!-- Publish digest: ${result.digest} -->`,
    '',
  ].join('\n')
  return `${out.trimEnd()}\n${note}`
}

/**
 * Generate a Published.toml for the deployed package.
 * Since v1.63, the Sui CLI writes Published.toml (not Move.lock) to record deployed
 * addresses per environment. The deployer bypasses the CLI, so we produce this file
 * so the downloaded package is immediately usable as a Move dependency reference.
 * Commit Published.toml to source control; add Pub.*.toml (ephemeral) to .gitignore.
 */
function renderPublishedToml(result: PublishResult): string {
  const env = result.network === 'mainnet' ? 'mainnet' : 'testnet'
  const chainId = CHAIN_IDS[env] ?? ''
  const lines = [
    `[published.${env}]`,
    `chain-id = "${chainId}"`,
    `original-id = "${result.packageId}"`,
    `published-at = "${result.packageId}"`,
    `version = 1`,
    `toolchain-version = "${TEMPLATE_TOOLCHAIN_VERSION}"`,
    `build-config = { flavor = "sui", edition = "2024" }`,
  ]
  if (result.upgradeCapId) {
    lines.push(`upgrade-capability = "${result.upgradeCapId}"`)
  } else {
    lines.push(
      `# upgrade-capability burned via 0x2::package::make_immutable — package is immutable`,
    )
  }
  return lines.join('\n') + '\n'
}

export interface GeneratePackageOptions {
  config: TokenConfig
  /** Full license text; when omitted for a real license, no LICENSE file is written. */
  licenseText?: string
  /** Publish result, to pre-fill deployments.md. */
  result?: PublishResult
}

/** Build the in-memory file map for the generated package. */
export function buildPackageFiles(opts: GeneratePackageOptions): Record<string, string> {
  const { config, licenseText } = opts
  assertSafeConfig(config)
  const out: Record<string, string> = {
    'Move.toml': renderMoveToml(config),
    [`sources/${config.moduleName}.move`]: renderSource(config),
    'scripts/publish.sh': renderPublishScript(config),
    '.gitignore': files['.gitignore'],
    'README.md': renderReadme(config),
    'deployments.md': renderDeployments(config, opts.result),
    'CLAUDE.md': applyDocPlaceholders(files['CLAUDE.md'], config),
    'AGENTS.md': applyDocPlaceholders(files['AGENTS.md'], config),
  }
  if (opts.result) {
    // Published.toml records the deployed address per environment (Sui v1.63+ convention).
    // Commit this file to source control; add Pub.*.toml (ephemeral) to .gitignore.
    out['Published.toml'] = renderPublishedToml(opts.result)
  }
  if (!isProprietary(config.license) && licenseText) {
    out['LICENSE'] = licenseText
  }
  return out
}

/** Zip the generated package. Returns bytes suitable for a download Blob. */
export function generatePackageZip(opts: GeneratePackageOptions): Uint8Array {
  const filesMap = buildPackageFiles(opts)
  const zipInput: Record<string, Uint8Array> = {}
  const root = opts.config.packageName
  for (const [path, content] of Object.entries(filesMap)) {
    zipInput[`${root}/${path}`] = strToU8(content)
  }
  return zipSync(zipInput, { level: 6 })
}
