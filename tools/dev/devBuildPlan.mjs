export const ALL_DEV_BUILD_TARGETS = Object.freeze(['main', 'preload', 'renderer', 'worker'])

export const planDevChange = relativePath => {
  const pathname = relativePath.replace(/\\/g, '/')

  if (pathname.startsWith('static/')) {
    return { targets: [], reload: true, restart: false, staticAsset: true }
  }
  if (pathname.startsWith('src/main/preload/')) {
    return { targets: ['preload'], reload: false, restart: true, staticAsset: false }
  }
  if (pathname.startsWith('src/main/')) {
    return { targets: ['main'], reload: false, restart: true, staticAsset: false }
  }
  if (pathname.startsWith('src/renderer/')) {
    return { targets: ['renderer'], reload: true, restart: false, staticAsset: false }
  }
  if (pathname.startsWith('src/muya/')) {
    return { targets: ['renderer', 'worker'], reload: true, restart: false, staticAsset: false }
  }

  return { targets: [...ALL_DEV_BUILD_TARGETS], reload: false, restart: true, staticAsset: false }
}
