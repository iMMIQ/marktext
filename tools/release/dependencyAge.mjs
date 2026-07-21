import fs from 'node:fs'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const packageTuplePattern = /^\s*"[^"]+": \["([^"]+@[^"]+)"/gm

export const parsePackageIdentifier = identifier => {
  const actualIdentifier = identifier.includes('npm:')
    ? identifier.slice(identifier.lastIndexOf('npm:') + 4)
    : identifier
  const separator = actualIdentifier.lastIndexOf('@')
  if (separator <= 0) return null

  const name = actualIdentifier.slice(0, separator)
  const version = actualIdentifier.slice(separator + 1)
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) return null
  return { name, version }
}

export const extractLockedPackages = source => {
  const packages = new Map()
  for (const match of source.matchAll(packageTuplePattern)) {
    const parsed = parsePackageIdentifier(match[1])
    if (parsed) packages.set(`${parsed.name}@${parsed.version}`, parsed)
  }
  return packages
}

export const findChangedPackages = (currentSource, baseSource) => {
  const current = extractLockedPackages(currentSource)
  const base = extractLockedPackages(baseSource)
  return [...current.entries()]
    .filter(([identifier]) => !base.has(identifier))
    .map(([, pkg]) => pkg)
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

export const isOldEnough = (publishedAt, now, minimumAgeDays) => {
  const published = new Date(publishedAt).getTime()
  return Number.isFinite(published) && now.getTime() - published >= minimumAgeDays * 24 * 60 * 60 * 1000
}

const readBaseLock = base => {
  return execFileSync('git', ['show', `${base}:bun.lock`], { encoding: 'utf8' })
}

const fetchPublishTime = async ({ name, version }) => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { accept: 'application/json' }
  })
  if (!response.ok) {
    throw new Error(`${name}@${version}: registry returned HTTP ${response.status}`)
  }

  const metadata = await response.json()
  const publishedAt = metadata.time?.[version]
  if (!publishedAt) {
    throw new Error(`${name}@${version}: registry publish time is unavailable`)
  }
  return { name, version, publishedAt }
}

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = new Array(items.length)
  let index = 0

  const worker = async () => {
    while (index < items.length) {
      const currentIndex = index++
      results[currentIndex] = await mapper(items[currentIndex])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

const run = async () => {
  const baseIndex = process.argv.indexOf('--base')
  const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : 'HEAD^'
  const minimumAgeDays = Number(process.env.MARKTEXT_DEPENDENCY_MIN_AGE_DAYS || 7)
  if (!base) throw new Error('Missing value for --base')
  if (!Number.isFinite(minimumAgeDays) || minimumAgeDays < 0) {
    throw new Error('MARKTEXT_DEPENDENCY_MIN_AGE_DAYS must be a non-negative number')
  }

  const currentSource = fs.readFileSync('bun.lock', 'utf8')
  const changed = findChangedPackages(currentSource, readBaseLock(base))
  if (!changed.length) {
    console.log(`Dependency age check passed: no locked package versions changed since ${base}.`)
    return
  }

  console.log(`Checking ${changed.length} changed package version(s) against the ${minimumAgeDays}-day minimum age...`)
  const releases = await mapWithConcurrency(changed, 12, fetchPublishTime)
  const now = new Date()
  const tooNew = releases.filter(release => !isOldEnough(release.publishedAt, now, minimumAgeDays))

  for (const release of releases) {
    const status = tooNew.includes(release) ? 'error' : 'ok'
    console.log(`[${status}] ${release.name}@${release.version}: published ${release.publishedAt}`)
  }

  if (tooNew.length) {
    throw new Error(`${tooNew.length} package version(s) are newer than the ${minimumAgeDays}-day supply-chain waiting period.`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  run().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
