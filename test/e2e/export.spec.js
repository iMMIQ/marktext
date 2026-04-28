const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('editor exports the opened markdown file as styled HTML', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-export-smoke-'))
  const markdownPath = path.join(tempDir, 'export-smoke.md')
  const htmlPath = path.join(tempDir, 'export-smoke.html')
  const token = `export body ${Date.now()}`
  fs.writeFileSync(markdownPath, `# Export smoke\n\n${token}\n`, 'utf8')

  let app
  try {
    const launched = await launchElectron([markdownPath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.editor-component')).toContainText(token)

    await app.evaluate(({ dialog }, targetPath) => {
      global.__marktextExportDialogCalls = 0
      dialog.showSaveDialog = async () => {
        global.__marktextExportDialogCalls += 1
        return { filePath: targetPath, canceled: false }
      }
    }, htmlPath)
    await clickMenuItemByPath(app, ['File', 'Export', 'HTML'])

    const exportDialog = page.locator('.print-settings-dialog .el-dialog')
    await expect(exportDialog).toBeVisible()
    await page.getByRole('button', { name: 'Export...' }).click()
    await expect(exportDialog).toBeHidden()

    await expect.poll(() => {
      return app.evaluate(() => global.__marktextExportDialogCalls || 0)
    }, { timeout: 15000 }).toBe(1)

    await expect.poll(() => {
      if (!fs.existsSync(htmlPath)) return ''
      return fs.readFileSync(htmlPath, 'utf8')
    }, { timeout: 15000 }).toContain(token)
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
