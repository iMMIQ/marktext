import { BrowserWindow, ipcMain, Menu } from 'electron'

const TABS_MENU_CHANNEL = 'mt::menu-tabs-command'
const SIDEBAR_MENU_CHANNEL = 'mt::menu-sidebar-command'

const popupRendererMenu = (win, template, x, y) => {
  Menu.buildFromTemplate(template).popup({
    window: win,
    x,
    y
  })
}

const sendRendererCommand = (webContents, channel, payload) => {
  if (!webContents.isDestroyed()) {
    webContents.send(channel, payload)
  }
}

const getTabsMenuTemplate = (webContents, { tabId, hasPath }) => ([
  {
    label: 'Close',
    id: 'closeThisTab',
    click: () => sendRendererCommand(webContents, TABS_MENU_CHANNEL, { id: 'closeThisTab', tabId })
  },
  {
    label: 'Close others',
    id: 'closeOtherTabs',
    click: () => sendRendererCommand(webContents, TABS_MENU_CHANNEL, { id: 'closeOtherTabs', tabId })
  },
  {
    label: 'Close saved tabs',
    id: 'closeSavedTabs',
    click: () => sendRendererCommand(webContents, TABS_MENU_CHANNEL, { id: 'closeSavedTabs', tabId })
  },
  {
    label: 'Close all tabs',
    id: 'closeAllTabs',
    click: () => sendRendererCommand(webContents, TABS_MENU_CHANNEL, { id: 'closeAllTabs', tabId })
  },
  { type: 'separator' },
  {
    label: 'Rename',
    id: 'renameFile',
    enabled: hasPath,
    click: () => sendRendererCommand(webContents, TABS_MENU_CHANNEL, { id: 'renameFile', tabId })
  },
  {
    label: 'Copy path',
    id: 'copyPath',
    enabled: hasPath,
    click: () => sendRendererCommand(webContents, TABS_MENU_CHANNEL, { id: 'copyPath', tabId })
  },
  {
    label: 'Show in folder',
    id: 'showInFolder',
    enabled: hasPath,
    click: () => sendRendererCommand(webContents, TABS_MENU_CHANNEL, { id: 'showInFolder', tabId })
  }
])

const getSidebarMenuTemplate = (webContents, { hasPathCache }) => ([
  {
    label: 'New File',
    id: 'newFileMenuItem',
    click: () => sendRendererCommand(webContents, SIDEBAR_MENU_CHANNEL, { id: 'newFileMenuItem' })
  },
  {
    label: 'New Directory',
    id: 'newDirectoryMenuItem',
    click: () => sendRendererCommand(webContents, SIDEBAR_MENU_CHANNEL, { id: 'newDirectoryMenuItem' })
  },
  { type: 'separator' },
  {
    label: 'Copy',
    id: 'copyMenuItem',
    click: () => sendRendererCommand(webContents, SIDEBAR_MENU_CHANNEL, { id: 'copyMenuItem' })
  },
  {
    label: 'Cut',
    id: 'cutMenuItem',
    click: () => sendRendererCommand(webContents, SIDEBAR_MENU_CHANNEL, { id: 'cutMenuItem' })
  },
  {
    label: 'Paste',
    id: 'pasteMenuItem',
    enabled: hasPathCache,
    click: () => sendRendererCommand(webContents, SIDEBAR_MENU_CHANNEL, { id: 'pasteMenuItem' })
  },
  { type: 'separator' },
  {
    label: 'Rename',
    id: 'renameMenuItem',
    click: () => sendRendererCommand(webContents, SIDEBAR_MENU_CHANNEL, { id: 'renameMenuItem' })
  },
  {
    label: 'Move To Trash',
    id: 'deleteMenuItem',
    click: () => sendRendererCommand(webContents, SIDEBAR_MENU_CHANNEL, { id: 'deleteMenuItem' })
  },
  { type: 'separator' },
  {
    label: 'Show In Folder',
    id: 'showInFolderMenuItem',
    click: () => sendRendererCommand(webContents, SIDEBAR_MENU_CHANNEL, { id: 'showInFolderMenuItem' })
  }
])

const registerMenuHandlers = menu => {
  ipcMain.on('mt::menu-popup-application', (event, payload = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !menu.has(win.id)) {
      return
    }

    if (payload.scope === 'tabs') {
      const { position = {} } = payload
      popupRendererMenu(win, getTabsMenuTemplate(event.sender, payload), position.x, position.y)
      return
    }

    if (payload.scope === 'sidebar') {
      const { position = {} } = payload
      popupRendererMenu(win, getSidebarMenuTemplate(event.sender, payload), position.x, position.y)
      return
    }

    const applicationMenu = menu.getWindowMenuById(win.id)
    if (!applicationMenu) {
      return
    }

    applicationMenu.popup({
      window: win,
      x: payload.x,
      y: payload.y
    })
  })
}

export default registerMenuHandlers
