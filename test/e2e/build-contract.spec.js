const fs = require('fs')
const path = require('path')
const { expect, test } = require('@playwright/test')

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
  for (const relativePath of contractFiles) {
    const absolutePath = path.join(outDir, relativePath)
    expect(fs.existsSync(absolutePath)).toBeTruthy()
    expect(fs.statSync(absolutePath).size).toBeGreaterThan(0)
  }

  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8')
  const emittedAssets = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map(([, asset]) => asset)

  expect(emittedAssets.length).toBeGreaterThan(0)

  const rendererScript = emittedAssets.find(asset => asset.endsWith('.js'))
  expect(rendererScript).toBeTruthy()
  expect(fs.readFileSync(path.join(outDir, rendererScript), 'utf8')).toContain('renderer:mount-start')

  for (const relativePath of emittedAssets) {
    expect(fs.existsSync(path.join(outDir, relativePath))).toBeTruthy()
  }
})
