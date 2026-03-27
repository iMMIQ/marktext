const fs = require('fs')
const path = require('path')
const { expect, test } = require('@playwright/test')

const RECENT_BUILD_WINDOW_MS = 10 * 60 * 1000

test('pack emits the Electron runtime contract files', async () => {
  const outDir = path.resolve('dist/electron')
  const contractFiles = [
    'main.js',
    'preload.js',
    'index.html',
    'static/preference.json',
    'static/logo-96px.png',
    'static/logo-small.png'
  ]
  const builtAfter = Date.now() - RECENT_BUILD_WINDOW_MS

  for (const relativePath of contractFiles) {
    const absolutePath = path.join(outDir, relativePath)
    expect(fs.existsSync(absolutePath)).toBeTruthy()
    expect(fs.statSync(absolutePath).mtimeMs).toBeGreaterThan(builtAfter)
  }

  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8')
  const emittedAssets = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map(([, asset]) => asset)

  expect(emittedAssets.length).toBeGreaterThan(0)

  for (const relativePath of emittedAssets) {
    expect(fs.existsSync(path.join(outDir, relativePath))).toBeTruthy()
  }
})
