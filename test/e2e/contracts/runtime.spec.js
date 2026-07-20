const fs = require('fs')
const path = require('path')
const {
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  getMainProcessCallCount,
  stubOpenDialog,
  test
} = require('../fixtures')

test.describe('Runtime contracts', () => {
  test('pack emits the main, preload, renderer, and worker entrypoints', async () => {
    const output = path.resolve('dist/electron')
    const contractFiles = [
      'main.js',
      'preload.js',
      'index.html',
      'vendor/mermaid.js',
      'vendor/vega-embed.js',
      'static/preference.json',
      'static/logo-96px.png',
      'static/logo-small.png'
    ]
    for (const relativePath of contractFiles) {
      const absolutePath = path.join(output, relativePath)
      expect(fs.existsSync(absolutePath), relativePath).toBe(true)
      expect(fs.statSync(absolutePath).size, relativePath).toBeGreaterThan(0)
    }

    const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8')
    const emittedAssets = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map(([, asset]) => asset)
    expect(emittedAssets.length).toBeGreaterThan(0)
    for (const relativePath of emittedAssets) {
      expect(fs.existsSync(path.join(output, relativePath)), relativePath).toBe(true)
    }
  })

  test('custom title bar controls call the native window boundary', async ({ launchApp }) => {
    const session = await launchApp()
    const { app, page } = session
    const platform = await app.evaluate(() => process.platform)

    if (platform === 'darwin') {
      await expect(page.locator('.title-bar .title')).toBeVisible()
    } else {
      await app.evaluate(({ BrowserWindow }) => {
        global.__minimizeCalls = 0
        BrowserWindow.getAllWindows()[0].minimize = () => { global.__minimizeCalls += 1 }
      })
      await page.locator('.frameless-titlebar-minimize').click()
      await expect.poll(() => app.evaluate(() => global.__minimizeCalls || 0)).toBe(1)
    }

    const state = await page.evaluate(() => window.mtNative.window.getState())
    expect(typeof state.isFullScreen).toBe('boolean')
    expect(typeof state.isMaximized).toBe('boolean')
    expectNoRendererErrors(session)
  })

  test('large-document parsing uses the packaged worker without protocol errors', async ({ launchApp, workspace }) => {
    const lines = ['# Worker contract', '']
    for (let index = 1; index <= 180; index++) lines.push(`worker paragraph ${index}`, '')
    const filePath = workspace.write('worker.md', lines.join('\n'))
    const session = await launchApp()
    const { app, page } = session

    await page.evaluate(() => {
      const NativeWorker = window.Worker
      window.__workerStats = { created: 0, errors: 0, messageErrors: 0, messages: 0, posted: 0 }
      window.Worker = class TrackedWorker extends NativeWorker {
        constructor (url, options) {
          super(url, options)
          window.__workerStats.created += 1
          this.addEventListener('message', () => { window.__workerStats.messages += 1 })
          this.addEventListener('error', () => { window.__workerStats.errors += 1 })
          this.addEventListener('messageerror', () => { window.__workerStats.messageErrors += 1 })
        }

        postMessage (...args) {
          window.__workerStats.posted += 1
          return super.postMessage(...args)
        }
      }
    })

    await stubOpenDialog(app, [filePath], '__workerFileOpenCalls')
    await clickMenuItemByPath(app, ['File', 'Open File...'])
    await expect.poll(() => getMainProcessCallCount(app, '__workerFileOpenCalls')).toBe(1)
    await expect(page.locator('.editor-component')).toContainText('worker paragraph 1')
    await expect.poll(() => page.evaluate(() => window.__workerStats.created)).toBeGreaterThan(0)
    await expect.poll(() => page.evaluate(() => window.__workerStats.posted)).toBeGreaterThan(0)
    await expect.poll(() => page.evaluate(() => window.__workerStats.messages)).toBeGreaterThan(0)
    expect(await page.evaluate(() => window.__workerStats)).toMatchObject({ errors: 0, messageErrors: 0 })
    expectNoRendererErrors(session)
  })
})
