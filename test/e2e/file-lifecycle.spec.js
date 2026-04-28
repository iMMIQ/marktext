const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, getMenuItemChecked, launchElectron } = require('./helpers')

test('file menu opens a selected markdown file', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-open-file-smoke-'))
  const filePath = path.join(tempDir, 'open-file-smoke.md')
  const token = `open-file-token-${Date.now()}`
  fs.writeFileSync(filePath, `# Open file smoke\n\n${token}\n`, 'utf8')

  let app
  try {
    const launched = await launchElectron()
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()

    await app.evaluate(({ dialog }, targetPath) => {
      global.__marktextOpenFileDialogCalls = 0
      dialog.showOpenDialog = async () => {
        global.__marktextOpenFileDialogCalls += 1
        return { filePaths: [targetPath], canceled: false }
      }
    }, filePath)

    await clickMenuItemByPath(app, ['File', 'Open File...'])

    await expect.poll(() => app.evaluate(() => global.__marktextOpenFileDialogCalls || 0)).toBe(1)
    await expect(page.locator('.editor-component')).toContainText(token)
    await expect(page.locator('.title-bar .filename')).toContainText('open-file-smoke.md')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('file menu moves the current markdown file to a selected path', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-move-file-smoke-'))
  const originalPath = path.join(tempDir, 'move-source.md')
  const movedPath = path.join(tempDir, 'move-target.md')
  const token = `move-file-token-${Date.now()}`
  fs.writeFileSync(originalPath, `# Move file smoke\n\n${token}\n`, 'utf8')

  let app
  try {
    const launched = await launchElectron([originalPath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-component')).toContainText(token)

    await app.evaluate(({ dialog }, targetPath) => {
      global.__marktextMoveDialogCalls = 0
      dialog.showSaveDialog = async () => {
        global.__marktextMoveDialogCalls += 1
        return { filePath: targetPath, canceled: false }
      }
    }, movedPath)

    await clickMenuItemByPath(app, ['File', 'Move To...'])

    await expect.poll(() => app.evaluate(() => global.__marktextMoveDialogCalls || 0)).toBe(1)
    await expect.poll(() => fs.existsSync(movedPath)).toBe(true)
    await expect.poll(() => fs.existsSync(originalPath)).toBe(false)
    await expect(page.locator('.title-bar .filename')).toContainText('move-target.md')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('file menu renames the current markdown file', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-rename-file-smoke-'))
  const originalPath = path.join(tempDir, 'rename-source.md')
  const renamedPath = path.join(tempDir, 'rename-target.md')
  const token = `rename-file-token-${Date.now()}`
  fs.writeFileSync(originalPath, `# Rename file smoke\n\n${token}\n`, 'utf8')

  let app
  try {
    const launched = await launchElectron([originalPath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-component')).toContainText(token)

    await clickMenuItemByPath(app, ['File', 'Rename...'])

    const renameInput = page.locator('.rename input.search')
    await expect(renameInput).toBeVisible()
    await renameInput.fill(path.basename(renamedPath))
    await page.keyboard.press('Enter')

    await expect.poll(() => fs.existsSync(renamedPath)).toBe(true)
    await expect.poll(() => fs.existsSync(originalPath)).toBe(false)
    await expect(page.locator('.title-bar .filename')).toContainText('rename-target.md')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('file menu auto save writes edited content without an explicit save', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-auto-save-smoke-'))
  const filePath = path.join(tempDir, 'auto-save-smoke.md')
  const token = `auto-save-token-${Date.now()}`
  fs.writeFileSync(filePath, '# Auto save smoke\n\nInitial paragraph\n', 'utf8')

  let app
  try {
    const launched = await launchElectron([filePath])
    app = launched.app
    const { page } = launched

    expect(await getMenuItemChecked(app, 'autoSaveMenuItem')).toBe(false)

    await clickMenuItemByPath(app, ['File', 'Auto Save'])
    await expect.poll(() => getMenuItemChecked(app, 'autoSaveMenuItem')).toBe(true)

    const editor = page.locator('.ag-paragraph-content').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type(` ${token}`)
    await expect(page.locator('.editor-component')).toContainText(token)

    await expect.poll(() => fs.readFileSync(filePath, 'utf8'), { timeout: 10000 }).toContain(token)
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
