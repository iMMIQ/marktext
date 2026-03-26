// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const buildWorkflow = fs.readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8')
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')
const buildDoc = fs.readFileSync(path.join(root, 'docs/dev/BUILD.md'), 'utf8')
const releaseDoc = fs.readFileSync(path.join(root, 'docs/dev/RELEASE.md'), 'utf8')
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')

describe('phase 5 docs and CI contract', () => {
  it('documents and tests the Node 24 baseline consistently', () => {
    expect(buildWorkflow).toMatch(/node-version-file:\s*['"]?\.nvmrc['"]?|node-version:\s*24/)
    expect(releaseWorkflow).toMatch(/node-version-file:\s*['"]?\.nvmrc['"]?|node-version:\s*24/)
    expect(buildDoc).not.toMatch(/>=v16|<v17|unit:vite/)
    expect(releaseDoc).not.toMatch(/AppVeyor|Travis CI/)
    expect(readme).not.toMatch(/travis-ci\.org|ci\.appveyor\.com/)
  })
})
