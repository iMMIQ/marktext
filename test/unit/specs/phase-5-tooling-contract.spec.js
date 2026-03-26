// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const babelConfig = fs.readFileSync(path.join(root, 'babel.config.js'), 'utf8')

describe('phase 5 tooling contract', () => {
  it('keeps one official script surface and no electron-vue leftovers', () => {
    expect(pkg.scripts.dev).not.toMatch(/dev:vite/)
    expect(pkg.scripts.pack).not.toMatch(/pack:vite/)
    expect(pkg.scripts.unit).not.toMatch(/unit:vite/)
    expect(pkg.scripts.build).not.toMatch(/pack:vite/)
    expect(pkg.scripts.preinstall).not.toMatch(/\.electron-vue/)
    expect(pkg.scripts.postinstall || '').not.toMatch(/\.electron-vue/)
    expect(pkg.scripts.format).toBeTruthy()
    expect(pkg.scripts['format:check']).toBeTruthy()
    expect(pkg.scripts['dev:vite']).toBeUndefined()
    expect(pkg.scripts['pack:vite']).toBeUndefined()
    expect(pkg.scripts['unit:vite']).toBeUndefined()
    expect(babelConfig).not.toMatch(/node:\s*16|targets:\s*\{\s*'node':\s*16\s*\}/)
    expect(babelConfig).not.toMatch(/element-ui/)
  })
})
