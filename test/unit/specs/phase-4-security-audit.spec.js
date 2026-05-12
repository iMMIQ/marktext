// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const preload = fs.readFileSync(path.join(root, 'src/main/preload/index.js'), 'utf8')
const fontTextbox = fs.readFileSync(path.join(root, 'src/renderer/prefComponents/common/fontTextBox/index.vue'), 'utf8')

describe('phase 4 security blockers', () => {
  it('removes sync bridge exposure from the renderer path', () => {
    expect(preload).not.toMatch(/sendSync\s*:/)
  })

  it('keeps renderer components free of direct native escape hatches', () => {
    expect(fontTextbox).not.toMatch(/require\('fontmanager-redux'\)/)
  })
})
