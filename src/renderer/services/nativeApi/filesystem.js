const fallbackFilesystemApi = {
  create: async () => {},
  paste: async () => {},
  rename: async () => {},
  moveToRelativeFolder: async () => '',
  moveImageToFolder: async () => '',
  uploadImage: async () => '',
  isFileExecutable: async () => false
}

const getFilesystemApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.filesystem) {
    return window.mtNative.filesystem
  }

  return fallbackFilesystemApi
}

export default {
  create: (pathname, type) => getFilesystemApi().create(pathname, type),
  paste: payload => getFilesystemApi().paste(payload),
  rename: (src, dest) => getFilesystemApi().rename(src, dest),
  moveToRelativeFolder: payload => getFilesystemApi().moveToRelativeFolder(payload),
  moveImageToFolder: payload => getFilesystemApi().moveImageToFolder(payload),
  uploadImage: payload => getFilesystemApi().uploadImage(payload),
  isFileExecutable: filepath => getFilesystemApi().isFileExecutable(filepath)
}
