const fallbackProjectApi = {
  openInSidebar: () => {},
  updateSidebarMenu: () => {}
}

const getProjectApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.project) {
    return window.mtNative.project
  }

  return fallbackProjectApi
}

export default {
  openInSidebar: () => getProjectApi().openInSidebar(),
  updateSidebarMenu: (windowId, visible) => getProjectApi().updateSidebarMenu(windowId, visible)
}
