const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('file menu save as writes an untitled tab to the selected path', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-save-as-smoke-'))
  const filePath = path.join(tempDir, 'save-as-smoke.md')
  const token = `save-as-token-${Date.now()}`

  let app
  try {
    const launched = await launchElectron()
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()

    const editor = page.locator('.ag-paragraph-content').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type(token)
    await expect(page.locator('.editor-component')).toContainText(token)

    await app.evaluate(({ dialog }, targetPath) => {
      global.__marktextSaveAsDialogCalls = 0
      dialog.showSaveDialog = async () => {
        global.__marktextSaveAsDialogCalls += 1
        return { filePath: targetPath, canceled: false }
      }
    }, filePath)

    await clickMenuItemByPath(app, ['File', 'Save As...'])

    await expect.poll(() => app.evaluate(() => global.__marktextSaveAsDialogCalls || 0)).toBe(1)
    await expect.poll(() => {
      if (!fs.existsSync(filePath)) return ''
      return fs.readFileSync(filePath, 'utf8')
    }).toContain(token)
    await expect(page.locator('.tabs-container li.active')).toContainText('save-as-smoke.md')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
