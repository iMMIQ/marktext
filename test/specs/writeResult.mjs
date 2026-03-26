import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { marked as markedJs } from 'marked'
import { padding } from './help.mjs'
import { MT_MARKED_OPTIONS } from './config.mjs'
import marked from '../../src/muya/lib/parser/marked/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const writeResult = (version, specs, markedSpecs, type = 'commonmark', shouldWriteArtifacts = false) => {
  let result = '## Test Result\n\n'
  const totalCount = specs.length
  const failedCount = specs.filter(s => s.shouldFail).length
  const classifiedResult = {}
  for (const spec of specs) {
    const { example, section, shouldFail } = spec
    const item = classifiedResult[section]
    if (item) {
      item.count++
      if (shouldFail) {
        item.failed++
        item.failedExamples.push(example)
      }
    } else {
      classifiedResult[section] = {
        count: 1,
        failed: 0,
        failedExamples: []
      }
      if (shouldFail) {
        classifiedResult[section].failed++
        classifiedResult[section].failedExamples.push(example)
      }
    }
  }
  result += `Total test ${totalCount} examples, and failed ${failedCount} examples:\n\n`

  const sectionMaxLen = Math.max(...Object.keys(classifiedResult).map(key => key.length))
  const failedTotalLen = 15
  const percentageLen = 15
  result += `|${padding('Section', sectionMaxLen)}|${padding('Failed/Total', failedTotalLen)}|${padding('Percentage', percentageLen)}|\n`
  result += `|${padding('-'.repeat(sectionMaxLen - 2), sectionMaxLen, ':')}|${padding('-'.repeat(failedTotalLen - 2), failedTotalLen, ':')}|${padding('-'.repeat(percentageLen - 2), percentageLen, ':')}|\n`

  for (const key of Object.keys(classifiedResult)) {
    const { count, failed } = classifiedResult[key]

    result += `|${padding(key, sectionMaxLen)}`
    result += `|${padding(failed + '/' + count, failedTotalLen)}`
    result += `|${padding(((count - failed) / count * 100).toFixed(2) + '%', percentageLen)}|\n`
  }

  result += '\n'

  specs.filter(s => s.shouldFail)
    .forEach(spec => {
      const expectedHtml = spec.html
      const acturalHtml = marked(spec.markdown, MT_MARKED_OPTIONS)
      result += `**Example${spec.example}**\n\n`
      result += '```markdown\n'
      result += 'Markdown content\n'
      result += `${spec.markdown.replace(/`/g, '\\`')}\n`
      result += 'Expected Html\n'
      result += `${expectedHtml}\n`
      result += 'Actural Html\n'
      result += `${acturalHtml}\n`
      result += '```\n\n'
    })

  const failedDirectory = type === 'commonmark' ? 'commonMark' : 'gfm'
  const failedPath = path.join(__dirname, failedDirectory, `${type}.${version}.md`)
  if (shouldWriteArtifacts) {
    fs.writeFileSync(failedPath, result)
  }

  let compareResult = '## Compare with `marked.js`\n\n'
  compareResult += `Marked.js failed examples count: ${markedSpecs.filter(s => s.shouldFail).length}\n`
  compareResult += `MarkText failed examples count: ${failedCount}\n\n`
  let count = 0
  specs.forEach((spec, i) => {
    if (spec.shouldFail !== markedSpecs[i].shouldFail) {
      count++
      const acturalHtml = marked(spec.markdown, MT_MARKED_OPTIONS)

      compareResult += `**Example${spec.example}**\n\n`
      compareResult += `MarkText ${spec.shouldFail ? 'fail' : 'success'} and marked.js ${markedSpecs[i].shouldFail ? 'fail' : 'success'}\n\n`
      compareResult += '```markdown\n'
      compareResult += 'Markdown content\n'
      compareResult += `${spec.markdown.replace(/`/g, '\\`')}\n`
      compareResult += 'Expected Html\n'
      compareResult += `${spec.html}\n`
      compareResult += 'Actural Html\n'
      compareResult += `${acturalHtml}\n`
      compareResult += 'marked.js html\n'
      compareResult += `${markedJs(spec.markdown, { headerIds: false })}\n`
      compareResult += '```\n\n'
    }
  })

  compareResult += `There are ${count} examples are different with marked.js.`
  const comparePath = path.join(__dirname, failedDirectory, 'compare.marked.md')
  if (shouldWriteArtifacts) {
    fs.writeFileSync(comparePath, compareResult)
  }
}
