const fallbackFilesystemApi = {
  create: async () => {},
  paste: async () => {},
  rename: async () => {},
  trashItem: async () => false,
  moveToRelativeFolder: async () => '',
  moveImageToFolder: async () => '',
  uploadImage: async () => '',
  isFileExecutable: async () => false,
  commandExists: async () => false,
  readDirectory: async () => [],
  readFile: async () => ''
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
  trashItem: pathname => getFilesystemApi().trashItem(pathname),
  moveToRelativeFolder: payload => getFilesystemApi().moveToRelativeFolder(payload),
  moveImageToFolder: payload => getFilesystemApi().moveImageToFolder(payload),
  uploadImage: payload => getFilesystemApi().uploadImage(payload),
  isFileExecutable: filepath => getFilesystemApi().isFileExecutable(filepath),
  commandExists: command => getFilesystemApi().commandExists(command),
  readDirectory: pathname => getFilesystemApi().readDirectory(pathname),
  readFile: (pathname, encoding) => getFilesystemApi().readFile(pathname, encoding)
}
