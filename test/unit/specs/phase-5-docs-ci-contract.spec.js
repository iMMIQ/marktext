// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const buildWorkflow = fs.readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8')
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')
const versionPolicy = fs.readFileSync(path.join(root, 'docs/dev/VERSION_POLICY.md'), 'utf8')
const devReadme = fs.readFileSync(path.join(root, 'docs/dev/README.md'), 'utf8')
const buildDoc = fs.readFileSync(path.join(root, 'docs/dev/BUILD.md'), 'utf8')
const architectureDoc = fs.readFileSync(path.join(root, 'docs/dev/ARCHITECTURE.md'), 'utf8')
const releaseDoc = fs.readFileSync(path.join(root, 'docs/dev/RELEASE.md'), 'utf8')
const rendererBoundaryDoc = fs.readFileSync(path.join(root, 'docs/dev/renderer-boundary.md'), 'utf8')
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
const nvmrc = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()
const i18nDocs = fs.readdirSync(path.join(root, 'docs/i18n'))
  .filter(file => file.endsWith('.md'))
  .map(file => fs.readFileSync(path.join(root, 'docs/i18n', file), 'utf8'))
  .join('\n')
const developerDocs = [
  readme,
  devReadme,
  buildDoc,
  architectureDoc,
  releaseDoc,
  rendererBoundaryDoc,
  versionPolicy
].join('\n')

const getSetupNodeSteps = workflow => {
  const steps = []
  let currentStep = []

  for (const line of workflow.split('\n')) {
    if (/^\s*-\s/.test(line)) {
      if (currentStep.length > 0) {
        steps.push(currentStep.join('\n'))
      }
      currentStep = [line]
      continue
    }

    if (currentStep.length > 0) {
      currentStep.push(line)
    }
  }

  if (currentStep.length > 0) {
    steps.push(currentStep.join('\n'))
  }

  return steps.filter(step => /uses:\s*actions\/setup-node@/m.test(step))
}

const expectNode24Baseline = workflow => {
  const setupNodeSteps = getSetupNodeSteps(workflow)

  expect(setupNodeSteps.length).toBeGreaterThan(0)

  for (const step of setupNodeSteps) {
    expect(step).toMatch(/node-version-file:\s*['"]?\.nvmrc['"]?/)
    expect(step).not.toMatch(/node-version:\s*16\b/)
    expect(step).toMatch(/cache:\s*yarn/)
    expect(step).toMatch(/cache-dependency-path:\s*yarn\.lock/)
  }
}

describe('phase 5 docs and CI contract', () => {
  it('documents and tests the Node 24 baseline consistently', () => {
    expect(nvmrc).toBe('24')
    expectNode24Baseline(buildWorkflow)
    expectNode24Baseline(releaseWorkflow)
    expect(versionPolicy).toMatch(/\.nvmrc/)
    expect(versionPolicy).toMatch(/\bNode 24\b|24\.x/)
    expect(devReadme).toContain('VERSION_POLICY.md')
    expect(buildDoc).not.toMatch(/>=v16|<v17|unit:vite|pack:vite|dev:vite/)
    expect(releaseDoc).not.toMatch(/AppVeyor|Travis CI/)
    expect(readme).not.toMatch(/travis-ci\.org|ci\.appveyor\.com/)
    for (const command of ['dev', 'rebuild', 'pack', 'unit', 'format', 'build']) {
      expect(developerDocs).toContain(`yarn run ${command}`)
    }
    expect(i18nDocs).not.toMatch(/travis-ci\.org|ci\.appveyor\.com|AppVeyor|Travis CI/)
  })
})
