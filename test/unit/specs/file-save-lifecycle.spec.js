// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map()
  const win = {
    id: 17,
    webContents: { send: vi.fn() }
  }
  return {
    handlers,
    win,
    writeMarkdownFile: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
    emit: vi.fn()
  }
})

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: () => mocks.win },
  app: {
    getPath: vi.fn(() => '/tmp'),
    quit: vi.fn()
  },
  dialog: {
    showSaveDialog: mocks.showSaveDialog,
    showMessageBox: mocks.showMessageBox
  },
  ipcMain: {
    emit: mocks.emit,
    on: vi.fn((name, handler) => mocks.handlers.set(name, handler))
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn()
  }
}))
vi.mock('../../../src/main/filesystem/markdown', () => ({
  writeMarkdownFile: mocks.writeMarkdownFile
}))
vi.mock('../../../src/main/menu/actions/marktext', () => ({
  checkUpdates: vi.fn(),
  userSetting: vi.fn()
}))
vi.mock('../../../src/main/menu/actions/view', () => ({ showTabBar: vi.fn() }))
vi.mock('../../../src/main/utils/pandoc', () => ({
  default: Object.assign(vi.fn(), { exists: vi.fn(() => false) })
}))

const { handleCloseWindowConfirm, handleResponseForSave } = await import('../../../src/main/menu/actions/file')

const savePayload = {
  id: 'tab-1',
  filename: 'document.md',
  markdown: 'changed content',
  pathname: '/tmp/document.md',
  options: {
    adjustLineEndingOnSave: false,
    lineEnding: 'lf',
    encoding: { encoding: 'utf8', isBom: false }
  }
}

describe('save and close lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.writeMarkdownFile.mockResolvedValue(undefined)
    mocks.showMessageBox.mockResolvedValue({ response: 0 })
  })

  it('propagates write failures after notifying the renderer', async () => {
    const error = new Error('disk full')
    mocks.writeMarkdownFile.mockRejectedValue(error)

    await expect(handleResponseForSave({ sender: {} }, savePayload)).rejects.toBe(error)
    expect(mocks.win.webContents.send).toHaveBeenCalledWith('mt::tab-save-failure', 'tab-1', 'disk full')
  })

  it('keeps the window open when the save path dialog is canceled', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 })
    mocks.showSaveDialog.mockResolvedValue({ canceled: true })
    const untitled = { ...savePayload, pathname: '' }

    await handleCloseWindowConfirm({ sender: {} }, [untitled])

    expect(mocks.emit).not.toHaveBeenCalledWith('window-close-by-id', mocks.win.id)
  })

  it('keeps the window open after a failed save unless discarding is explicit', async () => {
    mocks.writeMarkdownFile.mockRejectedValue(new Error('permission denied'))
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 1 })

    await handleCloseWindowConfirm({ sender: {} }, [savePayload])

    expect(mocks.emit).not.toHaveBeenCalledWith('window-close-by-id', mocks.win.id)
  })

  it('closes after a failed save only when the user explicitly discards changes', async () => {
    mocks.writeMarkdownFile.mockRejectedValue(new Error('permission denied'))
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 })

    await handleCloseWindowConfirm({ sender: {} }, [savePayload])

    expect(mocks.emit).toHaveBeenCalledWith('window-close-by-id', mocks.win.id)
  })

  it('closes the window after every unsaved document is saved', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 })

    await handleCloseWindowConfirm({ sender: {} }, [savePayload])

    expect(mocks.emit).toHaveBeenCalledWith('window-close-by-id', mocks.win.id)
  })
})
