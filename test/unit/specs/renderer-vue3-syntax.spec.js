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

describe('renderer Vue 3 syntax blockers', () => {
  it('removes Vue 2-only patterns from the main migration path', () => {
    const source = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')
    expect(source).not.toMatch(/new Vue\(|Vue\.use\(|:visible\.sync=|slot-scope=|beforeDestroy\s*\(/)
    expect(source).not.toMatch(/element-ui|vue-template-compiler|vue-electron/)
  })
})
