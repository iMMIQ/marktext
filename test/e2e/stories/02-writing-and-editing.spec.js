const fs = require('fs')
const {
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  getMenuItemChecked,
  test
} = require('../fixtures')

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test.describe('US-02 writing and editing', () => {
  test('[US-02.AC-01] formats a heading and bold text in the rich editor', async ({ captureStory, launchApp, workspace }) => {
    const filePath = workspace.write('writing.md', 'Heading target\n\nBody anchor\n')
    const session = await launchApp([filePath])
    const { app, page } = session

    const heading = page.locator('.ag-paragraph-content').filter({ hasText: 'Heading target' })
    await heading.click()
    await clickMenuItemByPath(app, ['Paragraph', 'Heading 1'])
    await expect(page.locator('.editor-component h1')).toContainText('Heading target')

    const body = page.locator('.ag-paragraph-content').filter({ hasText: 'Body anchor' })
    await body.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await clickMenuItemByPath(app, ['Format', 'Bold'])
    await expect.poll(() => getMenuItemChecked(app, 'strongMenuItem')).toBe(true)
    await page.keyboard.type('Bold target')
    await expect(page.locator('.editor-component strong')).toContainText('Bold target')
    await clickMenuItemByPath(app, ['File', 'Save'])
    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain('# Heading target')
    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain('**Bold target**')

    await captureStory(page, 'US-02 rich text editing')
    expectNoRendererErrors(session)
  })

  test('[US-02.AC-02] undoes and redoes an editing action', async ({ launchApp }) => {
    const session = await launchApp()
    const { page } = session
    const editor = page.locator('.ag-paragraph-content').first()

    await editor.click()
    await page.keyboard.type('undo redo target')
    await expect(page.locator('.editor-component')).toContainText('undo redo target')
    await page.keyboard.press(`${MOD}+Z`)
    await expect(page.locator('.editor-component')).not.toContainText('undo redo target')
    await page.keyboard.press(`Shift+${MOD}+Z`)
    await expect(page.locator('.editor-component')).toContainText('undo redo target')
    expectNoRendererErrors(session)
  })

  test('[US-02.AC-03] syncs source mode edits back to the rich editor and disk', async ({ captureStory, launchApp, workspace }) => {
    const sourceToken = `source-edit-${Date.now()}`
    const filePath = workspace.write('source-mode.md', '# Source mode\n\nInitial paragraph\n')
    const session = await launchApp([filePath])
    const { app, page } = session

    await clickMenuItemByPath(app, ['View', 'Source Code Mode'])
    await expect.poll(() => getMenuItemChecked(app, 'sourceCodeModeMenuItem')).toBe(true)
    const sourceEditor = page.locator('.source-code .cm-content')
    await expect(sourceEditor).toContainText('Initial paragraph')
    await sourceEditor.click()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
    await page.keyboard.type(`\n\n${sourceToken}`)
    await captureStory(page, 'US-02 source mode')

    await clickMenuItemByPath(app, ['View', 'Source Code Mode'])
    await expect(page.locator('.editor-component')).toContainText(sourceToken)
    await clickMenuItemByPath(app, ['File', 'Save'])
    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain(sourceToken)
    expectNoRendererErrors(session)
  })
})
