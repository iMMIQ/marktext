import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const validateReleaseState = ({ version, changelog, appData, refName, stable }) => {
  const failures = []
  if (stable && version.includes('-')) failures.push(`stable release version contains a prerelease suffix: ${version}`)
  if (!new RegExp(`^## ${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(changelog)) {
    failures.push(`changelog is missing an exact "## ${version}" heading`)
  }
  if (!new RegExp(`<release\\b[^>]*\\bversion=["']${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(appData)) {
    failures.push(`AppStream metadata is missing release version ${version}`)
  }
  if (refName?.startsWith('v') && refName !== `v${version}`) {
    failures.push(`tag ${refName} does not match package version v${version}`)
  }
  return failures
}

const run = () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  const failures = validateReleaseState({
    version: pkg.version,
    changelog: fs.readFileSync('.github/CHANGELOG.md', 'utf8'),
    appData: fs.readFileSync('resources/linux/marktext.appdata.xml', 'utf8'),
    refName: process.env.GITHUB_REF_NAME || '',
    stable: process.argv.includes('--stable')
  })

  if (failures.length) {
    for (const failure of failures) console.error(`[error] ${failure}`)
    throw new Error(`Release state check failed with ${failures.length} error(s).`)
  }
  console.log(`Release state check passed for ${pkg.version}.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    run()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
