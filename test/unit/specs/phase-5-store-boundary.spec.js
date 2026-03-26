// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const mainEntry = fs.readFileSync(path.join(root, 'src/renderer/main.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'src/main/preload/index.js'), 'utf8')
const storeFiles = fs.readdirSync(path.join(root, 'src/renderer/stores'))
  .filter(file => file.endsWith('.js'))
  .map(file => fs.readFileSync(path.join(root, 'src/renderer/stores', file), 'utf8'))
  .join('\n')

describe('phase 5 store and bridge boundary', () => {
  it('removes migration-only store adapters and generic app passthroughs', () => {
    expect(storeFiles).not.toMatch(/moduleDispatcher|\.\/modules\//)
    expect(mainEntry).not.toMatch(/\.dispatch\('|\.commit\('/)
    expect(preload).not.toMatch(/send:\s*\(channel|invoke:\s*\(channel/)
  })
})
