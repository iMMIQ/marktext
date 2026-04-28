const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('file menu opens a folder and find in folder returns markdown matches', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-folder-search-smoke-'))
  const filePath = path.join(tempDir, 'folder-search-smoke.md')
  const token = `folder-search-token-${Date.now()}`
  fs.writeFileSync(filePath, `# Folder search smoke\n\n${token}\n`, 'utf8')

  let app
  try {
    const launched = await launchElectron()
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()

    await app.evaluate(({ dialog }, targetPath) => {
      global.__marktextOpenFolderDialogCalls = 0
      dialog.showOpenDialog = async () => {
        global.__marktextOpenFolderDialogCalls += 1
        return { filePaths: [targetPath], canceled: false }
      }
    }, tempDir)

    await clickMenuItemByPath(app, ['File', 'Open Folder...'])

    await expect.poll(() => app.evaluate(() => global.__marktextOpenFolderDialogCalls || 0)).toBe(1)
    await expect(page.locator('.project-tree')).toBeVisible()
    await expect(page.locator('.project-tree')).toContainText(path.basename(tempDir))

    await clickMenuItemByPath(app, ['Edit', 'Find in Folder'])

    const searchPanel = page.locator('.side-bar-search')
    await expect(searchPanel).toBeVisible()
    const searchInput = searchPanel.locator('input[placeholder="Search in folder..."]')
    await searchInput.click()
    await page.keyboard.type(token)

    await expect(searchPanel.locator('.search-result-info')).toHaveText('1 match in 1 file', { timeout: 15000 })
    await expect(searchPanel.locator('.search-result-item')).toContainText('folder-search-smoke')
    await expect(searchPanel.locator('.search-result-item')).toContainText(token)
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
