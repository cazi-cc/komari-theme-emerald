import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Z.-]+)?$/i
const VERSION_FIELD_RE = /^(\s*"version"\s*:\s*")([^"]*)(")/m
const ROLLING_VERSION = '1.0.0'

function readVersionArg(): string | undefined {
  const args = process.argv.slice(2)

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '-v' || arg === '--version') {
      const version = args[i + 1]
      if (!version) {
        throw new Error('Missing version after -v/--version')
      }
      return version
    }

    if (arg.startsWith('--version=')) {
      return arg.slice('--version='.length)
    }
  }

  return undefined
}

function resolveVersion(): string {
  const versionArg = readVersionArg()

  if (versionArg && versionArg !== ROLLING_VERSION)
    throw new Error(`This fork uses the rolling ${ROLLING_VERSION} release. Change the release policy in code before publishing another version.`)

  return ROLLING_VERSION
}

function updateVersionField(filePath: string, version: string): void {
  const content = readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(content) as { version?: unknown }

  if (typeof parsed.version !== 'string') {
    throw new TypeError(`${filePath} does not contain a top-level string version field`)
  }

  const nextContent = content.replace(VERSION_FIELD_RE, `$1${version}$3`)

  JSON.parse(nextContent)
  writeFileSync(filePath, nextContent)
}

function gitAdd(files: string[]): void {
  const result = spawnSync('git', ['add', ...files], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error('git add failed')
  }
}

async function main(): Promise<void> {
  const version = resolveVersion()

  if (!VERSION_RE.test(version)) {
    throw new Error(`Invalid version: ${version}`)
  }

  const files = ['package.json', 'komari-theme.json']

  for (const file of files) {
    updateVersionField(resolve(process.cwd(), file), version)
  }

  gitAdd(files)
  console.log(`Prepared release version ${version}`)
  console.log(`Staged: ${files.join(', ')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
