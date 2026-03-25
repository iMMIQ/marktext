import crypto from 'crypto'
import filesystem from '../services/nativeApi/filesystem'

export const create = async (pathname, type) => {
  return filesystem.create(pathname, type)
}

export const paste = async ({ src, dest, type }) => {
  return filesystem.paste({ src, dest, type })
}

export const rename = async (src, dest) => {
  return filesystem.rename(src, dest)
}

export const getHash = (content, encoding, type) => {
  return crypto.createHash(type).update(content, encoding).digest('hex')
}

export const getContentHash = content => {
  return getHash(content, 'utf8', 'sha1')
}

const serializeImage = async image => {
  if (typeof image === 'string') {
    return image
  }

  return {
    name: image.name,
    size: image.size,
    type: image.type,
    data: await image.arrayBuffer()
  }
}

/**
 * Moves an image to a relative position.
 *
 * @param {String} cwd The relative base path (project root or full folder path of opened file).
 * @param {String} relativeName The relative directory name.
 * @param {String} filePath The full path to the opened file in editor.
 * @param {String} imagePath The image to move.
 * @returns {String} The relative path the the image from given `filePath`.
 */
export const moveToRelativeFolder = async (cwd, relativeName, filePath, imagePath) => {
  return filesystem.moveToRelativeFolder({
    cwd,
    relativeName,
    filePath,
    imagePath
  })
}

export const moveImageToFolder = async (pathname, image, outputDir) => {
  return filesystem.moveImageToFolder({
    pathname,
    image: await serializeImage(image),
    outputDir
  })
}

/**
 * @jocs todo, rewrite it use class
 */
export const uploadImage = async (pathname, image, preferences) => {
  return filesystem.uploadImage({
    pathname,
    image: await serializeImage(image),
    preferences
  })
}

export const isFileExecutable = async filepath => {
  return filesystem.isFileExecutable(filepath)
}
