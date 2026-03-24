const fallbackMenuApi = {
  popupApplicationMenu: () => {}
}

const getMenuApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.menu) {
    return window.mtNative.menu
  }

  return fallbackMenuApi
}

export default {
  popupApplicationMenu: position => getMenuApi().popupApplicationMenu(position)
}
