// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const mainConfig = fs.readFileSync(path.join(root, 'src/main/config.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'src/main/preload/index.js'), 'utf8')
const rendererHtml = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8')
const fontTextbox = fs.readFileSync(path.join(root, 'src/renderer/prefComponents/common/fontTextBox/index.vue'), 'utf8')

describe('phase 4 security blockers', () => {
  it('removes insecure runtime defaults from the main path', () => {
    expect(mainConfig).not.toMatch(/contextIsolation:\s*false/)
    expect(mainConfig).not.toMatch(/nodeIntegration:\s*true/)
    expect(mainConfig).not.toMatch(/webSecurity:\s*false/)
    expect(preload).not.toMatch(/sendSync\s*:/)
    expect(rendererHtml).not.toMatch(/typeof require === 'function'/)
    expect(fontTextbox).not.toMatch(/require\('fontmanager-redux'\)/)
  })
})
