import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const files = [
  'src/renderer/main.js',
  'src/renderer/components/tweet/index.vue',
  'src/renderer/components/rename/index.vue',
  'src/renderer/prefComponents/spellchecker/index.vue',
  'src/renderer/prefComponents/keybindings/index.vue'
]
const sources = Object.fromEntries(
  files.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')])
)
const blockers = [
  ['new Vue()', /\bnew\s+Vue\s*\(/],
  ['Vue.use()', /\bVue\s*\.\s*use\s*\(/],
  [':visible.sync', /:visible\s*\.sync\s*=/],
  ['slot-scope', /\bslot-scope\s*=/],
  ['beforeDestroy()', /\bbeforeDestroy\s*\(/],
  ['element-ui', /\belement-ui\b/],
  ['vue-template-compiler', /\bvue-template-compiler\b/],
  ['vue-electron', /\bvue-electron\b/]
]

describe('renderer Vue 3 syntax blockers', () => {
  it.each(
    files.flatMap(file => blockers.map(([blocker, pattern]) => [file, blocker, pattern]))
  )('keeps %s free of %s', (file, blocker, pattern) => {
    expect(sources[file]).not.toMatch(pattern)
  })
})
