import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const artifactPattern = /(?:\.AppImage|\.deb|\.rpm|\.tar\.gz|\.dmg|\.zip|\.exe|\.blockmap)$/i
const updateMetadataPattern = /^latest(?:[-.].*)?\.ya?ml$/i

export const findReleaseArtifacts = root => {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && (artifactPattern.test(entry.name) || updateMetadataPattern.test(entry.name)))
    .map(entry => entry.name)
    .sort()
}

export const createChecksumManifest = root => {
  const artifacts = findReleaseArtifacts(root)
  if (!artifacts.length) throw new Error(`No release artifacts found in ${root}`)

  return artifacts.map(filename => {
    const digest = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(root, filename)))
      .digest('hex')
    return `${digest}  ${filename}`
  }).join('\n') + '\n'
}

const run = () => {
  const root = path.resolve(process.argv[2] || 'build')
  const manifest = createChecksumManifest(root)
  const output = path.join(root, 'SHA256SUMS.txt')
  fs.writeFileSync(output, manifest)
  console.log(`Wrote ${output} with ${manifest.trim().split('\n').length} checksum(s).`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    run()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
