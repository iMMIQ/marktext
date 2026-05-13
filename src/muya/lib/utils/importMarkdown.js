/**
 * translate markdown format to content state used by MarkText
 * there is some difference when parse loose list item and tight lsit item.
 * Both of them add a p block in li block, use the CSS style to distinguish loose and tight.
 */
import StateRender from '../parser/render'
import { tokenizer } from '../parser'
import { getImageInfo } from '../utils'
import ExportMarkdown from './exportMarkdown'
import TurndownService, { usePluginAddRules } from './turndownService'
import { loadLanguage } from '../prism/index'
import { parseMarkdownToState } from './markdownStateParser'

// To be disabled rules when parse markdown, Because content state don't need to parse inline rules
import { CURSOR_ANCHOR_DNA, CURSOR_FOCUS_DNA } from '../config'

const languageLoaded = new Set()

export const loadCodeBlockLanguages = (languages, contentState = null) => {
  for (const lang of languages) {
    if (!lang || languageLoaded.has(lang)) {
      continue
    }
    languageLoaded.add(lang)
    loadLanguage(lang)
      .then(infoList => {
        if (!Array.isArray(infoList)) return
        const needRender = infoList.some(({ status }) => status === 'loaded')
        if (needRender && contentState) {
          contentState.render()
        }
      })
      .catch(err => {
        console.warn(err)
      })
  }
}

// Just because turndown change `\n`(soft line break) to space, So we add `span.ag-soft-line-break` to workaround.
const turnSoftBreakToSpan = html => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(
    `<x-mt id="turn-root">${html}</x-mt>`,
    'text/html'
  )
  const root = doc.querySelector('#turn-root')
  const travel = childNodes => {
    for (const node of childNodes) {
      if (node.nodeType === 3 && node.parentNode.tagName !== 'CODE') {
        let startLen = 0
        let endLen = 0
        const text = node.nodeValue.replace(/^(\n+)/, (_, p) => {
          startLen = p.length
          return ''
        }).replace(/(\n+)$/, (_, p) => {
          endLen = p.length
          return ''
        })
        if (/\n/.test(text)) {
          const tokens = text.split('\n')
          const params = []
          let i = 0
          const len = tokens.length
          for (; i < len; i++) {
            let text = tokens[i]
            if (i === 0 && startLen !== 0) {
              text = '\n'.repeat(startLen) + text
            } else if (i === len - 1 && endLen !== 0) {
              text = text + '\n'.repeat(endLen)
            }
            params.push(document.createTextNode(text))
            if (i !== len - 1) {
              const softBreak = document.createElement('span')
              softBreak.classList.add('ag-soft-line-break')
              params.push(softBreak)
            }
          }
          node.replaceWith(...params)
        }
      } else if (node.nodeType === 1) {
        travel(node.childNodes)
      }
    }
  }
  travel(root.childNodes)
  return root.innerHTML.trim()
}

const importRegister = ContentState => {
  // turn markdown to blocks
  ContentState.prototype.markdownToState = function (markdown) {
    const { blocks, languagesToLoad } = parseMarkdownToState(markdown, this.muya.options)
    loadCodeBlockLanguages(languagesToLoad, this)
    return blocks
  }

  ContentState.prototype.htmlToMarkdown = function (html, keeps = []) {
    // turn html to markdown
    const { turndownConfig } = this
    const turndownService = new TurndownService(turndownConfig)
    usePluginAddRules(turndownService, keeps)

    // fix #752, but I don't know why the &nbsp; vanlished.
    html = html.replace(/<span>&nbsp;<\/span>/g, String.fromCharCode(160))

    html = turnSoftBreakToSpan(html)
    const markdown = turndownService.turndown(html)

    return markdown
  }

  // turn html to blocks
  ContentState.prototype.html2State = function (html) {
    const markdown = this.htmlToMarkdown(html, ['ruby', 'rt', 'u', 'br'])
    return this.markdownToState(markdown)
  }

  ContentState.prototype.getSourceEditorCursor = function () {
    const blocks = this.getBlocks()
    const { anchor, focus } = this.cursor
    const anchorBlock = this.getBlock(anchor.key)
    const focusBlock = this.getBlock(focus.key)
    const { text: anchorText } = anchorBlock
    const { text: focusText } = focusBlock
    if (anchor.key === focus.key) {
      const minOffset = Math.min(anchor.offset, focus.offset)
      const maxOffset = Math.max(anchor.offset, focus.offset)
      const firstTextPart = anchorText.substring(0, minOffset)
      const secondTextPart = anchorText.substring(minOffset, maxOffset)
      const thirdTextPart = anchorText.substring(maxOffset)
      anchorBlock.text = firstTextPart +
        (anchor.offset <= focus.offset ? CURSOR_ANCHOR_DNA : CURSOR_FOCUS_DNA) +
        secondTextPart +
        (anchor.offset <= focus.offset ? CURSOR_FOCUS_DNA : CURSOR_ANCHOR_DNA) +
        thirdTextPart
    } else {
      anchorBlock.text = anchorText.substring(0, anchor.offset) + CURSOR_ANCHOR_DNA + anchorText.substring(anchor.offset)
      focusBlock.text = focusText.substring(0, focus.offset) + CURSOR_FOCUS_DNA + focusText.substring(focus.offset)
    }

    const { isGitlabCompatibilityEnabled, listIndentation } = this
    const markdown = new ExportMarkdown(blocks, listIndentation, isGitlabCompatibilityEnabled).generate()
    const cursor = markdown.split('\n').reduce((acc, line, index) => {
      const ach = line.indexOf(CURSOR_ANCHOR_DNA)
      const fch = line.indexOf(CURSOR_FOCUS_DNA)
      if (ach > -1 && fch > -1) {
        if (ach <= fch) {
          Object.assign(acc.anchor, { line: index, ch: ach })
          Object.assign(acc.focus, { line: index, ch: fch - CURSOR_ANCHOR_DNA.length })
        } else {
          Object.assign(acc.focus, { line: index, ch: fch })
          Object.assign(acc.anchor, { line: index, ch: ach - CURSOR_FOCUS_DNA.length })
        }
      } else if (ach > -1) {
        Object.assign(acc.anchor, { line: index, ch: ach })
      } else if (fch > -1) {
        Object.assign(acc.focus, { line: index, ch: fch })
      }
      return acc
    }, {
      anchor: {
        line: 0,
        ch: 0
      },
      focus: {
        line: 0,
        ch: 0
      }
    })
    // remove CURSOR_FOCUS_DNA and CURSOR_ANCHOR_DNA
    anchorBlock.text = anchorText
    focusBlock.text = focusText
    return cursor
  }

  ContentState.prototype.addCursorToMarkdown = function (markdown, cursor) {
    const { anchor, focus } = cursor
    if (!anchor || !focus) {
      return
    }
    const lines = markdown.split('\n')
    const anchorText = lines[anchor.line]
    const focusText = lines[focus.line]
    if (!anchorText || !focusText) {
      return {
        markdown: lines.join('\n'),
        isValid: false
      }
    }
    if (anchor.line === focus.line) {
      const minOffset = Math.min(anchor.ch, focus.ch)
      const maxOffset = Math.max(anchor.ch, focus.ch)
      const firstTextPart = anchorText.substring(0, minOffset)
      const secondTextPart = anchorText.substring(minOffset, maxOffset)
      const thirdTextPart = anchorText.substring(maxOffset)
      lines[anchor.line] = firstTextPart +
        (anchor.ch <= focus.ch ? CURSOR_ANCHOR_DNA : CURSOR_FOCUS_DNA) +
        secondTextPart +
        (anchor.ch <= focus.ch ? CURSOR_FOCUS_DNA : CURSOR_ANCHOR_DNA) +
        thirdTextPart
    } else {
      lines[anchor.line] = anchorText.substring(0, anchor.ch) + CURSOR_ANCHOR_DNA + anchorText.substring(anchor.ch)
      lines[focus.line] = focusText.substring(0, focus.ch) + CURSOR_FOCUS_DNA + focusText.substring(focus.ch)
    }

    return {
      markdown: lines.join('\n'),
      isValid: true
    }
  }

  ContentState.prototype.importCursor = function (hasCursor) {
    // set cursor
    const cursor = {
      anchor: null,
      focus: null
    }

    let count = 0

    const travel = blocks => {
      for (const block of blocks) {
        let { key, text, children, editable } = block
        if (text) {
          const offset = text.indexOf(CURSOR_ANCHOR_DNA)
          if (offset > -1) {
            block.text = text.substring(0, offset) + text.substring(offset + CURSOR_ANCHOR_DNA.length)
            text = block.text
            count++
            if (editable) {
              cursor.anchor = { key, offset }
            }
          }
          const focusOffset = text.indexOf(CURSOR_FOCUS_DNA)
          if (focusOffset > -1) {
            block.text = text.substring(0, focusOffset) + text.substring(focusOffset + CURSOR_FOCUS_DNA.length)
            count++
            if (editable) {
              cursor.focus = { key, offset: focusOffset }
            }
          }
          if (count === 2) {
            break
          }
        } else if (children.length) {
          travel(children)
        }
      }
    }
    if (hasCursor) {
      travel(this.blocks)
    } else {
      const lastBlock = this.getLastEditableBlock()
      const key = lastBlock.key
      const offset = lastBlock.text.length
      cursor.anchor = { key, offset }
      cursor.focus = { key, offset }
    }
    if (cursor.anchor && cursor.focus) {
      this.cursor = cursor
    }
  }

  ContentState.prototype.importMarkdown = function (markdown, options = {}) {
    const result = this.importPartitionedMarkdown(markdown, options)
    if (!result.isPartitioned) {
      return result
    }
    return result
  }

  ContentState.prototype.extractImages = function (markdown) {
    const results = new Set()
    const blocks = this.markdownToState(markdown)
    const render = new StateRender(this.muya)
    render.collectLabels(blocks)

    const travelToken = token => {
      const { type, attrs, children, tag, label, backlash } = token
      if (/reference_image|image/.test(type) || type === 'html_tag' && tag === 'img') {
        if ((type === 'image' || type === 'html_tag') && attrs.src) {
          results.add(attrs.src)
        } else {
          const rawSrc = label + backlash.second
          if (render.labels.has((rawSrc).toLowerCase())) {
            const { href } = render.labels.get(rawSrc.toLowerCase())
            const { src } = getImageInfo(href)
            if (src) {
              results.add(src)
            }
          }
        }
      } else if (children && children.length) {
        for (const child of children) {
          travelToken(child)
        }
      }
    }

    const travel = block => {
      const { text, children, type, functionType } = block
      if (children.length) {
        for (const b of children) {
          travel(b)
        }
      } else if (text && type === 'span' && /paragraphContent|atxLine|cellContent/.test(functionType)) {
        const tokens = tokenizer(text, [], false, render.labels)
        for (const token of tokens) {
          travelToken(token)
        }
      }
    }

    for (const block of blocks) {
      travel(block)
    }

    return Array.from(results)
  }
}

export default importRegister
