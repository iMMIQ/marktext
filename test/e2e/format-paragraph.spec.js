const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, getMenuItemChecked, launchElectron } = require('./helpers')

test('format menu applies bold to selected editor text', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-format-smoke-'))
  const filePath = path.join(tempDir, 'format-smoke.md')
  fs.writeFileSync(filePath, '\n', 'utf8')

  let app
  try {
    const launched = await launchElectron([filePath])
    app = launched.app
    const { page } = launched

    const editor = page.locator('.ag-paragraph-content').first()
    await expect(editor).toBeVisible()
    await editor.click()

    await clickMenuItemByPath(app, ['Format', 'Bold'])
    await expect.poll(() => getMenuItemChecked(app, 'strongMenuItem')).toBe(true)
    await page.waitForTimeout(200)
    await page.keyboard.type('format target', { delay: 30 })
    await expect(page.locator('.editor-component strong')).toContainText('format target')

    await clickMenuItemByPath(app, ['File', 'Save'])
    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain('**format target**')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('paragraph menu transforms the active paragraph into a heading', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-paragraph-smoke-'))
  const filePath = path.join(tempDir, 'paragraph-smoke.md')
  fs.writeFileSync(filePath, 'heading target\n', 'utf8')

  let app
  try {
    const launched = await launchElectron([filePath])
    app = launched.app
    const { page } = launched

    const editor = page.locator('.ag-paragraph-content').first()
    await expect(editor).toBeVisible()
    await editor.click()

    await clickMenuItemByPath(app, ['Paragraph', 'Heading 1'])
    await expect(page.locator('.editor-component h1')).toContainText('heading target')

    await clickMenuItemByPath(app, ['File', 'Save'])
    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toMatch(/^# heading target/m)
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
