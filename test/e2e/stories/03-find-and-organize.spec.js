const path = require('path')
const {
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  getMainProcessCallCount,
  stubOpenDialog,
  test
} = require('../fixtures')

const runPaletteCommand = async (app, page, query, expectedCommand) => {
  const palette = page.locator('.command-palette')
  await expect(palette).toBeAttached()
  await clickMenuItemByPath(app, ['View', 'Command Palette...'])
  await expect(palette.locator('.el-dialog')).toBeVisible()
  await palette.locator('input.search').fill(query)
  await expect(palette.locator('ul.commands li.active')).toContainText(expectedCommand)
  await page.keyboard.press('Enter')
  await expect(palette.locator('.el-dialog')).toBeHidden()
}

test.describe('US-03 find and organize', () => {
  test('[US-03.AC-01, US-03.AC-02] finds, navigates, and replaces content in the active document', async ({ captureStory, launchApp, workspace }) => {
    const target = `find-target-${Date.now()}`
    const replacement = `replacement-${Date.now()}`
    const filePath = workspace.write('find.md', `# Search notes\n\nFirst ${target}; second ${target}.\n`)
    const session = await launchApp([filePath])
    const { app, page } = session

    await expect(page.locator('.editor-component')).toContainText(target)
    await clickMenuItemByPath(app, ['Edit', 'Find'])
    const searchBar = page.locator('.search-bar')
    await expect(searchBar.getByRole('button', { name: 'Close find' })).toBeVisible()
    const searchControlSizes = await searchBar.locator('section.search button').evaluateAll(buttons => {
      return buttons.map(button => {
        const rect = button.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      })
    })
    expect(searchControlSizes.every(({ width, height }) => width >= 32 && height >= 32)).toBe(true)
    await searchBar.locator('input[placeholder="Search"]').click()
    await page.keyboard.type(target)
    await expect(searchBar.locator('.search-result')).toHaveText('1 / 2')
    await expect(page.locator('.ag-highlight')).toHaveCount(1)
    await expect(page.locator('.ag-highlight, .ag-selection')).toHaveCount(2)
    await captureStory(page, 'US-03 document find')

    const nextButtonHitTarget = await searchBar.locator('section.search .button-group .button').last().evaluate(button => {
      const rect = button.getBoundingClientRect()
      const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      const wrapperRect = button.closest('section').querySelector('.input-wrapper').getBoundingClientRect()
      const controlsRect = button.closest('section').querySelector('.controls').getBoundingClientRect()
      const groupRect = button.closest('.button-group').getBoundingClientRect()
      return {
        button: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        buttonGroup: { left: groupRect.left, right: groupRect.right },
        controls: { left: controlsRect.left, right: controlsRect.right },
        hitsOwnButton: target?.closest('button') === button,
        inputWrapper: { left: wrapperRect.left, right: wrapperRect.right },
        targetParentClass: target?.parentElement?.getAttribute('class') || '',
        targetClass: target?.getAttribute('class') || '',
        targetTag: target?.tagName || ''
      }
    })
    expect(nextButtonHitTarget.hitsOwnButton, JSON.stringify(nextButtonHitTarget)).toBe(true)
    await searchBar.locator('section.search .button-group .button').last().click()
    await expect(searchBar.locator('.search-result')).toHaveText('2 / 2')
    await searchBar.locator('section.search .button-group .button').first().click()
    await expect(searchBar.locator('.search-result')).toHaveText('1 / 2')

    await clickMenuItemByPath(app, ['Edit', 'Replace'])
    await expect(searchBar.locator('section.replace')).toBeVisible()
    await searchBar.locator('input[placeholder="Replacement"]').fill(replacement)
    await searchBar.locator('section.replace .button-group .button').last().evaluate(button => button.click())
    await expect(page.locator('.editor-component')).toContainText(replacement)
    await expect(searchBar.locator('.search-result')).toHaveText('1 / 1')
    await expect(page.locator('.tabs-container li.active.unsaved')).toHaveCount(1)
    await searchBar.locator('section.replace .button-group .button').first().evaluate(button => button.click())
    await expect(page.locator('.editor-component')).not.toContainText(target)
    await expect(searchBar.locator('.search-result')).toHaveText('0 / 0')
    expectNoRendererErrors(session)
  })

  test('[US-03.AC-04] filters and executes an action from the command palette', async ({ launchApp, workspace }) => {
    const target = `palette-target-${Date.now()}`
    const filePath = workspace.write('palette.md', `${target} one; ${target} two.\n`)
    const session = await launchApp([filePath])
    const { app, page } = session

    await expect(page.locator('.editor-component')).toContainText(target)
    await clickMenuItemByPath(app, ['Edit', 'Find'])
    const searchBar = page.locator('.search-bar')
    await searchBar.locator('input[placeholder="Search"]').click()
    await page.keyboard.type(target)
    await expect(searchBar.locator('.search-result')).toHaveText('1 / 2')
    await runPaletteCommand(app, page, 'find next', 'Edit: Find Next')
    await expect(searchBar.locator('.search-result')).toHaveText('2 / 2')
    expectNoRendererErrors(session)
  })

  test('[US-03.AC-03] opens a workspace and returns accurate cross-file search results', async ({ captureStory, launchApp, workspace }) => {
    const token = `workspace-token-${Date.now()}`
    workspace.write('notes/alpha.md', `# Alpha\n\n${token}\n`)
    workspace.write('notes/beta.md', '# Beta\n\nOther content\n')
    const session = await launchApp()
    const { app, page } = session

    await stubOpenDialog(app, [workspace.root], '__openFolderCalls')
    await clickMenuItemByPath(app, ['File', 'Open Folder...'])
    await expect.poll(() => getMainProcessCallCount(app, '__openFolderCalls')).toBe(1)
    const projectTree = page.locator('.project-tree')
    await expect(projectTree).toBeVisible()
    await expect(projectTree).toContainText(path.basename(workspace.root))

    await clickMenuItemByPath(app, ['Edit', 'Find in Folder'])
    const searchPanel = page.locator('.side-bar-search')
    await searchPanel.locator('input[placeholder="Search in folder..."]').click()
    await page.keyboard.type(token)
    await expect(searchPanel.locator('.search-result-info')).toHaveText('1 match in 1 file', { timeout: 15000 })
    await expect(searchPanel.locator('.search-result-item')).toContainText('alpha')
    await expect(searchPanel.locator('.search-result-item')).toContainText(token)
    const matchGeometry = await searchPanel.locator('.match-row').first().evaluate(element => {
      const row = element.getBoundingClientRect()
      const lineNumber = element.querySelector('.line-number').getBoundingClientRect()
      const text = element.querySelector('.match-text').getBoundingClientRect()
      return {
        lineNumberTop: lineNumber.top,
        rowRight: row.right,
        textRight: text.right,
        textTop: text.top,
        textWidth: text.width
      }
    })
    expect(Math.abs(matchGeometry.lineNumberTop - matchGeometry.textTop)).toBeLessThanOrEqual(4)
    expect(matchGeometry.textWidth).toBeGreaterThan(40)
    expect(matchGeometry.textRight).toBeLessThanOrEqual(matchGeometry.rowRight)

    await captureStory(page, 'US-03 folder search')
    expectNoRendererErrors(session)
  })
})
