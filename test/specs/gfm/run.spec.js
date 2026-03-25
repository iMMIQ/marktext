// This file is copy from https://github.com/markedjs/marked/blob/master/test/specs/gfm/getSpecs.js
// And for custom use.
import { removeCustomClass } from '../help'
import { writeResult } from '../writeResult'
import { MT_MARKED_OPTIONS } from '../config'
const fetch = require('node-fetch')
const cheerio = require('cheerio')
const marked = require('../../../src/muya/lib/parser/marked/index.js').default
const HtmlDiffer = require('@markedjs/html-differ').HtmlDiffer
const fs = require('fs')
const path = require('path')

const options = { ignoreSelfClosingSlash: true, ignoreAttributes: ['id', 'class'] }
const FETCH_TIMEOUT_MS = 10000
const shouldWriteArtifacts = process.env.MARKTEXT_UPDATE_MARKDOWN_SPECS === '1'

const htmlDiffer = new HtmlDiffer(options)

const withTimeout = url => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  return fetch(url, { signal: controller.signal }).finally(() => {
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
      const match = fileName.match(/^gfm\.(\d+\.\d+(?:\.\d+)?)\.json$/)
      return match ? { fileName, version: match[1] } : null
    })
    .filter(Boolean)
    .sort((a, b) => compareVersionsDescending(a.version, b.version))

  if (!fixtures.length) {
    throw new Error('No local GFM fixtures found')
  }

  const { fileName, version } = fixtures[0]
  const specs = JSON.parse(fs.readFileSync(path.resolve(__dirname, fileName), 'utf8'))
  return [version, specs]
}

const getSpecs = () => {
  return withTimeout('https://github.github.com/gfm/')
    .then(res => res.text())
    .then(html => cheerio.load(html))
    .then($ => {
      const version = $('.version').text().match(/\d+\.\d+/)[0]
      if (!version) {
        throw new Error('No version found')
      }
      const specs = []
      $('.extension').each((i, ext) => {
        const section = $('.definition', ext).text().trim().replace(/^\d+\.\d+(.*?) \(extension\)[\s\S]*$/, '$1')
        $('.example', ext).each((j, exa) => {
          const example = +$(exa).attr('id').replace(/\D/g, '')
          const markdown = $('.language-markdown', exa).text().trim()
          const html = $('.language-html', exa).text().trim()
          specs.push({
            section,
            html,
            markdown,
            example
          })
        })
      })

      return [version, specs]
    })
    .catch(() => getLocalSpecs())
}

const getMarkedSpecs = async (version) => {
  try {
    return await withTimeout(`https://raw.githubusercontent.com/markedjs/marked/master/test/specs/gfm/gfm.${version}.json`)
      .then(res => res.json())
  } catch (_) {
    return null
  }
}

const diffAndGenerateResult = async () => {
  const [version, specs] = await getSpecs()
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
    fs.writeFileSync(path.resolve(__dirname, `./gfm.${version}.json`), JSON.stringify(specs, null, 2) + '\n')
  }
  writeResult(version, specs, markedSpecs, 'gfm', shouldWriteArtifacts)
}

diffAndGenerateResult()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
