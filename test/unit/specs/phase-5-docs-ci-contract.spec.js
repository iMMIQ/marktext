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
const nvmrc = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()

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
    expect(step).toMatch(/node-version-file:\s*['"]?\.nvmrc['"]?|node-version:\s*24\b/)
    expect(step).not.toMatch(/node-version:\s*16\b/)
  }
}

describe('phase 5 docs and CI contract', () => {
  it('documents and tests the Node 24 baseline consistently', () => {
    expect(nvmrc).toBe('24')
    expectNode24Baseline(buildWorkflow)
    expectNode24Baseline(releaseWorkflow)
    expect(buildDoc).not.toMatch(/>=v16|<v17|unit:vite/)
    expect(releaseDoc).not.toMatch(/AppVeyor|Travis CI/)
    expect(readme).not.toMatch(/travis-ci\.org|ci\.appveyor\.com/)
  })
})
