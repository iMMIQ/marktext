import path from 'path'
import crypto from 'crypto'
import fs from 'fs-extra'
import { statSync, constants } from 'fs'
import { exec, execFile } from 'child_process'
import { tmpdir } from 'os'
import dayjs from 'dayjs'
import { Octokit } from '@octokit/rest'
import { ipcMain } from 'electron'
import { isImageFile } from 'common/filesystem/paths'

const getContentHash = content => {
  return crypto.createHash('sha1').update(content, 'utf8').digest('hex')
}

const create = async (pathname, type) => {
  return type === 'directory'
    ? fs.ensureDir(pathname)
    : fs.outputFile(pathname, '')
}

const paste = async ({ src, dest, type }) => {
  return type === 'cut'
    ? fs.move(src, dest)
    : fs.copy(src, dest)
}

const rename = async (src, dest) => {
  return fs.move(src, dest)
}

const moveToRelativeFolder = async ({ cwd, relativeName, filePath, imagePath }) => {
  if (!relativeName) {
    relativeName = 'assets'
  } else if (path.isAbsolute(relativeName)) {
    throw new Error('Invalid relative directory name.')
  }

  const absPath = path.resolve(cwd, relativeName)
  const dstPath = path.resolve(absPath, path.basename(imagePath))
  await fs.ensureDir(absPath)
  await fs.move(imagePath, dstPath, { overwrite: true })

  const dstRelPath = path.relative(path.dirname(filePath), dstPath)

  if (process.platform === 'win32') {
    return dstRelPath.replace(/\\/g, '/')
  }
  return dstRelPath
}

const toBuffer = image => {
  if (!image || typeof image !== 'object' || image.data == null) {
    return Buffer.alloc(0)
  }

  if (image.data instanceof ArrayBuffer) {
    return Buffer.from(image.data)
  }

  if (ArrayBuffer.isView(image.data)) {
    return Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength)
  }

  return Buffer.from(image.data)
}

const moveImageToFolder = async ({ pathname, image, outputDir }) => {
  await fs.ensureDir(outputDir)

  if (typeof image === 'string') {
    const dirname = path.dirname(pathname)
    const imagePath = path.resolve(dirname, image)
    const isImage = isImageFile(imagePath)
    if (isImage) {
      const filename = path.basename(imagePath)
      const extname = path.extname(imagePath)
      const noHashPath = path.join(outputDir, filename)
      if (noHashPath === imagePath) {
        return imagePath
      }
      const hash = getContentHash(imagePath)
      const hashFilePath = path.join(outputDir, `${hash}${extname}`)
      await fs.copy(imagePath, hashFilePath)
      return hashFilePath
    }
    return image
  }

  const imagePath = path.join(outputDir, `${dayjs().format('YYYY-MM-DD-HH-mm-ss')}-${image.name}`)
  await fs.writeFile(imagePath, toBuffer(image))
  return imagePath
}

const uploadImage = async ({ pathname, image, preferences }) => {
  const { currentUploader, imageBed, githubToken: auth, cliScript } = preferences
  const { owner, repo, branch } = imageBed.github
  const isPath = typeof image === 'string'
  const MAX_SIZE = 5 * 1024 * 1024

  if (currentUploader === 'none') {
    throw new Error('No image uploader provided.')
  }

  const uploadByGithub = async (content, filename) => {
    const octokit = new Octokit({ auth })
    const remotePath = dayjs().format('YYYY/MM') + `/${dayjs().format('DD-HH-mm-ss')}-${filename}`
    const message = `Upload by MarkText at ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`
    const payload = { owner, repo, path: remotePath, branch, message, content }
    if (!branch) {
      delete payload.branch
    }

    try {
      const result = await octokit.repos.createOrUpdateFileContents(payload)
      return result.data.content.download_url
    } catch (_) {
      throw new Error('Upload failed, the image will be copied to the image folder')
    }
  }

  const uploadByCommand = async (uploader, filepathOrBuffer) => {
    let filepath = filepathOrBuffer
    let shouldCleanup = false

    if (typeof filepathOrBuffer !== 'string') {
      filepath = path.join(tmpdir(), String(Date.now()))
      shouldCleanup = true
      await fs.writeFile(filepath, filepathOrBuffer)
    }

    try {
      if (uploader === 'picgo') {
        return await new Promise((resolve, reject) => {
          exec(`picgo u "${filepath}"`, (err, data) => {
            if (err) {
              return reject(err)
            }
            const parts = data.split('[PicGo SUCCESS]:')
            if (parts.length === 2) {
              return resolve(parts[1].trim())
            }
            reject(new Error('PicGo upload error'))
          })
        })
      }

      return await new Promise((resolve, reject) => {
        execFile(cliScript, [filepath], (err, data) => {
          if (err) {
            return reject(err)
          }
          resolve(data.trim())
        })
      })
    } finally {
      if (shouldCleanup) {
        await fs.unlink(filepath).catch(() => {})
      }
    }
  }

  if (isPath) {
    const dirname = path.dirname(pathname)
    const imagePath = path.resolve(dirname, image)
    if (!isImageFile(imagePath)) {
      return image
    }

    const { size } = await fs.stat(imagePath)
    if (size > MAX_SIZE) {
      throw new Error('Cannot upload more than 5M image, the image will be copied to the image folder')
    }

    switch (currentUploader) {
      case 'cliScript':
      case 'picgo':
        return uploadByCommand(currentUploader, imagePath)
      case 'github': {
        const imageFile = await fs.readFile(imagePath)
        return uploadByGithub(Buffer.from(imageFile).toString('base64'), path.basename(imagePath))
      }
    }
  }

  if (image.size > MAX_SIZE) {
    throw new Error('Cannot upload more than 5M image, the image will be copied to the image folder')
  }

  const imageBuffer = toBuffer(image)
  switch (currentUploader) {
    case 'cliScript':
    case 'picgo':
      return uploadByCommand(currentUploader, imageBuffer)
    default:
      return uploadByGithub(imageBuffer.toString('base64'), image.name)
  }
}

const isFileExecutable = filepath => {
  try {
    const stat = statSync(filepath)
    return stat.isFile() && (stat.mode & (constants.S_IXUSR | constants.S_IXGRP | constants.S_IXOTH)) !== 0
  } catch (_) {
    return false
  }
}

const readDirectory = async pathname => {
  return fs.readdir(pathname)
}

const readFile = async (pathname, encoding = 'utf8') => {
  return fs.readFile(pathname, encoding)
}

const registerFilesystemHandlers = () => {
  ipcMain.handle('mt::fs-create', async (event, pathname, type) => create(pathname, type))
  ipcMain.handle('mt::fs-paste', async (event, payload) => paste(payload))
  ipcMain.handle('mt::fs-rename', async (event, src, dest) => rename(src, dest))
  ipcMain.handle('mt::fs-move-to-relative-folder', async (event, payload) => moveToRelativeFolder(payload))
  ipcMain.handle('mt::fs-move-image-to-folder', async (event, payload) => moveImageToFolder(payload))
  ipcMain.handle('mt::fs-upload-image', async (event, payload) => uploadImage(payload))
  ipcMain.handle('mt::fs-is-file-executable', async (event, filepath) => isFileExecutable(filepath))
  ipcMain.handle('mt::fs-read-directory', async (event, pathname) => readDirectory(pathname))
  ipcMain.handle('mt::fs-read-file', async (event, pathname, encoding) => readFile(pathname, encoding))
}

export default registerFilesystemHandlers
