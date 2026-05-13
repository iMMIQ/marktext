import { Lexer } from '../parser/marked'
import escapeCharactersMap, { escapeCharacters } from '../parser/escapeCharacter'
import { getUniqueId } from './random'

const FUNCTION_TYPE_LANG = {
  multiplemath: 'latex',
  flowchart: 'yaml',
  mermaid: 'yaml',
  sequence: 'yaml',
  plantuml: 'yaml',
  'vega-lite': 'yaml',
  html: 'markup'
}

const createBlockFactory = ({ keyPrefix = 'ag' } = {}) => {
  let id = 0
  const createBlock = (type = 'span', extras = {}) => {
    const blockData = {
      key: `${keyPrefix}-${id++}`,
      text: '',
      type,
      editable: true,
      parent: null,
      preSibling: null,
      nextSibling: null,
      children: []
    }

    if (type === 'span' && !extras.functionType) {
      blockData.functionType = 'paragraphContent'
    }

    if (extras.functionType === 'codeContent' && extras.text) {
      const CHAR_REG = new RegExp(`(${escapeCharacters.join('|')})`, 'gi')
      extras.text = extras.text.replace(CHAR_REG, (_, p) => {
        return escapeCharactersMap[p]
      })
    }

    Object.assign(blockData, extras)
    return blockData
  }

  const appendChild = (parent, block) => {
    const len = parent.children.length
    const lastChild = parent.children[len - 1]
    parent.children.push(block)
    block.parent = parent.key
    if (lastChild) {
      lastChild.nextSibling = block.key
      block.preSibling = lastChild.key
    } else {
      block.preSibling = null
    }
    block.nextSibling = null
  }

  const createBlockP = (text = '') => {
    const pBlock = createBlock('p')
    const contentBlock = createBlock('span', { text })
    appendChild(pBlock, contentBlock)
    return pBlock
  }

  const createPreAndPreview = (functionType, value = '') => {
    const lang = FUNCTION_TYPE_LANG[functionType]
    const preBlock = createBlock('pre', {
      functionType,
      lang
    })
    const codeBlock = createBlock('code', {
      lang
    })

    appendChild(preBlock, codeBlock)

    if (typeof value === 'string' && value) {
      value = value.replace(/^\s+/, '')
      const codeContent = createBlock('span', {
        text: value,
        lang,
        functionType: 'codeContent'
      })
      appendChild(codeBlock, codeContent)
    } else {
      const emptyCodeContent = createBlock('span', {
        functionType: 'codeContent',
        lang
      })
      appendChild(codeBlock, emptyCodeContent)
    }

    const preview = createBlock('div', {
      editable: false,
      functionType
    })

    return { preBlock, preview }
  }

  const createContainerBlock = (functionType, value = '', style = undefined, isGitlabCompatibilityEnabled = false) => {
    const figureBlock = createBlock('figure', {
      functionType
    })

    if (functionType === 'multiplemath') {
      if (style === undefined) {
        figureBlock.mathStyle = isGitlabCompatibilityEnabled ? 'gitlab' : ''
      }
      figureBlock.mathStyle = style
    }

    const { preBlock, preview } = createPreAndPreview(functionType, value)
    appendChild(figureBlock, preBlock)
    appendChild(figureBlock, preview)
    return figureBlock
  }

  const createHtmlBlock = code => {
    const block = createBlock('figure')
    block.functionType = 'html'
    const { preBlock, preview } = createPreAndPreview('html', code)
    appendChild(block, preBlock)
    appendChild(block, preview)
    return block
  }

  return {
    appendChild,
    createBlock,
    createBlockP,
    createContainerBlock,
    createHtmlBlock
  }
}

export const parseMarkdownToState = (markdown, options = {}) => {
  const {
    footnote,
    isGitlabCompatibilityEnabled,
    keyPrefix = getUniqueId(),
    superSubScript,
    trimUnnecessaryCodeBlockEmptyLines
  } = options
  const factory = createBlockFactory({ keyPrefix })
  const {
    appendChild,
    createBlock,
    createBlockP,
    createContainerBlock,
    createHtmlBlock
  } = factory
  const rootState = {
    key: null,
    type: 'root',
    text: '',
    parent: null,
    preSibling: null,
    nextSibling: null,
    children: []
  }

  const tokens = new Lexer({
    disableInline: true,
    footnote,
    isGitlabCompatibilityEnabled,
    superSubScript
  }).lex(markdown)

  const languagesToLoad = []
  let token
  let block
  let value
  const parentList = [rootState]

  while ((token = tokens.shift())) {
    switch (token.type) {
      case 'frontmatter': {
        const { lang, style } = token
        value = token.text
          .replace(/^\s+/, '')
          .replace(/\s$/, '')
        block = createBlock('pre', {
          functionType: token.type,
          lang,
          style
        })

        const codeBlock = createBlock('code', {
          lang
        })

        const codeContent = createBlock('span', {
          text: value,
          lang,
          functionType: 'codeContent'
        })

        appendChild(codeBlock, codeContent)
        appendChild(block, codeBlock)
        appendChild(parentList[0], block)
        break
      }

      case 'hr': {
        value = token.marker
        block = createBlock('hr')
        const thematicBreakContent = createBlock('span', {
          text: value,
          functionType: 'thematicBreakLine'
        })
        appendChild(block, thematicBreakContent)
        appendChild(parentList[0], block)
        break
      }

      case 'heading': {
        const { headingStyle, depth, text, marker } = token
        value = headingStyle === 'atx' ? '#'.repeat(+depth) + ` ${text}` : text
        block = createBlock(`h${depth}`, {
          headingStyle
        })

        const headingContent = createBlock('span', {
          text: value,
          functionType: headingStyle === 'atx' ? 'atxLine' : 'paragraphContent'
        })

        appendChild(block, headingContent)

        if (marker) {
          block.marker = marker
        }

        appendChild(parentList[0], block)
        break
      }

      case 'multiplemath': {
        value = token.text
        block = createContainerBlock(token.type, value, token.mathStyle, isGitlabCompatibilityEnabled)
        appendChild(parentList[0], block)
        break
      }

      case 'code': {
        const { codeBlockStyle, text, lang: infostring = '' } = token
        const lang = (infostring || '').match(/\S*/)[0]

        value = text
        if (trimUnnecessaryCodeBlockEmptyLines && (value.endsWith('\n') || value.startsWith('\n'))) {
          value = value.replace(/\n+$/, '')
            .replace(/^\n+/, '')
        }
        if (/mermaid|flowchart|vega-lite|sequence|plantuml/.test(lang)) {
          block = createContainerBlock(lang, value, undefined, isGitlabCompatibilityEnabled)
          appendChild(parentList[0], block)
        } else {
          block = createBlock('pre', {
            functionType: codeBlockStyle === 'fenced' ? 'fencecode' : 'indentcode',
            lang
          })
          const codeBlock = createBlock('code', {
            lang
          })
          const codeContent = createBlock('span', {
            text: value,
            lang,
            functionType: 'codeContent'
          })
          const inputBlock = createBlock('span', {
            text: lang,
            functionType: 'languageInput'
          })
          if (lang) {
            languagesToLoad.push(lang)
          }

          appendChild(codeBlock, codeContent)
          appendChild(block, inputBlock)
          appendChild(block, codeBlock)
          appendChild(parentList[0], block)
        }
        break
      }

      case 'table': {
        const { header, align, cells } = token
        const table = createBlock('table')
        const thead = createBlock('thead')
        const tbody = createBlock('tbody')
        const theadRow = createBlock('tr')
        const restoreTableEscapeCharacters = text => {
          return text.replace(/\|/g, '\\|')
        }
        let i
        let j
        const headerLen = header.length
        for (i = 0; i < headerLen; i++) {
          const headText = header[i]
          const th = createBlock('th', {
            align: align[i] || '',
            column: i
          })
          const cellContent = createBlock('span', {
            text: restoreTableEscapeCharacters(headText),
            functionType: 'cellContent'
          })
          appendChild(th, cellContent)
          appendChild(theadRow, th)
        }
        const rowLen = cells.length
        for (i = 0; i < rowLen; i++) {
          const rowBlock = createBlock('tr')
          const rowContents = cells[i]
          const colLen = rowContents.length
          for (j = 0; j < colLen; j++) {
            const cell = rowContents[j]
            const td = createBlock('td', {
              align: align[j] || '',
              column: j
            })
            const cellContent = createBlock('span', {
              text: restoreTableEscapeCharacters(cell),
              functionType: 'cellContent'
            })

            appendChild(td, cellContent)
            appendChild(rowBlock, td)
          }
          appendChild(tbody, rowBlock)
        }

        Object.assign(table, { row: cells.length, column: header.length - 1 })
        block = createBlock('figure')
        block.functionType = 'table'
        appendChild(thead, theadRow)
        appendChild(block, table)
        appendChild(table, thead)
        if (tbody.children.length) {
          appendChild(table, tbody)
        }
        appendChild(parentList[0], block)
        break
      }

      case 'html': {
        const text = token.text.trim()
        const isSingleImage = /^<img[^<>]+>$/.test(text)
        if (isSingleImage) {
          block = createBlock('p')
          const contentBlock = createBlock('span', {
            text
          })
          appendChild(block, contentBlock)
          appendChild(parentList[0], block)
        } else {
          block = createHtmlBlock(text)
          appendChild(parentList[0], block)
        }
        break
      }

      case 'text': {
        value = token.text
        while (tokens[0].type === 'text') {
          token = tokens.shift()
          value += `\n${token.text}`
        }
        block = createBlock('p')
        const contentBlock = createBlock('span', {
          text: value
        })
        appendChild(block, contentBlock)
        appendChild(parentList[0], block)
        break
      }

      case 'toc':
      case 'paragraph': {
        value = token.text
        block = createBlock('p')
        const contentBlock = createBlock('span', {
          text: value
        })
        appendChild(block, contentBlock)
        appendChild(parentList[0], block)
        break
      }

      case 'blockquote_start': {
        block = createBlock('blockquote')
        appendChild(parentList[0], block)
        parentList.unshift(block)
        break
      }

      case 'blockquote_end': {
        if (parentList[0].children.length === 0) {
          const paragraphBlock = createBlockP()
          appendChild(parentList[0], paragraphBlock)
        }
        parentList.shift()
        break
      }

      case 'footnote_start': {
        block = createBlock('figure', {
          functionType: 'footnote'
        })
        const identifierInput = createBlock('span', {
          text: token.identifier,
          functionType: 'footnoteInput'
        })
        appendChild(block, identifierInput)
        appendChild(parentList[0], block)
        parentList.unshift(block)
        break
      }

      case 'footnote_end': {
        parentList.shift()
        break
      }

      case 'list_start': {
        const { ordered, listType, start } = token
        block = createBlock(ordered === true ? 'ol' : 'ul')
        block.listType = listType
        if (listType === 'order') {
          block.start = /^\d+$/.test(start) ? start : 1
        }
        appendChild(parentList[0], block)
        parentList.unshift(block)
        break
      }

      case 'list_end': {
        parentList.shift()
        break
      }

      case 'loose_item_start':
      case 'list_item_start': {
        const { listItemType, bulletMarkerOrDelimiter, checked, type } = token
        block = createBlock('li', {
          listItemType: checked !== undefined ? 'task' : listItemType,
          bulletMarkerOrDelimiter,
          isLooseListItem: type === 'loose_item_start'
        })

        if (checked !== undefined) {
          const input = createBlock('input', {
            checked
          })

          appendChild(block, input)
        }
        appendChild(parentList[0], block)
        parentList.unshift(block)
        break
      }

      case 'list_item_end': {
        parentList.shift()
        break
      }

      case 'space': {
        break
      }

      default:
        console.warn(`Unknown type ${token.type}`)
        break
    }
  }

  return {
    blocks: rootState.children.length ? rootState.children : [createBlockP()],
    languagesToLoad: [...new Set(languagesToLoad)]
  }
}
