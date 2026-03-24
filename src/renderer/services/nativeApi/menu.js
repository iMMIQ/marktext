const fallbackMenuApi = {
  popupApplicationMenu: () => {}
}

const getMenuApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.menu) {
    return window.mtNative.menu
  }

  return fallbackMenuApi
}

const popupBridgeMenu = payload => getMenuApi().popupApplicationMenu(payload)

export default {
  popupApplicationMenu: position => popupBridgeMenu(position),
  popupTabsMenu: ({ position, tabId, hasPath }) => popupBridgeMenu({
    scope: 'tabs',
    position,
    tabId,
    hasPath
  }),
  popupSideBarMenu: ({ position, hasPathCache }) => popupBridgeMenu({
    scope: 'sidebar',
    position,
    hasPathCache
  })
}
