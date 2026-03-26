// @vitest-environment node
import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')

describe('phase 4 native build contract', () => {
  it('rebuilds native modules explicitly before packaging', () => {
    expect(pkg.scripts.rebuild).toContain('rebuildNativeModules.mjs')
    expect(pkg.scripts.build).toContain('yarn run rebuild')
    expect(builder).toContain('npmRebuild: false')
    expect(builder).toContain('asarUnpack:\n- "**/*.node"')
  })
})
