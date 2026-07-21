import fs from 'fs-extra'
import fsPromises from 'fs/promises'
import crypto from 'crypto'
import path from 'path'
import { isDirectory, isFile, isSymbolicLink } from 'common/filesystem'

/**
 * Normalize the path into an absolute path and resolves the link target if needed.
 *
 * @param {string} pathname The path or link path.
 * @returns {string} Returns the absolute path and resolved link. If the link target
 *                   cannot be resolved, an empty string is returned.
 */
export const normalizeAndResolvePath = pathname => {
  if (isSymbolicLink(pathname)) {
    const absPath = path.dirname(pathname)
    const targetPath = path.resolve(absPath, fs.readlinkSync(pathname))
    if (isFile(targetPath) || isDirectory(targetPath)) {
      return path.resolve(targetPath)
    }
    console.error(`Cannot resolve link target "${pathname}" (${targetPath}).`)
    return ''
  }
  return path.resolve(pathname)
}

export const writeFile = (pathname, content, extension, options = 'utf-8') => {
  if (!pathname) {
    return Promise.reject(new Error('[ERROR] Cannot save file without path.'))
  }
  pathname = !extension || pathname.endsWith(extension) ? pathname : `${pathname}${extension}`

  return fs.outputFile(pathname, content, options)
}

export const writeFileAtomic = async (pathname, content, extension, options = 'utf-8') => {
  if (!pathname) {
    throw new Error('[ERROR] Cannot save file without path.')
  }

  pathname = !extension || pathname.endsWith(extension) ? pathname : `${pathname}${extension}`
  pathname = normalizeAndResolvePath(pathname)
  if (!pathname) {
    throw new Error('[ERROR] Cannot resolve file path.')
  }

  const dirname = path.dirname(pathname)
  await fs.ensureDir(dirname)

  let mode = 0o666
  try {
    const stat = await fsPromises.stat(pathname)
    mode = stat.mode & 0o777
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  const temporaryPath = path.join(
    dirname,
    `.${path.basename(pathname)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
  )
  let handle = null

  try {
    handle = await fsPromises.open(temporaryPath, 'wx', mode)
    await handle.writeFile(content, options)
    await handle.sync()
    await handle.close()
    handle = null
    await fsPromises.rename(temporaryPath, pathname)
  } catch (err) {
    if (handle) {
      await handle.close().catch(() => {})
    }
    await fsPromises.unlink(temporaryPath).catch(unlinkError => {
      if (unlinkError.code !== 'ENOENT') {
        err.cleanupError = unlinkError
      }
    })
    throw err
  }
}
