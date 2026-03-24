import nativeApi from '../../services/nativeApi'
import * as contextMenu from './actions'

const SIDEBAR_MENU_CHANNEL = 'mt::menu-sidebar-command'
const SIDEBAR_MENU_ACTIONS = {
  newFileMenuItem: () => contextMenu.newFile(),
  newDirectoryMenuItem: () => contextMenu.newDirectory(),
  copyMenuItem: () => contextMenu.copy(),
  cutMenuItem: () => contextMenu.cut(),
  pasteMenuItem: () => contextMenu.paste(),
  renameMenuItem: () => contextMenu.rename(),
  deleteMenuItem: () => contextMenu.remove(),
  showInFolderMenuItem: () => contextMenu.showInFolder()
}
let stopListening = null

const ensureListener = () => {
  if (stopListening) {
    return
  }

  stopListening = nativeApi.events.on(SIDEBAR_MENU_CHANNEL, (event, payload = {}) => {
    const action = SIDEBAR_MENU_ACTIONS[payload.id]
    if (action) {
      action(payload)
    }
  })
}

export const showContextMenu = (event, hasPathCache) => {
  ensureListener()
  nativeApi.menu.popupSideBarMenu({
    position: {
      x: event.clientX,
      y: event.clientY
    },
    hasPathCache
  })
}
