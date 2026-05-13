const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('hovering a markdown link opens link tools without renderer errors', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-link-tools-'))
  const filePath = path.join(tempDir, 'link-tools.md')
  fs.writeFileSync(filePath, '# Link tools\n\n[MarkText](https://github.com/marktext/marktext)\n', 'utf8')

  let app
  try {
    const launched = await launchElectron()
    app = launched.app
    const { page } = launched
    const editorComponent = page.locator('.editor-component')

    await app.evaluate(({ dialog }, targetPath) => {
      global.__marktextLinkToolsOpenDialogCalls = 0
      dialog.showOpenDialog = async () => {
        global.__marktextLinkToolsOpenDialogCalls += 1
        return { filePaths: [targetPath], canceled: false }
      }
    }, filePath)

    await clickMenuItemByPath(app, ['File', 'Open File...'])
    await expect.poll(() => app.evaluate(() => global.__marktextLinkToolsOpenDialogCalls || 0)).toBe(1)
    await expect(editorComponent).toContainText('MarkText')

    const link = page.locator('a.ag-inline-rule').filter({ hasText: 'MarkText' }).first()
    await link.hover()

    await expect(page.locator('.ag-link-tools')).toBeVisible()
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
