import nativeApi from '../../services/nativeApi'
import * as contextMenu from './actions'

const TABS_MENU_CHANNEL = 'mt::menu-tabs-command'
const TAB_MENU_ACTIONS = {
  closeThisTab: ({ tabId }) => contextMenu.closeThis(tabId),
  closeOtherTabs: ({ tabId }) => contextMenu.closeOthers(tabId),
  closeSavedTabs: () => contextMenu.closeSaved(),
  closeAllTabs: () => contextMenu.closeAll(),
  renameFile: ({ tabId }) => contextMenu.rename(tabId),
  copyPath: ({ tabId }) => contextMenu.copyPath(tabId),
  showInFolder: ({ tabId }) => contextMenu.showInFolder(tabId)
}
let stopListening = null

const ensureListener = () => {
  if (stopListening) {
    return
  }

  stopListening = nativeApi.events.on(TABS_MENU_CHANNEL, (event, payload = {}) => {
    const action = TAB_MENU_ACTIONS[payload.id]
    if (action) {
      action(payload)
    }
  })
}

export const showContextMenu = (event, tab) => {
  ensureListener()
  nativeApi.menu.popupTabsMenu({
    position: {
      x: event.clientX,
      y: event.clientY
    },
    tabId: tab.id,
    hasPath: !!tab.pathname
  })
}
