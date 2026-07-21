// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const workflows = ['build.yml', 'release.yml'].map(file => {
  return fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8')
})
const [buildWorkflow, releaseWorkflow] = workflows

describe('CI and release workflow contract', () => {
  it('pins every action to an immutable commit with an audited version comment', () => {
    for (const workflow of workflows) {
      const actionLines = workflow.split('\n').filter(line => line.trim().startsWith('uses:'))
      expect(actionLines.length).toBeGreaterThan(0)
      for (const line of actionLines) {
        expect(line).toMatch(/uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+# v\d/)
      }
    }
  })

  it('runs the quality gate on Linux without caching node_modules or rebuilding twice', () => {
    expect(buildWorkflow).toContain('runs-on: ubuntu-24.04')
    expect(buildWorkflow).not.toMatch(/runs-on:\s*(?:windows|macos)-/)
    expect(buildWorkflow).not.toMatch(/node_modules-cache|path:\s*.*node_modules/)
    expect(buildWorkflow.match(/bun run rebuild/g)).toHaveLength(1)
    expect(buildWorkflow.match(/bun run pack\s*$/gm)).toHaveLength(1)
    expect(buildWorkflow).toContain('bun run e2e:runtime')
    expect(buildWorkflow).toContain('bun run doctor')
    expect(buildWorkflow).toContain('kernel.apparmor_restrict_unprivileged_userns=0')
    expect(buildWorkflow).toContain('test-results/e2e')
  })

  it('stages checksummed Linux artifacts and keeps source maps separate', () => {
    expect(releaseWorkflow).toContain('runs-on: ubuntu-24.04')
    expect(releaseWorkflow).not.toMatch(/runs-on:\s*(?:windows|macos)-/)
    expect(releaseWorkflow).not.toContain('@latest')
    expect(releaseWorkflow).not.toContain('--publish always')
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts['package:linux'])
      .toContain('--publish never')
    expect(releaseWorkflow).toContain('bun run verify:native --platform linux')
    expect(releaseWorkflow).toContain('git describe --tags --abbrev=0 HEAD^')
    expect(releaseWorkflow).toContain('bun run doctor:release')
    expect(releaseWorkflow).toContain('kernel.apparmor_restrict_unprivileged_userns=0')
    expect(releaseWorkflow).toContain('bun run release:checksums')
    expect(releaseWorkflow).toContain('build/SHA256SUMS.txt')
    expect(releaseWorkflow).toContain('dist/electron/**/*.map')
  })
})
