/* global Bun */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { builtinModules, createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { transformVueSfc } from './vueSfcTransform.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
export const projectRoot = path.resolve(here, '../..')
export const distDir = path.join(projectRoot, 'dist/electron')
const rendererRoot = path.join(projectRoot, 'src/renderer')
const commonRoot = path.join(projectRoot, 'src/common')
const mainRoot = path.join(projectRoot, 'src/main')
const muyaRoot = path.join(projectRoot, 'src/muya')
const packageJsonPath = path.join(projectRoot, 'package.json')
const pathBrowserifyPath = require.resolve('path-browserify')
const axiosBrowserPath = require.resolve('axios/dist/browser/axios.cjs')
const htmlTagsPath = path.join(path.dirname(require.resolve('html-tags')), 'html-tags.json')
const htmlTagsVoidPath = path.join(path.dirname(require.resolve('html-tags')), 'html-tags-void.json')
const prismLoadLanguagePath = path.join(projectRoot, 'src/muya/lib/prism/loadLanguage.js')
const prismComponentsDir = path.join(projectRoot, 'node_modules/prismjs/components')

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

const unique = values => [...new Set(values)]

const resolveLocalModulePath = candidatePath => {
  const candidates = [candidatePath]
  const extensions = ['.js', '.mjs', '.cjs', '.json', '.vue', '.css']

  if (!path.extname(candidatePath)) {
    for (const extension of extensions) {
      candidates.push(`${candidatePath}${extension}`)
    }

    for (const extension of extensions) {
      candidates.push(path.join(candidatePath, `index${extension}`))
    }
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate
      }
    } catch (_) {
      // Ignore stat errors while probing candidate paths.
    }
  }

  return candidatePath
}

const resolveImportPath = (specifier, resolveDir) => {
  if (!specifier) return null

  if (path.isAbsolute(specifier)) {
    return resolveLocalModulePath(specifier)
  }

  try {
    return resolveLocalModulePath(require.resolve(specifier, {
      paths: [resolveDir, projectRoot]
    }))
  } catch (_) {
    // Continue to local path probing for relative imports that require extension lookup.
  }

  if (specifier.startsWith('.')) {
    return resolveLocalModulePath(path.resolve(resolveDir, specifier))
  }

  return null
}

const readGitRevision = args => {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8'
  })

  if (result.status !== 0) return null
  return (result.stdout || '').trim() || null
}

export const getExternalModules = (dependencyMap = pkg.dependencies) => {
  return unique([
    'electron',
    ...builtinModules,
    ...builtinModules.map(name => `node:${name}`),
    ...Object.keys(dependencyMap || {})
  ])
}

export const getMarkTextDefines = () => {
  let shortHash = 'N/A'
  let fullHash = 'N/A'

  try {
    shortHash = readGitRevision(['rev-parse', '--short', 'HEAD']) || shortHash
    fullHash = readGitRevision(['rev-parse', 'HEAD']) || fullHash
  } catch (_) {
    // Ignore builds without git metadata.
  }

  const isStableRelease = !!process.env.MARKTEXT_IS_STABLE
  const versionSuffix = isStableRelease ? '' : ` (${shortHash})`

  return {
    'global.MARKTEXT_GIT_SHORT_HASH': JSON.stringify(shortHash),
    'global.MARKTEXT_GIT_HASH': JSON.stringify(fullHash),
    'global.MARKTEXT_VERSION': JSON.stringify(pkg.version),
    'global.MARKTEXT_VERSION_STRING': JSON.stringify(`v${pkg.version}${versionSuffix}`),
    'global.MARKTEXT_IS_STABLE': JSON.stringify(isStableRelease),
    'process.versions.MARKTEXT_VERSION': JSON.stringify(pkg.version),
    'process.versions.MARKTEXT_VERSION_STRING': JSON.stringify(`v${pkg.version}${versionSuffix}`)
  }
}

export const getRendererDefines = () => ({
  ...getMarkTextDefines(),
  global: 'window',
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  'process.env.UNSPLASH_ACCESS_KEY': JSON.stringify(process.env.UNSPLASH_ACCESS_KEY || '')
})

const createAliasResolver = aliasPatterns => importPath => {
  for (const { prefix, target, exact = false } of aliasPatterns) {
    if ((exact && importPath === prefix) || (!exact && (importPath === prefix || importPath.startsWith(prefix)))) {
      const suffix = exact ? '' : (importPath === prefix ? '' : importPath.slice(prefix.length))
      return resolveImportPath(suffix ? path.join(target, suffix) : target, projectRoot)
    }
  }

  return null
}

const createAliasPlugin = (name, aliasPatterns) => ({
  name,
  setup (build) {
    const resolveAlias = createAliasResolver(aliasPatterns)

    build.onResolve({ filter: /.*/ }, args => {
      const resolved = resolveAlias(args.path)
      if (!resolved) return null

      return {
        path: resolved
      }
    })
  }
})

const createQueryImportPlugin = () => ({
  name: 'marktext-query-imports',
  setup (build) {
    build.onResolve({ filter: /\?(raw|inline|url)$/ }, args => {
      const queryMatch = args.path.match(/\?(raw|inline|url)$/)
      if (!queryMatch) return null

      const query = queryMatch[1]
      const basePath = args.path.slice(0, -queryMatch[0].length)
      const resolved = resolveImportPath(basePath, args.resolveDir)
      if (!resolved) return null

      return {
        path: resolved,
        namespace: `marktext-query-${query}`
      }
    })

    const createQueryLoader = query => ({
      filter: /.*/,
      namespace: `marktext-query-${query}`
    })

    build.onLoad(createQueryLoader('raw'), async args => {
      const source = await fs.promises.readFile(args.path, 'utf8')
      return {
        contents: `export default ${JSON.stringify(source)}`,
        loader: 'js'
      }
    })

    build.onLoad(createQueryLoader('inline'), async args => {
      const source = await fs.promises.readFile(args.path, 'utf8')
      return {
        contents: `export default ${JSON.stringify(source)}`,
        loader: 'js'
      }
    })

    build.onLoad(createQueryLoader('url'), async args => {
      const source = await fs.promises.readFile(args.path)
      return {
        contents: source,
        loader: 'file'
      }
    })
  }
})

const createCssSideEffectPlugin = () => ({
  name: 'marktext-css-side-effects',
  setup (build) {
    build.onResolve({ filter: /\.css$/ }, args => {
      if (/\?(raw|inline|url)$/.test(args.path)) return null
      const resolved = resolveImportPath(args.path, args.resolveDir)
      if (!resolved) return null

      if (resolved === path.join(muyaRoot, 'lib/assets/styles/index.css')) {
        return {
          path: resolved,
          namespace: 'marktext-css-inline'
        }
      }

      return null
    })

    build.onLoad({ filter: /.*/, namespace: 'marktext-css-inline' }, async args => {
      const source = await fs.promises.readFile(args.path, 'utf8')
      return {
        contents: `
const __css = ${JSON.stringify(source)}
if (typeof document !== 'undefined' && __css) {
  const __style = document.createElement('style')
  __style.setAttribute('type', 'text/css')
  __style.textContent = __css
  document.head.appendChild(__style)
}
export default __css
`,
        loader: 'js'
      }
    })
  }
})

const createHtmlTagsPlugin = () => ({
  name: 'marktext-html-tags',
  setup (build) {
    build.onResolve({ filter: /^html-tags$/ }, () => {
      return {
        path: 'html-tags',
        namespace: 'marktext-html-tags'
      }
    })

    build.onLoad({ filter: /^html-tags$/, namespace: 'marktext-html-tags' }, async () => {
      const [htmlTagsSource, voidHtmlTagsSource] = await Promise.all([
        fs.promises.readFile(htmlTagsPath, 'utf8'),
        fs.promises.readFile(htmlTagsVoidPath, 'utf8')
      ])
      const htmlTags = JSON.parse(htmlTagsSource)
      const voidHtmlTags = JSON.parse(voidHtmlTagsSource)

      return {
        contents: `
const htmlTags = ${JSON.stringify(htmlTags)}
const voidHtmlTags = ${JSON.stringify(voidHtmlTags)}

export default htmlTags
export { voidHtmlTags }
`,
        loader: 'js'
      }
    })
  }
})

const createImportMetaGlobPlugin = () => ({
  name: 'marktext-import-meta-glob',
  setup (build) {
    build.onLoad({ filter: /loadLanguage\.js$/ }, async args => {
      if (path.resolve(args.path) !== prismLoadLanguagePath) return null

      const source = await fs.promises.readFile(args.path, 'utf8')
      const componentFiles = (await fs.promises.readdir(prismComponentsDir))
        .filter(file => /^prism-[^.]+\.js$/.test(file) && !file.endsWith('.min.js'))
        .sort()
      const globKey = '../../../../node_modules/prismjs/components/prism-*.js'
      const loaderEntries = componentFiles.map(file => {
        const relativePath = `../../../../node_modules/prismjs/components/${file}`
        return `  ${JSON.stringify(relativePath)}: () => import(${JSON.stringify(relativePath)})`
      }).join(',\n')

      return {
        contents: source.replace(
          `const prismComponentLoaders = import.meta.glob('${globKey}')`,
          `const prismComponentLoaders = {\n${loaderEntries}\n}`
        ),
        loader: 'js'
      }
    })
  }
})

const createRelativeResolverPlugin = () => ({
  name: 'marktext-relative-imports',
  setup (build) {
    build.onResolve({ filter: /^\.{1,2}\// }, args => {
      const resolved = resolveImportPath(args.path, args.resolveDir)
      if (!resolved) return null

      return {
        path: resolved
      }
    })
  }
})

export const createMainAliasPlugin = () => createAliasPlugin('marktext-main-aliases', [
  { prefix: 'common/', target: commonRoot }
])

export const createRendererAliasPlugin = () => createAliasPlugin('marktext-renderer-aliases', [
  { prefix: '@/', target: rendererRoot },
  { prefix: 'common/', target: commonRoot },
  { prefix: 'main/', target: mainRoot },
  { prefix: 'muya/', target: muyaRoot },
  { prefix: 'axios', target: axiosBrowserPath, exact: true },
  { prefix: 'electron-log', target: path.join(projectRoot, 'src/renderer/shims/electronLog.js'), exact: true },
  { prefix: 'path', target: pathBrowserifyPath, exact: true },
  { prefix: 'snapsvg', target: path.join(projectRoot, 'src/muya/lib/assets/libs/snapSvg.js'), exact: true }
])

export const createVuePlugin = () => ({
  name: 'marktext-vue-sfc',
  setup (build) {
    build.onLoad({ filter: /\.vue$/ }, async args => {
      const source = await fs.promises.readFile(args.path, 'utf8')
      const { code } = await transformVueSfc(source, args.path)
      return {
        contents: code,
        loader: 'js'
      }
    })
  }
})

export const createMainBuildOptions = ({ production = true } = {}) => ({
  entrypoints: [path.join(projectRoot, 'src/main/index.js')],
  outdir: distDir,
  target: 'node',
  format: 'cjs',
  naming: { entry: 'main.js' },
  external: getExternalModules(),
  define: getMarkTextDefines(),
  minify: production,
  sourcemap: production ? 'external' : 'linked',
  plugins: [createRelativeResolverPlugin(), createMainAliasPlugin()]
})

export const createPreloadBuildOptions = ({ production = true } = {}) => ({
  entrypoints: [path.join(projectRoot, 'src/main/preload/index.js')],
  outdir: distDir,
  target: 'node',
  format: 'cjs',
  naming: { entry: 'preload.js' },
  external: getExternalModules(),
  define: getMarkTextDefines(),
  minify: production,
  sourcemap: production ? 'external' : 'linked',
  plugins: [createRelativeResolverPlugin(), createMainAliasPlugin()]
})

export const createRendererBuildOptions = ({ production = true } = {}) => ({
  entrypoints: [path.join(projectRoot, 'src/renderer/index.html')],
  outdir: distDir,
  target: 'browser',
  format: 'esm',
  splitting: true,
  conditions: ['browser'],
  mainFields: ['browser', 'module', 'main'],
  publicPath: './',
  naming: {
    entry: '[name].[ext]',
    asset: 'assets/[name]-[hash].[ext]',
    chunk: 'chunks/[name]-[hash].[ext]'
  },
  define: getRendererDefines(),
  minify: production,
  sourcemap: production ? 'external' : 'linked',
  plugins: [createQueryImportPlugin(), createCssSideEffectPlugin(), createHtmlTagsPlugin(), createImportMetaGlobPlugin(), createRelativeResolverPlugin(), createRendererAliasPlugin(), createVuePlugin()]
})

const repairRendererHtmlEntrypoint = async result => {
  const jsEntrypoint = (result.outputs || []).find(output => {
    return output.kind === 'entry-point' && output.path.endsWith('.js')
  })

  if (!jsEntrypoint) {
    throw new Error('Renderer build did not emit a JavaScript entry-point')
  }

  const indexFile = path.join(distDir, 'index.html')
  const relativeEntrypoint = path.relative(distDir, jsEntrypoint.path).replace(/\\/g, '/')
  const scriptTag = `<script type="module" crossorigin src="./${relativeEntrypoint}"></script>`
  const html = await fs.promises.readFile(indexFile, 'utf8')
  const repairedHtml = html.replace(
    /<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="\.\/[^"]+")[^>]*><\/script>/,
    scriptTag
  )

  if (repairedHtml === html) {
    throw new Error('Unable to repair renderer HTML module script')
  }

  await fs.promises.writeFile(indexFile, repairedHtml)
}

export const buildMain = async (options = {}) => Bun.build(createMainBuildOptions(options))
export const buildPreload = async (options = {}) => Bun.build(createPreloadBuildOptions(options))
export const buildRenderer = async (options = {}) => {
  const result = await Bun.build(createRendererBuildOptions(options))
  if (result.success) {
    await repairRendererHtmlEntrypoint(result)
  }
  return result
}

export const buildPack = async (options = {}) => {
  const production = options.production !== false
  const results = []

  results.push(await buildMain({ production }))
  results.push(await buildPreload({ production }))
  results.push(await buildRenderer({ production }))

  return results
}

export const serveBuiltRenderer = (port = 9091) => {
  const indexFile = path.join(distDir, 'index.html')

  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    development: true,
    fetch (request) {
      const url = new URL(request.url)
      const pathname = decodeURIComponent(url.pathname)
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      const filePath = path.join(distDir, relativePath)
      const resolved = path.resolve(filePath)

      if (resolved === indexFile) {
        return new Response(Bun.file(indexFile))
      }

      if (resolved.startsWith(distDir) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return new Response(Bun.file(resolved))
      }

      if (pathname === '/' || !path.extname(relativePath)) {
        return new Response(Bun.file(indexFile))
      }

      return new Response('Not Found', { status: 404 })
    }
  })
}
