const fs = require('fs')
const path = require('path')
const {
  clickMenuItemById,
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  getMainProcessCallCount,
  getMenuItemChecked,
  stubSaveDialog,
  test
} = require('../fixtures')

test.describe('US-01 document lifecycle', () => {
  test('[US-01.AC-02] opens a startup file, edits it, and saves without losing content', async ({ captureStory, launchApp, workspace }) => {
    const token = `saved-${Date.now()}`
    const filePath = workspace.write('draft.md', '# Project brief\n\nInitial paragraph\n')
    const session = await launchApp([filePath])
    const { app, page } = session

    await expect(page.locator('.editor-component')).toContainText('Initial paragraph')
    await expect(page.locator('.title-bar .filename')).toContainText('draft.md')
    await expect(page.locator('.title-bar .word-count')).toContainText(/\d+ words?/)

    const paragraph = page.locator('.ag-paragraph-content').filter({ hasText: 'Initial paragraph' })
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.type(` ${token}`)
    await expect(page.locator('.tabs-container li.active.unsaved')).toHaveCount(1)

    await clickMenuItemByPath(app, ['File', 'Save'])
    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain(token)
    await expect(page.locator('.tabs-container li.active.unsaved')).toHaveCount(0)

    await captureStory(page, 'US-01 saved document')
    expectNoRendererErrors(session)
  })

  test('[US-01.AC-01, US-01.AC-05] saves an untitled document and keeps tab creation predictable', async ({ launchApp, workspace }) => {
    const token = `new-document-${Date.now()}`
    const targetPath = path.join(workspace.root, 'new-document.md')
    const session = await launchApp()
    const { app, page } = session

    const editor = page.locator('.ag-paragraph-content').first()
    await editor.click()
    await page.keyboard.type(token)
    await stubSaveDialog(app, targetPath, '__saveAsCalls')
    await clickMenuItemByPath(app, ['File', 'Save As...'])

    await expect.poll(() => getMainProcessCallCount(app, '__saveAsCalls')).toBe(1)
    await expect.poll(() => fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '').toContain(token)
    await expect(page.locator('.tabs-container li.active')).toContainText('new-document.md')
    await expect(page.locator('.title-bar .filename')).toContainText('new-document.md')
    await expect(page.locator('.tabs-container li.active.unsaved')).toHaveCount(0)

    await clickMenuItemByPath(app, ['File', 'New Tab'])
    await expect(page.locator('.tabs-container li')).toHaveCount(2)
    await expect(page.locator('.tabs-container li.active')).toContainText('Untitled-1')
    await clickMenuItemByPath(app, ['File', 'Close Tab'])
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    await expect(page.locator('.tabs-container li.active')).toContainText('new-document.md')
    expectNoRendererErrors(session)
  })

  test('[US-01.AC-03, US-01.AC-04] moves, renames, auto-saves, and converts line endings on the active file', async ({ captureStory, launchApp, workspace }) => {
    const sourcePath = workspace.write('source.md', '# Managed file\n\nEditable body\n')
    const movedPath = path.join(workspace.root, 'moved.md')
    const renamedPath = path.join(workspace.root, 'final.md')
    const token = `autosaved-${Date.now()}`
    const session = await launchApp([sourcePath])
    const { app, page } = session

    await expect(page.locator('.editor-component')).toContainText('Editable body')
    await stubSaveDialog(app, movedPath, '__moveCalls')
    await clickMenuItemByPath(app, ['File', 'Move To...'])
    await expect.poll(() => getMainProcessCallCount(app, '__moveCalls')).toBe(1)
    await expect.poll(() => fs.existsSync(movedPath)).toBe(true)
    expect(fs.existsSync(sourcePath)).toBe(false)

    await clickMenuItemByPath(app, ['File', 'Rename...'])
    const renameInput = page.locator('.rename input.search')
    await expect(renameInput).toBeVisible()
    await renameInput.fill(path.basename(renamedPath))
    await page.keyboard.press('Enter')
    await expect.poll(() => fs.existsSync(renamedPath)).toBe(true)
    await expect(page.locator('.title-bar .filename')).toContainText('final.md')

    expect(await getMenuItemChecked(app, 'autoSaveMenuItem')).toBe(false)
    await clickMenuItemByPath(app, ['File', 'Auto Save'])
    await expect.poll(() => getMenuItemChecked(app, 'autoSaveMenuItem')).toBe(true)
    const paragraph = page.locator('.ag-paragraph-content').filter({ hasText: 'Editable body' })
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.type(` ${token}`)
    await expect.poll(() => fs.readFileSync(renamedPath, 'utf8'), { timeout: 10000 }).toContain(token)

    await clickMenuItemById(app, 'crlfLineEndingMenuEntry')
    await clickMenuItemByPath(app, ['File', 'Save'])
    await expect.poll(() => fs.readFileSync(renamedPath, 'utf8')).toContain('# Managed file\r\n\r\nEditable body')

    await captureStory(page, 'US-01 managed file')
    expectNoRendererErrors(session)
  })
})
