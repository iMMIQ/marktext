const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

const executeCommandPaletteCommand = async (app, page, query, expectedCommand) => {
  await clickMenuItemByPath(app, ['View', 'Command Palette...'])

  const palette = page.locator('.command-palette')
  await expect(page.locator('.el-dialog')).toBeVisible()

  const search = palette.locator('input.search')
  await expect(search).toBeVisible()
  await search.fill(query)
  await search.evaluate((input, key) => {
    input.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  }, query.slice(-1))
  await expect(palette.locator('ul.commands li.active')).toContainText(expectedCommand)
  await page.keyboard.press('Enter')
  await expect(page.locator('.el-dialog')).toBeHidden()
}

test('command palette find next and previous navigate search matches', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-find-smoke-'))
  const filePath = path.join(tempDir, 'find-smoke.md')
  const token = `find-target-${Date.now()}`
  fs.writeFileSync(filePath, `# Find smoke\n\nFirst ${token} second ${token} third\n`, 'utf8')

  let app
  try {
    const launched = await launchElectron([filePath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.editor-component')).toContainText(token)

    await clickMenuItemByPath(app, ['Edit', 'Find'])

    const searchBar = page.locator('.search-bar')
    await expect(searchBar).toBeVisible()
    await searchBar.locator('input[placeholder="Search"]').click()
    await page.keyboard.type(token)
    await expect(searchBar.locator('.search-result')).toHaveText('1 / 2')

    await executeCommandPaletteCommand(app, page, 'find next', 'Edit: Find Next')
    await expect(searchBar.locator('.search-result')).toHaveText('2 / 2')

    await executeCommandPaletteCommand(app, page, 'find previous', 'Edit: Find Previous')
    await expect(searchBar.locator('.search-result')).toHaveText('1 / 2')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
