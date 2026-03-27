import { describe, expect, it, vi } from 'vitest'

import codeMirror, {
  search,
  setCursorAtLastLine,
  setMode,
  setTextDirection
} from '../../../src/renderer/codeMirror'

describe('renderer codeMirror adapter', () => {
  it('creates a source editor with the legacy surface area used by sourceCode mode', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const editor = codeMirror(container, {
      value: 'alpha\nbeta',
      lineNumbers: true,
      lineWrapping: true,
      styleActiveLine: true,
      direction: 'ltr',
      autofocus: false,
      lineNumberFormatter: line => (line % 10 === 0 || line === 1 ? `${line}` : '')
    })

    expect(container.querySelector('.cm-editor')).toBeTruthy()
    expect(editor.getValue()).toBe('alpha\nbeta')
    expect(editor.lineCount()).toBe(2)
    expect(editor.lastLine()).toBe(1)
    expect(editor.getLine(1)).toBe('beta')

    editor.setCursor(0, 2)
    expect(editor.getCursor()).toMatchObject({ line: 0, ch: 2 })

    editor.setSelection({ line: 0, ch: 1 }, { line: 1, ch: 2 })
    expect(editor.getCursor('anchor')).toMatchObject({ line: 0, ch: 1 })
    expect(editor.getCursor('head')).toMatchObject({ line: 1, ch: 2 })

    setCursorAtLastLine(editor)
    expect(editor.getCursor()).toMatchObject({ line: 1, ch: 4 })

    await setMode(editor, 'markdown')
    expect(search('markdown')[0]).toMatchObject({ name: 'markdown' })

    setTextDirection(editor, 'rtl')
    expect(container.querySelector('.cm-content')?.getAttribute('dir')).toBe('rtl')
  })

  it('notifies cursor activity and DOM context menu listeners', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const editor = codeMirror(container, { value: 'alpha', autofocus: false })
    const cursorActivity = vi.fn()
    const contextmenu = vi.fn()

    editor.on('cursorActivity', cursorActivity)
    editor.on('contextmenu', contextmenu)
    editor.setCursor(0, 3)

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    container.querySelector('.cm-content')?.dispatchEvent(event)

    expect(cursorActivity).toHaveBeenCalled()
    expect(contextmenu).toHaveBeenCalled()
  })
})
