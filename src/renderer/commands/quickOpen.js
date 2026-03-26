import path from 'path'
import { isChildOfDirectory, hasMarkdownExtension, MARKDOWN_INCLUSIONS } from '../../common/filesystem/paths'
import bus from '../bus'
import { delay } from '@/util'
import appApi from '../services/nativeApi/app'
import { getRuntime } from '../services/runtime'
import nativeSearch from '../services/nativeApi/search'

const SPECIAL_CHARS = /[\[\]\\^$.\|\?\*\+\(\)\/]{1}/g // eslint-disable-line no-useless-escape

// The quick open command
class QuickOpenCommand {
  constructor (rootState) {
    this.id = 'file.quick-open'
    this.description = 'File: Quick Open'
    this.placeholder = 'Search file to open'
    this.shortcut = null

    this.subcommands = []
    this.subcommandSelectedIndex = -1

    // Reference to folder and editor and project state.
    this._editorState = rootState.editor
    this._folderState = rootState.project

    this._cancelFn = null
  }

  search = async query => {
    // Show opened files when no query given.
    if (!query) {
      return this.subcommands
    }

    const { _cancelFn } = this
    if (_cancelFn) {
      _cancelFn()
      this._cancelFn = null
    }

    const timeout = delay(300)
    this._cancelFn = () => {
      timeout.cancel()
      this._cancelFn = null
    }

    await timeout
    return this._doSearch(query)
  }

  run = async () => {
    const { _editorState, _folderState } = this
    if (!_folderState.projectTree && _editorState.tabs.length === 0) {
      throw new Error(null)
    }

    this.subcommands = _editorState.tabs
      .map(t => t.pathname)
      // Filter untitled tabs
      .filter(t => !!t)
      .map(pathname => {
        const item = { id: pathname }
        Object.assign(item, this._getPath(pathname))
        return item
      })
  }

  execute = async () => {
    // Timeout to hide the command palette and then show again to prevent issues.
    await delay(100)
    bus.$emit('show-command-palette', this)
  }

  executeSubcommand = async id => {
    const { windowId } = getRuntime().env
    appApi.openFileByWindowId(windowId, id)
  }

  unload = () => {
    this.subcommands = []
  }

  // --- private ------------------------------------------

  _doSearch = query => {
    this._cancelFn = null
    const { _editorState, _folderState } = this
    const isRootDirOpened = !!_folderState.projectTree
    const tabsAvailable = _editorState.tabs.length > 0

    // Only show opened files if no directory is opened.
    if (!isRootDirOpened && !tabsAvailable) {
      return []
    }

    const searchResult = []
    const rootPath = isRootDirOpened ? _folderState.projectTree.pathname : null

    // Add files that are not in the current root directory but opened.
    if (tabsAvailable) {
      const re = new RegExp(query.replace(SPECIAL_CHARS, p => {
        if (p === '*') return '.*'
        return p === '\\' ? '\\\\' : `\\${p}`
      }), 'i')

      for (const tab of _editorState.tabs) {
        const { pathname } = tab
        if (pathname && re.test(pathname) &&
          (!rootPath || !isChildOfDirectory(rootPath, pathname))
        ) {
          searchResult.push(pathname)
        }
      }
    }

    if (!isRootDirOpened) {
      return searchResult
        .map(pathname => {
          return {
            id: pathname,
            description: pathname,
            title: pathname
          }
        })
    }

    // Search root directory on disk.
    return new Promise((resolve, reject) => {
      let canceled = false
      const requestId = `quick-open:${Date.now()}:${Math.random()}`
      nativeSearch.searchFiles(rootPath, {
        requestId,
        maxResults: 30,
        inclusions: this._getInclusions(query)
      })
        .then(results => {
          if (canceled) {
            return
          }

          this._cancelFn = null
          searchResult.push(...results.slice(0, 30))
          resolve(
            searchResult
              .map(pathname => {
                const item = { id: pathname }
                Object.assign(item, this._getPath(pathname))
                return item
              })
          )
        })
        .catch(error => {
          if (canceled) {
            return
          }
          this._cancelFn = null
          reject(error)
        })

      this._cancelFn = () => {
        this._cancelFn = null
        canceled = true
        nativeSearch.cancel(requestId).catch(() => {})
      }
    })
  }

  _getInclusions = query => {
    // NOTE: This will fail on `foo.m` because we search for `foo.m.md`.
    if (hasMarkdownExtension(query)) {
      return [`*${query}`]
    }

    const inclusions = []
    for (let i = 0; i < MARKDOWN_INCLUSIONS.length; ++i) {
      inclusions[i] = `*${query}` + MARKDOWN_INCLUSIONS[i]
    }
    return inclusions
  }

  _getPath = pathname => {
    const rootPath = this._folderState.projectTree.pathname
    if (!isChildOfDirectory(rootPath, pathname)) {
      return { title: pathname, description: pathname }
    }

    const p = path.relative(rootPath, pathname)
    const item = { description: p }
    if (p.length > 50) {
      item.title = p
    }
    return item
  }
}

export default QuickOpenCommand
