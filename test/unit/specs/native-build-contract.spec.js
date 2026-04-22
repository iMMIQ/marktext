// @vitest-environment node
import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
const rebuildScript = fs.readFileSync(path.join(root, 'tools/build/rebuildNativeModules.mjs'), 'utf8')

describe('phase 4 native build contract', () => {
  it('rebuilds native modules explicitly before packaging', () => {
    expect(pkg.scripts.rebuild).toContain('rebuildNativeModules.mjs')
    expect(pkg.scripts['rebuild:force']).toContain('MARKTEXT_FORCE_NATIVE_REBUILD=1')
    expect(pkg.scripts.build).toContain('bun run rebuild')
    expect(builder).toContain('npmRebuild: false')
    // Normalize line endings for cross-platform compatibility
    expect(builder.replace(/\r\n/g, '\n')).toContain('asarUnpack:\n- "**/*.node"')
    expect(rebuildScript).toContain("'ced'")
    expect(rebuildScript).toContain('native-rebuild.json')
    expect(rebuildScript).toContain('skipping rebuild')
  })
})
