import path from 'path'
import {
  IMAGE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  MARKDOWN_INCLUSIONS,
  hasMarkdownExtension,
  isChildOfDirectory
} from './pathUtils'

const isOsx = typeof process !== 'undefined' && process.platform === 'darwin'

const getFs = () => {
  try {
    if (typeof require === 'function') {
      return require('fs')
    }
  } catch (_) {
    // Ignore browser environments.
  }

  return null
}

const isFilePath = filepath => {
  const fs = getFs()
  if (!fs) {
    return false
  }

  try {
    return fs.existsSync(filepath) && fs.lstatSync(filepath).isFile()
  } catch (_) {
    return false
  }
}

const isFilePathOrLink = filepath => {
  const fs = getFs()
  if (!fs) {
    return false
  }

  try {
    if (!fs.existsSync(filepath)) {
      return false
    }

    const fi = fs.lstatSync(filepath)
    if (fi.isFile()) {
      return true
    } else if (fi.isSymbolicLink()) {
      const targetPath = path.resolve(path.dirname(filepath), fs.readlinkSync(filepath))
      return isFilePath(targetPath)
    }
    return false
  } catch (_) {
    return false
  }
}

const isSymbolicLinkPath = filepath => {
  const fs = getFs()
  if (!fs) {
    return false
  }

  try {
    return fs.existsSync(filepath) && fs.lstatSync(filepath).isSymbolicLink()
  } catch (_) {
    return false
  }
}

export {
  IMAGE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  MARKDOWN_INCLUSIONS,
  hasMarkdownExtension,
  isChildOfDirectory
}

/**
 * Returns true if the path is an image file.
 *
 * @param {string} filepath The path
 */
export const isImageFile = filepath => {
  const extname = path.extname(filepath)
  return isFilePath(filepath) && IMAGE_EXTENSIONS.some(ext => {
    const EXT_REG = new RegExp(ext, 'i')
    return EXT_REG.test(extname)
  })
}

/**
 * Returns true if the path is a markdown file or symbolic link to a markdown file.
 *
 * @param {string} filepath The path or link path.
 */
export const isMarkdownFile = filepath => {
  if (!isFilePathOrLink(filepath)) return false

  // Check symbolic link.
  if (isSymbolicLinkPath(filepath)) {
    const fs = getFs()
    if (!fs) {
      return false
    }

    const targetPath = path.resolve(path.dirname(filepath), fs.readlinkSync(filepath))
    return isFilePath(targetPath) && hasMarkdownExtension(targetPath)
  }
  return hasMarkdownExtension(filepath)
}

/**
 * Check if the both paths point to the same file.
 *
 * @param {string} pathA The first path.
 * @param {string} pathB The second path.
 * @param {boolean} [isNormalized] Are both paths already normalized.
 */
export const isSamePathSync = (pathA, pathB, isNormalized = false) => {
  if (!pathA || !pathB) return false
  const a = isNormalized ? pathA : path.normalize(pathA)
  const b = isNormalized ? pathB : path.normalize(pathB)
  if (a.length !== b.length) {
    return false
  } else if (a === b) {
    return true
  } else if (a.toLowerCase() === b.toLowerCase()) {
    const fs = getFs()
    if (!fs) {
      return true
    }

    try {
      const fiA = fs.statSync(a)
      const fiB = fs.statSync(b)
      return fiA.ino === fiB.ino
    } catch (_) {
      // Ignore error
    }
  }
  return false
}

export const getResourcesPath = () => {
  let resPath = process.resourcesPath
  if (process.env.NODE_ENV === 'development') {
    // Default locations:
    //   Linux/Windows: node_modules/electron/dist/resources/
    //   macOS: node_modules/electron/dist/Electron.app/Contents/Resources
    if (isOsx) {
      resPath = path.join(resPath, '../..')
    }
    resPath = path.join(resPath, '../../../../resources')
  }
  return resPath
}
