const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('slow scrolling drains queued viewport placeholders', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-viewport-render-'))
  const filePath = path.join(tempDir, 'long-viewport-render.md')
  const lines = ['# Viewport render scheduler', '']
  for (let i = 1; i <= 180; i++) {
    lines.push(`slow scroll render paragraph ${i}`)
    lines.push('')
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')

  let app
  try {
    const launched = await launchElectron()
    app = launched.app
    const { page } = launched
    const editorComponent = page.locator('.editor-component')

    await app.evaluate(({ dialog }, targetPath) => {
      global.__marktextViewportRenderOpenDialogCalls = 0
      dialog.showOpenDialog = async () => {
        global.__marktextViewportRenderOpenDialogCalls += 1
        return { filePaths: [targetPath], canceled: false }
      }
    }, filePath)

    await clickMenuItemByPath(app, ['File', 'Open File...'])
    await expect.poll(() => app.evaluate(() => global.__marktextViewportRenderOpenDialogCalls || 0)).toBe(1)
    await expect(editorComponent).toContainText('Viewport render scheduler')

    for (let i = 0; i < 8; i++) {
      const visiblePlaceholders = await page.evaluate(async () => {
        const container = document.querySelector('.editor-component')
        if (!container) {
          return -1
        }
        container.scrollTop += Math.max(80, Math.floor(container.clientHeight / 2))
        container.dispatchEvent(new Event('scroll'))
        await new Promise(resolve => setTimeout(resolve, 180))
        const containerRect = container.getBoundingClientRect()
        return Array.from(document.querySelectorAll('.ag-viewport-placeholder')).filter(dom => {
          const rect = dom.getBoundingClientRect()
          return rect.bottom > containerRect.top && rect.top < containerRect.bottom
        }).length
      })

      expect(visiblePlaceholders).toBe(0)
    }
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
