import path from 'path'
import fs from 'fs-extra'

const CONTENT_TYPE_BY_EXT = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8'
}

const setContentType = (res, filePath) => {
  const extname = path.extname(filePath)
  const contentType = CONTENT_TYPE_BY_EXT[extname]
  if (contentType) {
    res.setHeader('Content-Type', contentType)
  }
}

const copyDirectory = async (source, destination) => {
  if (await fs.pathExists(source)) {
    await fs.copy(source, destination)
  }
}

const serveStaticFile = async (res, filePath) => {
  if (!(await fs.pathExists(filePath))) {
    return false
  }

  setContentType(res, filePath)
  res.end(await fs.readFile(filePath))
  return true
}

const marktextCodemirrorAssets = () => {
  const rootDir = process.cwd()
  const codemirrorModeDir = path.resolve(rootDir, 'node_modules/codemirror/mode')
  const staticDir = path.resolve(rootDir, 'static')
  let outDir = path.resolve(rootDir, 'dist/electron')

  return {
    name: 'marktext-codemirror-assets',
    configureServer (server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url ? req.url.split('?')[0] : ''
        if (!pathname) {
          return next()
        }

        if (pathname.startsWith('/codemirror/mode/')) {
          const filePath = path.join(codemirrorModeDir, pathname.slice('/codemirror/mode/'.length))
          if (await serveStaticFile(res, filePath)) {
            return
          }
        }

        if (pathname.startsWith('/static/')) {
          const filePath = path.join(staticDir, pathname.slice('/static/'.length))
          if (await serveStaticFile(res, filePath)) {
            return
          }
        }

        next()
      })
    },
    configResolved (config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async closeBundle () {
      await copyDirectory(codemirrorModeDir, path.join(outDir, 'codemirror/mode'))
      await copyDirectory(staticDir, path.join(outDir, 'static'))
    }
  }
}

export default marktextCodemirrorAssets
