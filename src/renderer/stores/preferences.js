import { defineStore } from 'pinia'
import bus from '@/bus'
import app from '@/services/nativeApi/app'
import events from '@/services/nativeApi/events'
import { getRuntime } from '@/services/runtime'

let isUserPreferenceListenerBound = false
let isViewListenerBound = false
let isToggleViewListenerBound = false

const getWindowId = () => {
  try {
    return getRuntime().env.windowId
  } catch (_) {
    return null
  }
}

const createPreferencesState = () => ({
  autoSave: false,
  autoSaveDelay: 5000,
  titleBarStyle: 'custom',
  openFilesInNewWindow: false,
  openFolderInNewWindow: false,
  zoom: 1.0,
  hideScrollbar: false,
  wordWrapInToc: false,
  fileSortBy: 'created',
  startUpAction: 'lastState',
  defaultDirectoryToOpen: '',
  language: 'en',

  editorFontFamily: 'Open Sans',
  fontSize: 16,
  lineHeight: 1.6,
  codeFontSize: 14,
  codeFontFamily: 'DejaVu Sans Mono',
  codeBlockLineNumbers: true,
  trimUnnecessaryCodeBlockEmptyLines: true,
  editorLineWidth: '',

  autoPairBracket: true,
  autoPairMarkdownSyntax: true,
  autoPairQuote: true,
  endOfLine: 'default',
  defaultEncoding: 'utf8',
  autoGuessEncoding: true,
  trimTrailingNewline: 2,
  textDirection: 'ltr',
  hideQuickInsertHint: false,
  imageInsertAction: 'folder',
  imagePreferRelativeDirectory: false,
  imageRelativeDirectoryName: 'assets',
  hideLinkPopup: false,
  autoCheck: false,

  preferLooseListItem: true,
  bulletListMarker: '-',
  orderListDelimiter: '.',
  preferHeadingStyle: 'atx',
  tabSize: 4,
  listIndentation: 1,
  frontmatterType: '-',
  superSubScript: false,
  footnote: false,
  isHtmlEnabled: true,
  isGitlabCompatibilityEnabled: false,
  sequenceTheme: 'hand',

  theme: 'light',
  autoSwitchTheme: 2,

  spellcheckerEnabled: false,
  spellcheckerNoUnderline: false,
  spellcheckerLanguage: 'en-US',

  sideBarVisibility: false,
  tabBarVisibility: false,
  sourceCodeModeEnabled: false,

  searchExclusions: [],
  searchMaxFileSize: '',
  searchIncludeHidden: false,
  searchNoIgnore: false,
  searchFollowSymlinks: true,

  watcherUsePolling: false,

  typewriter: false,
  focus: false,
  sourceCode: false,

  imageFolderPath: '',
  webImages: [],
  cloudImages: [],
  currentUploader: 'none',
  githubToken: '',
  imageBed: {
    github: {
      owner: '',
      repo: '',
      branch: ''
    }
  },
  cliScript: ''
})

export const usePreferencesStore = defineStore('preferences', {
  state: createPreferencesState,
  actions: {
    applyPreferences (preference) {
      for (const key of Object.keys(preference)) {
        if (typeof preference[key] !== 'undefined' && Object.prototype.hasOwnProperty.call(this.$state, key)) {
          this[key] = preference[key]
        }
      }
    },
    setMode ({ type, checked }) {
      if (Object.prototype.hasOwnProperty.call(this.$state, type)) {
        this[type] = checked
      }
    },
    toggleViewMode (entryName) {
      this[entryName] = !this[entryName]
    },
    askForUserPreference () {
      if (!isUserPreferenceListenerBound) {
        events.on('mt::user-preference', (event, preference) => {
          this.applyPreferences(preference)
        })
        isUserPreferenceListenerBound = true
      }

      app.send('mt::ask-for-user-preference')
      app.send('mt::ask-for-user-data')
    },
    setSinglePreference ({ type, value }) {
      if (Object.prototype.hasOwnProperty.call(this.$state, type)) {
        this[type] = value
      }
      app.send('mt::set-user-preference', { [type]: value })
    },
    setUserData ({ type, value }) {
      if (Object.prototype.hasOwnProperty.call(this.$state, type)) {
        this[type] = value
      }
      app.send('mt::set-user-data', { [type]: value })
    },
    setImageFolderPath (value) {
      if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(this.$state, 'imageFolderPath')) {
        this.imageFolderPath = value
      }
      app.send('mt::ask-for-modify-image-folder-path', value)
    },
    selectDefaultDirectoryToOpen () {
      app.send('mt::select-default-directory-to-open')
    },
    dispatchEditorViewState (viewState) {
      const windowId = getWindowId()
      if (windowId !== null) {
        app.send('mt::view-layout-changed', windowId, viewState)
      }
    },
    bindViewEvents () {
      if (isViewListenerBound) {
        return
      }

      events.on('mt::show-command-palette', () => {
        bus.$emit('show-command-palette')
      })

      events.on('mt::toggle-view-mode-entry', (event, entryName) => {
        this.toggleViewMode(entryName)
        this.dispatchEditorViewState({ [entryName]: this[entryName] })
      })

      isViewListenerBound = true
    },
    bindToggleViewEvents () {
      if (isToggleViewListenerBound) {
        return
      }

      bus.$on('view:toggle-view-entry', entryName => {
        this.toggleViewMode(entryName)
        this.dispatchEditorViewState({ [entryName]: this[entryName] })
      })

      isToggleViewListenerBound = true
    }
  }
})
