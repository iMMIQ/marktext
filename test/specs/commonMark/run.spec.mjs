// This file is copy from marked and modified.
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { removeCustomClass } from '../help.mjs'
import { MT_MARKED_OPTIONS } from '../config.mjs'
import { writeResult } from '../writeResult.mjs'
import marked from '../../../src/muya/lib/parser/marked/index.js'

const require = createRequire(import.meta.url)
const { HtmlDiffer } = require('@markedjs/html-differ')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const options = { ignoreSelfClosingSlash: true, ignoreAttributes: ['id', 'class'] }
const FETCH_TIMEOUT_MS = 10000
const shouldWriteArtifacts = process.env.MARKTEXT_UPDATE_MARKDOWN_SPECS === '1'

const htmlDiffer = new HtmlDiffer(options)

const fetchWithFallback = (...args) => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(...args)
  }

  return import('node-fetch').then(({ default: fetch }) => fetch(...args))
}

const withTimeout = url => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  return fetchWithFallback(url, { signal: controller.signal }).finally(() => {
    clearTimeout(timer)
  })
}

const compareVersionsDescending = (a, b) => {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  const length = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < length; i++) {
    const diff = (bParts[i] || 0) - (aParts[i] || 0)
    if (diff !== 0) {
      return diff
    }
  }

  return 0
}

const getLocalSpecs = () => {
  const fixtures = fs.readdirSync(__dirname)
    .map(fileName => {
      const match = fileName.match(/^commonmark\.(\d+\.\d+(?:\.\d+)?)\.json$/)
      return match ? { fileName, version: match[1] } : null
    })
    .filter(Boolean)
    .sort((a, b) => compareVersionsDescending(a.version, b.version))

  if (!fixtures.length) {
    throw new Error('No local CommonMark fixtures found')
  }

  const { fileName, version } = fixtures[0]
  const specs = JSON.parse(fs.readFileSync(path.join(__dirname, fileName), 'utf8'))
  return { specs, version, fromFixture: true }
}

const getSpecs = async () => {
  try {
    const version = await withTimeout('https://spec.commonmark.org/')
      .then(res => res.text())
      .then(html => {
        const versions = [...html.matchAll(/href="(\d+\.\d+(?:\.\d+)?)\/spec\.json"/g)].map(match => match[1])

        if (!versions.length) {
          throw new Error('No CommonMark spec version found')
        }

        return versions.sort(compareVersionsDescending)[0]
      })

    return withTimeout(`https://spec.commonmark.org/${version}/spec.json`)
      .then(res => res.json())
      .then(specs => ({ specs, version, fromFixture: false }))
  } catch (_) {
    return getLocalSpecs()
  }
}

const getMarkedSpecs = async version => {
  try {
    return await withTimeout(`https://raw.githubusercontent.com/markedjs/marked/master/test/specs/commonmark/commonmark.${version}.json`)
      .then(res => res.json())
  } catch (_) {
    return null
  }
}

const diffAndGenerateResult = async () => {
  const { specs, version } = await getSpecs()
  let markedSpecs = await getMarkedSpecs(version)

  specs.forEach(spec => {
    const html = removeCustomClass(marked(spec.markdown, MT_MARKED_OPTIONS))
    if (!htmlDiffer.isEqual(html, spec.html)) {
      spec.shouldFail = true
    }
  })
  if (!markedSpecs) {
    markedSpecs = specs.map(spec => ({ shouldFail: !!spec.shouldFail }))
  }
  if (shouldWriteArtifacts) {
    fs.writeFileSync(path.join(__dirname, `./commonmark.${version}.json`), JSON.stringify(specs, null, 2) + '\n')
  }
  writeResult(version, specs, markedSpecs, 'commonmark', shouldWriteArtifacts)
}

diffAndGenerateResult()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
