// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const nvmrc = fs.existsSync(path.join(root, '.nvmrc'))
  ? fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()
  : ''

describe('phase 4 runtime dependency contract', () => {
  it('targets the modern Electron runtime baseline', () => {
    expect(pkg.devDependencies.electron).toMatch(/^\^41\./)
    expect(pkg.devDependencies['electron-builder']).toMatch(/^\^26\./)
    expect(pkg.devDependencies['@electron/rebuild']).toMatch(/^\^4\./)
    expect(pkg.devDependencies['electron-updater']).toMatch(/^\^6\./)
    expect(pkg.dependencies['native-keymap']).toMatch(/^\^3\.3\.9$/)
    expect(pkg.engines.node).toBe('24.x')
    expect(nvmrc).toBe('24')
  })
})
