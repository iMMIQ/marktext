import { filter } from 'fuzzaldrin'
import { EditorSelection, EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import {
  bracketMatching,
  defaultHighlightStyle,
  HighlightStyle,
  syntaxHighlighting
} from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { tags } from '@lezer/highlight'
import { languages as languageData } from '@codemirror/language-data'

import './theme.css'

const markdownAliases = new Set(['markdown', 'gfm'])
const legacyLanguageAliases = new Map([
  ['c_cpp', 'c++'],
  ['csharp', 'c#'],
  ['cs', 'c#'],
  ['golang', 'go'],
  ['jsoniq', 'json'],
  ['less', 'less'],
  ['makefile', 'shell'],
  ['pgsql', 'sql'],
  ['plsql', 'sql'],
  ['shell', 'shell'],
  ['sh', 'shell'],
  ['soy_template', 'soy'],
  ['tex', 'latex'],
  ['typescript', 'typescript']
])
const MARKTEXT_SOURCE_EDITOR_CLASS = 'marktext-source-editor'
const MARKDOWN_LANGUAGE = markdown({ codeLanguages: languageData })

const legacyHighlightStyle = HighlightStyle.define([
  { tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], class: 'cm-header' },
  { tag: tags.quote, class: 'cm-quote' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.emphasis, class: 'cm-em' },
  { tag: [tags.link, tags.url], class: 'cm-link' },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword], class: 'cm-keyword' },
  { tag: [tags.atom, tags.bool, tags.null], class: 'cm-atom' },
  { tag: [tags.number, tags.integer, tags.float], class: 'cm-number' },
  { tag: tags.attributeName, class: 'cm-attribute' },
  { tag: tags.tagName, class: 'cm-tag' },
  { tag: tags.className, class: 'cm-def' },
  { tag: [tags.name, tags.variableName, tags.labelName], class: 'cm-variable' },
  { tag: tags.propertyName, class: 'cm-property' },
  { tag: [tags.typeName, tags.namespace, tags.macroName, tags.standard(tags.name)], class: 'cm-builtin' },
  { tag: [tags.string, tags.special(tags.string), tags.attributeValue], class: 'cm-string' },
  { tag: tags.operator, class: 'cm-operator' },
  { tag: [tags.punctuation, tags.separator], class: 'cm-punctuation' },
  { tag: tags.bracket, class: 'cm-bracket' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: 'cm-comment' },
  { tag: [tags.meta, tags.documentMeta, tags.annotation, tags.processingInstruction], class: 'cm-meta' },
  { tag: tags.invalid, class: 'cm-error' }
])

const getThemeName = theme => {
  if (theme === 'railscasts') {
    return 'railscasts'
  }
  if (theme === 'one-dark') {
    return 'one-dark'
  }
  return 'default'
}

const normalizeLegacyName = name => {
  if (!name) {
    return ''
  }
  return name.toLowerCase()
}

const resolveLanguageDescription = name => {
  const normalizedName = normalizeLegacyName(name)

  if (markdownAliases.has(normalizedName)) {
    return {
      name: 'markdown',
      description: {
        name: 'Markdown',
        alias: ['markdown', 'gfm'],
        extensions: ['md', 'markdown', 'mkd'],
        support: MARKDOWN_LANGUAGE
      }
    }
  }

  const candidate = legacyLanguageAliases.get(normalizedName) || normalizedName
  const description = languageData.find(item => {
    const aliases = (item.alias || []).map(normalizeLegacyName)
    return normalizeLegacyName(item.name) === candidate || aliases.includes(candidate)
  })

  if (!description) {
    return null
  }

  return {
    name: normalizedName,
    description
  }
}

const createLanguageEntries = () => {
  const entries = new Map()
  const addEntry = (name, description) => {
    const normalizedName = normalizeLegacyName(name)
    if (!normalizedName || entries.has(normalizedName)) {
      return
    }
    entries.set(normalizedName, {
      name: normalizedName,
      mode: {
        mode: normalizedName,
        description
      }
    })
  }

  for (const description of languageData) {
    addEntry(description.name, description)
    for (const alias of description.alias || []) {
      addEntry(alias, description)
    }
  }

  addEntry('markdown', MARKDOWN_LANGUAGE)
  addEntry('gfm', MARKDOWN_LANGUAGE)

  for (const [alias, target] of legacyLanguageAliases) {
    const resolved = resolveLanguageDescription(target)
    if (resolved) {
      addEntry(alias, resolved.description)
    }
  }

  return Array.from(entries.values())
}

const languageEntries = createLanguageEntries()

const getModeFromName = name => {
  const resolved = resolveLanguageDescription(name)
  if (!resolved) {
    return null
  }

  return {
    name: resolved.name,
    mode: {
      mode: resolved.name,
      description: resolved.description
    }
  }
}

const getLine = (doc, lineNumber) => {
  if (lineNumber < 0 || lineNumber >= doc.lines) {
    return undefined
  }
  return doc.line(lineNumber + 1)
}

const clampPosition = (doc, position = { line: 0, ch: 0 }) => {
  const lineNumber = Math.max(0, Math.min(position.line || 0, doc.lines - 1))
  const line = doc.line(lineNumber + 1)
  const ch = Math.max(0, Math.min(position.ch || 0, line.length))

  return { lineNumber, line, ch }
}

const toOffset = (doc, position) => {
  const { line, ch } = clampPosition(doc, position)
  return line.from + ch
}

const toPosition = (doc, offset) => {
  const clamped = Math.max(0, Math.min(offset, doc.length))
  const line = doc.lineAt(clamped)

  return {
    line: line.number - 1,
    ch: clamped - line.from
  }
}

class CodeMirrorAdapter {
  constructor (container, config = {}) {
    this.container = container
    this.handlers = new Map()
    this.languageCompartment = new Compartment()
    this.directionCompartment = new Compartment()
    this.view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: config.value || '',
        extensions: [
          EditorView.lineWrapping,
          history(),
          drawSelection(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          highlightSelectionMatches(),
          syntaxHighlighting(legacyHighlightStyle),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...searchKeymap
          ]),
          config.lineNumbers === false
            ? []
            : [
              lineNumbers({
                formatNumber: typeof config.lineNumberFormatter === 'function'
                  ? (lineNo, state) => config.lineNumberFormatter(lineNo, state)
                  : undefined
              })
            ],
          config.styleActiveLine === false
            ? []
            : [highlightActiveLine(), highlightActiveLineGutter()],
          this.directionCompartment.of(EditorView.contentAttributes.of({ dir: config.direction || 'ltr' })),
          this.languageCompartment.of(MARKDOWN_LANGUAGE),
          EditorView.updateListener.of(update => {
            if (update.docChanged || update.selectionSet) {
              this.emit('cursorActivity', this)
            }
          })
        ]
      })
    })

    this.view.dom.classList.add(MARKTEXT_SOURCE_EDITOR_CLASS)
    this.applyThemeName(config.theme)
    this.view.contentDOM.addEventListener('contextmenu', event => {
      this.emit('contextmenu', this, event)
    })

    if (config.autofocus) {
      this.focus()
    }
  }

  applyThemeName (theme) {
    this.view.dom.dataset.theme = getThemeName(theme)
  }

  emit (name, ...args) {
    const handlers = this.handlers.get(name)
    if (!handlers) {
      return
    }
    for (const handler of handlers) {
      handler(...args)
    }
  }

  on (name, handler) {
    const handlers = this.handlers.get(name) || []
    handlers.push(handler)
    this.handlers.set(name, handlers)
  }

  getValue () {
    return this.view.state.doc.toString()
  }

  setValue (value) {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: value || '' },
      selection: { anchor: 0 }
    })
  }

  getCursor (which = 'head') {
    const selection = this.view.state.selection.main
    const offset = which === 'anchor' ? selection.anchor : selection.head
    return toPosition(this.view.state.doc, offset)
  }

  setCursor (line, ch) {
    const anchor = toOffset(this.view.state.doc, { line, ch })
    this.view.dispatch({
      selection: { anchor },
      scrollIntoView: true
    })
  }

  setSelection (anchor, head, options = {}) {
    this.view.dispatch({
      selection: EditorSelection.single(
        toOffset(this.view.state.doc, anchor),
        toOffset(this.view.state.doc, head)
      ),
      scrollIntoView: options.scroll === true
    })
  }

  focus () {
    this.view.focus()
  }

  hasFocus () {
    return this.view.hasFocus
  }

  execCommand (command) {
    if (command === 'selectAll') {
      this.view.dispatch({
        selection: EditorSelection.single(0, this.view.state.doc.length),
        scrollIntoView: true
      })
    }
  }

  getLine (lineNumber) {
    const line = getLine(this.view.state.doc, lineNumber)
    return line ? line.text : undefined
  }

  getLineHandle (lineNumber) {
    const line = getLine(this.view.state.doc, lineNumber)
    return line ? { text: line.text } : undefined
  }

  lineCount () {
    return this.view.state.doc.lines
  }

  lastLine () {
    return this.view.state.doc.lines - 1
  }

  async setLanguageByName (name) {
    const mode = getModeFromName(name)
    if (!mode) {
      const errMsg = !name
        ? 'You\'d better provided a language mode when you create code block'
        : `${name} is not a valid language mode!`
      return Promise.reject(errMsg)
    }

    const support = mode.mode.description.support || await mode.mode.description.load()
    this.view.dispatch({
      effects: this.languageCompartment.reconfigure(support)
    })
    return mode
  }

  setDirection (textDirection) {
    this.view.dispatch({
      effects: this.directionCompartment.reconfigure(EditorView.contentAttributes.of({ dir: textDirection }))
    })
  }

  invalidateImageCache () {}
}

const codeMirror = (container, config = {}) => {
  return new CodeMirrorAdapter(container, config)
}

export const search = text => {
  const matchedLangs = filter(languageEntries, text, { key: 'name' })
  return matchedLangs.filter(Boolean)
}

export const setCursorAtLastLine = cm => {
  const lastLine = cm.lastLine()
  const lineHandle = cm.getLineHandle(lastLine)

  cm.focus()
  cm.setCursor(lastLine, lineHandle ? lineHandle.text.length : 0)
}

export const isCursorAtFirstLine = cm => {
  const cursor = cm.getCursor()
  return cursor.line === 0 && cursor.ch === 0
}

export const isCursorAtLastLine = cm => {
  const lastLine = cm.lastLine()
  const cursor = cm.getCursor()
  const lineHandle = cm.getLineHandle(lastLine)
  return cursor.line === lastLine && cursor.ch === (lineHandle ? lineHandle.text.length : 0)
}

export const isCursorAtBegin = cm => {
  const cursor = cm.getCursor()
  return cursor.line === 0 && cursor.ch === 0
}

export const onlyHaveOneLine = cm => {
  return cm.lineCount() === 1
}

export const isCursorAtEnd = cm => {
  const lastLine = cm.lastLine()
  const lastLineHandle = cm.getLineHandle(lastLine)
  const cursor = cm.getCursor()

  return cursor.line === lastLine && cursor.ch === (lastLineHandle ? lastLineHandle.text.length : 0)
}

export const getBeginPosition = () => {
  return {
    anchor: { line: 0, ch: 0 },
    head: { line: 0, ch: 0 }
  }
}

export const getEndPosition = cm => {
  const lastLine = cm.lastLine()
  const lastLineHandle = cm.getLineHandle(lastLine)
  const line = lastLine
  const ch = lastLineHandle ? lastLineHandle.text.length : 0
  return { anchor: { line, ch }, head: { line, ch } }
}

export const setCursorAtFirstLine = cm => {
  cm.focus()
  cm.setCursor(0, 0)
}

export const setMode = (doc, text) => {
  return doc.setLanguageByName(text)
}

export const setTextDirection = (cm, textDirection) => {
  cm.setDirection(textDirection)
}

export default codeMirror
