// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const nvmrc = fs.existsSync(path.join(root, '.nvmrc'))
  ? fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()
  : ''
const fontManagerSource = fs.readFileSync(path.join(root, 'src/main/native/fontManager.js'), 'utf8')
const nativeKeymapSource = fs.readFileSync(path.join(root, 'src/main/native/nativeKeymap.js'), 'utf8')
const electronBuilderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
const rendererOnlyDependencies = [
  '@codemirror/autocomplete',
  '@codemirror/commands',
  '@codemirror/lang-markdown',
  '@codemirror/language',
  '@codemirror/language-data',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@floating-ui/dom',
  '@marktext/file-icons',
  'axios',
  'dom-autoscroller',
  'dompurify',
  'dragula',
  'element-plus',
  'execall',
  'fast-deep-equal',
  'flowchart.js',
  'github-markdown-css',
  'html-tags',
  'iso-639-1',
  'joplin-turndown-plugin-gfm',
  'katex',
  'mermaid',
  'mitt',
  'pinia',
  'prismjs',
  'snabbdom',
  'snabbdom-to-html',
  'turndown',
  'underscore',
  'unsplash-js',
  'vega',
  'vega-embed',
  'vega-lite',
  'vue',
  'vue-router',
  'webfontloader'
]

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

  it('keeps native module loaders compatible with bundled cjs output', () => {
    expect(fontManagerSource).toContain("createRequire(typeof __filename === 'string' ? __filename : import.meta.url)")
    expect(nativeKeymapSource).toContain("createRequire(typeof __filename === 'string' ? __filename : import.meta.url)")
  })

  it('keeps ripgrep packaged as an unpacked runtime binary', () => {
    expect(pkg.dependencies['@vscode/ripgrep']).toMatch(/^\^1\./)
    expect(pkg.dependencies['vscode-ripgrep']).toBeUndefined()
    expect(electronBuilderConfig).toContain('node_modules/@vscode/ripgrep/bin/**')
    expect(electronBuilderConfig).not.toContain('node_modules/vscode-ripgrep')
  })

  it('keeps renderer-only libraries out of packaged runtime dependencies', () => {
    rendererOnlyDependencies.forEach(dependency => {
      expect(pkg.dependencies[dependency], dependency).toBeUndefined()
      expect(pkg.devDependencies[dependency], dependency).toBeTruthy()
    })
  })
})
