import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const files = [
  'src/renderer/main.js',
  'src/renderer/components/about/index.vue',
  'src/renderer/components/commandPalette/index.vue',
  'src/renderer/components/exportSettings/index.vue',
  'src/renderer/components/import/index.vue',
  'src/renderer/components/editorWithTabs/index.vue',
  'src/renderer/components/editorWithTabs/editor.vue',
  'src/renderer/components/editorWithTabs/sourceCode.vue',
  'src/renderer/components/editorWithTabs/tabs.vue',
  'src/renderer/components/editorWithTabs/notifications.vue',
  'src/renderer/components/tweet/index.vue',
  'src/renderer/components/rename/index.vue',
  'src/renderer/prefComponents/keybindings/key-input-dialog.vue',
  'src/renderer/prefComponents/sideBar/index.vue',
  'src/renderer/prefComponents/spellchecker/index.vue',
  'src/renderer/prefComponents/keybindings/index.vue',
  'src/renderer/prefComponents/common/fontTextBox/index.vue'
]
const sources = Object.fromEntries(
  files.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')])
)
const blockers = [
  ['new Vue()', /\bnew\s+Vue\s*\(/],
  ['Vue.use()', /\bVue\s*\.\s*use\s*\(/],
  [':visible.sync', /:visible\s*\.sync\s*=/],
  ['slot-scope', /\bslot-scope\s*=/],
  ['legacy slot attr', /\bslot\s*=\s*"(title|suffix|footer)"/],
  ['beforeDestroy()', /\bbeforeDestroy\s*\(/],
  ['vuex import', /from\s+['"]vuex['"]/],
  ['Element UI icon class', /\bel-icon-[a-z-]+\b/],
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
